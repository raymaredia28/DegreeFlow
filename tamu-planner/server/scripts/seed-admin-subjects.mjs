#!/usr/bin/env node
/**
 * One-off Firestore seed for admin-managed subjects.
 *
 * Reads data/courses.json, filters by ADMIN_SUBJECTS, and upserts each course
 * into the `courses` collection (doc id = course_id). Idempotent: re-running
 * is safe and will overwrite docs with the latest content from courses.json.
 *
 * Usage:
 *   # from tamu-planner/server
 *   FIREBASE_PROJECT_ID=... \
 *   FIREBASE_CLIENT_EMAIL=... \
 *   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..." \
 *   node scripts/seed-admin-subjects.mjs
 *
 *   # only seed CPEN + ECEN (skip CSCE that's already in prod):
 *   SUBJECTS=CPEN,ECEN node scripts/seed-admin-subjects.mjs
 *
 *   # dry run – print what would be written, don't touch Firestore:
 *   DRY_RUN=1 node scripts/seed-admin-subjects.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COURSES_FILE = path.resolve(__dirname, "..", "data", "courses.json");
const COURSES_COLLECTION = "courses";
const META_COLLECTION = "catalog_meta";
const BATCH_SIZE = 400;

const ADMIN_SUBJECTS = new Set(
  (process.env.SUBJECTS ?? "CSCE,CPEN,ECEN")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
);

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

function sanitizeForFirestore(obj) {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      Array.isArray(item)
        ? { group: item.map(sanitizeForFirestore) }
        : sanitizeForFirestore(item)
    );
  }
  if (typeof obj === "object") {
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) clean[k] = sanitizeForFirestore(v);
    }
    return clean;
  }
  return obj;
}

function initFirebase() {
  if (getApps().length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY."
    );
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

async function main() {
  console.log(`[seed] subjects: ${[...ADMIN_SUBJECTS].join(", ")}`);
  console.log(`[seed] reading ${COURSES_FILE}`);
  const all = JSON.parse(await fs.readFile(COURSES_FILE, "utf-8"));

  const target = all.filter((c) =>
    ADMIN_SUBJECTS.has(String(c?.primary_subject || "").toUpperCase())
  );

  const bySubject = target.reduce((acc, c) => {
    acc[c.primary_subject] = (acc[c.primary_subject] || 0) + 1;
    return acc;
  }, {});
  console.log(`[seed] ${target.length} courses to upsert:`, bySubject);

  if (DRY_RUN) {
    console.log("[seed] DRY_RUN=1, exiting without writing.");
    return;
  }

  initFirebase();
  const db = getFirestore();

  let written = 0;
  for (let i = 0; i < target.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const slice = target.slice(i, i + BATCH_SIZE);
    for (const course of slice) {
      if (typeof course.course_id !== "number") {
        console.warn(`[seed] skipping course without numeric course_id:`, course?.codes ?? course);
        continue;
      }
      const ref = db.collection(COURSES_COLLECTION).doc(String(course.course_id));
      batch.set(ref, sanitizeForFirestore(course), { merge: true });
    }
    await batch.commit();
    written += slice.length;
    console.log(`[seed] committed ${written}/${target.length}`);
  }

  await db
    .collection(META_COLLECTION)
    .doc("seed_status")
    .set(
      {
        seeded: true,
        seeded_at: new Date().toISOString(),
        last_subjects: [...ADMIN_SUBJECTS],
        last_count: written,
      },
      { merge: true }
    );

  console.log(`[seed] done. Wrote ${written} docs.`);
}

main().catch((err) => {
  console.error("[seed] FAILED:", err);
  process.exit(1);
});
