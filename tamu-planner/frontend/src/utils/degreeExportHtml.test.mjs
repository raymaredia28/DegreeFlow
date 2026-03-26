import { describe, it, expect } from 'vitest';
import { buildExportHtmlFromDegreeResult } from './degreeExportHtml.mjs';

describe('buildExportHtmlFromDegreeResult', () => {
  it('export HTML includes planned future course metadata', () => {
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

    expect(html).toContain('CSCE 999');
    expect(html).toContain('Planned Course Title');
    expect(html).toContain('Fall 2025');
    expect(html).toContain('PLANNED');
    expect(html).toContain('<td>H</td>');
    expect(html).toContain('Minor:');
    expect(html).toContain('Minor - Math');
  });
});
