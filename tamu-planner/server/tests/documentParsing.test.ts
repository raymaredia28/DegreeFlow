import assert from "assert";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { detectDocumentType } from "../src/services/documentType.js";
import {
  normalizeToTranscriptFormat,
  extractJsonFromAiResponse
} from "../src/services/degreeEvaluationParser.js";

const transcriptLines = [
  "Subj No. Course Title",
  "Fall 2023",
  "TOTAL INSTITUTION 90.000 85.000 300.000 3.50",
  "OVERALL 100.000 95.000 330.000 3.47"
];

const degreeEvalLines = [
  "Texas A&M University Degree Evaluation",
  "Program Requirements",
  "Areas",
  "Met Credits: 30 | Planned Credits: 0 | Unmet Credits: 0",
  "Work Not Applied (0) (Met)"
];

const run = async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const storageRoutePath = path.join(__dirname, "..", "src", "routes", "storage.ts");
  const storageRouteSource = await fs.readFile(storageRoutePath, "utf8");
  assert.ok(
    storageRouteSource.includes("scripts/parse_transcript.py"),
    "Transcript parsing route should keep Python parser path"
  );

  // ── Document type detection ──
  const transcript = detectDocumentType(transcriptLines);
  assert.strictEqual(transcript.documentType, "transcript", "Transcript markers should detect transcript");

  const degreeEval = detectDocumentType(degreeEvalLines);
  assert.strictEqual(
    degreeEval.documentType,
    "degree-evaluation",
    "Degree evaluation markers should detect degree-evaluation"
  );

  // ── normalizeToTranscriptFormat: valid input ──
  const normalized = normalizeToTranscriptFormat({
    studentName: "Test Student",
    courses: [
      {
        course: "CSCE 120",
        title: "PROGRAM DESIGN & CONCEPTS",
        credits: 3,
        grade: "A",
        term: "202331",
        source: "H",
        transfer: false
      },
      {
        course: "CSCE 221",
        title: "DATA STRUC & ALGORITHMS",
        credits: 4,
        grade: "A",
        term: "202411",
        source: "H"
      },
      {
        course: "ENGL 103",
        title: "INTRO TO COMP & RHET",
        credits: 3,
        grade: "TA",
        term: "202031",
        source: "T",
        transfer: true
      },
      {
        course: "CSCE 482",
        title: "SR CAPSTONE DESIGN",
        credits: 3,
        grade: "R",
        term: "202611",
        source: "R"
      },
      {
        course: "MATH 151",
        title: "ENGINEERING MATH I",
        credits: 4,
        // Missing grade but home-institution source should not be treated as in-progress.
        grade: "",
        term: "202431",
        source: "H",
        transfer: false
      },
      {
        course: "CSCE 199",
        title: "SPECIAL TOPICS",
        credits: 1,
        // Missing grade but registered source should be treated as in-progress.
        grade: "",
        term: "202511",
        source: "R"
      },
      {
        course: "HIST 110",
        title: "MODERN HISTORY",
        credits: 3,
        // Transfer should be detected from source 'TA' even if transfer boolean is missing/false.
        grade: "",
        term: "202031",
        source: "TA",
        transfer: false
      }
    ]
  });

  assert.ok(normalized.ok, "Valid course data should normalize");
  if (normalized.ok) {
    const { terms, studentName } = normalized.normalized;
    assert.strictEqual(studentName, "Test Student");
    assert.ok(terms.length >= 3, `Expected at least 3 terms, got ${terms.length}`);

    const fall2023 = terms.find(t => t.label === "Fall 2023");
    assert.ok(fall2023, "Should have Fall 2023 term");
    assert.strictEqual(fall2023!.courses.length, 1);
    assert.strictEqual(fall2023!.courses[0].code, "CSCE 120");
    assert.strictEqual(fall2023!.courses[0].credits, 3);
    assert.strictEqual(fall2023!.courses[0].grade, "A");
    assert.strictEqual(fall2023!.courses[0].transfer, false);

    const transfer = terms.find(t => t.label === "Fall 2020");
    assert.ok(transfer, "Should have Fall 2020 term for transfer course");
    assert.ok(
      transfer!.courses.some((c) => c.code === "ENGL 103" && c.transfer === true),
      "Transfer should be recognized for ENGL 103"
    );
    assert.ok(
      transfer!.courses.some((c) => c.code === "HIST 110" && c.transfer === true),
      "Transfer should be recognized from source 'TA' (HIST 110)"
    );

    const inProgress = terms.find(t => t.label === "Spring 2026");
    assert.ok(inProgress, "Should have Spring 2026 term for in-progress course");
    assert.strictEqual(inProgress!.status, "In Progress");
    assert.ok(
      inProgress!.courses.some((c) => c.code === "CSCE 482" && c.grade === "IP"),
      "Degree-eval grade token 'R' should be normalized to 'IP'"
    );

    const spring2025 = terms.find(t => t.label === "Spring 2025");
    assert.ok(spring2025, "Should have Spring 2025 term for in-progress course with missing grade");
    assert.strictEqual(spring2025!.status, "In Progress");
    assert.ok(
      spring2025!.courses.some((c) => c.code === "CSCE 199" && c.grade === "IP"),
      "Missing grade with source 'R' should normalize to in-progress 'IP'"
    );

    const fall2024 = terms.find(t => t.label === "Fall 2024");
    assert.ok(fall2024, "Should have Fall 2024 term for completed course with missing grade");
    assert.notStrictEqual(fall2024!.status, "In Progress");
    assert.ok(
      fall2024!.courses.some((c) => c.code === "MATH 151" && (c.grade === "" || c.grade === undefined)),
      "Missing grade with home-institution source should remain grade-less (not in-progress)"
    );
  }

  // ── normalizeToTranscriptFormat: deduplication ──
  const dupeTest = normalizeToTranscriptFormat({
    courses: [
      { course: "CSCE 120", credits: 3, grade: "A", term: "202331" },
      { course: "CSCE 120", credits: 3, grade: "A", term: "202331" }
    ]
  });
  assert.ok(dupeTest.ok);
  if (dupeTest.ok) {
    const total = dupeTest.normalized.terms.reduce((s, t) => s + t.courses.length, 0);
    assert.strictEqual(total, 1, "Duplicate courses should be deduplicated");
  }

  // ── normalizeToTranscriptFormat: invalid input ──
  const invalid = normalizeToTranscriptFormat({ courses: [] });
  assert.ok(!invalid.ok, "Empty courses should be rejected");

  const noArray = normalizeToTranscriptFormat({ studentName: "Test" });
  assert.ok(!noArray.ok, "Missing courses array should be rejected");

  // ── extractJsonFromAiResponse robustness tests ──
  const plainJson = '{"studentName":"Test","courses":[{"course":"CSCE 120","credits":3}]}';
  assert.deepStrictEqual(
    extractJsonFromAiResponse(plainJson),
    JSON.parse(plainJson),
    "Plain JSON string should parse"
  );

  const fencedJson = '```json\n' + plainJson + '\n```';
  assert.deepStrictEqual(
    extractJsonFromAiResponse(fencedJson),
    JSON.parse(plainJson),
    "Markdown-fenced JSON should parse"
  );

  const proseWrapped = 'Here is the result:\n```json\n' + plainJson + '\n```\nLet me know if you need more.';
  assert.deepStrictEqual(
    extractJsonFromAiResponse(proseWrapped),
    JSON.parse(plainJson),
    "JSON wrapped in prose + fences should parse"
  );

  const noFenceProse = 'Sure, here is the JSON:\n' + plainJson + '\nDone.';
  assert.deepStrictEqual(
    extractJsonFromAiResponse(noFenceProse),
    JSON.parse(plainJson),
    "JSON with leading/trailing prose but no fences should parse via brace extraction"
  );

  assert.strictEqual(extractJsonFromAiResponse(""), null, "Empty string returns null");
  assert.strictEqual(extractJsonFromAiResponse("no json here"), null, "Non-JSON text returns null");
  assert.strictEqual(extractJsonFromAiResponse("```json\nnot valid{```"), null, "Malformed fenced content returns null");

  // ── Verify route returns transcript-format (terms) not degreeResult ──
  assert.ok(
    storageRouteSource.includes("normalizeToTranscriptFormat"),
    "Route should use normalizeToTranscriptFormat"
  );
  assert.ok(
    !storageRouteSource.includes("normalizeDegreeEvaluation"),
    "Route should NOT use old normalizeDegreeEvaluation"
  );

  console.log("✅ document parsing tests passed");
};

run().catch((err) => {
  console.error("❌ document parsing test failed:", err.message);
  process.exit(1);
});
