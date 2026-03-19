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
  normalizeCode(`${course.department} ${course.course_number}`);

const buildCourseIndex = (studentCourses) => {
  const map = new Map();
  studentCourses.forEach((entry) => {
    const code = courseCodeFromRecord(entry.course);
    map.set(code, {
      code,
      grade: entry.grade,
      status: entry.status,
      credits: entry.course.credits,
      categories: entry.course.categories || [],
      department: entry.course.department,
      course_number: entry.course.course_number,
      course_id: entry.course.course_id
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

const isCompleted = (course, minGrade) => {
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

const evaluateAnyOf = (anyOf, context, minGrade) => {
  let best = { satisfied: false, credits: 0, used: [] };
  const missingOptions = [];

  anyOf.forEach((option) => {
    if (typeof option === 'string') {
      const code = normalizeCode(option);
      const course = context.courseIndex.get(code);
      if (isCompleted(course, minGrade)) {
        const credits = Number(course.credits) || 0;
        if (!best.satisfied || credits > best.credits) {
          best = { satisfied: true, credits, used: [code] };
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
        if (!isCompleted(course, minGrade)) {
          missing.push(code);
        } else {
          credits += Number(course.credits) || 0;
        }
      });
      if (missing.length === 0) {
        if (!best.satisfied || credits > best.credits) {
          best = { satisfied: true, credits, used: option.allOf.map(normalizeCode) };
        }
      } else {
        missingOptions.push(option.allOf.map(normalizeCode).join(' + '));
      }
      return;
    }

    if (option?.tag) {
      const result = evaluateTag(option, context, minGrade);
      if (result.satisfied) {
        if (!best.satisfied || result.credits > best.credits) {
          best = { satisfied: true, credits: result.credits, used: result.used || [] };
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
  const eligible = Array.from(context.courseIndex.values()).filter(
    (course) =>
      isCompleted(course, minGrade) && matchesTag(course, tag) && !excludeSet.has(course.code)
  );
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
  if (!creditOk) missing.push(`Need ${minCredits} credits from tag ${tag}`);
  if (minCount !== null && count < minCount) missing.push(`Need ${minCount} courses from tag ${tag}`);
  if (maxCount !== null && count > maxCount) missing.push(`Max ${maxCount} courses for tag ${tag}`);
  if (maxCredits !== null && credits > maxCredits) missing.push(`Max ${maxCredits} credits for tag ${tag}`);
  return { satisfied, credits, used: eligible.map((c) => c.code), missing };
};

const evaluateCourseRule = (courseCode, context, minGrade) => {
  const code = normalizeCode(courseCode);
  const course = context.courseIndex.get(code);
  if (!isCompleted(course, minGrade)) {
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

  const eligible = Array.from(context.courseIndex.values()).filter((course) => {
    const code = normalizeCode(`${course.department} ${course.course_number}`);
    if (!poolSet.has(code)) return false;
    if (excludeSet.has(code)) return false;
    return isCompleted(course, minGrade);
  });

  const credits = sumCredits(eligible);
  const count = eligible.length;

  const creditOk = minCredits === null ? true : credits >= minCredits;
  const countOk =
    (minCount === null || count >= minCount) && (maxCount === null || count <= maxCount);
  const creditCapOk = maxCredits === null ? true : credits <= maxCredits;

  const satisfied = creditOk && countOk && creditCapOk;

  const missing = [];
  if (!creditOk) missing.push(`Need ${minCredits} credits from pool`);
  if (minCount !== null && count < minCount) missing.push(`Need ${minCount} courses from pool`);
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
      if (isCompleted(course, minGrade) && context.emphasisCourseIds.has(course.course_id)) {
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
      isCompleted(course, minGrade) &&
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

  const credits = sumCredits(matched);
  const used = matched.map((c) => normalizeCode(`${c.department} ${c.course_number}`));
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
      results.push(evaluateCourseRule(item.course, context, minGrade));
      return;
    }
    if (item.anyOf) {
      results.push(evaluateAnyOf(item.anyOf, context, minGrade));
      return;
    }
    if (item.tag) {
      results.push(evaluateTag(item, context, minGrade));
      return;
    }
    if (item.pool) {
      results.push(evaluatePool(item, context, minGrade));
      return;
    }
    if (item.emphasisCredits) {
      results.push(evaluateEmphasis(item, context, minGrade));
      return;
    }
  });

  return results;
};

const summarizeGroup = (name, rules, context) => {
  if (rules.manual) {
    return {
      name,
      requiredCredits: rules.minCredits ?? null,
      earnedCredits: 0,
      satisfied: false,
      missing: [rules.note || 'Manual requirement'],
      usedCourses: [],
      warnings: []
    };
  }

  const minGrade = rules.gradeAtLeast || null;
  const missing = [];
  const warnings = [];
  const usedCourses = new Set();

  if (rules.allOf) {
    rules.allOf.forEach((code) => {
      const result = evaluateCourseRule(code, context, minGrade);
      if (!result.satisfied) missing.push(...(result.missing || []));
      (result.used || []).forEach((c) => usedCourses.add(c));
    });
  }

  if (rules.anyOf) {
    const result = evaluateAnyOf(rules.anyOf, context, minGrade);
    if (!result.satisfied) missing.push(...(result.missing || []));
    (result.used || []).forEach((c) => usedCourses.add(c));
  }

  if (rules.pool) {
    const result = evaluatePool(rules, context, minGrade);
    if (!result.satisfied) missing.push(...(result.missing || []));
    (result.used || []).forEach((c) => usedCourses.add(c));
  }

  if (rules.items) {
    const results = evaluateItems(rules.items, context, minGrade);
    results.forEach((result) => {
      if (!result.satisfied && result.missing) missing.push(...result.missing);
      (result.used || []).forEach((c) => usedCourses.add(c));
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
      return isCompleted(course, minGrade);
    });
    if (taken.length > rules.maxCount) {
      warnings.push(
        rules.maxWarning || `Only ${rules.maxCount} of ${codes.join(', ')} may be used.`
      );
      satisfied = false; // enforce strictly
    }
  }

  return {
    name,
    requiredCredits: minCredits,
    earnedCredits: credits,
    satisfied,
    missing,
    usedCourses: Array.from(usedCourses),
    warnings
  };
};

const evaluateRequirements = ({ requirementSet, studentCourses, emphasisCourseIds, hasHsLanguage, hasSabrCourse }) => {
  const courseIndex = buildCourseIndex(studentCourses);
  const completedCourses = Array.from(courseIndex.values()).filter((course) =>
    isCompleted(course, null)
  );

  const context = {
    courseIndex,
    completedCourses,
    emphasisCourseIds,
    hasHsLanguage: Boolean(hasHsLanguage),
    hasSabrCourse: Boolean(hasSabrCourse)
  };

  const groups = (requirementSet.groups || []).map((group) =>
    summarizeGroup(group.name, group.rules || {}, context)
  );

  return {
    requirementSet: {
      name: requirementSet.name,
      catalog_year: requirementSet.catalog_year
    },
    groups,
    warnings: groups.flatMap((group) => group.warnings || [])
  };
};

export { evaluateRequirements, normalizeCode };
