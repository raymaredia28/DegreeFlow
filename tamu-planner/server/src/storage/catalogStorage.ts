import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { ensureFirebaseApp } from "../services/auth.js";
import { getFirestore } from "firebase-admin/firestore";

export interface CatalogStorageProvider {
  getAllCourses(): Promise<any[]>;
  getCourseById(courseId: number): Promise<any | null>;
  addCourse(course: any): Promise<any>;
  updateCourse(courseId: number, updates: Record<string, unknown>): Promise<any | null>;
  deleteCourse(courseId: number): Promise<boolean>;
}

const COURSES_FILE = path.resolve("data", "courses.json");

// ── Local JSON implementation ────────────────────────────────────────────────

async function readCoursesFile(): Promise<any[]> {
  const raw = await fs.readFile(COURSES_FILE, "utf-8");
  return JSON.parse(raw);
}

async function writeCoursesFile(courses: any[]): Promise<void> {
  await fs.writeFile(COURSES_FILE, JSON.stringify(courses, null, 2));
}

function nextCourseId(courses: any[]): number {
  let max = 0;
  for (const c of courses) {
    if (typeof c.course_id === "number" && c.course_id > max) max = c.course_id;
  }
  return max + 1;
}

const localCatalogStorage: CatalogStorageProvider = {
  async getAllCourses() {
    return readCoursesFile();
  },

  async getCourseById(courseId) {
    const courses = await readCoursesFile();
    return courses.find((c: any) => c.course_id === courseId) ?? null;
  },

  async addCourse(course) {
    const courses = await readCoursesFile();
    const newCourse = { ...course, course_id: nextCourseId(courses) };
    courses.push(newCourse);
    await writeCoursesFile(courses);
    return newCourse;
  },

  async updateCourse(courseId, updates) {
    const courses = await readCoursesFile();
    const idx = courses.findIndex((c: any) => c.course_id === courseId);
    if (idx === -1) return null;
    courses[idx] = { ...courses[idx], ...updates, course_id: courseId };
    await writeCoursesFile(courses);
    return courses[idx];
  },

  async deleteCourse(courseId) {
    const courses = await readCoursesFile();
    const idx = courses.findIndex((c: any) => c.course_id === courseId);
    if (idx === -1) return false;
    courses.splice(idx, 1);
    await writeCoursesFile(courses);
    return true;
  },
};

// ── Firestore implementation ─────────────────────────────────────────────────

const COURSES_COLLECTION = "courses";
const META_COLLECTION = "catalog_meta";

function getDb() {
  ensureFirebaseApp();
  return getFirestore();
}

let seeded = false;

async function ensureSeeded(): Promise<void> {
  if (seeded) return;

  const db = getDb();
  const metaRef = db.collection(META_COLLECTION).doc("seed_status");
  const metaSnap = await metaRef.get();

  if (metaSnap.exists && metaSnap.data()?.seeded === true) {
    seeded = true;
    return;
  }

  const existing = await db.collection(COURSES_COLLECTION).limit(1).get();
  if (!existing.empty) {
    await metaRef.set({ seeded: true, seeded_at: new Date().toISOString() });
    seeded = true;
    return;
  }

  console.log("[catalogStorage] Seeding Firestore courses collection from courses.json...");
  const courses = await readCoursesFile();

  const BATCH_SIZE = 400;
  for (let i = 0; i < courses.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const slice = courses.slice(i, i + BATCH_SIZE);
    for (const course of slice) {
      const docRef = db.collection(COURSES_COLLECTION).doc(String(course.course_id));
      batch.set(docRef, course);
    }
    await batch.commit();
  }

  await metaRef.set({ seeded: true, seeded_at: new Date().toISOString(), count: courses.length });
  seeded = true;
  console.log(`[catalogStorage] Seeded ${courses.length} courses into Firestore.`);
}

const firestoreCatalogStorage: CatalogStorageProvider = {
  async getAllCourses() {
    await ensureSeeded();
    const db = getDb();
    const snapshot = await db.collection(COURSES_COLLECTION).get();
    return snapshot.docs.map((doc) => doc.data());
  },

  async getCourseById(courseId) {
    await ensureSeeded();
    const db = getDb();
    const doc = await db.collection(COURSES_COLLECTION).doc(String(courseId)).get();
    return doc.exists ? doc.data()! : null;
  },

  async addCourse(course) {
    await ensureSeeded();
    const db = getDb();

    const snapshot = await db
      .collection(COURSES_COLLECTION)
      .orderBy("course_id", "desc")
      .limit(1)
      .get();
    const maxId = snapshot.empty ? 0 : (snapshot.docs[0].data().course_id ?? 0);
    const newId = maxId + 1;

    const newCourse = { ...course, course_id: newId };
    await db.collection(COURSES_COLLECTION).doc(String(newId)).set(newCourse);
    return newCourse;
  },

  async updateCourse(courseId, updates) {
    await ensureSeeded();
    const db = getDb();
    const docRef = db.collection(COURSES_COLLECTION).doc(String(courseId));
    const doc = await docRef.get();
    if (!doc.exists) return null;

    const updated = { ...doc.data(), ...updates, course_id: courseId };
    await docRef.set(updated, { merge: true });
    return updated;
  },

  async deleteCourse(courseId) {
    await ensureSeeded();
    const db = getDb();
    const docRef = db.collection(COURSES_COLLECTION).doc(String(courseId));
    const doc = await docRef.get();
    if (!doc.exists) return false;

    await docRef.delete();
    return true;
  },
};

// ── Provider selection ───────────────────────────────────────────────────────

const useLocal = env.nodeEnv !== "production";

console.log(
  `[catalogStorage] Using ${useLocal ? "local JSON file" : "Firestore"} catalog storage (${env.nodeEnv})`
);

export const catalogStorage: CatalogStorageProvider = useLocal
  ? localCatalogStorage
  : firestoreCatalogStorage;
