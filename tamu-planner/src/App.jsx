import React, { useState, useMemo, useEffect } from 'react';
import tamuLogo from './assets/tamu-logo.svg';
import {
  Calendar,
  AlertTriangle,
  CheckCircle,
  Book,
  GraduationCap,
  TrendingUp,
  Plus,
  X,
  Search,
  Save
} from 'lucide-react';

// Mock data
const MOCK_STUDENT = {
  name: 'John Doe',
  uin: '123456789',
  major: 'Computer Science',
  catalogYear: '2023-2024',
  gpa: 3.45,
  completedCredits: 45,
  totalRequired: 120,
  emphasisArea: 'Software Engineering'
};

const COURSES = {
  'CSCE 121': {
    title: 'Intro to Program Design',
    credits: 4,
    difficulty: 3,
    prereqs: [],
    status: 'completed',
    grade: 'A'
  },
  'CSCE 221': {
    title: 'Data Structures & Algorithms',
    credits: 4,
    difficulty: 5,
    prereqs: ['CSCE 121'],
    status: 'completed',
    grade: 'B+'
  },
  'CSCE 222': {
    title: 'Discrete Structures',
    credits: 3,
    difficulty: 4,
    prereqs: ['MATH 151'],
    status: 'completed',
    grade: 'A-'
  },
  'CSCE 312': {
    title: 'Computer Organization',
    credits: 4,
    difficulty: 5,
    prereqs: ['CSCE 221'],
    status: 'in-progress'
  },
  'CSCE 313': {
    title: 'Intro to Computer Systems',
    credits: 4,
    difficulty: 4,
    prereqs: ['CSCE 221'],
    status: 'available'
  },
  'CSCE 314': {
    title: 'Programming Languages',
    credits: 3,
    difficulty: 4,
    prereqs: ['CSCE 221'],
    status: 'available'
  },
  'CSCE 331': {
    title: 'Foundations of Software Eng',
    credits: 3,
    difficulty: 4,
    prereqs: ['CSCE 221'],
    status: 'available'
  },
  'CSCE 411': {
    title: 'Design/Analysis of Algorithms',
    credits: 3,
    difficulty: 5,
    prereqs: ['CSCE 221', 'CSCE 222'],
    status: 'available'
  },
  'CSCE 421': {
    title: 'Machine Learning',
    credits: 3,
    difficulty: 5,
    prereqs: ['CSCE 221', 'MATH 304'],
    status: 'locked'
  },
  'CSCE 310': {
    title: 'Database Systems',
    credits: 3,
    difficulty: 3,
    prereqs: ['CSCE 221'],
    status: 'available'
  },
  'CSCE 420': {
    title: 'Artificial Intelligence',
    credits: 3,
    difficulty: 4,
    prereqs: ['CSCE 221'],
    status: 'available'
  },
  'CSCE 463': {
    title: 'Networks & Distributed Processing',
    credits: 3,
    difficulty: 4,
    prereqs: ['CSCE 313'],
    status: 'locked'
  },
  'MATH 151': {
    title: 'Calculus I',
    credits: 4,
    difficulty: 4,
    prereqs: [],
    status: 'completed',
    grade: 'B'
  },
  'MATH 152': {
    title: 'Calculus II',
    credits: 4,
    difficulty: 4,
    prereqs: ['MATH 151'],
    status: 'completed',
    grade: 'B+'
  },
  'MATH 304': {
    title: 'Linear Algebra',
    credits: 3,
    difficulty: 4,
    prereqs: ['MATH 151'],
    status: 'available'
  },
  'CSCE 399': {
    title: 'High Impact Experience',
    credits: 1,
    difficulty: 2,
    prereqs: [],
    status: 'available'
  }
};

const RISKY_COMBOS = [
  {
    courses: ['CSCE 221', 'CSCE 312'],
    message: 'High workload - both courses are very intensive',
    severity: 'high'
  },
  {
    courses: ['CSCE 313', 'CSCE 331'],
    message: 'Demanding combination - consider spreading across semesters',
    severity: 'medium'
  }
];

