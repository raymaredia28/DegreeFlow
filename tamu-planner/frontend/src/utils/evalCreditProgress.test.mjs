import { describe, it, expect } from 'vitest';
import { computeCreditProgressFromEvalResult } from './evalCreditProgress.mjs';

describe('computeCreditProgressFromEvalResult', () => {
  it('sums earned/required credits across groups', () => {
    const result = {
      groups: [
        { name: 'A', earnedCredits: 3, requiredCredits: 6, satisfied: false },
        { name: 'B (10 credits)', earnedCredits: 6, requiredCredits: null, satisfied: false },
        { name: 'C', earnedCredits: 0, requiredCredits: null, satisfied: false }
      ]
    };

    const out = computeCreditProgressFromEvalResult(result);
    expect(out.earnedCredits).toBe(9);
    expect(out.requiredCredits).toBe(16);
    expect(out.pct).toBeGreaterThan(56);
    expect(out.pct).toBeLessThan(57);
  });
});
