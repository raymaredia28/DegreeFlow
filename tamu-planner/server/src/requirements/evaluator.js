const normalizeCode = (raw) => {
  if (!raw) return '';
  const trimmed = String(raw).trim().toUpperCase();
  const spaced = trimmed.replace(/\s+/g, ' ');
  const compactMatch = spaced.match(/^([A-Z]{2,5})(\d{3,4})$/);
  if (compactMatch) {
    return `${compactMatch[1]} ${compactMatch[2]}`;
  }
  return spaced;
};

const DEPT_PREFIX_FIX_CODES = new Set([
  'AFST',
  'ANTH',
  'ARCH',
  'ARTS',
  'COMM',
  'CSCE',
  'DCED',
  'ENDS',
  'ENGL',
  'FILM',
  'FINC',
  'FREN',
  'GEOL',
  'GLST',
  'HISP',
  'HIST',
  'HORT',
  'INTA',
  'KINE',
  'MATH',
  'MKTG',
  'MSTC',
  'MUSC',
  'PERF',
  'PHIL',
  'PHYS',
  'POLS',
  'RELS',
  'THEA'
]);

const normalizeDepartment = (rawDept) => {
  const dept = String(rawDept || '').trim().toUpperCase();
  if (dept.length >= 4 && (dept.startsWith('U') || dept.startsWith('N'))) {
    const candidate = dept.slice(1);
    if (DEPT_PREFIX_FIX_CODES.has(candidate)) {
      return candidate;
    }
  }
  return dept;
};

// Equivalent/renamed courses — only one from each group should count
const EQUIVALENT_COURSE_GROUPS = [
  ['CSCE 120', 'CSCE 121'],
  ['CSCE 315', 'CSCE 331'],
];

const EQUIVALENT_MAP = new Map();
EQUIVALENT_COURSE_GROUPS.forEach((group) => {
  const canonical = group[0];
  group.forEach((code) => EQUIVALENT_MAP.set(code, canonical));
});

const getCanonicalCode = (code) => EQUIVALENT_MAP.get(code) || code;

const getEquivalentCodes = (code) => {
  const group = EQUIVALENT_COURSE_GROUPS.find((g) => g.includes(code));
  return group ? group.filter((c) => c !== code) : [];
};

const gradeValue = (grade) => {
  if (!grade) return null;
  const g = grade.toUpperCase().trim();
  if (g === 'IP' || g === 'TIP') return null;
  if (g === 'P' || g === 'S' || g === 'TCR') return 2.0;
  const map = {
    'A+': 4.0,
    A: 4.0,
    'A-': 3.7,
    'B+': 3.3,
    B: 3.0,
    'B-': 2.7,
    'C+': 2.3,
    C: 2.0,
    'C-': 1.7,
    'D+': 1.3,
    D: 1.0,
    'D-': 0.7,
    F: 0.0,
    TA: 4.0,
    TB: 3.0,
    TC: 2.0,
    TD: 1.0
  };
  return map[g] ?? null;
};

const minGradeValue = (minGrade) => {
  if (!minGrade) return null;
  return gradeValue(minGrade);
};

const meetsMinGrade = (grade, minGrade) => {
  const minVal = minGradeValue(minGrade);
  if (minVal === null) return true;
  const val = gradeValue(grade);
  if (val === null) return false;
  return val >= minVal;
};

const courseCodeFromRecord = (course) =>
  normalizeCode(`${normalizeDepartment(course.department)} ${course.course_number}`);

const buildCourseIndex = (studentCourses) => {
  const map = new Map();
  // Track which canonical equivalency groups are already represented
  const seenCanonical = new Set();

  studentCourses.forEach((entry) => {
    const code = courseCodeFromRecord(entry.course);
    const canonical = getCanonicalCode(code);

    // If an equivalent is already indexed, skip to prevent double-counting
    if (seenCanonical.has(canonical) && !map.has(code)) {
      return;
    }

    const record = {
      code,
      grade: entry.grade,
      status: entry.status,
      credits: entry.course.credits,
      categories: entry.course.categories || [],
      department: normalizeDepartment(entry.course.department),
      course_number: entry.course.course_number,
      course_id: entry.course.course_id,
      evaluationPriority: Boolean(entry.evaluationPriority)
    };

    map.set(code, record);
    seenCanonical.add(canonical);

    // Also register under equivalent codes so requirement rules can match by either name
    getEquivalentCodes(code).forEach((eqCode) => {
      if (!map.has(eqCode)) {
        map.set(eqCode, record);
      }
    });
  });
  return map;
};