const RAW_TRANSCRIPT_TERMS = [
  {
    label: 'Fall 2020',
    status: 'Transfer',
    courses: [
      { code: 'CHEM 119', title: 'Fund of Chemistry I', credits: 4, grade: 'TA', transfer: true },
      { code: 'ENGL 103', title: 'Intro to Comp & Rhet', credits: 3, grade: 'TA', transfer: true }
    ]
  },
  {
    label: 'Spring 2021',
    status: 'Transfer',
    courses: [
      {
        code: 'ENGL 104',
        title: 'Composition & Rhetoric',
        credits: 3,
        grade: 'TA',
        transfer: true
      }
    ]
  },
  {
    label: 'Fall 2021',
    status: 'Transfer',
    courses: [
      { code: 'ECON 202', title: 'Prin of Economics', credits: 3, grade: 'TA', transfer: true },
      {
        code: 'ENGL 231',
        title: 'Survey of English Lit I',
        credits: 3,
        grade: 'TA',
        transfer: true
      }
    ]
  },
  {
    label: 'Spring 2022',
    status: 'Transfer',
    courses: [
      {
        code: 'ENGL 232',
        title: 'Survey of English Lit II',
        credits: 3,
        grade: 'TA',
        transfer: true
      },
      {
        code: 'POLS 206',
        title: 'Amer Natnl Govt',
        credits: 3,
        grade: 'TA',
        transfer: true
      }
    ]
  },
  {
    label: 'Fall 2022',
    status: 'Evaluated',
    courses: [
      { code: 'CHEM 107', title: 'Gen Chem for Engineers', credits: 3, grade: 'A' },
      { code: 'CHEM 117', title: 'Gen Chem for Engr Lab', credits: 1, grade: 'A' },
      { code: 'DCED 202', title: 'Dance Appreciation', credits: 3, grade: 'A' },
      { code: 'ENGR 102', title: 'Engr Lab I Computation', credits: 2, grade: 'A' },
      { code: 'FYEX 101', title: 'Hullabaloo U', credits: 0, grade: 'S' },
      { code: 'MATH 151', title: 'Engineering Math I', credits: 4, grade: 'A' },
      { code: 'POLS 207', title: 'State & Local Govt', credits: 3, grade: 'A' }
    ]
  },
  {
    label: 'Spring 2023',
    status: 'Evaluated',
    courses: [
      { code: 'MATH 152', title: 'Engineering Math II', credits: 4, grade: 'A' },
      { code: 'PERF 201', title: 'Mus & Human Experience', credits: 3, grade: 'A' },
      { code: 'PHYS 206', title: 'Newtonian Mechanics Engr & Sci', credits: 3, grade: 'A' },
      { code: 'PHYS 216', title: 'Ex Phys Engr Lab II Mechanics', credits: 2, grade: 'B' }
    ]
  },
  {
    label: 'Summer 2023',
    status: 'Transfer',
    courses: [
      { code: 'ANTH 210', title: 'Soc and Cult Anth', credits: 3, grade: 'TA', transfer: true },
      { code: 'GEOG 203', title: 'Planet Earth', credits: 3, grade: 'TA', transfer: true }
    ]
  },
  {
    label: 'Fall 2023',
    status: 'Evaluated',
    courses: [
      { code: 'CSCE 120', title: 'Program Design & Concepts', credits: 3, grade: 'A' },
      { code: 'CSCE 181', title: 'Intro to Computing', credits: 1, grade: 'A' },
      { code: 'CSCE 222', title: 'Discrete Struc Computing', credits: 3, grade: 'A' },
      { code: 'MATH 251', title: 'Engineering Math III', credits: 3, grade: 'B' },
      { code: 'MATH 304', title: 'Linear Algebra', credits: 3, grade: 'A' }
    ]
  },
  {
    label: 'Spring 2024',
    status: 'Evaluated',
    courses: [
      { code: 'CSCE 221', title: 'Data Struc & Algorithms', credits: 4, grade: 'A' },
      { code: 'CSCE 312', title: 'Computer Organization', credits: 4, grade: 'A' },
      { code: 'CSCE 314', title: 'Programming Languages', credits: 3, grade: 'A' },
      { code: 'STAT 211', title: 'Prin of Statistics I', credits: 3, grade: 'A' }
    ]
  },
  {
    label: 'Fall 2024',
    status: 'Evaluated',
    courses: [
      { code: 'CSCE 313', title: 'Intro to Computer Systems', credits: 4, grade: 'B' },
      { code: 'CSCE 331', title: 'Foundations Software Engineer', credits: 4, grade: 'A' },
      { code: 'CSCE 481', title: 'Seminar', credits: 1, grade: 'A' },
      { code: 'FINC 409', title: 'Survey of Finance Prin', credits: 3, grade: 'A' },
      { code: 'GEOL 101', title: 'Principles of Geology', credits: 3, grade: 'A' },
      { code: 'GEOL 102', title: 'Principles of Geology Lab', credits: 1, grade: 'A' }
    ]
  },
  {
    label: 'Spring 2025',
    status: 'In Progress',
    courses: [
      { code: 'CSCE 310', title: 'Database Systems', credits: 3, grade: 'IP' },
      { code: 'CSCE 411', title: 'Design Analy Algorithms', credits: 3, grade: 'IP' },
      { code: 'CSCE 413', title: 'Software Security', credits: 3, grade: 'IP' },
      { code: 'CSCE 448', title: 'Computational Photography', credits: 3, grade: 'IP' },
      { code: 'MKTG 409', title: 'Principles of Marketing', credits: 3, grade: 'IP' }
    ]
  }
];

const normalizeTranscript = (terms) => {
  const termOrder = { Fall: 0, Winter: 1, Spring: 2, Summer: 3 };
  const years = new Map();

  terms.forEach((term) => {
    if (!term.label || !term.status || !Array.isArray(term.courses)) return;
    const [season, yearStr] = term.label.split(' ');
    const year = Number(yearStr);
    if (!season || Number.isNaN(year)) return;
    const academicYear =
      season === 'Fall' ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    if (!years.has(academicYear)) {
      years.set(academicYear, []);
    }
    years.get(academicYear).push(term);
  });

  return Array.from(years.entries())
    .map(([year, termsForYear]) => ({
      year,
      terms: termsForYear
        .sort((a, b) => {
          const [aSeason, aYear] = a.label.split(' ');
          const [bSeason, bYear] = b.label.split(' ');
          if (aYear !== bYear) return Number(aYear) - Number(bYear);
          return (termOrder[aSeason] ?? 99) - (termOrder[bSeason] ?? 99);
        })
        .map((term) => ({
          ...term,
          courses: term.courses.filter((course) => course.code && course.title)
        }))
    }))
    .sort((a, b) => {
      const [aStart] = a.year.split('-');
      const [bStart] = b.year.split('-');
      return Number(aStart) - Number(bStart);
    });
};

const TRANSCRIPT_YEARS = normalizeTranscript(RAW_TRANSCRIPT_TERMS);

