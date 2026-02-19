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

const makeTaggedCourse = (code, credits, categories, grade = 'A') => {
  const [department, number] = code.split(' ');
  return {
    course: {
      department,
      course_number: number,
      credits,
      categories,
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

  // KLPC should pass with a single approved pool course
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeCourse('ENGL 221', 3)];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name === 'Language, Philosophy & Culture (3 credits)');
    assert.ok(group?.satisfied, 'KLPC should be satisfied by one approved course');
  });

  // Social & Behavioral should pass with a single approved pool course
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeCourse('COMM 365', 3)];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name === 'Social and Behavioral Sciences (3 credits)');
    assert.ok(group?.satisfied, 'Social and Behavioral Sciences should be satisfied by one approved course');
  });

  // ICD should pass with a single approved pool course
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeCourse('IBUS 430', 3)];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name === 'International and Cultural Diversity (3 credits)');
    assert.ok(group?.satisfied, 'ICD should be satisfied by one approved course');
  });

  // Cultural Discourse should pass with a single approved pool course
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeCourse('COMM 257', 3)];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name === 'Cultural Discourse (3 credits)');
    assert.ok(group?.satisfied, 'Cultural Discourse should be satisfied by one approved course');
  });

  // Citizenship should pass with POLS 206/207 plus two approved history courses
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [
      makeCourse('POLS 206', 3),
      makeCourse('POLS 207', 3),
      makeCourse('HIST 105', 3),
      makeCourse('HIST 106', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name === 'Citizenship (12 credits)');
    assert.ok(group?.satisfied, 'Citizenship should be satisfied with required POLS + two history courses');
  });

  // Citizenship should fail with duplicate history entry (do not double count duplicates)
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [
      makeCourse('POLS 206', 3),
      makeCourse('POLS 207', 3),
      makeCourse('HIST 105', 3),
      makeCourse('HIST 105', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name === 'Citizenship (12 credits)');
    assert.ok(!group?.satisfied, 'Citizenship should fail if duplicate history course is used instead of two distinct courses');
  });

  // High Impact should pass via SABR attribute tag
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeTaggedCourse('UNIV 300', 3, ['attr-sabr'])];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name === 'High Impact Experience');
    assert.ok(group?.satisfied, 'High Impact should be satisfied by a SABR-tagged course');
  });

  // Foreign Language should pass with valid 201/202 pair
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeCourse('SPAN 201', 3), makeCourse('SPAN 202', 3)];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name === 'Foreign Language');
    assert.ok(group?.satisfied, 'Foreign Language should be satisfied by a matching 201/202 sequence');
  });

  // Foreign Language should pass via high-school 2-year tag
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeTaggedCourse('HSLG 001', 1, ['attr-hs-lang-2y'])];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name === 'Foreign Language');
    assert.ok(group?.satisfied, 'Foreign Language should be satisfied by HS 2-year language tag');
  });

  // Foreign Language should fail with duplicate single-semester course (needs full pair)
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeCourse('SPAN 201', 3), makeCourse('SPAN 201', 3)];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name === 'Foreign Language');
    assert.ok(!group?.satisfied, 'Foreign Language should fail without a 202 companion course');
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
