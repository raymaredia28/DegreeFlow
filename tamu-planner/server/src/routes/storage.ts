import { Router } from "express";
import type { Request, Response } from "express";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import {
  getOrCreateStudent,
  getPlannerState,
  getTranscriptForStudent,
  savePlannerState,
  saveTranscriptTerms
} from "../storage/index.js";
import { verifyBearerToken } from "../services/auth.js";

export const storageRouter = Router();
const execFileAsync = promisify(execFile);

const transcriptCourseSchema = z.object({
  code: z.string(),
  title: z.string(),
  credits: z.number(),
  grade: z.string(),
  transfer: z.boolean().optional()
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

const getAuthUser = async (req: Request, res: Response) => {
  try {
    return await verifyBearerToken(req.headers.authorization);
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
};

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

storageRouter.post("/storage/transcript", async (req, res) => {
  const authUser = await getAuthUser(req, res);
  if (!authUser) return;

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

storageRouter.get("/storage/transcript/:studentId", async (req, res) => {
  const authUser = await getAuthUser(req, res);
  if (!authUser) return;

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

storageRouter.post("/storage/planner/:studentId", async (req, res) => {
  const authUser = await getAuthUser(req, res);
  if (!authUser) return;

  if (rejectMismatchedStudentId(authUser.uid, req.params.studentId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const studentId = authUser.uid;
  const state = await savePlannerState(studentId, req.body);
  return res.json(state);
});

storageRouter.get("/storage/planner/:studentId", async (req, res) => {
  const authUser = await getAuthUser(req, res);
  if (!authUser) return;

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

storageRouter.post("/storage/login", async (req, res) => {
  const authUser = await getAuthUser(req, res);
  if (!authUser) return;

  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success && req.body) {
    return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
  }

  const student = await getOrCreateStudent({
    uid: authUser.uid,
    email: authUser.email || parsed.data?.email,
    name: authUser.name || parsed.data?.name
  });

  // Load existing transcript and planner data
  const transcript = await getTranscriptForStudent(student.user_id);
  const planner = await getPlannerState(student.user_id);

  return res.json({
    studentId: student.user_id,
    student: {
      firstName: student.first_name,
      lastName: student.last_name,
      email: student.email,
    },
    transcript: transcript.length > 0 ? { terms: transcript } : null,
    planner: planner?.payload ?? null,
  });
});
