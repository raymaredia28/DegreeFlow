import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { evaluateRequirements } from '../src/requirements/evaluator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

const loadReqSet = async (name) => {
  const raw = JSON.parse(await fs.readFile(path.join(dataDir, 'requirements.json'), 'utf8'));
  const set = raw.find((r) => r.name === name);
  if (!set) throw new Error(`Requirement set not found: ${name}`);
  return set;
};

const makeCourse = (code, credits, grade = 'A') => {
  const [department, number] = code.split(' ');
  return {
    course: {
      department,
      course_number: number,
      credits,
      categories: [],
      course_id: -1
    },
    grade,
    status: 'completed'
  };
};

const run = async () => {
  const tests = [];

  // Math Emphasis (should pass)
  tests.push(async () => {
    const req = await loadReqSet('CSCE Emphasis - Math');
    const studentCourses = [
      makeCourse('MATH 401', 3),
      makeCourse('MATH 447', 3),
      makeCourse('MATH 251', 3),
      makeCourse('MATH 308', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(result.groups[0].satisfied, 'Math emphasis should be satisfied');
  });

  // Math Emphasis should fail if not enough 400-level / credits
  tests.push(async () => {
    const req = await loadReqSet('CSCE Emphasis - Math');
    const studentCourses = [
      makeCourse('MATH 401', 3), // only 3 credits 400-level
      makeCourse('MATH 251', 3),
      makeCourse('MATH 308', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(!result.groups[0].satisfied, 'Math emphasis should fail with insufficient 400-level/credits');
  });

  // Math Minor example should fail (only 13 credits)
  tests.push(async () => {
    const req = await loadReqSet('Minor - Mathematics');
    const studentCourses = [
      makeCourse('MATH 148', 4),
      makeCourse('MATH 251', 3),
      makeCourse('MATH 308', 3),
      makeCourse('MATH 412', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(!result.groups[0].satisfied, 'Math minor should fail when under 16 credits');
  });

  // Math Minor should pass with 16 credits and 1+ 400-level
  tests.push(async () => {
    const req = await loadReqSet('Minor - Mathematics');
    const studentCourses = [
      makeCourse('MATH 152', 4),
      makeCourse('MATH 221', 3),
      makeCourse('MATH 308', 3),
      makeCourse('MATH 412', 3),
      makeCourse('MATH 414', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(result.groups[0].satisfied, 'Math minor should be satisfied with 16 credits and 400-level course');
  });

  // Statistics minor should pass with 3 electives
  tests.push(async () => {
    const req = await loadReqSet('Minor - Statistics');
    const studentCourses = [
      makeCourse('STAT 211', 3),
      makeCourse('STAT 212', 3),
      makeCourse('STAT 315', 3),
      makeCourse('STAT 335', 3),
      makeCourse('STAT 404', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(result.groups[0].satisfied, 'Statistics minor should be satisfied');
  });

  // Business minor should pass with all required courses
  tests.push(async () => {
    const req = await loadReqSet('Minor - Business');
    const studentCourses = [
      makeCourse('ACCT 209', 3),
      makeCourse('MGMT 309', 3),
      makeCourse('FINC 409', 3),
      makeCourse('MKTG 409', 3),
      makeCourse('ISTM 209', 3),
      makeCourse('MGMT 209', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(result.groups[0].satisfied, 'Business minor should be satisfied');
  });

  // Business minor should fail if missing a required course
  tests.push(async () => {
    const req = await loadReqSet('Minor - Business');
    const studentCourses = [
      makeCourse('ACCT 209', 3),
      makeCourse('MGMT 309', 3),
      makeCourse('FINC 409', 3),
      makeCourse('MKTG 409', 3),
      makeCourse('ISTM 209', 3)
      // missing MGMT 209
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(!result.groups[0].satisfied, 'Business minor should fail if any required course is missing');
  });

  // Game Design minor should pass with required pairs and 3 electives
  tests.push(async () => {
    const req = await loadReqSet('Minor - Game Design and Development');
    const studentCourses = [
      makeCourse('CSCE 110', 4),
      makeCourse('CSCE 111', 4),
      makeCourse('CSCE 441', 3),
      makeCourse('CSCE 443', 3),
      makeCourse('COMM 230', 3),
      makeCourse('COMM 453', 3),
      makeCourse('VIST 370', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(result.groups[0].satisfied, 'Game minor should be satisfied');
  });

  // Game Design minor should fail if electives count < 3
  tests.push(async () => {
    const req = await loadReqSet('Minor - Game Design and Development');
    const studentCourses = [
      makeCourse('CSCE 110', 4),
      makeCourse('CSCE 120', 4),
      makeCourse('VIST 386', 3),
      makeCourse('VIST 487', 3),
      makeCourse('COMM 230', 3),
      makeCourse('COMM 453', 3)
      // only 2 electives
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(!result.groups[0].satisfied, 'Game minor should fail with fewer than 3 electives');
  });

  // Cybersecurity emphasis pass
  tests.push(async () => {
    const req = await loadReqSet('CSCE Emphasis - Cybersecurity');
    const studentCourses = [
      makeCourse('CYBR 484', 3),
      makeCourse('ECEN 424', 3),
      makeCourse('ESET 315', 3),
      makeCourse('ITSV 308', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(result.groups[0].satisfied, 'Cybersecurity emphasis should be satisfied');
  });

  // Cybersecurity emphasis fail (insufficient credits)
  tests.push(async () => {
    const req = await loadReqSet('CSCE Emphasis - Cybersecurity');
    const studentCourses = [
      makeCourse('CYBR 484', 3),
      makeCourse('ECEN 424', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(!result.groups[0].satisfied, 'Cybersecurity emphasis should fail under 12 credits');
  });

  // Game emphasis (emphasis) pass
  tests.push(async () => {
    const req = await loadReqSet('CSCE Emphasis - Game');
    const studentCourses = [
      makeCourse('VIST 386', 3),
      makeCourse('VIST 487', 3),
      makeCourse('COMM 230', 3),
      makeCourse('COMM 453', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(result.groups[0].satisfied, 'Game emphasis should be satisfied');
  });

  // Neuroscience emphasis pass
  tests.push(async () => {
    const req = await loadReqSet('CSCE Emphasis - Neuroscience');
    const studentCourses = [
      makeCourse('BIOL 388', 3),
      makeCourse('NRSC 407', 3),
      makeCourse('PBSI 332', 3),
      makeCourse('VIBS 277', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(result.groups[0].satisfied, 'Neuroscience emphasis should be satisfied');
  });

  // Manual emphases should be unsatisfied by default
  tests.push(async () => {
    const req = await loadReqSet('CSCE Emphasis - STEM Areas');
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses: [],
      emphasisCourseIds: new Set()
    });
    assert.ok(!result.groups[0].satisfied, 'Manual STEM emphasis should be unsatisfied');
  });

  // Run tests
  let passed = 0;
  for (const t of tests) {
    await t();
    passed += 1;
  }
  console.log(`✅ evaluator tests passed (${passed}/${tests.length})`);
};

run().catch((err) => {
  console.error('❌ evaluator test failed:', err.message);
  process.exit(1);
});