const creditValue = (course) => {
  const cr = course?.credits;
  if (typeof cr === 'number') return cr;
  if (cr && typeof cr === 'object') {
    const val = cr.max ?? cr.min ?? 0;
    return Number.isFinite(val) ? val : 0;
  }
  const n = Number(cr);
  return Number.isFinite(n) ? n : 0;
};

const isCompleted = (course, minGrade, evalContext) => {
  if (!course) return false;
  if (course.status === 'planned' || course.status === 'in-progress') return true;
  if (!course.grade || course.grade.toUpperCase() === 'IP') return false;
  if (!meetsMinGrade(course.grade, minGrade)) return false;
  return true;
};

const sumCredits = (courses) => courses.reduce((sum, course) => sum + creditValue(course), 0);

const matchesTag = (course, tag) => {
  if (tag === 'track-any') {
    return (course.categories || []).some((cat) => cat.startsWith('track-'));
  }
  return (course.categories || []).includes(tag);
};

const anyOfPickScore = (used, credits, context) => {
  const pri = context?.priorityCodes;
  let priorityHits = 0;
  (used || []).forEach((c) => {
    const n = normalizeCode(c);
    if (pri?.has(n)) priorityHits += 1;
  });
  return { priorityHits, credits: credits || 0 };
};

const anyOfPickIsBetter = (next, prev, context) => {
  if (!prev.satisfied) return true;
  if (!next.satisfied) return false;
  const a = anyOfPickScore(next.used, next.credits, context);
  const b = anyOfPickScore(prev.used, prev.credits, context);
  if (a.priorityHits !== b.priorityHits) return a.priorityHits > b.priorityHits;
  return a.credits > b.credits;
};

const sortCoursesByEvaluationPriority = (courses, context) => {
  if (!Array.isArray(courses) || courses.length < 2) return courses || [];
  const pri = context?.priorityCodes;
  if (!pri || pri.size === 0) return courses;
  return [...courses].sort((a, b) => {
    const pa = pri.has(a.code) ? 1 : 0;
    const pb = pri.has(b.code) ? 1 : 0;
    if (pb !== pa) return pb - pa;
    return 0;
  });
};

const evaluateAnyOf = (anyOf, context, minGrade) => {
  let best = { satisfied: false, credits: 0, used: [] };
  const missingOptions = [];

  anyOf.forEach((option) => {
    if (typeof option === 'string') {
      const code = normalizeCode(option);
      const course = context.courseIndex.get(code);
      if (isCompleted(course, minGrade, context)) {
        const credits = Number(course.credits) || 0;
        const candidate = { satisfied: true, credits, used: [code] };
        if (anyOfPickIsBetter(candidate, best, context)) {
          best = candidate;
        }
      } else {
        missingOptions.push(code);
      }
      return;
    }

    if (option?.allOf) {
      const missing = [];
      let credits = 0;
      option.allOf.forEach((codeRaw) => {
        const code = normalizeCode(codeRaw);
        const course = context.courseIndex.get(code);
        if (!isCompleted(course, minGrade, context)) {
          missing.push(code);
        } else {
          credits += Number(course.credits) || 0;
        }
      });
      if (missing.length === 0) {
        const candidate = {
          satisfied: true,
          credits,
          used: option.allOf.map(normalizeCode)
        };
        if (anyOfPickIsBetter(candidate, best, context)) {
          best = candidate;
        }
      } else {
        missingOptions.push(option.allOf.map(normalizeCode).join(' + '));
      }
      return;
    }

    if (option?.tag) {
      const result = evaluateTag(option, context, minGrade);
      if (result.satisfied) {
        const candidate = {
          satisfied: true,
          credits: result.credits,
          used: result.used || []
        };
        if (anyOfPickIsBetter(candidate, best, context)) {
          best = candidate;
        }
      } else {
        missingOptions.push(`tag:${option.tag}`);
      }
    }
  });

  if (!best.satisfied) {
    return { satisfied: false, credits: 0, missing: missingOptions };
  }

  return { satisfied: true, credits: best.credits, used: best.used };
};

