const TRANSCRIPT_MARKERS = [
  "SUBJ NO",
  "COURSE TITLE",
  "COURSES IN PROGRESS",
  "TRANSCRIPT TOTALS",
  "TOTAL INSTITUTION",
  "TOTAL TRANSFER",
  "OVERALL"
];

const DEGREE_EVAL_MARKERS = [
  "DEGREE EVALUATION",
  "EVALUATION REQUEST INFORMATION",
  "PROGRAM REQUIREMENTS",
  "AREAS",
  "MET CREDITS",
  "PLANNED CREDITS",
  "UNMET CREDITS",
  "WORK NOT APPLIED",
  "RESIDENCE REQUIREMENT"
];

export type DocumentType = "transcript" | "degree-evaluation" | "unknown";

const normalize = (lines: string[]) =>
  (Array.isArray(lines) ? lines : [])
    .map((line) => String(line || "").toUpperCase())
    .join("\n");

export const detectDocumentType = (lines: string[]) => {
  const text = normalize(lines);
  let transcriptScore = 0;
  let degreeEvalScore = 0;

  TRANSCRIPT_MARKERS.forEach((marker) => {
    if (text.includes(marker)) transcriptScore += 2;
  });
  DEGREE_EVAL_MARKERS.forEach((marker) => {
    if (text.includes(marker)) degreeEvalScore += 2;
  });

  if (/\b(FALL|SPRING|SUMMER|WINTER)\s+\d{4}\b/.test(text)) transcriptScore += 1;
  if (/\bAREAS\b/.test(text) && /\bMET CREDITS\b/.test(text)) degreeEvalScore += 2;
  if (/\bDEGREE EVALUATION\b/.test(text)) degreeEvalScore += 4;

  const delta = Math.abs(degreeEvalScore - transcriptScore);
  const uncertain = delta < 3;
  if (uncertain) {
    return {
      documentType: "unknown" as DocumentType,
      confidence: "low" as const,
      transcriptScore,
      degreeEvaluationScore: degreeEvalScore
    };
  }

  if (degreeEvalScore > transcriptScore) {
    return {
      documentType: "degree-evaluation" as DocumentType,
      confidence: delta >= 6 ? ("high" as const) : ("medium" as const),
      transcriptScore,
      degreeEvaluationScore: degreeEvalScore
    };
  }

  return {
    documentType: "transcript" as DocumentType,
    confidence: delta >= 6 ? ("high" as const) : ("medium" as const),
    transcriptScore,
    degreeEvaluationScore: degreeEvalScore
  };
};

