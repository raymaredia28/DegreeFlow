import React, { useState, useMemo, useEffect } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
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
  // Intentionally empty; populated via transcript parser.
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

GlobalWorkerOptions.workerSrc = pdfWorker;

const TERM_REGEX = /\b(Fall|Spring|Summer|Winter)\s+(20\d{2})\b/;
const COURSE_REGEX = /\b([A-Z]{3,4})\s?(\d{3})\b/;
const GRADE_REGEX = /\b(A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F|S|U|P|W|IP)\b/;

const parseTranscriptLines = (lines) => {
  const terms = [];
  let currentTerm = null;

  lines.forEach((rawLine) => {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) return;

    const termMatch = line.match(TERM_REGEX);
    if (termMatch) {
      currentTerm = {
        label: `${termMatch[1]} ${termMatch[2]}`,
        status: 'Evaluated',
        courses: []
      };
      terms.push(currentTerm);
      return;
    }

    const courseMatch = line.match(COURSE_REGEX);
    if (!courseMatch || !currentTerm) return;

    const code = `${courseMatch[1]} ${courseMatch[2]}`;
    const gradeMatch = line.match(GRADE_REGEX);
    const grade = gradeMatch?.[1] ?? '';
    const creditsMatch = line.match(/\b(\d(?:\.\d)?)\b(?!.*\b\d\b)/);
    const credits = creditsMatch ? Number(creditsMatch[1]) : 0;

    const withoutCode = line.replace(courseMatch[0], '').trim();
    const withoutGrade = grade ? withoutCode.replace(grade, '').trim() : withoutCode;
    const title = credits
      ? withoutGrade.replace(String(credits), '').trim()
      : withoutGrade.trim();

    currentTerm.courses.push({
      code,
      title: title || code,
      credits: Number.isFinite(credits) ? credits : 0,
      grade
    });
    if (grade === 'IP') {
      currentTerm.status = 'In Progress';
    }
  });

  return terms;
};

const extractPdfLines = async (file) => {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const lines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = textContent.items
      .map((item) => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5]
      }))
      .filter((item) => item.text && item.text.trim() !== '');

    items.sort((a, b) => (b.y === a.y ? a.x - b.x : b.y - a.y));

    const grouped = [];
    const threshold = 2;
    items.forEach((item) => {
      const group = grouped.find((g) => Math.abs(g.y - item.y) <= threshold);
      if (group) {
        group.items.push(item);
      } else {
        grouped.push({ y: item.y, items: [item] });
      }
    });

    grouped.forEach((group) => {
      group.items.sort((a, b) => a.x - b.x);
      lines.push(group.items.map((i) => i.text).join(' '));
    });
  }

  return lines;
};