const evaluateTag = (tagRule, context, minGrade) => {
  const tag = tagRule.tag;

  // Global overrides: if the student checked the global flag, satisfy immediately
  if (tag === 'attr-hs-lang-2y' && context.hasHsLanguage) {
    return { satisfied: true, credits: 0, used: [], missing: [] };
  }
  if (tag === 'attr-sabr' && context.hasSabrCourse) {
    return { satisfied: true, credits: 0, used: [], missing: [] };
  }

  const excludeSet = new Set((tagRule.exclude || []).map(normalizeCode));
  let eligible = Array.from(context.courseIndex.values()).filter(
    (course) =>
      isCompleted(course, minGrade, context) && matchesTag(course, tag) && !excludeSet.has(course.code)
  );
  eligible = sortCoursesByEvaluationPriority(eligible, context);
  const credits = sumCredits(eligible);
  const minCredits = tagRule.minCredits ?? null;
  const minCount = tagRule.minCount ?? null;
  const maxCount = tagRule.maxCount ?? null;
  const maxCredits = tagRule.maxCredits ?? null;
  const count = eligible.length;
  const creditOk = minCredits === null ? true : credits >= minCredits;
  const countOk =
    (minCount === null || count >= minCount) && (maxCount === null || count <= maxCount);
  const creditCapOk = maxCredits === null ? true : credits <= maxCredits;
  const satisfied = creditOk && countOk && creditCapOk;
  const missing = [];
  if (!creditOk && minCredits !== null) {
    const remaining = Math.max(0, minCredits - credits);
    missing.push(`Need ${remaining} credits from tag ${tag}`);
  }
  if (minCount !== null && count < minCount) {
    const remaining = Math.max(0, minCount - count);
    missing.push(`Need ${remaining} courses from tag ${tag}`);
  }
  if (maxCount !== null && count > maxCount) missing.push(`Max ${maxCount} courses for tag ${tag}`);
  if (maxCredits !== null && credits > maxCredits) missing.push(`Max ${maxCredits} credits for tag ${tag}`);
  return { satisfied, credits, used: eligible.map((c) => c.code), missing };
};

const evaluateCourseRule = (courseCode, context, minGrade) => {
  const code = normalizeCode(courseCode);
  const course = context.courseIndex.get(code);
  if (!isCompleted(course, minGrade, context)) {
    return { satisfied: false, credits: 0, missing: [code] };
  }
  return { satisfied: true, credits: creditValue(course), used: [code] };
};

const evaluatePool = (poolRule, context, minGrade) => {
  const poolSet = new Set((poolRule.pool || []).map(normalizeCode));
  const excludeSet = new Set((poolRule.exclude || []).map(normalizeCode));
  const maxCredits = poolRule.maxCredits ?? null;
  const minCredits = poolRule.minCredits ?? null;
  const minCount = poolRule.minCount ?? null;
  const maxCount = poolRule.maxCount ?? null;
  const countOnly = poolRule.countOnly === true;

  let eligible = Array.from(context.courseIndex.values()).filter((course) => {
    const code = normalizeCode(`${course.department} ${course.course_number}`);
    if (!poolSet.has(code)) return false;
    if (excludeSet.has(code)) return false;
    return isCompleted(course, minGrade, context);
  });

  eligible = sortCoursesByEvaluationPriority(eligible, context);

  const credits = sumCredits(eligible);
  const count = eligible.length;

  const creditOk = minCredits === null ? true : credits >= minCredits;
  const countOk =
    (minCount === null || count >= minCount) && (maxCount === null || count <= maxCount);
  const creditCapOk = maxCredits === null ? true : credits <= maxCredits;

  const satisfied = creditOk && countOk && creditCapOk;

  const missing = [];
  if (!creditOk && minCredits !== null) {
    const remaining = Math.max(0, minCredits - credits);
    missing.push(`Need ${remaining} credits from pool`);
  }
  if (minCount !== null && count < minCount) {
    const remaining = Math.max(0, minCount - count);
    missing.push(`Need ${remaining} courses from pool`);
  }
  if (maxCount !== null && count > maxCount) missing.push(`Max ${maxCount} courses from pool`);
  if (maxCredits !== null && credits > maxCredits) missing.push(`Max ${maxCredits} credits from pool`);

  return {
    satisfied,
    credits: countOnly ? 0 : credits,
    used: eligible.map((c) => normalizeCode(`${c.department} ${c.course_number}`)),
    missing
  };
};

