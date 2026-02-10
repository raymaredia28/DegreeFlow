import { Router } from "express";
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
} from "../storage/localDb.js";

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
  const parsed = transcriptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
  }

  const student = await getOrCreateStudent({
    email: parsed.data.studentEmail,
    name: parsed.data.studentName
  });

  await saveTranscriptTerms(student.user_id, parsed.data.terms);

  return res.json({ studentId: student.user_id });
});

storageRouter.get("/storage/transcript/:studentId", async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (!Number.isFinite(studentId)) {
    return res.status(400).json({ error: "Invalid student id" });
  }
  const transcript = await getTranscriptForStudent(studentId);
  if (!transcript.length) {
    return res.status(404).json({ error: "Transcript not found" });
  }
  return res.json({ studentId, terms: transcript });
});

storageRouter.post("/storage/planner/:studentId", async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (!Number.isFinite(studentId)) {
    return res.status(400).json({ error: "Invalid student id" });
  }
  const state = await savePlannerState(studentId, req.body);
  return res.json(state);
});

storageRouter.get("/storage/planner/:studentId", async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (!Number.isFinite(studentId)) {
    return res.status(400).json({ error: "Invalid student id" });
  }
  const state = await getPlannerState(studentId);
  if (!state) {
    return res.status(404).json({ error: "Planner state not found" });
  }
  return res.json(state);
});
