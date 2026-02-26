import { getFirestore } from "firebase-admin/firestore";
import { ensureFirebaseApp } from "../services/auth.js";
import type { Student, PlannerState, TranscriptTerm } from "./types.js";

const USERS_COLLECTION = "users";

const splitName = (name?: string) => {
  if (!name) return { first: "", last: "" };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
};

const getDb = () => {
  ensureFirebaseApp();
  return getFirestore();
};

const nowIso = () => new Date().toISOString();

export async function getOrCreateStudent(input: {
  uid: string;
  email?: string;
  name?: string;
}): Promise<Student> {
  const db = getDb();
  const userRef = db.collection(USERS_COLLECTION).doc(input.uid);
  const snapshot = await userRef.get();
  const { first, last } = splitName(input.name);
  const now = nowIso();

  if (!snapshot.exists) {
    await userRef.set({
      user_id: input.uid,
      first_name: first,
      last_name: last,
      email: input.email ?? "",
      created_at: now,
      updated_at: now
    });
    return {
      user_id: input.uid,
      first_name: first,
      last_name: last,
      email: input.email ?? ""
    };
  }

  const existing = snapshot.data() ?? {};
  const shouldUpdate =
    (input.email && existing.email !== input.email) ||
    (first && existing.first_name !== first) ||
    (last && existing.last_name !== last);

  if (shouldUpdate) {
    await userRef.set(
      {
        email: input.email ?? existing.email ?? "",
        first_name: first || existing.first_name || "",
        last_name: last || existing.last_name || "",
        updated_at: now
      },
      { merge: true }
    );
  }

  return {
    user_id: input.uid,
    first_name: (first || (existing.first_name as string) || "").trim(),
    last_name: (last || (existing.last_name as string) || "").trim(),
    email: input.email ?? (existing.email as string) ?? ""
  };
}

export async function saveTranscriptTerms(studentId: string, terms: TranscriptTerm[]) {
  const db = getDb();
  const transcriptRef = db
    .collection(USERS_COLLECTION)
    .doc(studentId)
    .collection("transcript")
    .doc("current");

  const now = nowIso();
  const previous = await transcriptRef.get();
  const createdAt = (previous.data()?.created_at as string | undefined) ?? now;

  await transcriptRef.set(
    {
      id: "current",
      user_id: studentId,
      terms,
      created_at: createdAt,
      updated_at: now
    },
    { merge: true }
  );
}

export async function getTranscriptForStudent(studentId: string): Promise<TranscriptTerm[]> {
  const db = getDb();
  const transcriptRef = db
    .collection(USERS_COLLECTION)
    .doc(studentId)
    .collection("transcript")
    .doc("current");
  const snapshot = await transcriptRef.get();
  if (!snapshot.exists) return [];
  const value = snapshot.data()?.terms;
  return Array.isArray(value) ? (value as TranscriptTerm[]) : [];
}

export async function savePlannerState(studentId: string, payload: unknown): Promise<PlannerState> {
  const db = getDb();
  const plannerRef = db
    .collection(USERS_COLLECTION)
    .doc(studentId)
    .collection("planner")
    .doc("current");

  const now = nowIso();
  const previous = await plannerRef.get();
  const createdAt = (previous.data()?.created_at as string | undefined) ?? now;

  const record: PlannerState = {
    id: "current",
    user_id: studentId,
    created_at: createdAt,
    updated_at: now,
    payload
  };

  await plannerRef.set(record, { merge: true });
  return record;
}

export async function getPlannerState(studentId: string): Promise<PlannerState | null> {
  const db = getDb();
  const plannerRef = db
    .collection(USERS_COLLECTION)
    .doc(studentId)
    .collection("planner")
    .doc("current");
  const snapshot = await plannerRef.get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() ?? {};
  return {
    id: String(data.id ?? "current"),
    user_id: String(data.user_id ?? studentId),
    created_at: String(data.created_at ?? ""),
    updated_at: String(data.updated_at ?? ""),
    payload: data.payload ?? null
  };
}