const evaluateEmphasis = (rule, context, minGrade) => {
  const requiredCredits = rule.emphasisCredits || 0;
  const usedCodes = new Set();
  const matched = [];

  // Match courses from the predefined emphasis pool
  if (context.emphasisCourseIds && context.emphasisCourseIds.size > 0) {
    Array.from(context.courseIndex.values()).forEach((course) => {
      if (isCompleted(course, minGrade, context) && context.emphasisCourseIds.has(course.course_id)) {
        const code = normalizeCode(`${course.department} ${course.course_number}`);
        if (!usedCodes.has(code)) {
          usedCodes.add(code);
          matched.push(course);
        }
      }
    });
  }

  // Also match courses the student manually tagged as custom-emphasis
  Array.from(context.courseIndex.values()).forEach((course) => {
    if (
      isCompleted(course, minGrade, context) &&
      (course.categories || []).includes('custom-emphasis')
    ) {
      const code = normalizeCode(`${course.department} ${course.course_number}`);
      if (!usedCodes.has(code)) {
        usedCodes.add(code);
        matched.push(course);
      }
    }
  });

  if (matched.length === 0) {
    return {
      satisfied: false,
      credits: 0,
      used: [],
      missing: ['Emphasis area courses (advisor-approved)']
    };
  }

  const matchedSorted = sortCoursesByEvaluationPriority(matched, context);

  const credits = sumCredits(matchedSorted);
  const used = matchedSorted.map((c) => normalizeCode(`${c.department} ${c.course_number}`));
  const satisfied = credits >= requiredCredits;
  return {
    satisfied,
    credits,
    used,
    missing: satisfied
      ? []
      : [`Emphasis credits: need ${requiredCredits - credits} more (${credits}/${requiredCredits})`]
  };
};

const evaluateItems = (items, context, minGrade) => {
  const results = [];
  items.forEach((item) => {
    if (item.course) {
      results.push({ ...evaluateCourseRule(item.course, context, minGrade), _type: 'course' });
      return;
    }
    if (item.anyOf) {
      results.push({ ...evaluateAnyOf(item.anyOf, context, minGrade), _type: 'anyOf' });
      return;
    }
    if (item.tag) {
      results.push({ ...evaluateTag(item, context, minGrade), _type: 'tag' });
      return;
    }
    if (item.pool) {
      results.push({ ...evaluatePool(item, context, minGrade), _type: 'pool' });
      return;
    }
    if (item.emphasisCredits) {
      results.push({ ...evaluateEmphasis(item, context, minGrade), _type: 'emphasis' });
      return;
    }
  });

  return results;
};

const extractCodesFromAnyOf = (anyOf = []) => {
  const codes = [];
  anyOf.forEach((option) => {
    if (typeof option === 'string') {
      const code = normalizeCode(option);
      if (code) codes.push(code);
      return;
    }
    if (option?.course && typeof option.course === 'string') {
      const code = normalizeCode(option.course);
      if (code) codes.push(code);
      return;
    }
    if (Array.isArray(option?.allOf)) {
      option.allOf.forEach((raw) => {
        const code = normalizeCode(raw);
        if (code) codes.push(code);
      });
      return;
    }
    if (Array.isArray(option?.pool)) {
      option.pool.forEach((raw) => {
        const code = normalizeCode(raw);
        if (code) codes.push(code);
      });
    }
  });
  return Array.from(new Set(codes));
};