const FLOWCHART_COURSES = {
  'CSCE 120': { title: 'Program Design & Concepts', prereqs: [], tags: ['SWE'] },
  'CSCE 121': { title: 'Intro to Program Design', prereqs: [], tags: ['SWE'] },
  'CSCE 181': { title: 'Intro to Computing', prereqs: [], tags: [] },
  'MATH 151': { title: 'Engineering Math I', prereqs: [], tags: [] },
  'CSCE 222': { title: 'Discrete Structures', prereqs: [], tags: ['AI', 'ML'] },
  'CSCE 221': { title: 'Data Structures & Algorithms', prereqs: ['CSCE 120'], tags: ['AI', 'ML', 'SWE'] },
  'CSCE 312': { title: 'Computer Organization', prereqs: ['CSCE 221'], tags: ['Cyber', 'SWE'] },
  'CSCE 313': {
    title: 'Intro to Computer Systems',
    prereqs: ['CSCE 221', 'CSCE 312'],
    tags: ['Cyber', 'SWE']
  },
  'CSCE 314': { title: 'Programming Languages', prereqs: ['CSCE 221'], tags: ['SWE'] },
  'CSCE 331': { title: 'Foundations of Software Eng', prereqs: ['CSCE 221'], tags: ['SWE'] },
  'CSCE 411': {
    title: 'Design/Analysis of Algorithms',
    prereqs: ['CSCE 221', 'CSCE 222'],
    tags: ['AI', 'ML']
  },
  'CSCE 420': { title: 'Artificial Intelligence', prereqs: ['CSCE 411'], tags: ['AI'] },
  'MATH 304': { title: 'Linear Algebra', prereqs: ['MATH 151'], tags: ['AI', 'ML'] },
  'STAT 211': { title: 'Prin of Statistics I', prereqs: [], tags: ['ML'] },
  'CSCE 421': {
    title: 'Machine Learning',
    prereqs: ['MATH 304', 'STAT 211', 'CSCE 221', 'CSCE 120'],
    tags: ['AI', 'ML']
  },
  'CSCE 431': { title: 'Software Engineering', prereqs: ['CSCE 331'], tags: ['SWE'] },
  'CSCE 434': { title: 'Compiler Design', prereqs: ['CSCE 331'], tags: ['SWE'] },
  'CSCE 441': { title: 'Computer Graphics', prereqs: ['CSCE 221'], tags: ['AI'] },
  'CSCE 442': { title: 'Scientific Programming', prereqs: ['CSCE 221', 'MATH 304'], tags: ['AI'] },
  'CSCE 448': {
    title: 'Computational Photography',
    prereqs: ['CSCE 331', 'MATH 304'],
    tags: ['AI']
  },
  'CSCE 451': { title: 'Software Reverse Engineering', prereqs: ['CSCE 313'], tags: ['Cyber'] },
  'CSCE 463': { title: 'Networks & Distributed Processing', prereqs: ['CSCE 313'], tags: ['Cyber'] },
  'CSCE 465': { title: 'Computer & Network Security', prereqs: ['CSCE 331', 'CSCE 313'], tags: ['Cyber'] },
  'CSCE 481': { title: 'Seminar', prereqs: [], tags: [] },
  'CSCE 482': { title: 'Senior Capstone Design', prereqs: ['CSCE 411', 'CSCE 331'], tags: ['SWE'] },
  'ENGR 102': { title: 'Engr Lab I Computation', prereqs: [], tags: [] },
  'MATH 152': { title: 'Calculus II', prereqs: ['MATH 151'], tags: [] },
  'MATH 251': { title: 'Engineering Math III', prereqs: ['MATH 152'], tags: [] },
  'MATH 308': { title: 'Differential Equations', prereqs: ['MATH 152'], tags: [] },
  'STAT 212': { title: 'Statistics II', prereqs: ['STAT 211'], tags: [] }
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
    const terms = ['Fall', 'Winter', 'Spring', 'Summer'];
    const startIndex = terms.indexOf(startTerm);
    const endIndex = terms.indexOf(endTerm);
    const semesters = [];

    for (let year = startYear; year <= endYear; year += 1) {
      for (let t = 0; t < terms.length; t += 1) {
        const term = terms[t];
        const isStartYear = year === startYear;
        const isEndYear = year === endYear;
        if (isStartYear && t < startIndex) continue;
        if (isEndYear && t > endIndex) continue;
        semesters.push(`${term} ${year}`);
      }
    }

    return semesters;
  };

  const getCurrentTermLabel = (date = new Date()) => {
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    if (month === 12) return `Winter ${year}`;
    if (month === 1) return `Winter ${year - 1}`;
    if (month >= 8 && month <= 11) return `Fall ${year}`;
    if (month >= 6 && month <= 7) return `Summer ${year}`;
    return `Spring ${year}`;
  };

  const getAcademicYearStart = (termLabel) => {
    const [term, yearStr] = termLabel.split(' ');
    const year = Number(yearStr);
    if (term === 'Fall' || term === 'Winter') return year;
    return year - 1;
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

  const semesterOrder = useMemo(() => {
    const currentTerm = getCurrentTermLabel();
    const currentAcademicStart = getAcademicYearStart(currentTerm);
    const startYear = currentAcademicStart - 4;
    const endYear = currentAcademicStart + 4;
    return buildSemesterRange(startYear, 'Fall', endYear + 1, 'Summer');
  }, []);
  const [transcriptTerms, setTranscriptTerms] = useState([]);
  const [transcriptError, setTranscriptError] = useState('');
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const transcriptYears = useMemo(() => normalizeTranscript(transcriptTerms), [transcriptTerms]);
  const transcriptIndex = useMemo(() => buildTranscriptIndex(transcriptTerms), [transcriptTerms]);
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
  const [selectedTranscriptYear, setSelectedTranscriptYear] = useState('');

  useEffect(() => {
    if (transcriptYears.length === 0) {
      if (selectedTranscriptYear) setSelectedTranscriptYear('');
      return;
    }
    const exists = transcriptYears.some((year) => year.year === selectedTranscriptYear);
    if (!exists) {
      setSelectedTranscriptYear(transcriptYears[transcriptYears.length - 1].year);
    }
  }, [transcriptYears, selectedTranscriptYear]);

  const handleTranscriptFile = async (file) => {
    if (!file) return;
    setTranscriptLoading(true);
    setTranscriptError('');
    try {
      const lines = await extractPdfLines(file);
      const parsed = parseTranscriptLines(lines);
      if (parsed.length === 0) {
        setTranscriptTerms([]);
        setTranscriptError('No terms detected. Please upload a text-based transcript PDF.');
        return;
      }
      setTranscriptTerms(parsed);
      const normalized = normalizeTranscript(parsed);
      if (normalized.length > 0) {
        setSelectedTranscriptYear(normalized[normalized.length - 1].year);
      }
    } catch (err) {
      setTranscriptError('Unable to read this PDF. Please try a different transcript file.');
    } finally {
      setTranscriptLoading(false);
    }
  };

  const isCoursePlannedInEarlierSemester = (courseCode, semester) => {
    const targetIndex = semesterIndex.get(semester);
    if (targetIndex === undefined) return false;
    return semesterOrder.some((sem, idx) => {
      if (idx >= targetIndex) return false;
      return semesterPlans[sem]?.includes(courseCode);
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
    if (isCoursePlannedInEarlierSemester(courseCode, semester)) {
      setPlanError(`${courseCode} has already been planned in a prior semester.`);
      return;
    }
    setSemesterPlans((prev) => ({
      ...prev,
      [semester]: [...(prev[semester] ?? []), courseCode]
    }));
    setPlanError('');
    setShowCourseModal(false);
  };

  const removeCourseFromSemester = (courseCode, semester) => {
    setSemesterPlans((prev) => ({
      ...prev,
      [semester]: (prev[semester] ?? []).filter((c) => c !== courseCode)
    }));
  };

  const validateSemester = (semester) => {
    const courses = semesterPlans[semester] ?? [];
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
      semesterOrder.forEach((term) => {
        const label = getAcademicYearForTerm(term);
        if (!years.includes(label)) {
          years.push(label);
        }
      });
      return years;
    }, [semesterOrder]);
    const currentDate = new Date();
    const getTermStartDate = (termLabel) => {
      const [season, yearStr] = termLabel.split(' ');
      const year = Number(yearStr);
      const startMonth = {
        Spring: 2,
        Summer: 6,
        Fall: 8,
        Winter: 12
      }[season] ?? 1;
      return new Date(year, startMonth - 1, 1);
    };
    const getTermEndDate = (termLabel) => {
      const [season, yearStr] = termLabel.split(' ');
      const year = Number(yearStr);
      const endMonth = {
        Spring: 5,
        Summer: 7,
        Fall: 11,
        Winter: 1
      }[season] ?? 12;
      const endYear = season === 'Winter' ? year + 1 : year;
      return new Date(endYear, endMonth, 0);
    };
    const getGraceEndDate = (termLabel) => {
      const [season, yearStr] = termLabel.split(' ');
      const year = Number(yearStr);
      if (season === 'Winter') return new Date(year + 1, 2, 0);
      if (season === 'Summer') return new Date(year, 9, 0);
      return getTermEndDate(termLabel);
    };
    const currentTermLabel = getCurrentTermLabel(currentDate);
    const getTermState = (termLabel) => {
      const termDate = getTermStartDate(termLabel);
      const termEnd = getTermEndDate(termLabel);
      const graceEnd = getGraceEndDate(termLabel);
      if (currentDate < termDate) return 'future';
      if (currentDate > graceEnd) return 'past';
      if (currentDate > termEnd) return 'recent';
      return 'current';
    };
    const isPlanYearSelectable = (yearLabel) => {
      const terms = getTermsForAcademicYear(yearLabel);
      return terms.some((term) => getTermState(term) !== 'past');
    };
    const firstSelectableYear = planYears.find((year) => isPlanYearSelectable(year));
    const activePlanYear = planYears.includes(selectedPlanYear)
      ? selectedPlanYear
      : firstSelectableYear || planYears[0];
    const planTerms = activePlanYear ? getTermsForAcademicYear(activePlanYear) : [];
    const transcriptYear =
      transcriptYears.find((year) => year.year === selectedTranscriptYear) ||
      transcriptYears[0];
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
              {planYears.map((year) => {
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
                    } ${selectable ? '' : 'opacity-40 cursor-not-allowed'}`}
                    style={selectedPlanYear === year ? { backgroundColor: '#500000' } : {}}
                    disabled={!selectable}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          </div>

          {!isPlanYearSelectable(selectedPlanYear) && (
            <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              Planning is disabled for past academic years. You can view the current term ({currentTermLabel}) but cannot edit it.
            </div>
          )}

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
              const courses = semesterPlans[term] || [];
              const termValidation = validateSemester(term);
              const termState = getTermState(term);
              const isEditable = termState !== 'past';
              const isViewOnly = false;
              return (
                <div key={term} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-gray-900">{term}</h4>
                      <p className="text-xs text-gray-600">
                        {termValidation.totalCredits} credits • Difficulty:{' '}
                        {termValidation.totalDifficulty}/25
                      </p>
                      {isViewOnly && termState === 'recent' && (
                        <p className="text-xs text-blue-600 mt-1">
                          Recent term (credit transfer window)
                        </p>
                      )}
                      {!isEditable && !isViewOnly && (
                        <p className="text-xs text-gray-500 mt-1">Past term (locked)</p>
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
                    {courses.length === 0 ? (
                      <div className="text-center py-6 text-gray-500 text-sm">
                        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No courses planned</p>
                      </div>
                    ) : (
                      courses.map((code) => {
                        const course = COURSES[code];
                        const hasPrereqIssue = course.prereqs.some((p) => !isCourseCompleted(p));

                        return (
                          <div
                            key={code}
                            className={`p-3 rounded-lg border ${
                              hasPrereqIssue
                                ? 'border-red-300 bg-red-50'
                                : 'border-gray-200 bg-white'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold text-gray-900">{code}</h4>
                                  <span className="text-xs bg-gray-200 px-2 py-1 rounded">
                                    {course.credits} cr
                                  </span>
                                </div>
                                <p className="text-xs text-gray-600 mt-1">{course.title}</p>
                                {hasPrereqIssue && (
                                  <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    Missing prerequisites:{' '}
                                    {course.prereqs.filter((p) => !isCourseCompleted(p)).join(', ')}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  if (!isEditable) return;
                                  removeCourseFromSemester(code, term);
                                }}
                                className={`text-gray-400 ${
                                  isEditable ? 'hover:text-red-600' : 'cursor-not-allowed opacity-50'
                                }`}
                                disabled={!isEditable}
                              >
                                <X className="w-4 h-4" />
                              </button>
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
              <label className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-100 cursor-pointer">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => handleTranscriptFile(e.target.files?.[0])}
                />
                Upload Transcript PDF
              </label>
              {transcriptLoading && (
                <span className="text-sm text-gray-500">Parsing...</span>
              )}
              {transcriptError && (
                <span className="text-sm text-red-600">{transcriptError}</span>
              )}
              {transcriptYears.map((year) => (
                <button
                  key={year.year}
                  onClick={() => setSelectedTranscriptYear(year.year)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                    selectedTranscriptYear === year.year
                      ? 'text-white'
                      : 'text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                  style={
                    selectedTranscriptYear === year.year ? { backgroundColor: '#500000' } : {}
                  }
                >
                  {year.year}
                </button>
              ))}
            </div>
          </div>

          {transcriptYears.length === 0 || !transcriptYear ? (
            <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
              Upload a transcript PDF to populate your academic record.
            </div>
          ) : (
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
                                <p className="text-sm font-semibold text-gray-900">
                                  {course.code}
                                </p>
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
          )}
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
                    const alreadyPlanned = (semesterPlans[selectedSemester] ?? []).includes(code);
                    const alreadyTaken = isCourseCompleted(code);
                    const inProgress = isCourseInProgress(code);
                    const alreadyPlannedEarlier = isCoursePlannedInEarlierSemester(
                      code,
                      selectedSemester
                    );
                    const isDisabled =
                      isLocked || alreadyPlanned || alreadyTaken || inProgress || alreadyPlannedEarlier;

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
                                `${code} has already been planned in a prior semester.`
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
                          {alreadyPlannedEarlier && (
                            <span className="text-xs text-red-600">Already planned</span>
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
    const trackTags = ['All', 'Cyber', 'AI', 'ML', 'SWE'];
    const [selectedTrack, setSelectedTrack] = useState('All');
    const [hoveredCourse, setHoveredCourse] = useState(null);
    const flowNodes = [
      { id: 'MATH 151', x: 100, y: 40 },
      { id: 'ENGR 102', x: 100, y: 150 },
      { id: 'MATH 152', x: 100, y: 260 },
      { id: 'CSCE 181', x: 100, y: 370 },
      { id: 'CSCE 120', x: 420, y: 40 },
      { id: 'CSCE 222', x: 420, y: 150 },
      { id: 'MATH 304', x: 420, y: 260 },
      { id: 'STAT 211', x: 420, y: 370 },
      { id: 'CSCE 221', x: 740, y: 40 },
      { id: 'CSCE 312', x: 740, y: 150 },
      { id: 'CSCE 314', x: 740, y: 260 },
      { id: 'STAT 212', x: 740, y: 370 },
      { id: 'MATH 251', x: 740, y: 480 },
      { id: 'MATH 308', x: 740, y: 590 },
      { id: 'CSCE 313', x: 1060, y: 40 },
      { id: 'CSCE 331', x: 1060, y: 150 },
      { id: 'CSCE 411', x: 1060, y: 260 },
      { id: 'CSCE 420', x: 1380, y: 40 },
      { id: 'CSCE 421', x: 1380, y: 150 },
      { id: 'CSCE 463', x: 1380, y: 260 },
      { id: 'CSCE 465', x: 1380, y: 370 },
      { id: 'CSCE 431', x: 1380, y: 480 },
      { id: 'CSCE 434', x: 1380, y: 590 },
      { id: 'CSCE 441', x: 1380, y: 700 },
      { id: 'CSCE 442', x: 1380, y: 810 },
      { id: 'CSCE 448', x: 1380, y: 920 },
      { id: 'CSCE 451', x: 1380, y: 1030 },
      { id: 'CSCE 481', x: 1380, y: 1140 },
      { id: 'CSCE 482', x: 1380, y: 1250 }
    ];
    const flowEdges = Object.entries(FLOWCHART_COURSES).flatMap(([code, course]) =>
      course.prereqs.map((prereq) => ({ from: prereq, to: code }))
    );
    const nodeWidth = 210;
    const nodeHeight = 58;
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
    const isPrereqMet = (code) => isCourseCompleted(code) || isCourseInProgress(code);
    const getCourseData = (code) => FLOWCHART_COURSES[code] || COURSES[code];
    const getUnmetPrereqs = (code, visited = new Set()) => {
      if (!code || visited.has(code)) return new Set();
      visited.add(code);
      const course = getCourseData(code);
      if (!course || !course.prereqs || course.prereqs.length === 0) return new Set();
      const unmet = new Set();
      course.prereqs.forEach((prereq) => {
        if (!isPrereqMet(prereq)) {
          unmet.add(prereq);
          getUnmetPrereqs(prereq, visited).forEach((item) => unmet.add(item));
        }
      });
      return unmet;
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
    const hoveredUnmet = useMemo(
      () => (hoveredCourse ? getUnmetPrereqs(hoveredCourse) : new Set()),
      [hoveredCourse]
    );

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold mb-2">Course Prerequisite Flowchart</h3>
          <p className="text-sm text-gray-600 mb-6">
            Flowchart-style prerequisites for the CS core. Boxes show status based on transcript.
          </p>

          <div className="border border-gray-200 rounded-lg bg-gray-50 p-4 overflow-x-auto">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {trackTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTrack(tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    selectedTrack === tag
                      ? 'text-white'
                      : 'text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                  style={selectedTrack === tag ? { backgroundColor: '#500000' } : {}}
                >
                  {tag}
                </button>
              ))}
            </div>
            <svg
              viewBox="0 0 1700 1380"
              className="w-[1700px] h-auto"
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
                const midX = (startX + endX) / 2;
                const fromTags = FLOWCHART_COURSES[edge.from]?.tags || [];
                const toTags = FLOWCHART_COURSES[edge.to]?.tags || [];
                const edgeActive =
                  selectedTrack === 'All' ||
                  fromTags.includes(selectedTrack) ||
                  toTags.includes(selectedTrack);
                const edgeHighlighted =
                  hoveredCourse &&
                  ((edge.to === hoveredCourse && hoveredUnmet.has(edge.from)) ||
                    (hoveredUnmet.has(edge.to) && hoveredUnmet.has(edge.from)));
                return (
                  <path
                    key={`${edge.from}-${edge.to}`}
                    d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                    fill="none"
                    stroke={edgeHighlighted ? '#dc2626' : '#9ca3af'}
                    strokeWidth={edgeHighlighted ? '2.2' : edgeActive ? '1.6' : '1'}
                    strokeOpacity={edgeHighlighted ? '0.9' : edgeActive ? '0.7' : '0.25'}
                    markerEnd="url(#arrow)"
                  />
                );
              })}

              {flowNodes.map((node) => {
                const course = FLOWCHART_COURSES[node.id] || COURSES[node.id];
                if (!course) return null;
                const status = getStatus(node.id);
                const tags = FLOWCHART_COURSES[node.id]?.tags || [];
                const isTagged = selectedTrack === 'All' || tags.includes(selectedTrack);
                const isHighlighted = hoveredUnmet.has(node.id);
                const nodeOpacity = isHighlighted ? 1 : isTagged ? 1 : 0.35;
                return (
                  <g
                    key={node.id}
                    opacity={nodeOpacity}
                    onMouseEnter={() => {
                      if (status === 'locked') setHoveredCourse(node.id);
                    }}
                    onMouseLeave={() => setHoveredCourse(null)}
                  >
                    <rect
                      x={node.x}
                      y={node.y}
                      width={nodeWidth}
                      height={nodeHeight}
                      rx="8"
                      className={`${statusStyles[status]} stroke-2`}
                      stroke={isHighlighted ? '#dc2626' : isTagged ? '#500000' : undefined}
                      strokeWidth={isHighlighted ? 3 : undefined}
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

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="shadow-lg" style={{ backgroundColor: '#500000' }}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GraduationCap className="w-8 h-8 text-white" />
              <div>
                <h1 className="text-2xl font-bold text-white">TAMU Academic Planner</h1>
                <p className="text-sm" style={{ color: '#f0e5d8' }}>
                  Enhanced Planning Tool
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg hover:bg-gray-100" style={{ color: '#500000' }}>
                <Save className="w-4 h-4" />
                Save Plan
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
      </main>
    </div>
  );
}

export default App;