const FLOWCHART_COURSES = {
  'CSCE 120': { title: 'Program Design & Concepts', prereqs: [] },
  'CSCE 121': { title: 'Intro to Program Design', prereqs: [] },
  'CSCE 181': { title: 'Intro to Computing', prereqs: [] },
  'MATH 151': { title: 'Engineering Math I', prereqs: [] },
  'CSCE 222': { title: 'Discrete Structures', prereqs: [] },
  'CSCE 221': { title: 'Data Structures & Algorithms', prereqs: ['CSCE 120'] },
  'CSCE 312': { title: 'Computer Organization', prereqs: ['CSCE 221'] },
  'CSCE 313': { title: 'Intro to Computer Systems', prereqs: ['CSCE 221', 'CSCE 312'] },
  'CSCE 314': { title: 'Programming Languages', prereqs: ['CSCE 221'] },
  'CSCE 315': { title: 'Programming Studio', prereqs: ['CSCE 312', 'CSCE 314', 'CSCE 313'] },
  'CSCE 331': { title: 'Foundations of Software Eng', prereqs: ['CSCE 221'] },
  'CSCE 411': { title: 'Design/Analysis of Algorithms', prereqs: ['CSCE 221', 'CSCE 222'] },
  'CSCE 420': { title: 'Artificial Intelligence', prereqs: ['CSCE 411'] },
  'MATH 304': { title: 'Linear Algebra', prereqs: ['MATH 151'] },
  'STAT 211': { title: 'Prin of Statistics I', prereqs: [] },
  'CSCE 421': { title: 'Machine Learning', prereqs: ['MATH 304', 'STAT 211', 'CSCE 221', 'CSCE 120'] },
  'CSCE 431': { title: 'Software Engineering', prereqs: ['CSCE 315'] },
  'CSCE 434': { title: 'Compiler Design', prereqs: ['CSCE 315'] },
  'CSCE 441': { title: 'Computer Graphics', prereqs: ['CSCE 221'] },
  'CSCE 442': { title: 'Scientific Programming', prereqs: ['CSCE 221', 'MATH 304'] },
  'CSCE 448': { title: 'Computational Photography', prereqs: ['CSCE 315', 'MATH 304'] },
  'CSCE 451': { title: 'Software Reverse Engineering', prereqs: ['CSCE 313'] },
  'CSCE 463': { title: 'Networks & Distributed Processing', prereqs: ['CSCE 313'] },
  'CSCE 465': { title: 'Computer & Network Security', prereqs: ['CSCE 315', 'CSCE 313'] },
  'CSCE 481': { title: 'Seminar', prereqs: [] },
  'CSCE 482': { title: 'Senior Capstone Design', prereqs: ['CSCE 411', 'CSCE 315'] }
};

const buildTranscriptIndex = (terms) => {
  const map = new Map();
  terms.forEach((term) => {
    term.courses.forEach((course) => {
      if (!course.code) return;
      const isInProgress = course.grade === 'IP';
      const status = isInProgress ? 'in-progress' : 'completed';
      const existing = map.get(course.code);
      if (!existing || existing.status !== 'in-progress') {
        map.set(course.code, {
          status,
          grade: course.grade,
          transfer: Boolean(course.transfer),
          honors: Boolean(course.honors)
        });
      }
    });
  });
  return map;
};

const EMPHASIS_TRACKS = {
  'Software Engineering': ['CSCE 314', 'CSCE 331', 'CSCE 310'],
  'AI/ML': ['CSCE 420', 'CSCE 421', 'CSCE 689'],
  Cybersecurity: ['CSCE 465', 'CSCE 469', 'CSCE 181']
};