const buildRecommendationBuckets = (rules = {}) => {
  const buckets = [];

  const pushBucket = (bucket) => {
    if (!bucket || typeof bucket !== 'object') return;
    const normalizedCodes = Array.from(
      new Set((Array.isArray(bucket.codes) ? bucket.codes : []).map(normalizeCode).filter(Boolean))
    );
    const isCodeOptionalType = bucket.type === 'tag' || bucket.type === 'emphasisCredits';
    if (!isCodeOptionalType && normalizedCodes.length === 0) return;
    buckets.push({
      ...bucket,
      codes: normalizedCodes
    });
  };

  if (Array.isArray(rules.allOf)) {
    rules.allOf.forEach((code) => {
      pushBucket({
        type: 'required',
        codes: [code]
      });
    });
  }

  if (Array.isArray(rules.anyOf)) {
    pushBucket({
      type: 'anyOf',
      codes: extractCodesFromAnyOf(rules.anyOf),
      minCredits: rules.minCredits ?? null,
      minCount: rules.minCount ?? null,
      note: rules.note || null
    });
  }

  if (Array.isArray(rules.pool)) {
    pushBucket({
      type: 'pool',
      codes: rules.pool,
      minCredits: rules.minCredits ?? null,
      minCount: rules.minCount ?? null,
      note: rules.note || null
    });
  }

  if (Array.isArray(rules.items)) {
    rules.items.forEach((item) => {
      if (item?.course) {
        pushBucket({
          type: 'required',
          codes: [item.course],
          note: item.note || null
        });
      }

      if (Array.isArray(item?.allOf)) {
        pushBucket({
          type: 'allOf',
          codes: item.allOf,
          note: item.note || null
        });
      }

      if (Array.isArray(item?.anyOf)) {
        pushBucket({
          type: 'anyOf',
          codes: extractCodesFromAnyOf(item.anyOf),
          minCredits: item.minCredits ?? null,
          minCount: item.minCount ?? null,
          note: item.note || null
        });
      }

      if (Array.isArray(item?.pool)) {
        pushBucket({
          type: 'pool',
          codes: item.pool,
          minCredits: item.minCredits ?? null,
          minCount: item.minCount ?? null,
          note: item.note || null
        });
      }

      if (item?.tag) {
        pushBucket({
          type: 'tag',
          tag: item.tag,
          minCredits: item.minCredits ?? null,
          minCount: item.minCount ?? null,
          note: item.note || null,
          codes: []
        });
      }

      if (item?.emphasisCredits) {
        pushBucket({
          type: 'emphasisCredits',
          minCredits: item.emphasisCredits,
          note: item.note || null,
          codes: []
        });
      }
    });
  }

  if (rules.emphasisCredits) {
    pushBucket({
      type: 'emphasisCredits',
      minCredits: rules.emphasisCredits,
      note: rules.note || null,
      codes: []
    });
  }

  return buckets;
};

/**
 * For a satisfied pool sub-rule, pick a minimal set of used codes that must
 * "count" toward that pool (minCredits / minCount). These are treated like
 * mandatory for group-level overflow so we do not strip a course that is
 * still required to satisfy its directed-elective slot when trimming surplus
 * flex toward the group's total minCredits.
 */
const pickPoolCoverCodes = (usedCodes, poolRule, context) => {
  const minCredits =
    poolRule.minCredits != null && poolRule.minCredits > 0 ? poolRule.minCredits : null;
  const minCount =
    poolRule.minCount != null && poolRule.minCount > 0 ? poolRule.minCount : null;
  if (minCredits === null && minCount === null) return [];

  const unique = [...new Set((usedCodes || []).map(normalizeCode).filter(Boolean))];
  if (unique.length === 0) return [];

  const ordered = unique.map((code) => {
    const course = context.courseIndex.get(code);
    const priority = Boolean(course?.evaluationPriority);
    return {
      code,
      norm: normalizeCode(code),
      credits: creditValue(course),
      priority
    };
  });
  ordered.sort((a, b) => {
    if (a.priority !== b.priority) return (b.priority ? 1 : 0) - (a.priority ? 1 : 0);
    if (a.credits !== b.credits) return b.credits - a.credits;
    return String(b.norm).localeCompare(String(a.norm));
  });

  const picked = [];
  let sum = 0;
  let count = 0;
  for (const row of ordered) {
    const creditsOk = minCredits === null || sum >= minCredits;
    const countOk = minCount === null || count >= minCount;
    if (creditsOk && countOk) break;
    picked.push(row.code);
    sum += row.credits;
    count += 1;
  }
  return picked;
};

