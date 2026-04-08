import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
// @ts-ignore – plain JS module, no type declarations
import { evaluateRequirements } from "../requirements/evaluator.js";
import { catalogStorage } from "../storage/catalogStorage.js";

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
    const courses = await catalogStorage.getFullCatalog();
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
  categories?: string[];
}

/** Normalize a raw course code string to "DEPT NNN" form. */
const normCode = (raw: string) =>
  String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

/**
 * Build a Set of course IDs that are eligible for a given emphasis area
 * directly from the emphasis area's rules — no course_emphasis.json needed.
 */
const buildEmphasisCourseIds = (
  emphasisData: any,
  catalogIndex: Map<string, any>
): Set<number> => {
  const ids = new Set<number>();
  const rules = emphasisData?.rules || {};

  const addByCode = (code: string) => {
    const c = catalogIndex.get(normCode(code));
    if (c?.course_id != null && c.course_id !== -1) ids.add(c.course_id);
  };

  // Explicit required / allowed courses
  (rules.required_courses || []).forEach(addByCode);
  (rules.special_allow || []).forEach(addByCode);
  (rules.max_lower_level_overflow?.courses || []).forEach(addByCode);

  // Department + level-based rules (e.g. any MATH 400+)
  if ((rules.allowed_departments || []).length > 0) {
    const minLevel: number = rules.min_level ?? 0;
    const excluded = new Set(
      (rules.excluded_courses || []).map((c: string) => normCode(c))
    );
    for (const [code, c] of catalogIndex) {
      const deptCode =
        typeof c.department === "object" ? c.department?.code : c.department;
      const num = parseInt(
        String(c.primary_number ?? c.course_number ?? "0"),
        10
      );
      if (
        rules.allowed_departments.includes(deptCode) &&
        num >= minLevel &&
        !excluded.has(code) &&
        c.course_id != null
      ) {
        ids.add(c.course_id);
      }
    }
  }

  return ids;
};

/**
 * Extract eligible course IDs from an emphasis requirement set in
 * requirements.json by walking its groups' pools, allOf, anyOf, and items.
 * This covers emphasis areas whose emphasis_areas.json rules aren't fully
 * handled by buildEmphasisCourseIds (e.g. source_minor-based emphases).
 */
const extractCourseIdsFromRequirementSet = (
  reqSet: any,
  catalogIndex: Map<string, any>
): Set<number> => {
  const ids = new Set<number>();

  const addByCode = (code: string) => {
    const c = catalogIndex.get(normCode(code));
    if (c?.course_id != null && c.course_id !== -1) ids.add(c.course_id);
  };

  for (const group of reqSet.groups || []) {
    const rules = group.rules;
    if (!rules) continue;

    if (Array.isArray(rules.pool)) {
      rules.pool.forEach((c: string) => addByCode(c));
    }

    if (Array.isArray(rules.allOf)) {
      rules.allOf.forEach((c: string) => {
        if (typeof c === "string") addByCode(c);
      });
    }

    if (Array.isArray(rules.items)) {
      for (const item of rules.items) {
        if (item.course) addByCode(item.course);
        if (Array.isArray(item.pool)) {
          item.pool.forEach((c: string) => addByCode(c));
        }
        if (Array.isArray(item.anyOf)) {
          item.anyOf.forEach((opt: any) => {
            if (typeof opt === "string") addByCode(opt);
          });
        }
      }
    }
  }

  return ids;
};