function App() {
  const buildSemesterRange = (startYear, startTerm, endYear, endTerm) => {
    const semesters = [];
    const advanceTerm = (term, year) => {
      switch (term) {
        case 'Fall':
          return { term: 'Winter', year };
        case 'Winter':
          return { term: 'Spring', year: year + 1 };
        case 'Spring':
          return { term: 'Summer', year };
        case 'Summer':
        default:
          return { term: 'Fall', year: year + 1 };
      }
    };

    let term = startTerm;
    let year = startYear;
    const guardLimit = 200;
    let guard = 0;
    while (guard < guardLimit) {
      semesters.push(`${term} ${year}`);
      if (term === endTerm && year === endYear) break;
      const next = advanceTerm(term, year);
      term = next.term;
      year = next.year;
      guard += 1;
    }

    return semesters;
  };

  const getAcademicYearForTerm = (termLabel) => {
    const [term, yearStr] = termLabel.split(' ');
    const year = Number(yearStr);
    if (term === 'Fall' || term === 'Winter') {
      return `${year}-${year + 1}`;
    }
    return `${year - 1}-${year}`;
  };

  const getTermsForAcademicYear = (yearLabel) => {
    const [startYearStr] = yearLabel.split('-');
    const startYear = Number(startYearStr);
    return [
      `Fall ${startYear}`,
      `Winter ${startYear}`,
      `Spring ${startYear + 1}`,
      `Summer ${startYear + 1}`
    ];
  };

  const PLAN_START_YEAR = 2022;
  const PLAN_END_YEAR = 2026;
  const SEMESTER_START_YEAR = 2021;
  const semesterOrder = useMemo(
    () => buildSemesterRange(SEMESTER_START_YEAR, 'Fall', PLAN_END_YEAR + 1, 'Summer'),
    []
  );
  const transcriptIndex = useMemo(() => buildTranscriptIndex(RAW_TRANSCRIPT_TERMS), []);
  const semesterIndex = useMemo(() => {
    const map = new Map();
    semesterOrder.forEach((sem, idx) => map.set(sem, idx));
    return map;
  }, [semesterOrder]);
  const initSemesterPlans = (basePlans) => {
    const seeded = {};
    semesterOrder.forEach((sem) => {
      seeded[sem] = basePlans[sem] ? [...basePlans[sem]] : [];
    });
    return seeded;
  };

  const [activeTab, setActiveTab] = useState('planner');
  const [selectedSemester, setSelectedSemester] = useState('Fall 2024');
  const [semesterPlans, setSemesterPlans] = useState(() =>
    initSemesterPlans({
      'Fall 2024': ['CSCE 312', 'CSCE 314', 'MATH 304'],
      'Spring 2025': [],
      'Fall 2025': [],
      'Spring 2026': []
    })
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [planError, setPlanError] = useState('');
  const [selectedPlanYear, setSelectedPlanYear] = useState('2024-2025');
  const [selectedTranscriptYear, setSelectedTranscriptYear] = useState('2024-2025');

  const transcriptTermMap = useMemo(() => {
    const map = new Map();
    RAW_TRANSCRIPT_TERMS.forEach((term) => {
      if (!term?.label) return;
      map.set(term.label, term);
    });
    return map;
  }, []);

  const isCourseInTranscriptTerm = (courseCode, termLabel) =>
    transcriptTermMap
      .get(termLabel)
      ?.courses?.some((course) => course.code === courseCode);

  const getPriorTermWithCourse = (courseCode, semester) => {
    const targetIndex = semesterIndex.get(semester);
    if (targetIndex === undefined) return null;
    const priorTerms = semesterOrder.filter((_, idx) => idx < targetIndex);
    for (let i = priorTerms.length - 1; i >= 0; i -= 1) {
      const term = priorTerms[i];
      if (
        semesterPlans[term]?.includes(courseCode) ||
        isCourseInTranscriptTerm(courseCode, term)
      ) {
        return term;
      }
    }
    return null;
  };

  const isCoursePlannedInEarlierSemester = (courseCode, semester) => {
    const targetIndex = semesterIndex.get(semester);
    if (targetIndex === undefined) return false;
    return semesterOrder.some((sem, idx) => {
      if (idx >= targetIndex) return false;
      return (
        semesterPlans[sem]?.includes(courseCode) ||
        isCourseInTranscriptTerm(courseCode, sem)
      );
    });
  };

  const isCourseSelectedInOtherSemester = (courseCode, semester) => {
    const plannedInOther = Object.entries(semesterPlans).some(([term, courses]) => {
      if (term === semester) return false;
      return courses?.includes(courseCode);
    });
    if (plannedInOther) return true;
    return RAW_TRANSCRIPT_TERMS.some((term) => {
      if (term.label === semester) return false;
      return term.courses?.some((course) => course.code === courseCode);
    });
  };

  const isCourseCompleted = (courseCode) =>
    transcriptIndex.get(courseCode)?.status === 'completed' ||
    COURSES[courseCode]?.status === 'completed';
  const isCourseInProgress = (courseCode) =>
    transcriptIndex.get(courseCode)?.status === 'in-progress' ||
    COURSES[courseCode]?.status === 'in-progress';

  const addCourseToSemester = (courseCode, semester) => {
    if (isCourseCompleted(courseCode)) {
      setPlanError(`${courseCode} has already been taken.`);
      return;
    }
    if (isCourseInProgress(courseCode)) {
      setPlanError(`${courseCode} is currently in progress.`);
      return;
    }
    if (isCourseSelectedInOtherSemester(courseCode, semester)) {
      setPlanError(`${courseCode} is already selected in another term.`);
      return;
    }
    setSemesterPlans((prev) => ({
      ...prev,
      [semester]: [...(prev[semester] || []), courseCode]
    }));
    setPlanError('');
    setShowCourseModal(false);
  };

  const removeCourseFromSemester = (courseCode, semester) => {
    setSemesterPlans((prev) => ({
      ...prev,
      [semester]: (prev[semester] || []).filter((c) => c !== courseCode)
    }));
  };

  const validateSemester = (semester) => {
    const courses = semesterPlans[semester] || [];
    const warnings = [];
    const errors = [];

    let totalCredits = 0;
    let totalDifficulty = 0;

    courses.forEach((code) => {
      const course = COURSES[code];
      totalCredits += course.credits;
      totalDifficulty += course.difficulty;

      if (isCourseCompleted(code) || isCourseInProgress(code) || isCoursePlannedInEarlierSemester(code, semester)) {
        errors.push(`${code} has already been taken or planned in a prior semester`);
      }

      // Check prerequisites
      course.prereqs.forEach((prereq) => {
        if (!isCourseCompleted(prereq)) {
          errors.push(`${code} requires ${prereq} to be completed`);
        }
      });
    });

    // Check risky combinations
    RISKY_COMBOS.forEach((combo) => {
      const hasAll = combo.courses.every((c) => courses.includes(c));
      if (hasAll) {
        if (combo.severity === 'high') {
          errors.push(combo.message);
        } else {
          warnings.push(combo.message);
        }
      }
    });

    // Credit hour warnings
    if (totalCredits > 18) {
      errors.push(`${totalCredits} credits exceeds recommended maximum of 18`);
    } else if (totalCredits >= 16) {
      warnings.push(`${totalCredits} credits is a heavy load`);
    }

    return { warnings, errors, totalCredits, totalDifficulty };
  };

  const filteredCourses = useMemo(() => {
    return Object.entries(COURSES).filter(([code, course]) => {
      const matchesSearch =
        code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch && (course.status === 'available' || course.status === 'locked');
    });
  }, [searchQuery]);

  const DashboardTab = () => {
    const completionPercentage = (MOCK_STUDENT.completedCredits / MOCK_STUDENT.totalRequired) * 100;

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{MOCK_STUDENT.name}</h2>
              <p className="text-gray-600">UIN: {MOCK_STUDENT.uin}</p>
              <p className="text-gray-600">
                {MOCK_STUDENT.major} • Catalog Year: {MOCK_STUDENT.catalogYear}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold" style={{ color: '#500000' }}>
                {MOCK_STUDENT.gpa}
              </div>
              <div className="text-sm text-gray-600">Current GPA</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Credits Completed</p>
                <p className="text-2xl font-bold text-gray-900">
                  {MOCK_STUDENT.completedCredits}/{MOCK_STUDENT.totalRequired}
                </p>
              </div>
              <Book className="w-8 h-8 text-blue-500" />
            </div>
            <div className="mt-4 bg-gray-200 rounded-full h-2">
              <div
                className="h-2 rounded-full"
                style={{ width: `${completionPercentage}%`, backgroundColor: '#500000' }}
              ></div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Emphasis Area</p>
                <p className="text-lg font-bold text-gray-900">{MOCK_STUDENT.emphasisArea}</p>
              </div>
              <GraduationCap className="w-8 h-8 text-green-500" />
            </div>
            <p className="mt-2 text-sm text-gray-600">On track</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">GPA Trend</p>
                <p className="text-2xl font-bold text-gray-900">↗</p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-500" />
            </div>
            <p className="mt-2 text-sm text-green-600">Improving</p>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" />
            <div>
              <h3 className="font-semibold text-yellow-900">Action Required</h3>
              <p className="text-sm text-yellow-800 mt-1">
                You need to complete CSCE 399 (High Impact Experience) before graduation. Plan to
                register by Fall 2025.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold mb-4">Degree Requirements Progress</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Core CS Courses</span>
              <span className="text-sm font-semibold text-green-600">8/12 completed</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Math Requirements</span>
              <span className="text-sm font-semibold text-green-600">3/4 completed</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Emphasis Area (SWE)</span>
              <span className="text-sm font-semibold text-yellow-600">1/3 completed</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Technical Electives</span>
              <span className="text-sm font-semibold text-gray-600">0/9 credits</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const PlannerTab = () => {
    const validation = validateSemester(selectedSemester);
    const planYears = useMemo(() => {
      const years = [];
      for (let year = SEMESTER_START_YEAR; year <= PLAN_END_YEAR; year += 1) {
        years.push(`${year}-${year + 1}`);
      }
      return years;
    }, []);
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const getTermStartDate = (termLabel) => {
      const [season, yearStr] = termLabel.split(' ');
      const year = Number(yearStr);
      const startMonth = {
        Spring: 1,
        Summer: 6,
        Fall: 9,
        Winter: 12
      }[season] ?? 1;
      return new Date(year, startMonth - 1, 1);
    };
    const getCurrentTermLabel = () => {
      const month = currentDate.getMonth() + 1;
      if (month === 12) return `Winter ${currentYear}`;
      if (month >= 9) return `Fall ${currentYear}`;
      if (month >= 6) return `Summer ${currentYear}`;
      return `Spring ${currentYear}`;
    };
    const currentTermLabel = getCurrentTermLabel();
    const filteredPlanYears = planYears;
    const getTermState = (termLabel) => {
      const termDate = getTermStartDate(termLabel);
      const currentTermDate = getTermStartDate(currentTermLabel);
      if (termDate < currentTermDate) return 'past';
      if (termDate > currentTermDate) return 'future';
      return 'current';
    };
    const isPlanYearSelectable = () => true;
    const activePlanYear = filteredPlanYears.includes(selectedPlanYear)
      ? selectedPlanYear
      : filteredPlanYears[0];
    const planTerms = activePlanYear ? getTermsForAcademicYear(activePlanYear) : [];
    const transcriptYear =
      TRANSCRIPT_YEARS.find((year) => year.year === selectedTranscriptYear) ||
      TRANSCRIPT_YEARS[0];
    const transcriptYears = TRANSCRIPT_YEARS.map((year) => year.year);
    const statusStyles = {
      Evaluated: 'bg-green-100 text-green-700',
      'In Progress': 'bg-blue-100 text-blue-700',
      Transfer: 'bg-gray-200 text-gray-700'
    };

    useEffect(() => {
      if (activePlanYear && selectedPlanYear !== activePlanYear) {
        setSelectedPlanYear(activePlanYear);
        const [fallTerm] = getTermsForAcademicYear(activePlanYear);
        if (fallTerm && fallTerm !== selectedSemester) {
          setSelectedSemester(fallTerm);
        }
      }
    }, [activePlanYear, selectedPlanYear, selectedSemester]);

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Plan by Academic Year</h3>
              <p className="text-sm text-gray-600">
                Build Fall, Winter, and Spring schedules within each year
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {filteredPlanYears.map((year) => {
                const selectable = isPlanYearSelectable(year);
                return (
                  <button
                    key={year}
                    onClick={() => {
                      if (!selectable) return;
                      setSelectedPlanYear(year);
                      const [fallTerm] = getTermsForAcademicYear(year);
                      setSelectedSemester(fallTerm);
                      setPlanError('');
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                      selectedPlanYear === year
                        ? 'text-white'
                        : 'text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                    style={selectedPlanYear === year ? { backgroundColor: '#500000' } : {}}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          </div>

          {(planError || validation.errors.length > 0) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-start">
                <X className="w-5 h-5 text-red-600 mt-0.5 mr-3" />
                <div className="flex-1">
                  <h3 className="font-semibold text-red-900">
                    Planning Errors ({selectedSemester})
                  </h3>
                  <ul className="mt-2 space-y-1">
                    {planError && (
                      <li className="text-sm text-red-800">• {planError}</li>
                    )}
                    {validation.errors.map((err, idx) => (
                      <li key={idx} className="text-sm text-red-800">
                        • {err}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" />
                <div className="flex-1">
                  <h3 className="font-semibold text-yellow-900">
                    Warnings ({selectedSemester})
                  </h3>
                  <ul className="mt-2 space-y-1">
                    {validation.warnings.map((warn, idx) => (
                      <li key={idx} className="text-sm text-yellow-800">
                        • {warn}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {planTerms.map((term) => {
              const transcriptTerm = transcriptTermMap.get(term);
              const transcriptCourses = transcriptTerm?.courses || [];
              const plannedCourses = semesterPlans[term] || [];
              const displayCourses = [
                ...transcriptCourses.map((course) => ({
                  type: 'transcript',
                  code: course.code,
                  title: course.title,
                  credits: course.credits,
                  grade: course.grade,
                  status: transcriptTerm?.status
                })),
                ...plannedCourses
                  .filter((code) => !transcriptCourses.some((c) => c.code === code))
                  .map((code) => ({
                    type: 'planned',
                    code,
                    title: COURSES[code]?.title,
                    credits: COURSES[code]?.credits ?? 0
                  }))
              ];
              const termValidation = validateSemester(term);
              const termState = getTermState(term);
              const isEditable = true;
              const isViewOnly = termState === 'current';
              return (
                <div key={term} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-gray-900">{term}</h4>
                      <p className="text-xs text-gray-600">
                        {termValidation.totalCredits} credits • Difficulty:{' '}
                        {termValidation.totalDifficulty}/25
                      </p>
                      {isViewOnly && (
                        <p className="text-xs text-blue-600 mt-1">Current term</p>
                      )}
                      {termState === 'past' && (
                        <p className="text-xs text-gray-500 mt-1">Past term</p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        if (!isEditable) return;
                        setSelectedSemester(term);
                        setShowCourseModal(true);
                        setPlanError('');
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                        isEditable
                          ? 'text-white'
                          : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                      }`}
                      style={isEditable ? { backgroundColor: '#500000' } : {}}
                      onMouseEnter={(e) => {
                        if (isEditable) {
                          e.currentTarget.style.backgroundColor = '#3d0000';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (isEditable) {
                          e.currentTarget.style.backgroundColor = '#500000';
                        }
                      }}
                      disabled={!isEditable}
                    >
                      <Plus className="w-3 h-3" />
                      Add Course
                    </button>
                  </div>

                  <div className="space-y-2">
                    {displayCourses.length === 0 ? (
                      <div className="text-center py-6 text-gray-500 text-sm">
                        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No courses planned</p>
                      </div>
                    ) : (
                      displayCourses.map((course) => {
                        const courseMeta = COURSES[course.code];
                        const hasPrereqIssue =
                          course.type === 'planned' &&
                          courseMeta?.prereqs?.some((p) => !isCourseCompleted(p));

                        return (
                          <div
                            key={`${term}-${course.code}-${course.type}`}
                            className={`p-3 rounded-lg border ${
                              hasPrereqIssue
                                ? 'border-red-300 bg-red-50'
                                : 'border-gray-200 bg-white'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold text-gray-900">{course.code}</h4>
                                  <span className="text-xs bg-gray-200 px-2 py-1 rounded">
                                    {course.credits} cr
                                  </span>
                                  {course.type === 'transcript' && (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                      {course.status || 'Recorded'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-600 mt-1">
                                  {course.title || courseMeta?.title}
                                </p>
                                {hasPrereqIssue && (
                                  <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    Missing prerequisites:{' '}
                                    {courseMeta.prereqs
                                      .filter((p) => !isCourseCompleted(p))
                                      .join(', ')}
                                  </p>
                                )}
                              </div>
                              {course.type === 'planned' && (
                                <button
                                  onClick={() => {
                                    if (!isEditable) return;
                                    removeCourseFromSemester(course.code, term);
                                  }}
                                  className={`text-gray-400 ${
                                    isEditable
                                      ? 'hover:text-red-600'
                                      : 'cursor-not-allowed opacity-50'
                                  }`}
                                  disabled={!isEditable}
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Academic Record</h3>
              <p className="text-sm text-gray-600">Transcript-aligned terms with grades</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {transcriptYears.map((year) => (
                <button
                  key={year}
                  onClick={() => setSelectedTranscriptYear(year)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                    selectedTranscriptYear === year
                      ? 'text-white'
                      : 'text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                  style={selectedTranscriptYear === year ? { backgroundColor: '#500000' } : {}}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {transcriptYear.terms
              .filter((term) => term.courses.length > 0)
              .map((term) => {
                const termCredits = term.courses.reduce((sum, c) => sum + c.credits, 0);
                return (
                  <div
                    key={term.label}
                    className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-gray-900">{term.label}</h4>
                        <p className="text-xs text-gray-600">{termCredits} credits</p>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          statusStyles[term.status] || 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {term.status}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {term.courses.map((course) => (
                        <div
                          key={`${term.label}-${course.code}`}
                          className="rounded-md bg-white border border-gray-100 px-3 py-2"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{course.code}</p>
                              <p className="text-xs text-gray-600">{course.title}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-900">
                                {course.grade}
                              </p>
                              <p className="text-xs text-gray-500">{course.credits} cr</p>
                            </div>
                          </div>
                          {(course.transfer || course.honors) && (
                            <div className="mt-2 flex items-center justify-end gap-2">
                              {course.honors && (
                                <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                                  Honors
                                </span>
                              )}
                              {course.transfer && (
                                <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  Transfer
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {showCourseModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">Add Course to {selectedSemester}</h3>
                  <button
                    onClick={() => {
                      setShowCourseModal(false);
                      setPlanError('');
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                {planError && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                    {planError}
                  </div>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search courses..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div className="p-6 overflow-y-auto max-h-96">
                <div className="space-y-2">
                  {filteredCourses.map(([code, course]) => {
                    const isLocked = course.status === 'locked';
                    const plannedForSelectedSemester =
                      semesterPlans[selectedSemester] || [];
                    const alreadyPlanned = plannedForSelectedSemester.includes(code);
                    const alreadyTaken = isCourseCompleted(code);
                    const inProgress = isCourseInProgress(code);
                    const alreadyPlannedEarlier = isCoursePlannedInEarlierSemester(
                      code,
                      selectedSemester
                    );
                    const alreadySelectedOtherTerm =
                      !alreadyPlannedEarlier &&
                      isCourseSelectedInOtherSemester(code, selectedSemester);
                    const priorTermLabel =
                      (alreadyPlannedEarlier || alreadySelectedOtherTerm) &&
                      getPriorTermWithCourse(code, selectedSemester);
                    const isDisabled =
                      isLocked ||
                      alreadyPlanned ||
                      alreadyTaken ||
                      inProgress ||
                      alreadyPlannedEarlier ||
                      alreadySelectedOtherTerm;

                    return (
                      <div
                        key={code}
                        className={`p-4 rounded-lg border ${
                          isLocked
                            ? 'border-gray-300 bg-gray-100 opacity-60'
                            : alreadyPlanned
                              ? 'border-green-300 bg-green-50'
                              : alreadyTaken || inProgress || alreadyPlannedEarlier
                                ? 'border-red-300 bg-red-50'
                                : 'border-gray-200 hover:bg-yellow-50 cursor-pointer'
                        }`}
                        onMouseEnter={(e) => {
                          if (!isDisabled) {
                            e.currentTarget.style.borderColor = '#500000';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isDisabled) {
                            e.currentTarget.style.borderColor = '#e5e7eb';
                          }
                        }}
                        onClick={() => {
                          if (isDisabled) {
                            if (alreadyTaken) {
                              setPlanError(`${code} has already been taken.`);
                            } else if (inProgress) {
                              setPlanError(`${code} is currently in progress.`);
                            } else if (alreadyPlannedEarlier) {
                              setPlanError(
                                `${code} is already selected in a prior term.`
                              );
                            }
                            return;
                          }
                          addCourseToSemester(code, selectedSemester);
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold">{code}</h4>
                              <span className="text-xs bg-gray-200 px-2 py-1 rounded">
                                {course.credits} cr
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">{course.title}</p>
                            {course.prereqs.length > 0 && (
                              <p className="text-xs text-gray-500 mt-1">
                                Prerequisites: {course.prereqs.join(', ')}
                              </p>
                            )}
                          </div>
                          {isLocked && <span className="text-xs text-red-600">Locked</span>}
                          {alreadyTaken && (
                            <span className="text-xs text-red-600">Already taken</span>
                          )}
                          {inProgress && (
                            <span className="text-xs text-blue-600">In progress</span>
                          )}
                          {(alreadyPlannedEarlier || alreadySelectedOtherTerm) && (
                            <span className="text-xs text-red-600">
                              Already selected{priorTermLabel ? ` (${priorTermLabel})` : ''}
                            </span>
                          )}
                          {alreadyPlanned && <CheckCircle className="w-5 h-5 text-green-600" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const PrerequisiteTab = () => {
    const flowNodes = [
      { id: 'CSCE 120', x: 20, y: 20 },
      { id: 'CSCE 121', x: 20, y: 100 },
      { id: 'CSCE 181', x: 20, y: 180 },
      { id: 'MATH 151', x: 20, y: 260 },
      { id: 'CSCE 221', x: 240, y: 60 },
      { id: 'CSCE 222', x: 240, y: 140 },
      { id: 'MATH 304', x: 240, y: 220 },
      { id: 'STAT 211', x: 240, y: 300 },
      { id: 'CSCE 312', x: 460, y: 20 },
      { id: 'CSCE 313', x: 460, y: 90 },
      { id: 'CSCE 314', x: 460, y: 160 },
      { id: 'CSCE 331', x: 460, y: 230 },
      { id: 'CSCE 481', x: 460, y: 300 },
      { id: 'CSCE 411', x: 680, y: 20 },
      { id: 'CSCE 420', x: 680, y: 90 },
      { id: 'CSCE 421', x: 680, y: 160 },
      { id: 'CSCE 463', x: 680, y: 230 },
      { id: 'CSCE 465', x: 680, y: 300 },
      { id: 'CSCE 315', x: 900, y: 20 },
      { id: 'CSCE 431', x: 900, y: 90 },
      { id: 'CSCE 434', x: 900, y: 160 },
      { id: 'CSCE 441', x: 900, y: 230 },
      { id: 'CSCE 448', x: 900, y: 300 },
      { id: 'CSCE 451', x: 1120, y: 90 },
      { id: 'CSCE 482', x: 1120, y: 170 },
      { id: 'CSCE 442', x: 1120, y: 250 }
    ];
    const flowEdges = Object.entries(FLOWCHART_COURSES).flatMap(([code, course]) =>
      course.prereqs.map((prereq) => ({ from: prereq, to: code }))
    );
    const nodeWidth = 180;
    const nodeHeight = 56;
    const nodeMap = useMemo(() => {
      const map = new Map();
      flowNodes.forEach((node) => map.set(node.id, node));
      return map;
    }, [flowNodes]);
    const statusStyles = {
      completed: 'fill-[#dcfce7] stroke-[#16a34a]',
      'in-progress': 'fill-[#dbeafe] stroke-[#2563eb]',
      available: 'fill-[#fef9c3] stroke-[#ca8a04]',
      locked: 'fill-[#f3f4f6] stroke-[#9ca3af]'
    };
    const getStatus = (code) => {
      if (isCourseCompleted(code)) return 'completed';
      if (isCourseInProgress(code)) return 'in-progress';
      const course = FLOWCHART_COURSES[code] || COURSES[code];
      if (!course) return 'locked';
      const prereqsMet =
        course.prereqs.length === 0 || course.prereqs.every((p) => isCourseCompleted(p));
      return prereqsMet ? 'available' : 'locked';
    };

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold mb-2">Course Prerequisite Flowchart</h3>
          <p className="text-sm text-gray-600 mb-6">
            Flowchart-style prerequisites for the CS core. Boxes show status based on transcript.
          </p>

          <div className="border border-gray-200 rounded-lg bg-gray-50 p-4 overflow-x-auto">
            <svg
              viewBox="0 0 1540 380"
              className="w-[1540px] h-auto"
              role="img"
              aria-label="Course prerequisite flowchart"
            >
              <defs>
                <marker
                  id="arrow"
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L9,3 L0,6 Z" fill="#9ca3af" />
                </marker>
              </defs>

              {flowEdges.map((edge) => {
                const from = nodeMap.get(edge.from);
                const to = nodeMap.get(edge.to);
                if (!from || !to) return null;
                const startX = from.x + nodeWidth;
                const startY = from.y + nodeHeight / 2;
                const endX = to.x;
                const endY = to.y + nodeHeight / 2;
                return (
                  <line
                    key={`${edge.from}-${edge.to}`}
                    x1={startX}
                    y1={startY}
                    x2={endX}
                    y2={endY}
                    stroke="#9ca3af"
                    strokeWidth="2"
                    markerEnd="url(#arrow)"
                  />
                );
              })}

              {flowNodes.map((node) => {
                const course = FLOWCHART_COURSES[node.id] || COURSES[node.id];
                if (!course) return null;
                const status = getStatus(node.id);
                return (
                  <g key={node.id}>
                    <rect
                      x={node.x}
                      y={node.y}
                      width={nodeWidth}
                      height={nodeHeight}
                      rx="8"
                      className={`${statusStyles[status]} stroke-2`}
                    />
                    <text x={node.x + 12} y={node.y + 20} fontSize="12" fill="#111827">
                      <tspan fontWeight="600">{node.id}</tspan>
                    </text>
                    <text x={node.x + 12} y={node.y + 38} fontSize="10" fill="#4b5563">
                      <tspan>{course.title}</tspan>
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold mb-4">Legend</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 border-2 border-green-300 rounded"></div>
              <span className="text-sm">Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-100 border-2 border-blue-300 rounded"></div>
              <span className="text-sm">In Progress</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-100 border-2 border-yellow-300 rounded"></div>
              <span className="text-sm">Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-100 border-2 border-gray-300 rounded"></div>
              <span className="text-sm">Locked</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const LoginPage = () => {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <img
              src={tamuLogo}
              alt="TAMU logo"
              className="w-12 h-12 rounded-full bg-gray-100 p-2"
            />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Sign in to TAMU Planner</h2>
              <p className="text-sm text-gray-600">Access your degree plan in seconds</p>
            </div>
          </div>

          <button
            type="button"
            className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50"
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white border border-gray-200 text-sm font-bold">
              G
            </span>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-200"></div>
            <span className="text-xs uppercase text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200"></div>
          </div>

          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">NetID</label>
              <input
                type="text"
                placeholder="netid123"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#500000]/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#500000]/30"
              />
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-sm text-[#500000] font-semibold hover:underline"
              >
                Forgot password?
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg text-white text-sm font-semibold"
                style={{ backgroundColor: '#500000' }}
              >
                Sign in with NetID
              </button>
            </div>
          </form>

          <div className="mt-6 text-sm text-gray-600 flex items-center justify-between">
            <span>New here? Use Google to sign up.</span>
            <button
              type="button"
              onClick={() => setActiveTab('planner')}
              className="text-[#500000] font-semibold hover:underline"
            >
              Back to planner
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="shadow-lg" style={{ backgroundColor: '#500000' }}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-3 text-left"
              aria-label="Go to dashboard"
            >
              <img
                src={tamuLogo}
                alt="TAMU logo"
                className="w-10 h-10 rounded-full bg-white p-1"
              />
              <div>
                <h1 className="text-2xl font-bold text-white">TAMU Academic Planner</h1>
                <p className="text-sm" style={{ color: '#f0e5d8' }}>
                  Enhanced Planning Tool
                </p>
              </div>
            </button>
            <div className="flex gap-2">
              <button
                className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg hover:bg-gray-100"
                style={{ color: '#500000' }}
              >
                <Save className="w-4 h-4" />
                Save Plan
              </button>
              <button
                className="flex items-center gap-2 border border-white/60 px-4 py-2 rounded-lg text-white hover:bg-white/10"
                type="button"
                onClick={() => setActiveTab('login')}
              >
                Login
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-6">
            {['dashboard', 'planner', 'prerequisites'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-2 border-b-2 font-medium capitalize ${
                  activeTab === tab
                    ? 'text-gray-900'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
                style={activeTab === tab ? { borderColor: '#500000', color: '#500000' } : {}}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'planner' && <PlannerTab />}
        {activeTab === 'prerequisites' && <PrerequisiteTab />}
        {activeTab === 'login' && <LoginPage />}
      </main>
    </div>
  );
}

export default App;
