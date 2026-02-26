import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import type { Student, PlannerState, TranscriptTerm } from "./types.js";

const dbPath = () => path.resolve(env.localDbPath);

type UserRecord = {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
  updated_at: string;
  transcript_terms: TranscriptTerm[];
  planner: PlannerState | null;
};

type LocalDb = {
  users: Record<string, UserRecord>;
};

const createEmptyDb = (): LocalDb => ({ users: {} });

async function readDb(): Promise<LocalDb> {
  const p = dbPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  try {
    const raw = await fs.readFile(p, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "users" in parsed) {
      return parsed as LocalDb;
    }
    return createEmptyDb();
  } catch {
    return createEmptyDb();
  }
}

async function writeDb(db: LocalDb): Promise<void> {
  const p = dbPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(db, null, 2));
}

const splitName = (name?: string) => {
  if (!name) return { first: "", last: "" };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
};

const nowIso = () => new Date().toISOString();

export async function getOrCreateStudent(input: {
  uid: string;
  email?: string;
  name?: string;
}): Promise<Student> {
  const db = await readDb();
  const existing = db.users[input.uid];
  const { first, last } = splitName(input.name);
  const now = nowIso();

  if (!existing) {
    const user: UserRecord = {
      user_id: input.uid,
      first_name: first,
      last_name: last,
      email: input.email ?? "",
      created_at: now,
      updated_at: now,
      transcript_terms: [],
      planner: null,
    };
    db.users[input.uid] = user;
    await writeDb(db);
    return {
      user_id: input.uid,
      first_name: first,
      last_name: last,
      email: input.email ?? "",
    };
  }

  const shouldUpdate =
    (input.email && existing.email !== input.email) ||
    (first && existing.first_name !== first) ||
    (last && existing.last_name !== last);

  if (shouldUpdate) {
    existing.email = input.email ?? existing.email;
    existing.first_name = first || existing.first_name;
    existing.last_name = last || existing.last_name;
    existing.updated_at = now;
    await writeDb(db);
  }

  return {
    user_id: existing.user_id,
    first_name: existing.first_name,
    last_name: existing.last_name,
    email: existing.email,
  };
}

export async function saveTranscriptTerms(
  studentId: string,
  terms: TranscriptTerm[]
): Promise<void> {
  const db = await readDb();
  const user = db.users[studentId];
  if (!user) throw new Error(`User ${studentId} not found in local DB`);
  user.transcript_terms = terms;
  user.updated_at = nowIso();
  await writeDb(db);
}

export async function getTranscriptForStudent(
  studentId: string
): Promise<TranscriptTerm[]> {
  const db = await readDb();
  return db.users[studentId]?.transcript_terms ?? [];
}

export async function savePlannerState(
  studentId: string,
  payload: unknown
): Promise<PlannerState> {
  const db = await readDb();
  const user = db.users[studentId];
  if (!user) throw new Error(`User ${studentId} not found in local DB`);
  const now = nowIso();
  const state: PlannerState = {
    id: "current",
    user_id: studentId,
    created_at: user.planner?.created_at ?? now,
    updated_at: now,
    payload,
  };
  user.planner = state;
  await writeDb(db);
  return state;
}

export async function getPlannerState(
  studentId: string
): Promise<PlannerState | null> {
  const db = await readDb();
  return db.users[studentId]?.planner ?? null;
}
