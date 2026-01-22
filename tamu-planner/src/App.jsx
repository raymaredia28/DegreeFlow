import React, { useState, useMemo } from 'react';
import {
  Calendar,
  AlertTriangle,
  CheckCircle,
  Book,
  GraduationCap,
  TrendingUp,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  Search,
  Download,
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

const EMPHASIS_TRACKS = {
  'Software Engineering': ['CSCE 314', 'CSCE 331', 'CSCE 310'],
  'AI/ML': ['CSCE 420', 'CSCE 421', 'CSCE 689'],
  Cybersecurity: ['CSCE 465', 'CSCE 469', 'CSCE 181']
};

function App() {
  const [activeTab, setActiveTab] = useState('planner');
  const [selectedSemester, setSelectedSemester] = useState('Fall 2024');
  const [semesterPlans, setSemesterPlans] = useState({
    'Fall 2024': ['CSCE 312', 'CSCE 314', 'MATH 304'],
    'Spring 2025': [],
    'Fall 2025': [],
    'Spring 2026': []
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({
    core: true,
    major: true,
    electives: false
  });

  const addCourseToSemester = (courseCode, semester) => {
    setSemesterPlans((prev) => ({
      ...prev,
      [semester]: [...prev[semester], courseCode]
    }));
    setShowCourseModal(false);
  };

  const removeCourseFromSemester = (courseCode, semester) => {
    setSemesterPlans((prev) => ({
      ...prev,
      [semester]: prev[semester].filter((c) => c !== courseCode)
    }));
  };

  const validateSemester = (semester) => {
    const courses = semesterPlans[semester];
    const warnings = [];
    const errors = [];

    let totalCredits = 0;
    let totalDifficulty = 0;

    courses.forEach((code) => {
      const course = COURSES[code];
      totalCredits += course.credits;
      totalDifficulty += course.difficulty;

      // Check prerequisites
      course.prereqs.forEach((prereq) => {
        const prereqCourse = COURSES[prereq];
        if (prereqCourse.status !== 'completed') {
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
    const semesters = Object.keys(semesterPlans);
    const validation = validateSemester(selectedSemester);

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex gap-2 overflow-x-auto">
            {semesters.map((sem) => (
              <button
                key={sem}
                onClick={() => setSelectedSemester(sem)}
                className={`px-4 py-2 rounded-lg whitespace-nowrap ${
                  selectedSemester === sem
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={selectedSemester === sem ? { backgroundColor: '#500000' } : {}}
              >
                {sem}
              </button>
            ))}
          </div>
        </div>

        {validation.errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start">
              <X className="w-5 h-5 text-red-600 mt-0.5 mr-3" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900">Planning Errors</h3>
                <ul className="mt-2 space-y-1">
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
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900">Warnings</h3>
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

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-bold">{selectedSemester} Schedule</h3>
              <p className="text-sm text-gray-600">
                {validation.totalCredits} credits • Difficulty: {validation.totalDifficulty}/25
              </p>
            </div>
            <button
              onClick={() => setShowCourseModal(true)}
              className="flex items-center gap-2 text-white px-4 py-2 rounded-lg"
              style={{ backgroundColor: '#500000' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3d0000')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#500000')}
            >
              <Plus className="w-4 h-4" />
              Add Course
            </button>
          </div>

          <div className="space-y-3">
            {semesterPlans[selectedSemester].length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No courses planned for this semester</p>
                <p className="text-sm">Click "Add Course" to get started</p>
              </div>
            ) : (
              semesterPlans[selectedSemester].map((code) => {
                const course = COURSES[code];
                const hasPrereqIssue = course.prereqs.some((p) => COURSES[p].status !== 'completed');

                return (
                  <div
                    key={code}
                    className={`p-4 rounded-lg border-2 ${
                      hasPrereqIssue ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-gray-900">{code}</h4>
                          <span className="text-xs bg-gray-200 px-2 py-1 rounded">
                            {course.credits} cr
                          </span>
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            Difficulty: {course.difficulty}/5
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{course.title}</p>
                        {hasPrereqIssue && (
                          <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Missing prerequisites:{' '}
                            {course.prereqs
                              .filter((p) => COURSES[p].status !== 'completed')
                              .join(', ')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeCourseFromSemester(code, selectedSemester)}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {showCourseModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">Add Course to {selectedSemester}</h3>
                  <button
                    onClick={() => setShowCourseModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
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
                    const alreadyPlanned = semesterPlans[selectedSemester].includes(code);

                    return (
                      <div
                        key={code}
                        className={`p-4 rounded-lg border ${
                          isLocked
                            ? 'border-gray-300 bg-gray-100 opacity-60'
                            : alreadyPlanned
                              ? 'border-green-300 bg-green-50'
                              : 'border-gray-200 hover:bg-yellow-50 cursor-pointer'
                        }`}
                        onMouseEnter={(e) => {
                          if (!isLocked && !alreadyPlanned) {
                            e.currentTarget.style.borderColor = '#500000';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isLocked && !alreadyPlanned) {
                            e.currentTarget.style.borderColor = '#e5e7eb';
                          }
                        }}
                        onClick={() => !isLocked && !alreadyPlanned && addCourseToSemester(code, selectedSemester)}
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
    const toggleCategory = (cat) => {
      setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
    };

    const renderCourseTree = (courseCode, level = 0) => {
      const course = COURSES[courseCode];
      if (!course) return null;

      const statusColors = {
        completed: 'bg-green-100 border-green-300 text-green-800',
        'in-progress': 'bg-blue-100 border-blue-300 text-blue-800',
        available: 'bg-yellow-100 border-yellow-300 text-yellow-800',
        locked: 'bg-gray-100 border-gray-300 text-gray-600'
      };

      return (
        <div key={courseCode} className="mb-2" style={{ marginLeft: `${level * 20}px` }}>
          <div
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 ${
              statusColors[course.status]
            }`}
          >
            {course.status === 'completed' && <CheckCircle className="w-4 h-4" />}
            <span className="font-semibold text-sm">{courseCode}</span>
            <span className="text-xs opacity-75">{course.title}</span>
          </div>
          {course.prereqs.length > 0 && (
            <div className="ml-4 mt-2 border-l-2 border-gray-300 pl-4">
              {course.prereqs.map((prereq) => renderCourseTree(prereq, level + 1))}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold mb-4">Course Prerequisites Map</h3>
          <p className="text-sm text-gray-600 mb-6">
            Visual representation of course dependencies and completion status
          </p>

          <div className="space-y-6">
            <div>
              <button
                onClick={() => toggleCategory('core')}
                className="flex items-center gap-2 font-semibold text-gray-900 mb-3"
              >
                {expandedCategories.core ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
                Core Computer Science Courses
              </button>
              {expandedCategories.core && (
                <div className="space-y-4 ml-4">
                  {renderCourseTree('CSCE 411')}
                  {renderCourseTree('CSCE 313')}
                  {renderCourseTree('CSCE 314')}
                </div>
              )}
            </div>

            <div>
              <button
                onClick={() => toggleCategory('major')}
                className="flex items-center gap-2 font-semibold text-gray-900 mb-3"
              >
                {expandedCategories.major ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
                Advanced Electives
              </button>
              {expandedCategories.major && (
                <div className="space-y-4 ml-4">
                  {renderCourseTree('CSCE 421')}
                  {renderCourseTree('CSCE 463')}
                </div>
              )}
            </div>
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
              <button className="flex items-center gap-2 text-white px-4 py-2 rounded-lg bg-[#3d0000] hover:bg-[#2d0000]">
                <Download className="w-4 h-4" />
                Export
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
