import { Router } from "express";
import type { Request, Response } from "express";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { env } from "../config/env.js";
import { detectDocumentType } from "../services/documentType.js";
import {
  buildDegreeEvaluationPrompt,
  normalizeToTranscriptFormat,
  extractJsonFromAiResponse
} from "../services/degreeEvaluationParser.js";
import {
  getOrCreateStudent,
  getPlannerState,
  getTranscriptForStudent,
  savePlannerState,
  saveTranscriptTerms
} from "../storage/index.js";
import { authenticate } from "../middleware/auth.js";

export const storageRouter = Router();
const execFileAsync = promisify(execFile);

const transcriptCourseSchema = z.object({
  code: z.string(),
  title: z.string(),
  credits: z.number(),
  grade: z.string(),
  transfer: z.boolean().optional(),
  categories: z.array(z.string()).optional()
});

const transcriptTermSchema = z.object({
  label: z.string(),
  status: z.string(),
  courses: z.array(transcriptCourseSchema)
});

const transcriptSchema = z.object({
  studentEmail: z.string().email().optional(),
  studentName: z.string().optional(),
  terms: z.array(transcriptTermSchema)
});

const parsePayloadSchema = z.object({
  fileName: z.string().optional(),
  dataBase64: z.string()
});

const detectDocumentPayloadSchema = z.object({
  lines: z.array(z.string())
});

const parseDegreeEvalPayloadSchema = z.object({
  lines: z.array(z.string()).min(1)
});

const rejectMismatchedStudentId = (authUid: string, requestedStudentId?: string) => {
  if (!requestedStudentId) return false;
  return requestedStudentId !== authUid;
};

// ── Transcript parser: Python pdfplumber ─────────────────────────────────────
storageRouter.post("/storage/parse-transcript", async (req, res) => {
  const parsed = parsePayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
  }

  const buffer = Buffer.from(parsed.data.dataBase64, "base64");
  const tmpPath = path.join(
    os.tmpdir(),
    `transcript_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`
  );
  await fs.writeFile(tmpPath, buffer);

  try {
    const scriptPath = path.resolve("scripts/parse_transcript.py");
    const { stdout } = await execFileAsync("python3", [scriptPath, tmpPath], {
      maxBuffer: 10 * 1024 * 1024
    });
    const result = JSON.parse(stdout.trim() || "{}");
    if (result.error) {
      return res.status(500).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to parse transcript";
    return res.status(500).json({ error: message });
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
});

storageRouter.post("/storage/detect-document-type", async (req, res) => {
  const parsed = detectDocumentPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
  }
  return res.json(detectDocumentType(parsed.data.lines));
});

