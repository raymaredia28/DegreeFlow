import fs from "node:fs/promises";
import path from "node:path";

const defaultPath = path.resolve(process.env.LOCAL_DB_PATH ?? "./data/local-db.json");

export type LoginCredential = {
  credential_id: number;
  user_id: number;
  username: string;
  password_hash: string;
  last_login_at: string;
};

export type Student = {
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
};

export type EmphasisArea = {
  emphasis_id: number;
  emphasis_name: string;
};

export type Minor = {
  minor_id: number;
  minor_name: string;
};

export type Course = {
  course_id: number;
  department: string;
  course_number: string;
  title: string;
  credits: number;
};

export type StudentEmphasis = {
  student_emphasis_id: number;
  user_id: number;
  emphasis_id: number;
  catalog_year: string;
};

export type StudentCourse = {
  entry_id: number;
  user_id: number;
  course_id: number;
  student_emphasis_id?: number | null;
  term: string;
  year: number;
  grade: string;
  status: string;
};

export type CourseEmphasis = {
  course_emphasis_id: number;
  course_id: number;
  emphasis_id: number;
};

export type CourseMinor = {
  course_minor_id: number;
  course_id: number;
  minor_id: number;
};

export type PlannerState = {
  id: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  payload: unknown;
};

export type TranscriptCourse = {
  code: string;
  title: string;
  credits: number;
  grade: string;
  transfer?: boolean;
};

export type TranscriptTerm = {
  label: string;
  status: string;
  courses: TranscriptCourse[];
};

export type TranscriptTotals = {
  institution?: { gpa?: string; qualityPoints?: string; earnedHours?: string; gpaHours?: string };
  transfer?: { gpa?: string; qualityPoints?: string; earnedHours?: string; gpaHours?: string };
  overall?: { gpa?: string; qualityPoints?: string; earnedHours?: string; gpaHours?: string };
};

type LocalDb = {
  login_credentials: LoginCredential[];
  students: Student[];
  emphasis_areas: EmphasisArea[];
  minors: Minor[];
  courses: Course[];
  student_emphasis: StudentEmphasis[];
  student_courses: StudentCourse[];
  course_emphasis: CourseEmphasis[];
  course_minor: CourseMinor[];
  planner_states: PlannerState[];
};

const COURSE_CODE_REGEX = /([A-Z]{2,4})\s+(\d{3})/;

async function readDb(dbPath = defaultPath): Promise<LocalDb> {
  const raw = await fs.readFile(dbPath, "utf-8");
  return JSON.parse(raw) as LocalDb;
}

async function writeDb(next: LocalDb, dbPath = defaultPath): Promise<void> {
  await fs.writeFile(dbPath, JSON.stringify(next, null, 2));
}

function nextId(items: Array<Record<string, unknown>>, key: string) {
  const values = items.map((i) => Number(i[key] ?? 0)).filter((v) => Number.isFinite(v));
  return values.length ? Math.max(...values) + 1 : 1;
}

function splitName(name?: string) {
  if (!name) return { first: "", last: "" };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export async function getOrCreateStudent(input: {
  email?: string;
  name?: string;
}): Promise<Student> {
  const db = await readDb();
  const existing = input.email
    ? db.students.find((s) => s.email.toLowerCase() === input.email?.toLowerCase())
    : undefined;
  if (existing) return existing;

  const { first, last } = splitName(input.name);
  const record: Student = {
    user_id: nextId(db.students, "user_id"),
    first_name: first,
    last_name: last,
    email: input.email ?? ""
  };
  db.students.push(record);
  await writeDb(db);
  return record;
}

export async function saveTranscriptTerms(studentId: number, terms: TranscriptTerm[]) {
  const db = await readDb();

  db.student_courses = db.student_courses.filter((entry) => entry.user_id !== studentId);

  terms.forEach((term) => {
    const [termName, yearStr] = term.label.split(" ");
    const year = Number(yearStr);

    term.courses.forEach((course) => {
      const codeMatch = course.code.match(COURSE_CODE_REGEX);
      if (!codeMatch) return;
      const [, department, courseNumber] = codeMatch;

      let courseRecord = db.courses.find(
        (c) => c.department === department && c.course_number === courseNumber
      );
      if (!courseRecord) {
        courseRecord = {
          course_id: nextId(db.courses, "course_id"),
          department,
          course_number: courseNumber,
          title: course.title,
          credits: course.credits
        };
        db.courses.push(courseRecord);
      }

      const status = term.status
        ? term.status
        : course.grade === "IP"
          ? "In Progress"
          : course.grade === "TA"
            ? "Transfer"
            : "Evaluated";

      db.student_courses.push({
        entry_id: nextId(db.student_courses, "entry_id"),
        user_id: studentId,
        course_id: courseRecord.course_id,
        student_emphasis_id: null,
        term: termName,
        year: Number.isFinite(year) ? year : new Date().getFullYear(),
        grade: course.grade,
        status
      });
    });
  });

  await writeDb(db);
}

export async function getTranscriptForStudent(studentId: number) {
  const db = await readDb();
  const entries = db.student_courses.filter((e) => e.user_id === studentId);
  if (!entries.length) return [] as TranscriptTerm[];

  const coursesById = new Map(db.courses.map((c) => [c.course_id, c]));
  const termsMap = new Map<string, TranscriptTerm>();

  entries.forEach((entry) => {
    const course = coursesById.get(entry.course_id);
    if (!course) return;
    const label = `${entry.term} ${entry.year}`;
    if (!termsMap.has(label)) {
      termsMap.set(label, {
        label,
        status: entry.status || "Evaluated",
        courses: []
      });
    }
    const term = termsMap.get(label);
    term?.courses.push({
      code: `${course.department} ${course.course_number}`,
      title: course.title,
      credits: course.credits,
      grade: entry.grade,
      transfer: entry.grade === "TA"
    });
    if (term && entry.status === "In Progress") {
      term.status = "In Progress";
    }
  });

  return Array.from(termsMap.values()).sort((a, b) => {
    const [aTerm, aYearStr] = a.label.split(" ");
    const [bTerm, bYearStr] = b.label.split(" ");
    if (aYearStr !== bYearStr) return Number(aYearStr) - Number(bYearStr);
    const order: Record<string, number> = { Spring: 0, Summer: 1, Fall: 2, Winter: 3 };
    return (order[aTerm] ?? 9) - (order[bTerm] ?? 9);
  });
}

export async function savePlannerState(userId: number, payload: unknown) {
  const db = await readDb();
  const existing = db.planner_states.find((p) => p.user_id === userId);
  const now = new Date().toISOString();

  if (existing) {
    existing.payload = payload;
    existing.updated_at = now;
    await writeDb(db);
    return existing;
  }

  const next: PlannerState = {
    id: `planner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    user_id: userId,
    created_at: now,
    updated_at: now,
    payload
  };
  db.planner_states.push(next);
  await writeDb(db);
  return next;
}

export async function getPlannerState(userId: number) {
  const db = await readDb();
  return db.planner_states.find((p) => p.user_id === userId) ?? null;
}
