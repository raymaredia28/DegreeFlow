import { describe, it, expect } from 'vitest';
import { computeEvaluationSignature } from './evaluationFreshness.mjs';

describe('computeEvaluationSignature', () => {
  it('is order-insensitive for arrays/codes', () => {
    const baseTranscriptTerms = [
      {
        label: 'Fall 2023',
        status: 'Evaluated',
        courses: [
          { code: 'CSCE 120', grade: 'A', credits: 3, transfer: false, title: 'T1' }
        ]
      }
    ];

    const altTranscriptTerms = [
      {
        label: 'Fall 2023',
        status: 'Evaluated',
        courses: [
          { code: 'CSCE 120', grade: 'A', credits: 3, transfer: false, title: 'T1' }
        ]
      }
    ];

    const baseSemesterPlans = {
      'Spring 2024': ['MATH 151', 'CSCE 221']
    };
    const altSemesterPlans = {
      'Spring 2024': ['CSCE 221', 'MATH 151']
    };

    const sig1 = computeEvaluationSignature({
      transcriptTerms: baseTranscriptTerms,
      semesterPlans: baseSemesterPlans,
      selectedEmphasis: 'Undecided',
      selectedMinor: 'None',
      hasHsLanguage: true,
      hasSabrCourse: false
    });

    const sig2 = computeEvaluationSignature({
      transcriptTerms: altTranscriptTerms,
      semesterPlans: altSemesterPlans,
      selectedEmphasis: 'Undecided',
      selectedMinor: 'None',
      hasHsLanguage: true,
      hasSabrCourse: false
    });

    expect(sig1).toBe(sig2);
  });

  it('changes when planned courses change', () => {
    const transcriptTerms = [
      {
        label: 'Fall 2023',
        status: 'Evaluated',
        courses: [{ code: 'CSCE 120', grade: 'A', credits: 3, transfer: false, title: 'T1' }]
      }
    ];

    const semesterPlans1 = { 'Spring 2024': ['CSCE 221'] };
    const semesterPlans2 = { 'Spring 2024': ['CSCE 312'] };

    const sig1 = computeEvaluationSignature({
      transcriptTerms,
      semesterPlans: semesterPlans1,
      selectedEmphasis: 'Undecided',
      selectedMinor: 'None',
      hasHsLanguage: false,
      hasSabrCourse: false
    });

    const sig2 = computeEvaluationSignature({
      transcriptTerms,
      semesterPlans: semesterPlans2,
      selectedEmphasis: 'Undecided',
      selectedMinor: 'None',
      hasHsLanguage: false,
      hasSabrCourse: false
    });

    expect(sig1).not.toBe(sig2);
  });

  it('changes when evaluation priority codes change', () => {
    const transcriptTerms = [
      {
        label: 'Fall 2023',
        status: 'Evaluated',
        courses: [{ code: 'CSCE 120', grade: 'A', credits: 3, transfer: false, title: 'T1' }]
      }
    ];
    const semesterPlans = {};

    const sig1 = computeEvaluationSignature({
      transcriptTerms,
      semesterPlans,
      selectedEmphasis: 'Undecided',
      selectedMinor: 'None',
      hasHsLanguage: false,
      hasSabrCourse: false,
      evaluationPriorityCodes: []
    });

    const sig2 = computeEvaluationSignature({
      transcriptTerms,
      semesterPlans,
      selectedEmphasis: 'Undecided',
      selectedMinor: 'None',
      hasHsLanguage: false,
      hasSabrCourse: false,
      evaluationPriorityCodes: ['MATH 151']
    });

    expect(sig1).not.toBe(sig2);
  });
});
