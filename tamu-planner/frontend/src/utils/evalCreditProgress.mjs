export const computeCreditProgressFromEvalResult = (evalResult) => {
  const groups = Array.isArray(evalResult?.groups) ? evalResult.groups : [];
  let required = 0;
  let earned = 0;

  groups.forEach((g) => {
    const reqFromField = Number(g?.requiredCredits ?? 0);
    const reqFromNameMatch = String(g?.name ?? '').match(/\((\d+)\s*credits?\)/i);
    const reqFromName = reqFromNameMatch ? Number(reqFromNameMatch[1]) : 0;
    const req = Number.isFinite(reqFromField) && reqFromField > 0 ? reqFromField : reqFromName;
    const ern = Number(g?.earnedCredits ?? 0);
    if (!Number.isFinite(req) || req <= 0) return;
    required += req;
    earned += Number.isFinite(ern) ? ern : 0;
  });

  // Avoid divide-by-zero and avoid >100% fill.
  const pct = required > 0 ? Math.min(100, Math.max(0, (earned / required) * 100)) : 0;
  return {
    earnedCredits: earned,
    requiredCredits: required,
    pct
  };
};

