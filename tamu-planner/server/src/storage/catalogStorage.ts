import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { ensureFirebaseApp } from "../services/auth.js";
import { getFirestore } from "firebase-admin/firestore";

const ADMIN_SUBJECTS = new Set(["CSCE", "CPEN", "ECEN"]);

export interface CatalogStorageProvider {
  /** All admin-managed courses (CSCE/CPEN/ECEN). Used by admin panel. */
  getAllCourses(): Promise<any[]>;
  /** Full catalog: non-admin subjects from static file + admin subjects from admin store. Used by public API + evaluator. */
  getFullCatalog(): Promise<any[]>;
  getCourseById(courseId: number): Promise<any | null>;
  addCourse(course: any): Promise<any>;
  updateCourse(courseId: number, updates: Record<string, unknown>): Promise<any | null>;
  deleteCourse(courseId: number): Promise<boolean>;
}

// ── Full-catalog cache (shared by both providers) ────────────────────────────

const CATALOG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let cachedFullCatalog: any[] | null = null;
let catalogCacheTime = 0;

export function invalidateCatalogCache(): void {
  cachedFullCatalog = null;
  catalogCacheTime = 0;
}

function getCachedCatalog(): any[] | null {
  if (cachedFullCatalog && Date.now() - catalogCacheTime < CATALOG_CACHE_TTL) {
    return cachedFullCatalog;
  }
  return null;
}

function setCachedCatalog(catalog: any[]): any[] {
  cachedFullCatalog = catalog;
  catalogCacheTime = Date.now();
  return catalog;
}

const COURSES_FILE = path.resolve("data", "courses.json");

const isAdminCourse = (c: any) =>
  ADMIN_SUBJECTS.has(String(c?.primary_subject || "").toUpperCase());

/**
 * Sanitize an object for Firestore:
 * - Strip undefined values (Firestore rejects them)
 * - Convert nested arrays to arrays of objects with a `group` wrapper,
 *   since Firestore does not support arrays within arrays.
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map((item) => {
      if (Array.isArray(item)) {
        return { group: item.map(sanitizeForFirestore) };
      }
      return sanitizeForFirestore(item);
    });
  }
  if (typeof obj === "object") {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        clean[key] = sanitizeForFirestore(value);
      }
    }
    return clean;
  }
  return obj;
}

/**
 * Reverse the Firestore sanitization: unwrap `{group:[...]}` back to
 * nested arrays so the rest of the app sees the original shape.
 */
function deserializeFromFirestore(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map((item) => {
      if (item && typeof item === "object" && "group" in item && Array.isArray(item.group) && Object.keys(item).length === 1) {
        return item.group.map(deserializeFromFirestore);
      }
      return deserializeFromFirestore(item);
    });
  }
  if (typeof obj === "object") {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      clean[key] = deserializeFromFirestore(value);
    }
    return clean;
  }
  return obj;
}

// ── Shared helpers ───────────────────────────────────────────────────────────

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

// ── Local JSON implementation ────────────────────────────────────────────────

const localCatalogStorage: CatalogStorageProvider = {
  async getAllCourses() {
    const courses = await readCoursesFile();
    return courses.filter(isAdminCourse);
  },

  async getFullCatalog() {
    const cached = getCachedCatalog();
    if (cached) return cached;
    return setCachedCatalog(await readCoursesFile());
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
    invalidateCatalogCache();
    return newCourse;
  },

  async updateCourse(courseId, updates) {
    const courses = await readCoursesFile();
    const idx = courses.findIndex((c: any) => c.course_id === courseId);
    if (idx === -1) return null;
    courses[idx] = { ...courses[idx], ...updates, course_id: courseId };
    await writeCoursesFile(courses);
    invalidateCatalogCache();
    return courses[idx];
  },

  async deleteCourse(courseId) {
    const courses = await readCoursesFile();
    const idx = courses.findIndex((c: any) => c.course_id === courseId);
    if (idx === -1) return false;
    courses.splice(idx, 1);
    await writeCoursesFile(courses);
    invalidateCatalogCache();
    return true;
  },
};

// ── Firestore implementation (CSCE courses only) ─────────────────────────────

const COURSES_COLLECTION = "courses";
const META_COLLECTION = "catalog_meta";

function getDb() {
  ensureFirebaseApp();
  return getFirestore();
}

let seeded = false;

