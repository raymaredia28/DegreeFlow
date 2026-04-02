/**
 * Compute a stable signature for the inputs that affect the generated evaluation.
 * This is used to decide whether the currently displayed `degreeResult` is stale.
 */
export const computeEvaluationSignature = ({
  transcriptTerms = [],
  semesterPlans = {},
  selectedEmphasis = '',
  selectedMinor = '',
  hasHsLanguage = false,
  hasSabrCourse = false
} = {}) => {
  const normTranscript = (Array.isArray(transcriptTerms) ? transcriptTerms : [])
    .map((t) => ({
      label: String(t?.label ?? ''),
      status: String(t?.status ?? ''),
      courses: (Array.isArray(t?.courses) ? t.courses : [])
        .map((c) => ({
          code: String(c?.code ?? '').replace(/\s+/g, ' ').trim().toUpperCase(),
          title: String(c?.title ?? ''),
          credits: Number(c?.credits ?? 0),
          grade: String(c?.grade ?? ''),
          transfer: Boolean(c?.transfer)
        }))
        .filter((c) => c.code)
        .sort((a, b) => a.code.localeCompare(b.code))
    }))
    .filter((t) => t.label)
    .sort((a, b) => a.label.localeCompare(b.label));

  const normPlans = Object.entries(semesterPlans || {})
    .filter(([, codes]) => Array.isArray(codes) && codes.length > 0)
    .map(([termLabel, codes]) => ({
      termLabel: String(termLabel ?? ''),
      codes: codes
        .map((code) => String(code ?? '').replace(/\s+/g, ' ').trim().toUpperCase())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
    }))
    .filter((x) => x.termLabel)
    .sort((a, b) => a.termLabel.localeCompare(b.termLabel));

  const payload = {
    transcript: normTranscript,
    plans: normPlans,
    selectedEmphasis: String(selectedEmphasis ?? ''),
    selectedMinor: String(selectedMinor ?? ''),
    hasHsLanguage: Boolean(hasHsLanguage),
    hasSabrCourse: Boolean(hasSabrCourse)
  };

  return JSON.stringify(payload);
};

