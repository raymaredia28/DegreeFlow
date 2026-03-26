import { describe, it, expect } from 'vitest';
import {
  validateDegreeRequirements,
  getRequirements,
  checkPrerequisites
} from '../utils/degreeValidator';
import degreeValidator from '../utils/degreeValidator';

describe('degreeValidator', () => {
  describe('getRequirements', () => {
    it('returns the requirements object', () => {
      const reqs = getRequirements();
      expect(reqs).toBeDefined();
      expect(reqs.degree).toBe('Computer Science - BS');
      expect(reqs.totalRequiredHours).toBe(126);
    });

    it('contains required courses, core curriculum, and electives', () => {
      const reqs = getRequirements();
      expect(reqs.requiredCourses).toBeDefined();
      expect(reqs.coreCurriculum).toBeDefined();
      expect(reqs.electiveRequirements).toBeDefined();
    });

    it('contains course prerequisites', () => {
      const reqs = getRequirements();
      expect(reqs.coursePrerequisites).toBeDefined();
      expect(reqs.coursePrerequisites['CSCE 221']).toContain('CSCE 120');
    });
  });

  describe('meetsMinimumGrade', () => {
    const { meetsMinimumGrade } = degreeValidator;

    it('returns true when grade meets minimum', () => {
      expect(meetsMinimumGrade('A', 'C')).toBe(true);
      expect(meetsMinimumGrade('B', 'C')).toBe(true);
      expect(meetsMinimumGrade('C', 'C')).toBe(true);
    });

    it('returns false when grade is below minimum', () => {
      expect(meetsMinimumGrade('D', 'C')).toBe(false);
      expect(meetsMinimumGrade('F', 'C')).toBe(false);
    });

    it('returns true for in-progress grades', () => {
      expect(meetsMinimumGrade('IP', 'C')).toBe(true);
      expect(meetsMinimumGrade('S', 'C')).toBe(true);
      expect(meetsMinimumGrade('P', 'C')).toBe(true);
    });

    it('returns true for transfer grades', () => {
      expect(meetsMinimumGrade('TA', 'C')).toBe(true);
      expect(meetsMinimumGrade('TIP', 'C')).toBe(true);
    });

    it('returns true when either grade is missing', () => {
      expect(meetsMinimumGrade(null, 'C')).toBe(true);
      expect(meetsMinimumGrade('A', null)).toBe(true);
      expect(meetsMinimumGrade(null, null)).toBe(true);
    });

    it('returns true for unknown grade strings', () => {
      expect(meetsMinimumGrade('X', 'C')).toBe(true);
    });

    it('handles grade distinctions (plus/minus)', () => {
      expect(meetsMinimumGrade('B+', 'B')).toBe(true);
      expect(meetsMinimumGrade('B-', 'B')).toBe(false);
      expect(meetsMinimumGrade('C+', 'B-')).toBe(false);
      expect(meetsMinimumGrade('A-', 'B+')).toBe(true);
    });
  });

  describe('checkPrerequisites', () => {
    it('returns satisfied for course with no prerequisites', () => {
      const result = checkPrerequisites('CSCE 181', []);
      expect(result.satisfied).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('returns satisfied when all prerequisites are met', () => {
      const completed = [
        { code: 'CSCE 120', credits: 3, grade: 'A' },
        { code: 'CSCE 222', credits: 3, grade: 'B' }
      ];
      const result = checkPrerequisites('CSCE 221', completed);
      expect(result.satisfied).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('returns missing prerequisites', () => {
      const completed = [
        { code: 'CSCE 120', credits: 3, grade: 'A' }
      ];
      const result = checkPrerequisites('CSCE 221', completed);
      expect(result.satisfied).toBe(false);
      expect(result.missing).toContain('CSCE 222');
    });

    it('handles senior standing prerequisite', () => {
      const fewCredits = Array.from({ length: 10 }, (_, i) => ({
        code: `COURSE ${i}`,
        credits: 3,
        grade: 'A'
      }));
      const result = checkPrerequisites('CSCE 481', fewCredits);
      expect(result.satisfied).toBe(false);
      expect(result.missing).toContain('Senior standing');
    });

    it('satisfies senior standing with 90+ credits', () => {
      const manyCredits = Array.from({ length: 30 }, (_, i) => ({
        code: `COURSE ${i}`,
        credits: 3,
        grade: 'A'
      }));
      const result = checkPrerequisites('CSCE 481', manyCredits);
      expect(result.satisfied).toBe(true);
    });

    it('returns satisfied for unknown course code', () => {
      const result = checkPrerequisites('UNKNOWN 999', []);
      expect(result.satisfied).toBe(true);
    });

    it('returns satisfied for CSCE 120 with None prerequisite', () => {
      const result = checkPrerequisites('CSCE 120', []);
      expect(result.satisfied).toBe(true);
    });
  });

  describe('validateDegreeRequirements', () => {
    it('returns structure with all sections for empty courses', () => {
      const result = validateDegreeRequirements([]);
      expect(result.summary).toBeDefined();
      expect(result.requiredCourses).toBeDefined();
      expect(result.coreCurriculum).toBeDefined();
      expect(result.csElectives).toBeDefined();
      expect(result.emphasisArea).toBeDefined();
      expect(result.scienceElectives).toBeDefined();
      expect(result.overallStatus).toBeDefined();
    });

    it('shows 0 credits and 126 required for empty courses', () => {
      const result = validateDegreeRequirements([]);
      expect(result.summary.totalCredits).toBe(0);
      expect(result.summary.requiredCredits).toBe(126);
      expect(result.summary.remainingCredits).toBe(126);
    });

    it('counts completed course credits', () => {
      const courses = [
        { code: 'CSCE 120', credits: 3, grade: 'A' },
        { code: 'MATH 151', credits: 4, grade: 'B' }
      ];
      const result = validateDegreeRequirements(courses);
      expect(result.summary.totalCredits).toBe(7);
    });

    it('does not count IP courses toward total credits', () => {
      const courses = [
        { code: 'CSCE 120', credits: 3, grade: 'A' },
        { code: 'CSCE 221', credits: 4, grade: 'IP' }
      ];
      const result = validateDegreeRequirements(courses);
      expect(result.summary.totalCredits).toBe(3);
    });

    it('marks satisfied required courses', () => {
      const courses = [
        { code: 'CHEM 107', credits: 3, grade: 'A' },
        { code: 'MATH 151', credits: 4, grade: 'B' }
      ];
      const result = validateDegreeRequirements(courses);
      const satisfiedCodes = result.requiredCourses.satisfied.map(
        s => s.requirement.code
      );
      expect(satisfiedCodes).toContain('CHEM 107');
      expect(satisfiedCodes).toContain('MATH 151');
    });

    it('marks in-progress courses separately', () => {
      const courses = [
        { code: 'CSCE 120', credits: 3, grade: 'IP' }
      ];
      const result = validateDegreeRequirements(courses);
      expect(result.requiredCourses.inProgress.length).toBeGreaterThan(0);
    });

    it('recognizes alternative courses', () => {
      const courses = [
        { code: 'ENGL 104', credits: 3, grade: 'A' }
      ];
      const result = validateDegreeRequirements(courses);
      const satisfiedAlts = result.requiredCourses.satisfied.filter(
        s => s.requirement.alternatives && s.requirement.alternatives.includes('ENGL 104')
      );
      expect(satisfiedAlts.length).toBeGreaterThan(0);
    });

    it('recognizes alternate code courses', () => {
      const courses = [
        { code: 'PHYS 216', credits: 2, grade: 'B' }
      ];
      const result = validateDegreeRequirements(courses);
      const found = result.requiredCourses.satisfied.some(
        s => s.requirement.alternateCode === 'PHYS 216'
      );
      expect(found).toBe(true);
    });

    it('validates science electives', () => {
      const courses = [
        { code: 'BIOL 111', credits: 4, grade: 'A' },
        { code: 'GEOL 101', credits: 3, grade: 'B' }
      ];
      const result = validateDegreeRequirements(courses);
      expect(result.scienceElectives.satisfied).toBe(7);
      expect(result.scienceElectives.courses.length).toBe(2);
    });

    it('excludes required science from science electives', () => {
      const courses = [
        { code: 'CHEM 107', credits: 3, grade: 'A' },
        { code: 'PHYS 206', credits: 3, grade: 'B' }
      ];
      const result = validateDegreeRequirements(courses);
      expect(result.scienceElectives.satisfied).toBe(0);
    });

    it('validates emphasis area credits', () => {
      const courses = [
        { code: 'MATH 401', credits: 3, grade: 'A' },
        { code: 'MATH 447', credits: 3, grade: 'A' }
      ];
      const result = validateDegreeRequirements(courses, ['MATH 401', 'MATH 447']);
      expect(result.emphasisArea.satisfied).toBe(6);
    });

    it('sets overallStatus to Early Progress when many courses remain', () => {
      const result = validateDegreeRequirements([]);
      expect(result.overallStatus).toBe('Early Progress');
    });

    it('sets overallStatus to Complete when all done', () => {
      const reqs = getRequirements();
      const allRequired = [];
      Object.values(reqs.requiredCourses).forEach(year => {
        Object.values(year).forEach(semester => {
          if (Array.isArray(semester)) {
            semester.forEach(req => {
              const code = req.code || (req.alternatives && req.alternatives[0]);
              if (code) {
                allRequired.push({ code, credits: req.credits, grade: 'A' });
              }
            });
          }
        });
      });
      allRequired.push({ code: 'CSCE 399', credits: 0, grade: 'S' });

      const filler = Array.from({ length: 30 }, (_, i) => ({
        code: `FILL ${100 + i}`,
        credits: 3,
        grade: 'A'
      }));

      const all = [...allRequired, ...filler];
      const result = validateDegreeRequirements(all);
      if (result.requiredCourses.unsatisfied.length === 0 &&
          result.summary.totalCredits >= 126) {
        expect(result.overallStatus).toBe('Complete');
      }
    });

    it('identifies unsatisfied courses with reason', () => {
      const result = validateDegreeRequirements([]);
      expect(result.requiredCourses.unsatisfied.length).toBeGreaterThan(0);
      result.requiredCourses.unsatisfied.forEach(item => {
        expect(item.reason).toBeDefined();
      });
    });

    it('handles grade below minimum requirement', () => {
      const courses = [
        { code: 'CHEM 107', credits: 3, grade: 'D' }
      ];
      const result = validateDegreeRequirements(courses);
      const found = result.requiredCourses.unsatisfied.find(
        item => item.course && item.course.code === 'CHEM 107'
      );
      expect(found).toBeDefined();
      expect(found.reason).toMatch(/does not meet minimum/i);
    });
  });
});
