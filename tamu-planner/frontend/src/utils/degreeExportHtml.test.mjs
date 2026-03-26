import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExportHtmlFromDegreeResult } from './degreeExportHtml.mjs';

test('export HTML includes planned future course metadata', () => {
  const degreeResult = {
    requirementSet: { name: 'Test Degree', catalog_year: 2024 },
    groups: [
      {
        name: 'Area A',
        satisfied: false,
        earnedCredits: 0,
        requiredCredits: 3,
        usedCourses: ['CSCE 999'],
        missing: []
      }
    ]
  };

  // Simulate the export pipeline augmenting transcript terms with planned terms.
  const exportTerms = [
    {
      label: 'Fall 2025',
      status: 'Planned',
      courses: [
        {
          code: 'CSCE 999',
          title: 'Planned Course Title',
          credits: 3,
          grade: 'PLANNED',
          transfer: false
        }
      ]
    }
  ];

  const html = buildExportHtmlFromDegreeResult(degreeResult, exportTerms, 'Computed in DegreeFlow', {
    minor: 'Minor - Math'
  });

  assert.ok(html.includes('CSCE 999'));
  assert.ok(html.includes('Planned Course Title'));
  assert.ok(html.includes('Fall 2025'));
  assert.ok(html.includes('PLANNED'));
  // Source column uses `T` for transfer and `H` otherwise
  assert.ok(html.includes('<td>H</td>'));
  assert.ok(html.includes('Minor:'));
  assert.ok(html.includes('Minor - Math'));
});