async function ensureSeeded(): Promise<void> {
  if (seeded) return;

  try {
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

    const subjectsLabel = [...ADMIN_SUBJECTS].join("/");
    console.log(`[catalogStorage] Seeding Firestore with ${subjectsLabel} courses from courses.json...`);
    const allCourses = await readCoursesFile();
    const adminCourses = allCourses.filter(isAdminCourse);
    console.log(`[catalogStorage] Found ${adminCourses.length} ${subjectsLabel} courses (of ${allCourses.length} total), writing to Firestore...`);

    const BATCH_SIZE = 400;
    for (let i = 0; i < adminCourses.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const slice = adminCourses.slice(i, i + BATCH_SIZE);
      for (const course of slice) {
        const docRef = db.collection(COURSES_COLLECTION).doc(String(course.course_id));
        batch.set(docRef, sanitizeForFirestore(course));
      }
      await batch.commit();
      console.log(`[catalogStorage] Seeded batch ${Math.floor(i / BATCH_SIZE) + 1} (${Math.min(i + BATCH_SIZE, adminCourses.length)}/${adminCourses.length})`);
    }

    await metaRef.set({ seeded: true, seeded_at: new Date().toISOString(), count: adminCourses.length });
    seeded = true;
    console.log(`[catalogStorage] Seeded ${adminCourses.length} ${subjectsLabel} courses into Firestore.`);
  } catch (err) {
    console.error("[catalogStorage] ensureSeeded FAILED:", err);
    throw err;
  }
}

/** Read admin-managed courses (CSCE/CPEN/ECEN) from Firestore. */
async function getFirestoreAdminCourses(): Promise<any[]> {
  await ensureSeeded();
  const db = getDb();
  const snapshot = await db.collection(COURSES_COLLECTION).get();
  return snapshot.docs.map((doc) => deserializeFromFirestore(doc.data()));
}

const firestoreCatalogStorage: CatalogStorageProvider = {
  async getAllCourses() {
    return getFirestoreAdminCourses();
  },

  async getFullCatalog() {
    const cached = getCachedCatalog();
    if (cached) return cached;

    const allStatic = await readCoursesFile();
    const adminCourses = await getFirestoreAdminCourses();

    const adminById = new Map(adminCourses.map((c: any) => [c.course_id, c]));
    const nonAdmin = allStatic.filter((c: any) => !isAdminCourse(c));
    return setCachedCatalog([...nonAdmin, ...adminById.values()]);
  },

  async getCourseById(courseId) {
    await ensureSeeded();
    const db = getDb();
    const doc = await db.collection(COURSES_COLLECTION).doc(String(courseId)).get();
    return doc.exists ? deserializeFromFirestore(doc.data()!) : null;
  },

  async addCourse(course) {
    await ensureSeeded();
    const db = getDb();

    const snapshot = await db
      .collection(COURSES_COLLECTION)
      .orderBy("course_id", "desc")
      .limit(1)
      .get();

    const allStatic = await readCoursesFile();
    const maxStaticId = nextCourseId(allStatic) - 1;
    const maxFirestoreId = snapshot.empty ? 0 : (snapshot.docs[0].data().course_id ?? 0);
    const newId = Math.max(maxStaticId, maxFirestoreId) + 1;

    const newCourse = { ...course, course_id: newId };
    await db.collection(COURSES_COLLECTION).doc(String(newId)).set(sanitizeForFirestore(newCourse));
    invalidateCatalogCache();
    return newCourse;
  },

  async updateCourse(courseId, updates) {
    await ensureSeeded();
    const db = getDb();
    const docRef = db.collection(COURSES_COLLECTION).doc(String(courseId));
    const doc = await docRef.get();
    if (!doc.exists) return null;

    const updated = { ...deserializeFromFirestore(doc.data()), ...updates, course_id: courseId };
    await docRef.set(sanitizeForFirestore(updated), { merge: true });
    invalidateCatalogCache();
    return updated;
  },

  async deleteCourse(courseId) {
    await ensureSeeded();
    const db = getDb();
    const docRef = db.collection(COURSES_COLLECTION).doc(String(courseId));
    const doc = await docRef.get();
    if (!doc.exists) return false;

    await docRef.delete();
    invalidateCatalogCache();
    return true;
  },
};

// ── Provider selection ───────────────────────────────────────────────────────

const useLocal = env.nodeEnv !== "production";

console.log(
  `[catalogStorage] Using ${useLocal ? "local JSON file" : `Firestore (${[...ADMIN_SUBJECTS].join("/")})`} catalog storage (${env.nodeEnv})`
);

export const catalogStorage: CatalogStorageProvider = useLocal
  ? localCatalogStorage
  : firestoreCatalogStorage;
