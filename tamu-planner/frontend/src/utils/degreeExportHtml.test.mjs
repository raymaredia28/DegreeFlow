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

  it('includes Work Not Applied section when courses exist', () => {
    const degreeResult = {
      requirementSet: { name: 'Test Degree', catalog_year: 2024 },
      groups: [
        { name: 'Core', satisfied: true, earnedCredits: 3, requiredCredits: 3, usedCourses: ['CSCE 121'], missing: [] }
      ],
      workNotApplied: [
        { code: 'HIST 105', credits: 3, status: 'completed', reason: 'Not matched', potentialGroups: ['General Electives'] },
        { code: 'POLS 206', credits: 3, status: 'completed', reason: 'Not matched', potentialGroups: [] }
      ]
    };

    const terms = [
      {
        label: 'Fall 2023',
        status: 'Evaluated',
        courses: [
          { code: 'CSCE 121', title: 'Intro to CS', credits: 4, grade: 'A', transfer: false },
          { code: 'HIST 105', title: 'History of the US', credits: 3, grade: 'B', transfer: false },
          { code: 'POLS 206', title: 'Amer Natl Govt', credits: 3, grade: 'A', transfer: true }
        ]
      }
    ];

    const html = buildExportHtmlFromDegreeResult(degreeResult, terms);

    expect(html).toContain('Work Not Applied');
    expect(html).toContain('HIST 105');
    expect(html).toContain('History of the US');
    expect(html).toContain('POLS 206');
    expect(html).toContain('General Electives');
    expect(html).toContain('2 courses');
    expect(html).toContain('6 credits');
  });

  it('omits Work Not Applied section when no unapplied courses', () => {
    const degreeResult = {
      requirementSet: { name: 'Test Degree' },
      groups: [
        { name: 'Core', satisfied: true, earnedCredits: 3, requiredCredits: 3, usedCourses: ['CSCE 121'], missing: [] }
      ],
      workNotApplied: []
    };

    const html = buildExportHtmlFromDegreeResult(degreeResult, []);
    expect(html).not.toContain('Work Not Applied');
  });

  it('handles missing workNotApplied gracefully', () => {
    const degreeResult = {
      requirementSet: { name: 'Test Degree' },
      groups: []
    };

    const html = buildExportHtmlFromDegreeResult(degreeResult, []);
    expect(html).not.toContain('Work Not Applied');
    expect(html).toContain('Degree Evaluation Export');
  });
});
