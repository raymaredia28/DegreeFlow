import { z } from "zod";

// ── Term code helpers ────────────────────────────────────────────────────────
const TERM_SUFFIX_MAP: Record<string, string> = {
  "11": "Spring",
  "21": "Summer",
  "31": "Fall",
  "41": "Winter"
};

const termCodeToLabel = (code: string): string => {
  const trimmed = code.trim();
  if (trimmed.length === 6) {
    const year = trimmed.slice(0, 4);
    const suffix = trimmed.slice(4);
    const season = TERM_SUFFIX_MAP[suffix];
    if (season) return `${season} ${year}`;
  }
  return trimmed;
};

// ── AI response JSON extraction ──────────────────────────────────────────────
export const extractJsonFromAiResponse = (raw: string): unknown | null => {
  if (!raw || typeof raw !== "string") return null;
  let text = raw.trim();

  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// ── Zod schema for AI output (course-extraction mode) ────────────────────────
const aiCourseSchema = z.object({
  course: z.string(),
  title: z.string().optional().default(""),
  credits: z.union([z.number(), z.string()]).optional(),
  grade: z.string().optional().default(""),
  term: z.string().optional().default(""),
  source: z.string().optional().default(""),
  transfer: z.boolean().optional()
});

const aiExtractionSchema = z.object({
  studentName: z.string().optional(),
  courses: z.array(aiCourseSchema).min(1)
});

// ── Normalize AI output into transcript-compatible { terms, studentName } ────
export const normalizeToTranscriptFormat = (raw: unknown) => {
  const parsed = aiExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "AI output does not match expected course-extraction shape",
      issues: parsed.error.issues
    };
  }

  const data = parsed.data;

  const termMap = new Map<string, {
    label: string;
    status: string;
    courses: Array<{
      code: string;
      title: string;
      credits: number;
      grade: string;
      transfer: boolean;
    }>;
  }>();

  const seenCourseKeys = new Set<string>();

  for (const c of data.courses) {
    const code = c.course.replace(/\s+/g, " ").trim().toUpperCase();
    if (!code) continue;

    const credits = typeof c.credits === "number"
      ? c.credits
      : Number(String(c.credits ?? "0").replace(/[^0-9.]/g, "")) || 0;
    const grade = (c.grade || "").trim().toUpperCase();
    const termCode = (c.term || "").trim();
    const label = termCode ? termCodeToLabel(termCode) : "Unknown Term";
    const sourceUpper = (c.source || "").toUpperCase();
    // Keep this aligned with the frontend conventions used by `isCourseMarkedInProgress`.
    const TRANSFER_GRADES = new Set(["TA", "TB", "TC", "TD", "TF", "TCR", "TIP"]);
    const IN_PROGRESS_GRADES = new Set(["IP", "TIP", "R"]);

    const isTransfer =
      c.transfer === true ||
      sourceUpper === "T" ||
      sourceUpper === "TA" ||
      TRANSFER_GRADES.has(grade);

    // The frontend expects in-progress to be represented as `IP`/`TIP` (not `R`).
    const isInProgress = sourceUpper === "R" || IN_PROGRESS_GRADES.has(grade);

    // Normalize AI grade tokens into frontend-friendly ones.
    // - `R` -> `IP`
    // - if source is `R` but grade is missing, still treat as in-progress
    let normalizedGrade = grade;
    if (normalizedGrade === "R") normalizedGrade = "IP";
    if (sourceUpper === "R" && !normalizedGrade) normalizedGrade = "IP";

    const dedupeKey = `${code}|${label}`;
    if (seenCourseKeys.has(dedupeKey)) continue;
    seenCourseKeys.add(dedupeKey);

    if (!termMap.has(label)) {
      const status = isInProgress ? "In Progress" : (isTransfer ? "Transfer" : "Completed");
      termMap.set(label, { label, status, courses: [] });
    }

    const term = termMap.get(label)!;
    if (isInProgress && term.status !== "In Progress") {
      term.status = "In Progress";
    }

    term.courses.push({
      code,
      title: (c.title || "").trim(),
      credits,
      grade: normalizedGrade,
      transfer: isTransfer
    });
  }

  const termSortKey = (label: string): number => {
    const m = label.match(/(Spring|Summer|Fall|Winter)\s+(\d{4})/);
    if (!m) return 0;
    const year = Number(m[2]);
    const seasonOrder: Record<string, number> = { Spring: 0, Summer: 1, Fall: 2, Winter: 3 };
    return year * 10 + (seasonOrder[m[1]] ?? 0);
  };

  const terms = Array.from(termMap.values())
    .sort((a, b) => termSortKey(a.label) - termSortKey(b.label));

  return {
    ok: true as const,
    normalized: {
      terms,
      studentName: data.studentName || undefined
    }
  };
};

// ── Prompt builder: asks AI to extract courses in a flat list ─────────────────
export const buildDegreeEvaluationPrompt = (lines: string[]) => {
  const snippet = lines.slice(0, 2000).join("\n");
  return [
    "You are extracting course/history data from a TAMU Degree Evaluation PDF text dump.",
    "Your goal is to extract every unique course the student has taken or is currently taking.",
    "",
    "Return ONLY raw JSON. No markdown code fences. No explanation. No prose.",
    "",
    "Use this EXACT shape:",
    "{",
    '  "studentName": "First Last",',
    '  "courses": [',
    "    {",
    '      "course": "CSCE 120",',
    '      "title": "PROGRAM DESIGN & CONCEPTS",',
    '      "credits": 3,',
    '      "grade": "A",',
    '      "term": "202331",',
    '      "source": "H",',
    '      "transfer": false',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- Extract every course that appears in the PDF, from all areas/sections.",
    "- Include the 6-digit term code (e.g. 202331) if present.",
    "- source 'H' = taken at home institution, 'T' = transfer, 'E' = exam/exemption, 'R' = registered/in-progress.",
    "- Set transfer to true if source is 'T' or 'TA'.",
    "- Grade 'TA' means transfer-accepted. 'IP' or 'R' means in-progress.",
    "- If a course appears in multiple areas, include it only ONCE using its first appearance.",
    "- credits should be a number (e.g. 3, not '3.00').",
    "- If a field is missing or unclear, use empty string for strings or 0 for numbers.",
    "- Do NOT invent courses or data not present in the text.",
    "",
    "PDF_TEXT_START",
    snippet,
    "PDF_TEXT_END"
  ].join("\n");
};
