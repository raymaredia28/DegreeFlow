import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
// @ts-ignore – plain JS module, no type declarations
import { evaluateRequirements } from "../requirements/evaluator.js";

export const catalogRouter = Router();

const dataDir = path.resolve("data");

const loadJson = async (filename: string) => {
  const filePath = path.join(dataDir, filename);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
};

// ── Catalog endpoints (read-only JSON) ──────────────────────────────────────

catalogRouter.get("/api/courses", async (_req, res, next) => {
  try {
    const courses = await loadJson("courses.json");
    res.json({ courses });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get("/api/minors", async (_req, res, next) => {
  try {
    const minors = await loadJson("minors.json");
    res.json({ minors });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get("/api/emphases", async (_req, res, next) => {
  try {
    const emphases = await loadJson("emphasis_areas.json");
    res.json({ emphases });
  } catch (err) {
    next(err);
  }
});

// ── Requirements evaluation ─────────────────────────────────────────────────

interface CourseEntry {
  department?: string;
  course_number?: string;
  credits?: number;
  grade?: string | null;
  status?: string;
}

catalogRouter.post("/api/requirements/evaluate-local", async (req, res, next) => {
  try {
    const {
      catalogYear = null,
      courses = [],
      emphasisId = null,
      minorId = null,
    } = req.body || {};

    const requirementSets = await loadJson("requirements.json");

    const inferType = (name = "") => {
      if (name.startsWith("Minor -")) return "minor";
      if (name.startsWith("CSCE Emphasis")) return "emphasis";
      return "degree";
    };

    let requirementSet: any = null;

    if (emphasisId) {
      const emphases = await loadJson("emphasis_areas.json").catch(() => []);
      const match = emphases.find((e: any) => e.emphasis_id === emphasisId);
      if (match?.name || match?.emphasis_name) {
        const targetName = `CSCE Emphasis - ${match.name || match.emphasis_name}`;
        requirementSet =
          requirementSets.find((r: any) => r.name === targetName) ||
          requirementSet;
      }
    }

    if (!requirementSet && minorId) {
      const minors = await loadJson("minors.json").catch(() => []);
      const match = minors.find((m: any) => m.minor_id === minorId);
      if (match?.name || match?.minor_name) {
        const targetName = `Minor - ${match.name || match.minor_name}`;
        requirementSet =
          requirementSets.find((r: any) => r.name === targetName) ||
          requirementSet;
      }
    }

    if (!requirementSet && catalogYear) {
      requirementSet =
        requirementSets.find((r: any) => r.catalog_year === catalogYear) || null;
    }

    if (!requirementSet) {
      requirementSet =
        requirementSets.find((r: any) => inferType(r.name) === "degree") || null;
    }

    if (!requirementSet && requirementSets.length > 0) {
      requirementSet = requirementSets[0];
    }

    if (!requirementSet) {
      return res.status(404).json({ error: "Requirement set not found" });
    }

    const allCourses = await loadJson("courses.json");
    const courseIndex = new Map(
      allCourses.map((c: any) => [
        c.code || `${c.department} ${c.course_number}`,
        c,
      ])
    );

    const studentCourses = (courses as CourseEntry[]).map((entry) => {
      const code =
        `${(entry.department || "").toUpperCase()} ${String(entry.course_number || "").trim()}`.trim();
      const catalogCourse: any = courseIndex.get(code) || {};
      return {
        course: {
          course_id: catalogCourse.course_id ?? -1,
          department: catalogCourse.department ?? entry.department ?? "",
          course_number:
            catalogCourse.course_number ?? entry.course_number ?? "",
          credits: entry.credits ?? catalogCourse.credits ?? 0,
          categories: catalogCourse.categories || [],
        },
        grade: entry.grade || null,
        status: entry.status || "completed",
      };
    });

    const emphasisCourseIds = new Set<number>();
    if (emphasisId) {
      const courseEmphasis = await loadJson("course_emphasis.json").catch(
        () => []
      );
      courseEmphasis
        .filter((ce: any) => ce.emphasis_id === emphasisId)
        .forEach((ce: any) => emphasisCourseIds.add(ce.course_id));
    }

    const result = evaluateRequirements({
      requirementSet,
      studentCourses,
      emphasisCourseIds,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});