catalogRouter.post("/api/requirements/evaluate-local", async (req, res, next) => {
  try {
    const {
      catalogYear = null,
      courses = [],
      emphasisId = null,
      // degreeEmphasisId: pass this when evaluating the *degree* requirement set
      // but still need emphasis courses for the emphasisCredits sub-rule.
      degreeEmphasisId = null,
      // degreeMinorId: pass this when evaluating the *degree* requirement set
      // but still need minor-applied courses excluded from Work Not Applied.
      degreeMinorId = null,
      minorId = null,
      hasHsLanguage = false,
      hasSabrCourse = false,
    } = req.body || {};

    const requirementSets = await loadJson("requirements.json");
    const emphases: any[] = await loadJson("emphasis_areas.json").catch(() => []);
    const minors: any[] = await loadJson("minors.json").catch(() => []);

    const inferType = (name = "") => {
      if (name.startsWith("Minor -")) return "minor";
      if (name.startsWith("CSCE Emphasis")) return "emphasis";
      return "degree";
    };

    let requirementSet: any = null;

    if (emphasisId) {
      const match = emphases.find((e: any) => e.emphasis_id === emphasisId);
      if (match?.name || match?.emphasis_name) {
        const targetName = `CSCE Emphasis - ${match.name || match.emphasis_name}`;
        requirementSet =
          requirementSets.find((r: any) => r.name === targetName) ||
          requirementSet;
      }
    }

    if (!requirementSet && minorId) {
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

    const allCourses = await catalogStorage.getFullCatalog();

    // Build catalog index keyed by the primary course code (e.g. "ACCT 209").
    // courses.json stores the code in c.codes[0] or via primary_subject/primary_number.
    const catalogIndex = new Map<string, any>();
    for (const c of allCourses) {
      const primaryCode = Array.isArray(c.codes) && c.codes.length > 0
        ? normCode(c.codes[0])
        : normCode(`${c.primary_subject || ""} ${c.primary_number || ""}`);
      if (primaryCode) catalogIndex.set(primaryCode, c);
      // Also index any aliases
      for (const alias of c.aliases || []) {
        const aliasCode = normCode(alias);
        if (aliasCode && !catalogIndex.has(aliasCode)) catalogIndex.set(aliasCode, c);
      }
    }

    const studentCourses = (courses as CourseEntry[]).map((entry) => {
      const code = normCode(
        `${entry.department || ""} ${entry.course_number || ""}`
      );
      const catalogCourse: any = catalogIndex.get(code) || {};
      const mergedCategories = Array.from(
        new Set([...(catalogCourse.categories || []), ...(entry.categories || [])])
      );
      return {
        course: {
          course_id: catalogCourse.course_id ?? -1,
          department: catalogCourse.primary_subject ?? entry.department ?? "",
          course_number:
            catalogCourse.primary_number ?? entry.course_number ?? "",
          credits: entry.credits ?? catalogCourse.credits ?? 0,
          categories: mergedCategories,
        },
        grade: entry.grade || null,
        status: entry.status || "completed",
      };
    });

    // Build emphasis course IDs from emphasis area rules.
    // Works for both the emphasis requirement set evaluation AND the degree
    // evaluation (which has an emphasisCredits sub-rule in Supporting Coursework).
    const emphasisCourseIds = new Set<number>();
    const emphasisLookupId = emphasisId ?? degreeEmphasisId;
    if (emphasisLookupId) {
      const match = emphases.find((e: any) => e.emphasis_id === emphasisLookupId);
      if (match) {
        buildEmphasisCourseIds(match, catalogIndex).forEach((id) =>
          emphasisCourseIds.add(id)
        );

        // Supplement from the matching emphasis requirement set's pools in
        // requirements.json — fills the gap for emphases whose
        // emphasis_areas.json rules use source_minor (Cybersecurity, Game,
        // Neuroscience) and aren't covered by buildEmphasisCourseIds.
        const emphasisName = match.name || match.emphasis_name;
        const targetName = `CSCE Emphasis - ${emphasisName}`;
        const emphasisReqSet = requirementSets.find(
          (r: any) => r.name === targetName
        );
        if (emphasisReqSet) {
          extractCourseIdsFromRequirementSet(emphasisReqSet, catalogIndex).forEach(
            (id) => emphasisCourseIds.add(id)
          );
        }
      }
    }

    const collectUsedCodes = (result: any): Set<string> => {
      const used = new Set<string>();
      (result?.groups || []).forEach((group: any) => {
        (group?.usedCourses || []).forEach((code: string) => {
          const normalized = normCode(code);
          if (normalized) used.add(normalized);
        });
      });
      return used;
    };

    const externallyAppliedCodes = new Set<string>();
    const isDegreeEvaluation = inferType(requirementSet.name) === "degree";

    // When evaluating the degree requirement set, also treat courses used by the
    // selected minor/emphasis requirement sets as "applied" so Work Not Applied
    // reflects true excess-only courses across all active requirement contexts.
    if (isDegreeEvaluation) {
      if (degreeMinorId) {
        const minorMatch = minors.find((m: any) => m.minor_id === degreeMinorId);
        if (minorMatch?.name || minorMatch?.minor_name) {
          const minorSetName = `Minor - ${minorMatch.name || minorMatch.minor_name}`;
          const minorReqSet = requirementSets.find((r: any) => r.name === minorSetName);
          if (minorReqSet) {
            const minorEval = evaluateRequirements({
              requirementSet: minorReqSet,
              studentCourses,
              emphasisCourseIds: new Set<number>(),
              hasHsLanguage: Boolean(hasHsLanguage),
              hasSabrCourse: Boolean(hasSabrCourse),
            });
            collectUsedCodes(minorEval).forEach((code) => externallyAppliedCodes.add(code));
          }
        }
      }

      if (degreeEmphasisId) {
        const emphasisMatch = emphases.find((e: any) => e.emphasis_id === degreeEmphasisId);
        if (emphasisMatch?.name || emphasisMatch?.emphasis_name) {
          const emphasisSetName = `CSCE Emphasis - ${emphasisMatch.name || emphasisMatch.emphasis_name}`;
          const emphasisReqSet = requirementSets.find((r: any) => r.name === emphasisSetName);
          if (emphasisReqSet) {
            const emphasisEval = evaluateRequirements({
              requirementSet: emphasisReqSet,
              studentCourses,
              emphasisCourseIds,
              hasHsLanguage: Boolean(hasHsLanguage),
              hasSabrCourse: Boolean(hasSabrCourse),
            });
            collectUsedCodes(emphasisEval).forEach((code) => externallyAppliedCodes.add(code));
          }
        }
      }
    }

    const externallyAppliedCodeList: string[] = Array.from(externallyAppliedCodes);

    const result = evaluateRequirements({
      requirementSet,
      studentCourses,
      emphasisCourseIds,
      hasHsLanguage: Boolean(hasHsLanguage),
      hasSabrCourse: Boolean(hasSabrCourse),
      externallyAppliedCodes: externallyAppliedCodeList as any,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});
