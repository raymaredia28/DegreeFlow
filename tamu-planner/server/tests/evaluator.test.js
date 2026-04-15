import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { evaluateRequirements, normalizeCode, EQUIVALENT_COURSE_GROUPS, getCanonicalCode, getEquivalentCodes } from '../src/requirements/evaluator.js';

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
    const req = await loadReqSet('CSCE Emphasis - Mathematics');
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
    const req = await loadReqSet('CSCE Emphasis - Mathematics');
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

  // Game Design minor should pass with one intro course, required pairs, and 2 electives
  tests.push(async () => {
    const req = await loadReqSet('Minor - Game Design and Development');
    const studentCourses = [
      makeCourse('CSCE 120', 4),
      makeCourse('CSCE 441', 3),
      makeCourse('CSCE 443', 3),
      makeCourse('COMM 230', 3),
      makeCourse('COMM 453', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(result.groups[0].satisfied, 'Game minor should be satisfied with 2 electives');
  });

  // Game Design minor should fail if electives count < 2
  tests.push(async () => {
    const req = await loadReqSet('Minor - Game Design and Development');
    const studentCourses = [
      makeCourse('CSCE 120', 4),
      makeCourse('VIST 386', 3),
      makeCourse('VIST 487', 3),
      makeCourse('COMM 230', 3)
      // only 1 elective
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(!result.groups[0].satisfied, 'Game minor should fail with fewer than 2 electives');
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
    const req = await loadReqSet('CSCE Emphasis - Game Design and Development');
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

  // Citizenship should show internally consistent "remaining" missing values for 9/12 case
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [
      makeCourse('POLS 206', 3),
      makeCourse('POLS 207', 3),
      makeCourse('HIST 105', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name === 'Citizenship (12 credits)');
    assert.ok(group, 'Citizenship group should exist');
    assert.ok(!group.satisfied, 'Citizenship should not be satisfied at 9/12');
    assert.strictEqual(group.requiredCredits, 12);
    assert.strictEqual(group.earnedCredits, 9);
    assert.ok(
      Array.isArray(group.missing) && group.missing.some((m) => String(m).includes('Need 3 credits from pool')),
      `Expected remaining credits missing to be 3, got: ${(group.missing || []).join(' | ')}`
    );
    assert.ok(
      Array.isArray(group.missing) && group.missing.some((m) => String(m).includes('1 course')),
      `Expected remaining courses missing to be 1, got: ${(group.missing || []).join(' | ')}`
    );
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

  // Transfer credit grade (TCR) should be treated as completed
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeCourse('ENGL 221', 3, 'TCR')];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name === 'Language, Philosophy & Culture (3 credits)');
    assert.ok(group?.satisfied, 'Course with TCR grade should satisfy requirements');
  });

  // Satisfactory (S) grade should be treated as completed
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeCourse('COMM 365', 3, 'S')];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name === 'Social and Behavioral Sciences (3 credits)');
    assert.ok(group?.satisfied, 'Course with S grade should satisfy requirements');
  });

  // Transfer A (TA) grade should be treated as completed
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeCourse('COMM 257', 3, 'TA')];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name === 'Cultural Discourse (3 credits)');
    assert.ok(group?.satisfied, 'Course with TA grade should satisfy requirements');
  });

  // In-progress (IP) grade should NOT count as completed
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeCourse('ENGL 221', 3, 'IP')];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name === 'Language, Philosophy & Culture (3 credits)');
    assert.ok(!group?.satisfied, 'Course with IP grade should not satisfy requirements');
  });

  // === Equivalency / anti-double-counting tests ===

  // getCanonicalCode should return the canonical form
  tests.push(async () => {
    assert.strictEqual(getCanonicalCode('CSCE 121'), 'CSCE 120', 'CSCE 121 canonical should be CSCE 120');
    assert.strictEqual(getCanonicalCode('CSCE 120'), 'CSCE 120', 'CSCE 120 canonical should be itself');
    assert.strictEqual(getCanonicalCode('CSCE 331'), 'CSCE 315', 'CSCE 331 canonical should be CSCE 315');
    assert.strictEqual(getCanonicalCode('CSCE 315'), 'CSCE 315', 'CSCE 315 canonical should be itself');
    assert.strictEqual(getCanonicalCode('MATH 151'), 'MATH 151', 'Non-equivalent course should return itself');
  });

  // getEquivalentCodes should return the other course(s) in the group
  tests.push(async () => {
    const eq120 = getEquivalentCodes('CSCE 120');
    assert.ok(eq120.includes('CSCE 121'), 'CSCE 120 should list CSCE 121 as equivalent');
    assert.ok(!eq120.includes('CSCE 120'), 'CSCE 120 should not list itself');
    const eq331 = getEquivalentCodes('CSCE 331');
    assert.ok(eq331.includes('CSCE 315'), 'CSCE 331 should list CSCE 315 as equivalent');
    const eqNone = getEquivalentCodes('MATH 151');
    assert.strictEqual(eqNone.length, 0, 'Non-equivalent course should have empty equivalents');
  });

  // CSCE 120 should satisfy a requirement that asks for CSCE 120
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeCourse('CSCE 120', 3)];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name.includes('Major Coursework'));
    assert.ok(group.usedCourses.includes('CSCE 120'), 'CSCE 120 should be used');
  });

  // CSCE 121 should also satisfy a requirement that asks for CSCE 120 (equivalent)
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeCourse('CSCE 121', 3)];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name.includes('Major Coursework'));
    assert.ok(
      group.usedCourses.includes('CSCE 120') || group.usedCourses.includes('CSCE 121'),
      'CSCE 121 (equivalent to 120) should satisfy the CSCE 120 requirement'
    );
  });

  // Both CSCE 120 and CSCE 121 together should not double-count
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [
      makeCourse('CSCE 120', 3),
      makeCourse('CSCE 121', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name.includes('Major Coursework'));
    const csce120Used = group.usedCourses.filter((c) => c === 'CSCE 120' || c === 'CSCE 121').length;
    assert.ok(csce120Used <= 1, 'Equivalent courses 120/121 should not both appear in used courses');
  });

  // CSCE 331 should satisfy requirement that asks for CSCE 331
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeCourse('CSCE 331', 4)];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name.includes('Major Coursework'));
    assert.ok(
      group.usedCourses.includes('CSCE 331') || group.usedCourses.includes('CSCE 315'),
      'CSCE 331 should be used for its requirement'
    );
  });

  // CSCE 315 should also satisfy requirement asking for CSCE 331 (equivalent)
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [makeCourse('CSCE 315', 4)];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name.includes('Major Coursework'));
    assert.ok(
      group.usedCourses.includes('CSCE 331') || group.usedCourses.includes('CSCE 315'),
      'CSCE 315 (equivalent to 331) should satisfy the CSCE 331 requirement'
    );
  });

  // Both CSCE 315 and CSCE 331 together should not double-count
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [
      makeCourse('CSCE 315', 4),
      makeCourse('CSCE 331', 4)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups.find((g) => g.name.includes('Major Coursework'));
    const csce331Used = group.usedCourses.filter((c) => c === 'CSCE 315' || c === 'CSCE 331').length;
    assert.ok(csce331Used <= 1, 'Equivalent courses 315/331 should not both appear in used courses');
  });

  // normalizeCode edge cases
  tests.push(async () => {
    assert.strictEqual(normalizeCode('CSCE120'), 'CSCE 120', 'Should split compact format');
    assert.strictEqual(normalizeCode('csce 120'), 'CSCE 120', 'Should uppercase');
    assert.strictEqual(normalizeCode('  CSCE  331  '), 'CSCE 331', 'Should trim and normalize spaces');
    assert.strictEqual(normalizeCode(''), '', 'Empty string should return empty');
    assert.strictEqual(normalizeCode(null), '', 'Null should return empty');
  });

  // === Work Not Applied / Overflow tests ===

  // workNotApplied should list courses not used by any group
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [
      makeCourse('ENGL 221', 3),
      makeCourse('ART 999', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const unapplied = result.workNotApplied || [];
    const unappliedCodes = unapplied.map(e => e.code);
    assert.ok(unappliedCodes.includes('ART 999'), 'ART 999 (not in any pool) should be work not applied');
    assert.ok(!unappliedCodes.includes('ENGL 221'), 'ENGL 221 (used in LPC) should not be in work not applied');
  });

  // workNotApplied should be empty when all courses are used
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
    assert.strictEqual((result.workNotApplied || []).length, 0, 'All courses used — workNotApplied should be empty');
  });

  // workNotApplied entries should include potentialGroups for courses that could match a rule
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [
      makeCourse('ENGL 221', 3),
      makeCourse('ENGL 210', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const entry = (result.workNotApplied || []).find(e => e.code === 'ENGL 210');
    if (entry) {
      assert.ok(entry.potentialGroups.length > 0, 'ENGL 210 should suggest potential groups (LPC pool)');
    }
  });

  // Degree evaluation should exclude courses applied by an external minor context
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [
      makeCourse('MGMT 209', 3),
      makeCourse('ENGL 221', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set(),
      externallyAppliedCodes: ['MGMT 209']
    });
    const unappliedCodes = (result.workNotApplied || []).map((e) => e.code);
    assert.ok(!unappliedCodes.includes('MGMT 209'), 'MGMT 209 should be excluded when externally applied');
  });

  // Any minor-applied course should be excluded from degree Work Not Applied
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [
      makeCourse('MATH 308', 3),
      makeCourse('ART 999', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set(),
      externallyAppliedCodes: ['MATH 308']
    });
    const unappliedCodes = (result.workNotApplied || []).map((e) => e.code);
    assert.ok(!unappliedCodes.includes('MATH 308'), 'Minor-applied course should not be in workNotApplied');
    assert.ok(unappliedCodes.includes('ART 999'), 'Truly unused course should remain in workNotApplied');
  });

  // Any emphasis-applied course should be excluded from degree Work Not Applied
  tests.push(async () => {
    const req = await loadReqSet('CSCE Degree - Core');
    const studentCourses = [
      makeCourse('CYBR 484', 3),
      makeCourse('MUSC 123', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set(),
      externallyAppliedCodes: ['CYBR 484']
    });
    const unappliedCodes = (result.workNotApplied || []).map((e) => e.code);
    assert.ok(!unappliedCodes.includes('CYBR 484'), 'Emphasis-applied course should not be in workNotApplied');
    assert.ok(unappliedCodes.includes('MUSC 123'), 'Unused course should still be in workNotApplied');
  });

  // overflowCourses on a pool group that exceeds minCredits
  tests.push(async () => {
    const req = await loadReqSet('CSCE Emphasis - Cybersecurity');
    const studentCourses = [
      makeCourse('CYBR 484', 3),
      makeCourse('ECEN 424', 3),
      makeCourse('ESET 315', 3),
      makeCourse('ITSV 308', 3),
      makeCourse('ESET 269', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    const group = result.groups[0];
    assert.ok(group.satisfied, 'Cybersecurity emphasis should be satisfied');
    assert.ok(group.overflowCourses.length > 0, 'Should have overflow courses when exceeding minCredits');
  });

  // overflowCourses should be empty when credits match exactly
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
    const group = result.groups[0];
    assert.ok(group.satisfied, 'Cybersecurity emphasis should be satisfied');
    assert.strictEqual(group.overflowCourses.length, 0, 'No overflow when credits match exactly');
  });

  // Manual groups should have empty overflowCourses
  tests.push(async () => {
    const req = await loadReqSet('CSCE Emphasis - STEM Areas');
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses: [],
      emphasisCourseIds: new Set()
    });
    assert.deepStrictEqual(result.groups[0].overflowCourses, [], 'Manual group should have empty overflow');
  });

  // === Task 3: Catalog Label Fixes — Statistics Minor ===

  // Statistics minor should fail if STAT 211 is missing
  tests.push(async () => {
    const req = await loadReqSet('Minor - Statistics');
    const studentCourses = [
      // STAT 211 intentionally omitted
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
    assert.ok(!result.groups[0].satisfied, 'Statistics minor should fail when STAT 211 is missing');
    const missing = result.groups[0].missing || [];
    assert.ok(missing.some((m) => String(m).includes('STAT 211')), `STAT 211 should appear in missing: ${missing.join(' | ')}`);
  });

  // Statistics minor should fail if STAT 212 is missing
  tests.push(async () => {
    const req = await loadReqSet('Minor - Statistics');
    const studentCourses = [
      makeCourse('STAT 211', 3),
      // STAT 212 intentionally omitted
      makeCourse('STAT 315', 3),
      makeCourse('STAT 335', 3),
      makeCourse('STAT 404', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(!result.groups[0].satisfied, 'Statistics minor should fail when STAT 212 is missing');
    const missing = result.groups[0].missing || [];
    assert.ok(missing.some((m) => String(m).includes('STAT 212')), `STAT 212 should appear in missing: ${missing.join(' | ')}`);
  });

  // Statistics minor should fail with fewer than 3 electives
  tests.push(async () => {
    const req = await loadReqSet('Minor - Statistics');
    const studentCourses = [
      makeCourse('STAT 211', 3),
      makeCourse('STAT 212', 3),
      makeCourse('STAT 315', 3),
      makeCourse('STAT 335', 3)
      // only 2 electives — need 3
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(!result.groups[0].satisfied, 'Statistics minor should fail with only 2 electives');
  });

  // === Task 3: Catalog Label Fixes — Game Design Minor intro course variants ===

  // Game Design minor should pass with CSCE 110 as the intro course
  tests.push(async () => {
    const req = await loadReqSet('Minor - Game Design and Development');
    const studentCourses = [
      makeCourse('CSCE 110', 3),
      makeCourse('CSCE 441', 3),
      makeCourse('CSCE 443', 3),
      makeCourse('COMM 230', 3),
      makeCourse('COMM 453', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(result.groups[0].satisfied, 'Game minor should pass with CSCE 110 as intro course');
  });

  // Game Design minor should pass with CSCE 111 as the intro course
  tests.push(async () => {
    const req = await loadReqSet('Minor - Game Design and Development');
    const studentCourses = [
      makeCourse('CSCE 111', 3),
      makeCourse('VIST 386', 3),
      makeCourse('VIST 487', 3),
      makeCourse('COMM 230', 3),
      makeCourse('VIST 370', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(result.groups[0].satisfied, 'Game minor should pass with CSCE 111 as intro course');
  });

  // Game Design minor should fail without any intro course
  tests.push(async () => {
    const req = await loadReqSet('Minor - Game Design and Development');
    const studentCourses = [
      // no intro course (CSCE 110/111/120)
      makeCourse('CSCE 441', 3),
      makeCourse('CSCE 443', 3),
      makeCourse('COMM 230', 3),
      makeCourse('COMM 453', 3)
    ];
    const result = evaluateRequirements({
      requirementSet: req,
      studentCourses,
      emphasisCourseIds: new Set()
    });
    assert.ok(!result.groups[0].satisfied, 'Game minor should fail without an intro course');
  });

  // === Task 3: Catalog Label Fixes — renamed emphasis sets are loadable ===

  // "CSCE Emphasis - Mathematics" (renamed from "CSCE Emphasis - Math") should load
  tests.push(async () => {
    const req = await loadReqSet('CSCE Emphasis - Mathematics');
    assert.ok(req, 'CSCE Emphasis - Mathematics requirement set should exist');
    assert.strictEqual(req.name, 'CSCE Emphasis - Mathematics');
  });

  // "CSCE Emphasis - Game Design and Development" (renamed from "CSCE Emphasis - Game") should load
  tests.push(async () => {
    const req = await loadReqSet('CSCE Emphasis - Game Design and Development');
    assert.ok(req, 'CSCE Emphasis - Game Design and Development requirement set should exist');
    assert.strictEqual(req.name, 'CSCE Emphasis - Game Design and Development');
  });

  // "Minor - Game Design and Development" (renamed from "Minor - Game") should load
  tests.push(async () => {
    const req = await loadReqSet('Minor - Game Design and Development');
    assert.ok(req, 'Minor - Game Design and Development requirement set should exist');
    assert.strictEqual(req.name, 'Minor - Game Design and Development');
  });

  // Math Minor group label should reflect 16 credits, not 13
  tests.push(async () => {
    const req = await loadReqSet('Minor - Mathematics');
    const group = req.groups[0];
    assert.ok(group.name.includes('16'), `Math Minor group should say 16 credits, got: "${group.name}"`);
    assert.ok(!group.name.includes('13'), `Math Minor group should not say 13 credits, got: "${group.name}"`);
  });

  // Statistics Minor group label should reflect 15 credits
  tests.push(async () => {
    const req = await loadReqSet('Minor - Statistics');
    const group = req.groups[0];
    assert.ok(group.name.includes('15'), `Statistics Minor group should say 15 credits, got: "${group.name}"`);
  });

  // Game Design Minor group label should reflect 15 credits
  tests.push(async () => {
    const req = await loadReqSet('Minor - Game Design and Development');
    const group = req.groups[0];
    assert.ok(group.name.includes('15'), `Game Minor group should say 15 credits, got: "${group.name}"`);
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
