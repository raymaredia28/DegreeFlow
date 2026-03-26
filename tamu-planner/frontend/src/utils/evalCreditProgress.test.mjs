import test from 'node:test';
import assert from 'node:assert/strict';

import { computeCreditProgressFromEvalResult } from './evalCreditProgress.mjs';

test('computeCreditProgressFromEvalResult sums earned/required credits across groups', () => {
  const result = {
    groups: [
      { name: 'A', earnedCredits: 3, requiredCredits: 6, satisfied: false },
      // Required credits derived from name when requiredCredits is missing
      { name: 'B (10 credits)', earnedCredits: 6, requiredCredits: null, satisfied: false },
      { name: 'C', earnedCredits: 0, requiredCredits: null, satisfied: false }
    ]
  };

  const out = computeCreditProgressFromEvalResult(result);
  assert.equal(out.earnedCredits, 9);
  assert.equal(out.requiredCredits, 16);
  assert.ok(out.pct > 56 && out.pct < 57); // 9/16 = 56.25%
});

