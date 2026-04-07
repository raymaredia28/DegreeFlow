const normalizeCode = (raw) => {
  if (!raw) return '';
  return String(raw).trim().toUpperCase().replace(/\s+/g, ' ');
};

const collectAppliedCodesFromResult = (result) => {
  const used = new Set();
  if (!result || !Array.isArray(result.groups)) return used;
  result.groups.forEach((group) => {
    (group?.usedCourses || []).forEach((code) => {
      const normalized = normalizeCode(code);
      if (normalized) used.add(normalized);
    });
  });
  return used;
};

export const reconcileWorkNotApplied = (degreeResult, ...otherResults) => {
  if (!degreeResult || !Array.isArray(degreeResult.workNotApplied)) return degreeResult;

  const appliedEverywhere = new Set();

  collectAppliedCodesFromResult(degreeResult).forEach((code) => appliedEverywhere.add(code));
  otherResults.forEach((result) => {
    collectAppliedCodesFromResult(result).forEach((code) => appliedEverywhere.add(code));
  });

  const filteredWorkNotApplied = degreeResult.workNotApplied.filter((entry) => {
    const code = normalizeCode(entry?.code);
    return code && !appliedEverywhere.has(code);
  });

  return {
    ...degreeResult,
    workNotApplied: filteredWorkNotApplied
  };
};