const computeOverflowCourses = (usedCourses, mandatoryCourses, earnedCredits, requiredCredits, context) => {
  if (requiredCredits === null || earnedCredits <= requiredCredits) return [];

  const flexCodes = Array.from(usedCourses).filter((code) => {
    const n = normalizeCode(code);
    return !mandatoryCourses.has(code) && !mandatoryCourses.has(n);
  });
  if (flexCodes.length === 0) return [];

  const mandatoryCredits = Array.from(mandatoryCourses).reduce((sum, code) => {
    const course = context.courseIndex.get(code);
    return sum + (course ? creditValue(course) : 0);
  }, 0);

  const neededFlexCredits = Math.max(0, requiredCredits - mandatoryCredits);

  /**
   * Order flex courses for "applied toward minimum" vs overflow:
   * - Prefer keeping evaluationPriority courses in the applied bucket (they sort first).
   * - Then larger credit hours first (so same-credit electives tie-break consistently).
   * - Among same credits without priority, higher course code sorts first so lower numbers
   *   (e.g. CSCE 410) are more likely to overflow when the bucket is already filled.
   */
  const flexWithCredits = flexCodes.map((code) => {
    const norm = normalizeCode(code);
    const course = context.courseIndex.get(code) || context.courseIndex.get(norm);
    const priority = Boolean(course?.evaluationPriority);
    return {
      code,
      norm: norm || code,
      credits: creditValue(course),
      priority
    };
  });

  flexWithCredits.sort((a, b) => {
    if (a.priority !== b.priority) return (b.priority ? 1 : 0) - (a.priority ? 1 : 0);
    if (a.credits !== b.credits) return b.credits - a.credits;
    return String(b.norm).localeCompare(String(a.norm));
  });

  const overflow = [];
  let accumulated = 0;
  for (const item of flexWithCredits) {
    if (accumulated >= neededFlexCredits) {
      overflow.push(item.code);
    } else {
      accumulated += item.credits;
    }
  }

  return overflow;
};