storageRouter.post("/storage/parse-degree-evaluation", async (req, res) => {
  const parsed = parseDegreeEvalPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
  }

  const clientKey = (req.headers["x-api-key"] as string | undefined)?.trim();
  const apiKey = (clientKey && clientKey.length >= 10) ? clientKey : null;

  if (!apiKey) {
    return res.status(401).json({ error: "A TAMU AI API key is required to parse degree evaluations. Add your key in the upload prompt." });
  }

  const callAi = async (attempt: number) => {
    const prompt = buildDegreeEvaluationPrompt(parsed.data.lines);
    console.log(`[degree-eval] AI attempt ${attempt}, sending ${parsed.data.lines.length} lines (prompt ${prompt.length} chars)`);
    const response = await fetch(`${env.tamuAiApiEndpoint}/api/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "protected.gemini-2.0-flash-lite",
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "You extract course data as JSON from university degree evaluation documents. " +
              "Return ONLY raw JSON. No markdown fences, no explanation."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const details = await response.text();
      console.error(`[degree-eval] AI HTTP ${response.status} (attempt ${attempt}):`, details.slice(0, 500));
      return { error: `Degree evaluation AI request failed (HTTP ${response.status})`, details, status: response.status };
    }

    const aiData = await response.json();
    const rawContent: string = aiData?.choices?.[0]?.message?.content || "";
    console.log(`[degree-eval] AI raw response length: ${rawContent.length} (attempt ${attempt})`);
    if (rawContent.length < 20) {
      console.error(`[degree-eval] AI returned very short content:`, rawContent);
    }

    const parsedContent = extractJsonFromAiResponse(rawContent);
    if (parsedContent === null) {
      console.error(`[degree-eval] extractJsonFromAiResponse returned null (attempt ${attempt}). Raw snippet:`, rawContent.slice(0, 500));
      return { error: `AI returned non-JSON content (attempt ${attempt})`, rawSnippet: rawContent.slice(0, 500) };
    }

    const normalized = normalizeToTranscriptFormat(parsedContent);
    if (!normalized.ok) {
      console.error(`[degree-eval] normalization failed (attempt ${attempt}):`, normalized.error, normalized.issues);
      return { error: normalized.error, issues: normalized.issues };
    }

    console.log(`[degree-eval] Success (attempt ${attempt}): ${normalized.normalized.terms.length} terms, ${normalized.normalized.terms.reduce((s, t) => s + t.courses.length, 0)} courses`);
    return { ok: true, data: normalized.normalized };
  };

  try {
    let result = await callAi(1);
    if (!("ok" in result) || !result.ok) {
      console.log(`[degree-eval] Attempt 1 failed, retrying...`);
      result = await callAi(2);
    }

    if ("ok" in result && result.ok) {
      return res.json(result.data);
    }

    const errResult = result as Record<string, unknown>;
    return res.status(typeof errResult.status === "number" ? errResult.status : 422).json({
      error: errResult.error || "Unable to parse degree evaluation after retries",
      ...(errResult.issues ? { issues: errResult.issues } : {}),
      ...(errResult.rawSnippet ? { rawSnippet: errResult.rawSnippet } : {})
    });
  } catch (err) {
    console.error(`[degree-eval] Unexpected error:`, err);
    const message = err instanceof Error ? err.message : "Unable to parse degree evaluation";
    return res.status(500).json({ error: message });
  }
});

storageRouter.post("/storage/transcript", authenticate, async (req, res) => {
  const authUser = req.user!;

  const parsed = transcriptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
  }

  const student = await getOrCreateStudent({
    uid: authUser.uid,
    email: authUser.email || parsed.data.studentEmail,
    name: authUser.name || parsed.data.studentName
  });

  await saveTranscriptTerms(student.user_id, parsed.data.terms);

  return res.json({ studentId: student.user_id });
});

storageRouter.get("/storage/transcript/:studentId", authenticate, async (req, res) => {
  const authUser = req.user!;

  if (rejectMismatchedStudentId(authUser.uid, req.params.studentId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const studentId = authUser.uid;
  const transcript = await getTranscriptForStudent(studentId);
  if (!transcript.length) {
    return res.status(404).json({ error: "Transcript not found" });
  }
  return res.json({ studentId, terms: transcript });
});

storageRouter.post("/storage/planner/:studentId", authenticate, async (req, res) => {
  const authUser = req.user!;

  if (rejectMismatchedStudentId(authUser.uid, req.params.studentId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const studentId = authUser.uid;
  const state = await savePlannerState(studentId, req.body);
  return res.json(state);
});

storageRouter.get("/storage/planner/:studentId", authenticate, async (req, res) => {
  const authUser = req.user!;

  if (rejectMismatchedStudentId(authUser.uid, req.params.studentId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const studentId = authUser.uid;
  const state = await getPlannerState(studentId);
  if (!state) {
    return res.status(404).json({ error: "Planner state not found" });
  }
  return res.json(state);
});

// Login/lookup: find or create student by email, return id + any saved data
const loginSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().optional(),
});

storageRouter.post("/storage/login", authenticate, async (req, res) => {
  const authUser = req.user!;

  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success && req.body) {
    return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
  }

  const student = await getOrCreateStudent({
    uid: authUser.uid,
    email: authUser.email || parsed.data?.email,
    name: authUser.name || parsed.data?.name
  });

  const [transcript, planner] = await Promise.all([
    getTranscriptForStudent(student.user_id),
    getPlannerState(student.user_id),
  ]);

  return res.json({
    studentId: student.user_id,
    student: {
      firstName: student.first_name,
      lastName: student.last_name,
      email: student.email,
    },
    transcript: transcript.length > 0 ? { terms: transcript } : null,
    planner: planner?.payload ?? null,
    isAdmin: authUser.isAdmin,
  });
});
