/**
 * Degree Requirements Validator
 * 
 * Validates a student's completed courses against CS degree requirements
 */

import csRequirements from '../data/csRequirements.json';

/**
 * Grade point mapping for GPA calculations
 */
const GRADE_POINTS = {
  'A': 4.0,
  'A-': 3.67,
  'B+': 3.33,
  'B': 3.0,
  'B-': 2.67,
  'C+': 2.33,
  'C': 2.0,
  'C-': 1.67,
  'D+': 1.33,
  'D': 1.0,
  'D-': 0.67,
  'F': 0.0
};

/**
 * Checks if a grade meets the minimum requirement
 */
function meetsMinimumGrade(grade, minGrade) {
  if (!grade || !minGrade) return true;
  if (grade === 'IP' || grade === 'S' || grade === 'P') return true; // In progress or pass
  if (grade === 'TA' || grade === 'TIP') return true; // Transfer credit
  
  const gradeValue = GRADE_POINTS[grade];
  const minGradeValue = GRADE_POINTS[minGrade];
  
  if (gradeValue === undefined || minGradeValue === undefined) return true;
  return gradeValue >= minGradeValue;
}

/**
 * Checks if a course matches a requirement (handles alternatives)
 */
function matchesCourseRequirement(course, requirement) {
  if (requirement.code && course.code === requirement.code) {
    return true;
  }
  if (requirement.alternateCode && course.code === requirement.alternateCode) {
    return true;
  }
  if (requirement.alternatives && requirement.alternatives.includes(course.code)) {
    return true;
  }
  return false;
}

/**
 * Validates all required courses
 */
function validateRequiredCourses(completedCourses) {
  const results = {
    satisfied: [],
    unsatisfied: [],
    inProgress: []
  };

  const allRequiredCourses = [];
  
  // Flatten all required courses
  Object.values(csRequirements.requiredCourses).forEach(year => {
    Object.values(year).forEach(semester => {
      if (Array.isArray(semester)) {
        allRequiredCourses.push(...semester);
      }
    });
  });

  // Add special requirements
  if (csRequirements.specialRequirements.highImpactExperience) {
    allRequiredCourses.push(csRequirements.specialRequirements.highImpactExperience);
  }

  // Check each required course
  allRequiredCourses.forEach(requirement => {
    const matchingCourse = completedCourses.find(course => 
      matchesCourseRequirement(course, requirement)
    );

    if (matchingCourse) {
      if (matchingCourse.grade === 'IP' || matchingCourse.grade === 'TIP') {
        results.inProgress.push({
          requirement,
          course: matchingCourse
        });
      } else if (meetsMinimumGrade(matchingCourse.grade, requirement.minGrade)) {
        results.satisfied.push({
          requirement,
          course: matchingCourse
        });
      } else {
        results.unsatisfied.push({
          requirement,
          course: matchingCourse,
          reason: `Grade ${matchingCourse.grade} does not meet minimum grade ${requirement.minGrade}`
        });
      }
    } else {
      results.unsatisfied.push({
        requirement,
        course: null,
        reason: 'Course not taken'
      });
    }
  });

  return results;
}

/**
 * Validates core curriculum requirements
 */
function validateCoreCurriculum(completedCourses) {
  const results = {
    satisfied: {},
    remaining: {}
  };

  // This is simplified - in reality, you'd need to check against approved lists
  // For now, we'll just count UCC courses and categorize them
  const uccCourses = completedCourses.filter(course => 
    // Add logic to identify UCC courses (might need tags or a lookup)
    false // Placeholder - needs implementation
  );

  Object.entries(csRequirements.coreCurriculum.categories).forEach(([category, req]) => {
    // Count hours in each category (needs proper categorization)
    results.satisfied[category] = 0;
    results.remaining[category] = req.hours;
  });

  return results;
}

/**
 * Validates CS elective requirements
 */
function validateCSElectives(completedCourses) {
  const results = {
    satisfied: {},
    remaining: {}
  };

  const csElectives = completedCourses.filter(course => 
    course.code.startsWith('CSCE') && 
    !isRequiredCourse(course.code)
  );

  const breakdown = csRequirements.electiveRequirements.computerScienceElectives.breakdown;
  
  Object.entries(breakdown).forEach(([category, req]) => {
    // Simplified - needs proper categorization of courses
    results.satisfied[category] = 0;
    results.remaining[category] = req.hours;
  });

  // Count total CS elective hours
  const totalCSElectiveHours = csElectives.reduce((sum, course) => sum + course.credits, 0);
  results.totalHours = totalCSElectiveHours;
  results.requiredHours = csRequirements.electiveRequirements.computerScienceElectives.totalHours;

  return results;
}