const summarizeGroup = (name, rules, context, { deriveCredits = false } = {}) => {
  if (rules.manual) {
    return {
      name,
      requiredCredits: rules.minCredits ?? null,
      earnedCredits: 0,
      satisfied: false,
      missing: [rules.note || 'Manual requirement'],
      usedCourses: [],
      overflowCourses: [],
      warnings: [],
      recommendationBuckets: []
    };
  }

  const minGrade = rules.gradeAtLeast || null;
  const missing = [];
  const warnings = [];
  const usedCourses = new Set();
  const mandatoryCourses = new Set();

  if (rules.allOf) {
    rules.allOf.forEach((code) => {
      const result = evaluateCourseRule(code, context, minGrade);
      if (!result.satisfied) missing.push(...(result.missing || []));
      (result.used || []).forEach((c) => {
        usedCourses.add(c);
        mandatoryCourses.add(c);
      });
    });
  }

  if (rules.anyOf) {
    const result = evaluateAnyOf(rules.anyOf, context, minGrade);
    if (!result.satisfied) missing.push(...(result.missing || []));
    (result.used || []).forEach((c) => {
      usedCourses.add(c);
      mandatoryCourses.add(c);
    });
  }

  if (rules.pool) {
    const result = evaluatePool(rules, context, minGrade);
    if (!result.satisfied) missing.push(...(result.missing || []));
    (result.used || []).forEach((c) => usedCourses.add(c));
    if (result.satisfied) {
      pickPoolCoverCodes(result.used, rules, context).forEach((c) => mandatoryCourses.add(c));
    }
  }

  if (rules.items) {
    const results = evaluateItems(rules.items, context, minGrade);
    results.forEach((result, idx) => {
      if (!result.satisfied && result.missing) missing.push(...result.missing);
      (result.used || []).forEach((c) => usedCourses.add(c));
      if (result._type === 'course' || result._type === 'anyOf') {
        (result.used || []).forEach((c) => mandatoryCourses.add(c));
      } else if (result._type === 'pool' && result.satisfied) {
        const item = rules.items[idx];
        if (item?.pool) {
          pickPoolCoverCodes(result.used, item, context).forEach((c) => mandatoryCourses.add(c));
        }
      } else if (result._type === 'tag' && result.satisfied) {
        const item = rules.items[idx];
        if (item?.tag) {
          pickPoolCoverCodes(result.used, item, context).forEach((c) => mandatoryCourses.add(c));
        }
      } else if (result._type === 'emphasis' && result.satisfied) {
        const item = rules.items[idx];
        if (item?.emphasisCredits) {
          pickPoolCoverCodes(result.used, { minCredits: item.emphasisCredits, minCount: null }, context).forEach(
            (c) => mandatoryCourses.add(c)
          );
        }
      }
    });
  }

  // Compute total credits once, using unique courses across all sub-rules
  const credits = Array.from(usedCourses).reduce((sum, code) => {
    const course = context.courseIndex.get(code);
    return sum + (course ? Number(course.credits) || 0 : 0);
  }, 0);

  const minCredits = rules.minCredits ?? null;
  let satisfied =
    missing.length === 0 && (minCredits !== null ? credits >= minCredits : true);

  if (rules.maxFrom && rules.maxCount != null) {
    const codes = rules.maxFrom.map(normalizeCode);
    const taken = codes.filter((code) => {
      const course = context.courseIndex.get(code);
      return isCompleted(course, minGrade, context);
    });
    if (taken.length > rules.maxCount) {
      warnings.push(
        rules.maxWarning || `Only ${rules.maxCount} of ${codes.join(', ')} may be used.`
      );
      satisfied = false;
    }
  }

  // For minor groups only: derive a display-friendly requiredCredits when the
  // group has no top-level minCredits by walking sub-rules and estimating
  // 3 credits per course.
  let derivedRequired = minCredits;
  if (deriveCredits && (derivedRequired === null || derivedRequired === 0)) {
    let subTotal = 0;
    const estimateItem = (item) => {
      if (item.countOnly) return;
      if (item.minCredits) { subTotal += item.minCredits; return; }
      if (item.pool && item.minCount) { subTotal += item.minCount * 3; return; }
      if (item.allOf) { subTotal += item.allOf.length * 3; return; }
      if (item.anyOf) { subTotal += 3; return; }
      if (item.course) { subTotal += 3; return; }
    };
    if (rules.items) (rules.items || []).forEach(estimateItem);
    if (rules.allOf) subTotal += rules.allOf.length * 3;
    if (rules.anyOf && !rules.pool) subTotal += 3;
    if (rules.pool) {
      if (rules.minCredits) subTotal += rules.minCredits;
      else if (rules.minCount) subTotal += rules.minCount * 3;
    }
    if (subTotal > 0) derivedRequired = subTotal;
  }

  const overflowCourses = computeOverflowCourses(usedCourses, mandatoryCourses, credits, minCredits, context);
  const overflowNorm = new Set(overflowCourses.map((c) => normalizeCode(c)).filter(Boolean));
  const usedCoursesApplied = Array.from(usedCourses).filter((c) => !overflowNorm.has(normalizeCode(c)));

  const creditCap = minCredits;
  const reportedEarned =
    satisfied && overflowCourses.length > 0 && creditCap != null
      ? Math.min(credits, creditCap)
      : credits;

  return {
    name,
    requiredCredits: derivedRequired,
    earnedCredits: reportedEarned,
    satisfied,
    missing,
    usedCourses: usedCoursesApplied,
    overflowCourses,
    warnings,
    recommendationBuckets: buildRecommendationBuckets(rules)
  };
};

const computeWorkNotApplied = (groups, courseIndex, externallyAppliedCodes = []) => {
  const allUsed = new Set();
  groups.forEach((group) => {
    (group.usedCourses || []).forEach((code) => allUsed.add(code));
  });
  externallyAppliedCodes.forEach((code) => {
    const normalized = normalizeCode(code);
    if (normalized) allUsed.add(normalized);
  });

  /** normalized code -> surplus messages (pool overflow for a named group) */
  const overflowReasonsByNorm = new Map();
  groups.forEach((group) => {
    (group.overflowCourses || []).forEach((raw) => {
      const n = normalizeCode(raw);
      if (!n) return;
      const label = group.requiredCredits != null ? `${group.requiredCredits} cr minimum` : 'credit minimum';
      const line = `Surplus toward ${group.name} (${label})`;
      if (!overflowReasonsByNorm.has(n)) overflowReasonsByNorm.set(n, []);
      overflowReasonsByNorm.get(n).push(line);
    });
  });

  const seenRecords = new Set();
  const unapplied = [];

  for (const [, course] of courseIndex.entries()) {
    if (seenRecords.has(course)) continue;
    seenRecords.add(course);

    if (allUsed.has(course.code)) continue;
    if (getEquivalentCodes(course.code).some((eq) => allUsed.has(eq))) continue;
    if (!isCompleted(course, null)) continue;

    const norm = normalizeCode(course.code);
    const surplusLines = norm ? overflowReasonsByNorm.get(norm) : null;

    unapplied.push({
      code: course.code,
      credits: creditValue(course),
      status: course.status || 'completed',
      reason: surplusLines?.length
        ? surplusLines.join('; ')
        : 'Not matched by any requirement group',
      potentialGroups: []
    });
  }

  return unapplied;
};

const courseMatchesRule = (course, code, rules) => {
  if (rules.manual) return false;

  if (rules.allOf && rules.allOf.map(normalizeCode).includes(code)) return true;

  if (rules.anyOf) {
    const hit = rules.anyOf.some(option => {
      if (typeof option === 'string') return normalizeCode(option) === code;
      if (option?.allOf) return option.allOf.map(normalizeCode).includes(code);
      if (option?.tag) return matchesTag(course, option.tag);
      return false;
    });
    if (hit) return true;
  }

  if (rules.pool) {
    const poolSet = new Set(rules.pool.map(normalizeCode));
    const excludeSet = new Set((rules.exclude || []).map(normalizeCode));
    if (poolSet.has(code) && !excludeSet.has(code)) return true;
  }

  if (rules.items) {
    const hit = rules.items.some(item => {
      if (item.course) return normalizeCode(item.course) === code;
      if (item.anyOf) {
        return item.anyOf.some(option => {
          if (typeof option === 'string') return normalizeCode(option) === code;
          if (option?.allOf) return option.allOf.map(normalizeCode).includes(code);
          if (option?.tag) return matchesTag(course, option.tag);
          return false;
        });
      }
      if (item.tag) return matchesTag(course, item.tag);
      if (item.pool) {
        const ps = new Set(item.pool.map(normalizeCode));
        const es = new Set((item.exclude || []).map(normalizeCode));
        return ps.has(code) && !es.has(code);
      }
      return false;
    });
    if (hit) return true;
  }

  return false;
};

const findAlternativePlacements = (unappliedCourses, requirementSet, courseIndex) => {
  if (!unappliedCourses.length) return unappliedCourses;

  const groups = requirementSet.groups || [];

  return unappliedCourses.map(entry => {
    const course = courseIndex.get(entry.code);
    if (!course) return entry;

    const potentialGroups = [];
    groups.forEach(group => {
      if (courseMatchesRule(course, entry.code, group.rules || {})) {
        potentialGroups.push(group.name);
      }
    });

    return { ...entry, potentialGroups };
  });
};

const evaluateRequirements = ({
  requirementSet,
  studentCourses,
  emphasisCourseIds,
  hasHsLanguage,
  hasSabrCourse,
  externallyAppliedCodes = []
}) => {
  const courseIndex = buildCourseIndex(studentCourses);
  const completedCourses = Array.from(courseIndex.values()).filter((course) =>
    isCompleted(course, null)
  );

  const priorityCodes = new Set();
  const seenPriorityRecord = new Set();
  for (const course of courseIndex.values()) {
    if (seenPriorityRecord.has(course)) continue;
    seenPriorityRecord.add(course);
    if (course.evaluationPriority) priorityCodes.add(course.code);
  }

  const context = {
    courseIndex,
    completedCourses,
    emphasisCourseIds,
    hasHsLanguage: Boolean(hasHsLanguage),
    hasSabrCourse: Boolean(hasSabrCourse),
    priorityCodes
  };

  const isMinor = (requirementSet.name || '').startsWith('Minor -');
  const groups = (requirementSet.groups || []).map((group) =>
    summarizeGroup(group.name, group.rules || {}, context, { deriveCredits: isMinor })
  );

  let workNotApplied = computeWorkNotApplied(groups, courseIndex, externallyAppliedCodes);
  workNotApplied = findAlternativePlacements(workNotApplied, requirementSet, courseIndex);

  return {
    requirementSet: {
      name: requirementSet.name,
      catalog_year: requirementSet.catalog_year
    },
    groups,
    warnings: groups.flatMap((group) => group.warnings || []),
    workNotApplied
  };
};

export { evaluateRequirements, normalizeCode, EQUIVALENT_COURSE_GROUPS, getCanonicalCode, getEquivalentCodes };