/**
 * Helper to check if a course is required
 */
function isRequiredCourse(courseCode) {
  const allRequiredCourses = [];
  Object.values(csRequirements.requiredCourses).forEach(year => {
    Object.values(year).forEach(semester => {
      if (Array.isArray(semester)) {
        semester.forEach(req => {
          if (req.code) allRequiredCourses.push(req.code);
          if (req.alternateCode) allRequiredCourses.push(req.alternateCode);
          if (req.alternatives) allRequiredCourses.push(...req.alternatives);
        });
      }
    });
  });
  return allRequiredCourses.includes(courseCode);
}

/**
 * Validates emphasis area requirements
 */
function validateEmphasisArea(completedCourses, emphasisAreaCourses = []) {
  const emphasisCredits = emphasisAreaCourses.reduce((sum, code) => {
    const course = completedCourses.find(c => c.code === code);
    return sum + (course ? course.credits : 0);
  }, 0);

  return {
    satisfied: emphasisCredits,
    required: csRequirements.electiveRequirements.emphasisArea.totalHours,
    remaining: Math.max(0, csRequirements.electiveRequirements.emphasisArea.totalHours - emphasisCredits)
  };
}

/**
 * Validates science electives
 */
function validateScienceElectives(completedCourses) {
  // Science courses typically: CHEM, PHYS, BIOL, etc. (excluding required ones)
  const sciencePrefixes = ['CHEM', 'PHYS', 'BIOL', 'GEOL', 'ASTR', 'ATMO', 'OCNG'];
  
  const requiredScience = ['CHEM 107', 'CHEM 117', 'PHYS 206', 'PHYS 216'];
  
  const scienceElectives = completedCourses.filter(course => {
    const prefix = course.code.split(' ')[0];
    return sciencePrefixes.includes(prefix) && !requiredScience.includes(course.code);
  });

  const totalHours = scienceElectives.reduce((sum, course) => sum + course.credits, 0);

  return {
    satisfied: totalHours,
    required: csRequirements.electiveRequirements.scienceElectives.totalHours,
    remaining: Math.max(0, csRequirements.electiveRequirements.scienceElectives.totalHours - totalHours),
    courses: scienceElectives
  };
}

/**
 * Main validation function
 */
export function validateDegreeRequirements(completedCourses, emphasisAreaCourses = []) {
  const totalCredits = completedCourses.reduce((sum, course) => {
    // Don't count IP courses or courses with no grade
    if (course.grade === 'IP' || course.grade === 'TIP' || !course.grade) return sum;
    return sum + course.credits;
  }, 0);

  const results = {
    summary: {
      totalCredits,
      requiredCredits: csRequirements.totalRequiredHours,
      remainingCredits: Math.max(0, csRequirements.totalRequiredHours - totalCredits)
    },
    requiredCourses: validateRequiredCourses(completedCourses),
    coreCurriculum: validateCoreCurriculum(completedCourses),
    csElectives: validateCSElectives(completedCourses),
    emphasisArea: validateEmphasisArea(completedCourses, emphasisAreaCourses),
    scienceElectives: validateScienceElectives(completedCourses),
    overallStatus: 'In Progress'
  };

  // Determine overall status
  const allRequiredSatisfied = results.requiredCourses.unsatisfied.length === 0;
  const allCreditsComplete = totalCredits >= csRequirements.totalRequiredHours;
  
  if (allRequiredSatisfied && allCreditsComplete) {
    results.overallStatus = 'Complete';
  } else if (results.requiredCourses.unsatisfied.length > 10) {
    results.overallStatus = 'Early Progress';
  }

  return results;
}

/**
 * Get detailed requirement info
 */
export function getRequirements() {
  return csRequirements;
}

/**
 * Check prerequisites for a course
 */
export function checkPrerequisites(courseCode, completedCourses) {
  const prerequisites = csRequirements.coursePrerequisites[courseCode];
  
  if (!prerequisites || prerequisites[0] === 'None or ENGR 102' || prerequisites[0] === 'None') {
    return { satisfied: true, missing: [] };
  }

  const completedCodes = completedCourses.map(c => c.code);
  const missing = prerequisites.filter(prereq => {
    if (prereq === 'Senior standing') {
      // Check if student has 90+ credits
      const totalCredits = completedCourses.reduce((sum, c) => sum + c.credits, 0);
      return totalCredits < 90;
    }
    return !completedCodes.includes(prereq);
  });

  return {
    satisfied: missing.length === 0,
    missing
  };
}

export default {
  validateDegreeRequirements,
  getRequirements,
  checkPrerequisites,
  meetsMinimumGrade
};
