import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import tamuLogo from './assets/tamu-logo.svg';
import { DegreeProgress } from './components/DegreeProgress';
import { signInWithPopup, signOut } from 'firebase/auth';
import { firebaseAuth, googleProvider } from './firebase';
import {
  Calendar,
  AlertTriangle,
  CheckCircle,
  Book,
  Plus,
  X,
  Search,
  Save,
  ChevronDown,
  Edit2,
  PanelRightClose,
  PanelRightOpen,
  Loader2,
  RefreshCw,
  Info
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const [, base64] = reader.result.split(',');
        resolve(base64);
      } else {
        reject(new Error('Unable to read file'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const DISPLAY_NAME_STORAGE_KEY = 'tamuPlannerDisplayName';

const normalizeDisplayStudentName = (rawName) => {
  if (!rawName || typeof rawName !== 'string') return '';
  let name = rawName
    .replace(/^\s*(Student\s+)?Name\s*:\s*/i, '')
    .replace(/\s*\(\s*\d{6,12}\s*\)\s*$/, '')
    .trim();
  if (!name) return '';
  if (name.includes(',')) {
    const [last, ...rest] = name.split(',');
    const firstPart = rest.join(',').trim();
    if (firstPart) {
      name = `${firstPart} ${last.trim()}`.trim();
    }
  }
  return name;
};

// Requirement areas used for the evaluation bars on the Dashboard.
// NOTE: Replace/extend these with your real CS degree audit rules as needed.
const REQUIREMENT_AREAS = [
  {
    id: 'major-coursework',
    name: 'Major Coursework',
    requiredCredits: 30,
    courses: [
      'CSCE 121',
      'CSCE 221',
      'CSCE 222',
      'CSCE 312',
      'CSCE 313',
      'CSCE 314',
      'CSCE 331',
      'CSCE 399'
    ]
  },
  {
    id: 'supporting-coursework',
    name: 'Supporting Coursework',
    requiredCredits: 46,
    courses: ['MATH 151', 'MATH 152', 'MATH 304']
  },
  { id: 'communication', name: 'Communication', requiredCredits: 6, courses: [] },
  { id: 'mathematics', name: 'Mathematics', requiredCredits: 8, courses: ['MATH 151', 'MATH 152'] },
  { id: 'life-physical-sciences', name: 'Life and Physical Sciences', requiredCredits: 14, courses: [] },
  { id: 'language-philosophy-culture', name: 'Language, Philosophy & Culture', requiredCredits: 3, courses: [] },
  { id: 'creative-arts', name: 'Creative Arts', requiredCredits: 3, courses: [] },
  { id: 'social-behavioral-sciences', name: 'Social and Behavioral Sciences', requiredCredits: 3, courses: [] },
  { id: 'citizenship', name: 'Citizenship', requiredCredits: 12, courses: [] },
  { id: 'general-electives', name: 'General Electives', requiredCredits: 1, courses: [] }
];

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

// Convert ALL-CAPS course titles to Title Case for display
const toTitleCase = (str) => {
  if (!str) return str;
  // Only convert if the string is mostly uppercase
  if (str !== str.toUpperCase()) return str;
  const lowercase = new Set(['a','an','and','as','at','but','by','for','from','in','into','of','on','or','the','to','with']);
  const roman = new Set(['I','II','III','IV','V','VI','VII','VIII','IX','X']);
  return str.split(' ').map((word, i) => {
    const upper = word.toUpperCase();
    if (roman.has(upper)) return upper;
    if (i === 0) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    if (lowercase.has(word.toLowerCase())) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
};

const TERM_REGEX = /\b(Fall|Spring|Summer|Winter)\s+(20\d{2})\b/;
const COURSE_REGEX = /\b([A-Z]{2,4})\s+(\d{3})\b/;
const GRADE_REGEX = /\b(A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F|S|U|P|W|Q|IP|TA|TB|TC|TD|TF|TCR|TIP)\b/;

// Transfer grades include TA/TB/TC/TD/TF, TCR (Transfer Credit), and TIP (Transfer In Progress)
// Pass/fail grades: S (Satisfactory), U (Unsatisfactory), P (Pass)
const TRANSFER_GRADES = new Set(['TA', 'TB', 'TC', 'TD', 'TF', 'TCR', 'TIP']);
const PASS_FAIL_GRADES = new Set(['S', 'U', 'P']);
const normalizeGrade = (grade) =>
  typeof grade === 'string' ? grade.trim().toUpperCase() : '';
const isTransferGrade = (grade) => TRANSFER_GRADES.has(normalizeGrade(grade));
const isPassFailGrade = (grade) => PASS_FAIL_GRADES.has(normalizeGrade(grade));
const isInProgressGrade = (grade) => {
  const normalized = normalizeGrade(grade);
  return normalized === 'IP' || normalized === 'TIP';
};
const isCourseMarkedInProgress = (course, fallbackTermStatus = '') => {
  const normalizedGrade = normalizeGrade(course?.grade);
  if (isInProgressGrade(normalizedGrade)) return true;
  if (course?.transfer || isTransferGrade(normalizedGrade)) return false;
  if (!normalizedGrade) {
    const termStatus = String(course?.termStatus || fallbackTermStatus || '').trim();
    return termStatus === 'In Progress';
  }
  return false;
};
const EXCLUDED_TRANSCRIPT_GRADES = new Set(['Q']);
const isExcludedTranscriptGrade = (grade) =>
  EXCLUDED_TRANSCRIPT_GRADES.has(normalizeGrade(grade));
const sanitizeTranscriptTermsForDisplay = (terms = []) =>
  (Array.isArray(terms) ? terms : [])
    .map((term) => {
      const courses = (Array.isArray(term?.courses) ? term.courses : [])
        .filter((course) => !isExcludedTranscriptGrade(course?.grade));
      const hasInProgress = courses.some((course) =>
        isCourseMarkedInProgress({ ...course, termStatus: term?.status })
      );
      const hasTransfer = courses.some((course) =>
        Boolean(course?.transfer) || isTransferGrade(course?.grade)
      );
      return {
        ...term,
        status: hasInProgress ? 'In Progress' : hasTransfer ? 'Transfer' : 'Evaluated',
        courses
      };
    })
    .filter((term) => term.courses.length > 0);
const CHAT_ACTION_BLOCK_REGEX = /\[DEGREEFLOW_ACTIONS\]([\s\S]*?)\[\/DEGREEFLOW_ACTIONS\]/i;

// Courses that are equivalent (renamed/replaced). Each array is a group of
// interchangeable course codes. Only one from each group should count.
const EQUIVALENT_COURSE_GROUPS = [
  ['CSCE 120', 'CSCE 121'],
  ['CSCE 315', 'CSCE 331'],
];

// Build a fast lookup: courseCode -> canonical (first element of its group)
const EQUIVALENT_MAP = new Map();
EQUIVALENT_COURSE_GROUPS.forEach((group) => {
  const canonical = group[0];
  group.forEach((code) => EQUIVALENT_MAP.set(code, canonical));
});

const getCanonicalCode = (code) => EQUIVALENT_MAP.get(code) || code;

const getEquivalents = (code) => {
  const canonical = getCanonicalCode(code);
  const group = EQUIVALENT_COURSE_GROUPS.find((g) => g.includes(canonical));
  return group ? group.filter((c) => c !== code) : [];
};

const normalizeSpacedText = (line) => {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return line.trim();
  const singleCount = tokens.filter((t) => t.length === 1).length;
  if (singleCount / tokens.length < 0.6) return line.trim();
  const out = [];
  let buffer = '';
  const flush = () => {
    if (buffer) {
      out.push(buffer);
      buffer = '';
    }
  };
  tokens.forEach((tok) => {
    if (tok.length === 1 && /[A-Za-z0-9]/.test(tok)) {
      buffer += tok;
    } else {
      flush();
      out.push(tok);
    }
  });
  flush();
  return out.join(' ');
};

const cleanTranscriptLine = (rawLine) => {
  let line = normalizeSpacedText(rawLine);
  if (!line) return '';
  line = line
    .replace(/([A-Za-z])(\d{2,4})/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/([A-Z]{2,4})(\d{3})/g, '$1 $2')
    .replace(/(\d)\s*\.\s*(\d)/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .trim();
  return line;
};

const splitByTermMarkers = (line) => {
  const matches = [...line.matchAll(new RegExp(TERM_REGEX, 'g'))];
  if (matches.length <= 1) return [line];
  const parts = [];
  let cursor = 0;
  matches.forEach((match, idx) => {
    if (idx === 0) return;
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push(line.slice(cursor, index).trim());
    }
    cursor = index;
  });
  if (cursor < line.length) parts.push(line.slice(cursor).trim());
  return parts.filter(Boolean);
};

const splitByCourseCodes = (line) => {
  const matches = [...line.matchAll(new RegExp(COURSE_REGEX, 'g'))];
  if (matches.length <= 1) return [line];
  const parts = [];
  let cursor = 0;
  matches.forEach((match, idx) => {
    if (idx === 0) return;
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push(line.slice(cursor, index).trim());
    }
    cursor = index;
  });
  if (cursor < line.length) parts.push(line.slice(cursor).trim());
  return parts.filter(Boolean);
};

const splitLineByMarkers = (line) => {
  let working = line;
  const parts = [];
  let guard = 0;
  while (working && guard < 5) {
    guard += 1;
    const termMatch = working.match(TERM_REGEX);
    const courseMatch = working.match(COURSE_REGEX);
    if (!termMatch || !courseMatch) break;
    const termIndex = termMatch.index ?? 0;
    const courseIndex = courseMatch.index ?? 0;
    if (termIndex === 0 && courseIndex === 0) break;
    if (courseIndex < termIndex && termIndex > 0) {
      parts.push(working.slice(0, termIndex).trim());
      working = working.slice(termIndex).trim();
      continue;
    }
    if (termIndex < courseIndex && courseIndex > 0) {
      parts.push(working.slice(0, courseIndex).trim());
      working = working.slice(courseIndex).trim();
      continue;
    }
    break;
  }
  if (working) parts.push(working.trim());
  return parts.filter(Boolean);
};

const preprocessTranscriptLines = (lines) => {
  const cleaned = [];
  lines.forEach((raw) => {
    const line = cleanTranscriptLine(raw);
    if (!line) return;
    splitLineByMarkers(line).forEach((segment) => {
      splitByTermMarkers(segment).forEach((part) => {
        splitByCourseCodes(part).forEach((piece) => {
          const trimmed = piece.trim();
          if (trimmed) cleaned.push(trimmed);
        });
      });
    });
  });
  return cleaned;
};

const shouldForceOcr = (lines) => {
  if (!lines.length) return true;
  let spacedLike = 0;
  lines.forEach((line) => {
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length < 6) return;
    const singleCount = tokens.filter((t) => t.length === 1).length;
    if (singleCount / tokens.length > 0.6) spacedLike += 1;
  });
  const spacedRatio = spacedLike / lines.length;
  if (spacedRatio > 0.3) return true;
  const hasMergedMarkers = lines.some((line) => {
    const cleaned = cleanTranscriptLine(line);
    const termMatch = cleaned.match(TERM_REGEX);
    const courseMatch = cleaned.match(COURSE_REGEX);
    if (!termMatch || !courseMatch) return false;
    const termIndex = termMatch.index ?? 0;
    const courseIndex = courseMatch.index ?? 0;
    return courseIndex < termIndex;
  });
  return hasMergedMarkers;
};

const scoreTranscript = (terms) => {
  if (!Array.isArray(terms) || terms.length === 0) return 0;
  const termsWithCourses = terms.filter((term) => (term.courses || []).length > 0).length;
  const totalCourses = terms.reduce((sum, term) => sum + (term.courses || []).length, 0);
  const uniqueLabels = new Set(terms.map((term) => term.label)).size;
  return termsWithCourses * 100 + totalCourses * 2 + uniqueLabels;
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

const extractPdfOcrLines = async (file, onProgress) => {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const { default: Tesseract } = await import('tesseract.js');
  const lines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;

    onProgress?.(`Running OCR (page ${pageNum}/${pdf.numPages})...`);
    const result = await Tesseract.recognize(canvas, 'eng');
    const text = result?.data?.text || '';
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => lines.push(line));
  }

  return lines;
};

const parseTranscriptLines = (lines) => {
  const normalizedLines = preprocessTranscriptLines(lines);
  const terms = [];
  let currentTerm = null;

  const addCourseFromLine = (raw) => {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) return false;
    if (/^semester$/i.test(line) || /term totals/i.test(line) || /overall totals/i.test(line)) {
      return false;
    }
    if (/subj\s*no\.?/i.test(line) && /course\s*title/i.test(line)) return false;
    if (/ehr?s\s*:/i.test(line)) {
      const trimmed = line.split(/ehr?s\s*:/i)[0]?.trim();
      if (!trimmed) return false;
      return addCourseFromLine(trimmed);
    }

    const courseLineMatch = line.match(
      /^([A-Z]{2,4})\s+(\d{3})\s+(.+?)\s+(\d+(?:\.\d{3})?)\s+([A-Z][+\-]?|IP|TA|TB|TC|TD|TF|TCR|TIP|S|U|P|W|Q)\b/
    );
    if (courseLineMatch && currentTerm) {
      const [, subj, num, title, creditsStr, gradeRaw] = courseLineMatch;
      const code = `${subj} ${num}`;
      const credits = Number(creditsStr);
      const grade = normalizeGrade(gradeRaw);
      if (isExcludedTranscriptGrade(grade)) return true;
      const resolvedTitle = toTitleCase(title.trim() || code);
      const resolvedCredits = Number.isFinite(credits) && credits > 0 ? credits : 0;
      currentTerm.courses.push({
        code,
        title: resolvedTitle,
        credits: resolvedCredits,
        grade,
        transfer: isTransferGrade(grade)
      });
      if (grade === 'IP' || grade === 'TIP') {
        currentTerm.status = 'In Progress';
      } else if (isTransferGrade(grade) && currentTerm.status !== 'In Progress') {
        currentTerm.status = 'Transfer';
      }
      return true;
    }

    const courseMatch = line.match(COURSE_REGEX);
    if (!courseMatch || !currentTerm) return false;
    if (!line.startsWith(courseMatch[0])) return false;
    const code = `${courseMatch[1]} ${courseMatch[2]}`;
    const gradeMatch = line.match(GRADE_REGEX);
    const grade = normalizeGrade(gradeMatch?.[1] ?? '');
    if (isExcludedTranscriptGrade(grade)) return true;
    const creditsMatch = line.match(/\b(\d+\.\d{3}|\d+)\b(?!.*\b\d\b)/);
    const credits = creditsMatch ? Number(creditsMatch[1]) : 0;
    const withoutCode = line.replace(courseMatch[0], '').trim();
    const withoutGrade = grade ? withoutCode.replace(grade, '').trim() : withoutCode;
    const title = credits
      ? withoutGrade.replace(String(credits), '').trim()
      : withoutGrade.trim();
    const resolvedTitle = toTitleCase(title || code);
    const resolvedCredits = Number.isFinite(credits) && credits > 0 ? credits : 0;

    currentTerm.courses.push({
      code,
      title: resolvedTitle,
      credits: resolvedCredits,
      grade,
      transfer: isTransferGrade(grade)
    });
    if (grade === 'IP' || grade === 'TIP') {
      currentTerm.status = 'In Progress';
    } else if (isTransferGrade(grade) && currentTerm.status !== 'In Progress') {
      currentTerm.status = 'Transfer';
    }
    return true;
  };

  normalizedLines.forEach((rawLine) => {
    let line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) return;

    if (/courses in progress/i.test(line)) {
      //console.log('[transcript] Skipping "courses in progress" marker:', line);
      return;
    }

    const termMatch = line.match(TERM_REGEX);
    const courseMatch = line.match(COURSE_REGEX);
    if (termMatch && courseMatch && (courseMatch.index ?? 0) < (termMatch.index ?? 0)) {
      const courseSegment = line.slice(0, termMatch.index).trim();
      const termSegment = line.slice(termMatch.index).trim();
      if (courseSegment) addCourseFromLine(courseSegment);
      line = termSegment;
    }

    const termCheck = line.match(TERM_REGEX);
    if (termCheck) {
      //console.log('[transcript] Term match:', { line, termMatch: termCheck });
      const label = `${termCheck[1]} ${termCheck[2]}`;
      const existing = terms.find((term) => term.label === label);
      if (existing) {
        currentTerm = existing;
      } else {
        currentTerm = {
          label,
          status: 'Evaluated',
          courses: []
        };
        terms.push(currentTerm);
      }
      if (/transfer/i.test(line)) {
        currentTerm.status = 'Transfer';
      }
      return;
    }

    addCourseFromLine(line);
  });

  return terms;
};

const hasTermInLines = (lines) =>
  preprocessTranscriptLines(lines).some((line) => TERM_REGEX.test(line));

const parseTranscriptTotals = (lines) => {
  const normalizedLines = preprocessTranscriptLines(lines);
  const totals = {
    institution: null,
    transfer: null,
    overall: null
  };

  normalizedLines.forEach((line) => {
    const cleaned = line.replace(/\s+/g, ' ').trim();
    if (!cleaned) return;
    const match = cleaned.match(
      /\b(TOTAL INSTITUTION|TOTAL TRANSFER|OVERALL)\b.*?(\d+\.\d{3}|\d+)\s+(\d+\.\d{3}|\d+)\s+(\d+\.\d{3}|\d+)\s+(\d+\.\d{3}|\d+)/
    );
    if (!match) return;
    const label = match[1];
    const entry = {
      earnedHours: Number(match[2]),
      gpaHours: Number(match[3]),
      points: Number(match[4]),
      gpa: Number(match[5])
    };
    if (label === 'TOTAL INSTITUTION') totals.institution = entry;
    if (label === 'TOTAL TRANSFER') totals.transfer = entry;
    if (label === 'OVERALL') totals.overall = entry;
  });

  return totals;
};

const FLOWCHART_COURSES = {
  'ENGR 102': { title: 'Engr Lab I Computation', prereqs: [] },
  'CSCE 120': { title: 'Program Design & Concepts', prereqs: [] },
  'CSCE 121': { title: 'Intro to Program Design', prereqs: [] },
  'CSCE 181': { title: 'Intro to Computing', prereqs: [] },
  'MATH 151': { title: 'Engineering Math I', prereqs: [] },
  'MATH 152': { title: 'Calculus II', prereqs: [] },
  'CSCE 222': { title: 'Discrete Structures', prereqs: [] },
  'CSCE 221': { title: 'Data Structures & Algorithms', prereqs: ['CSCE 120'] },
  'CSCE 312': { title: 'Computer Organization', prereqs: ['CSCE 221'] },
  'CSCE 313': { title: 'Intro to Computer Systems', prereqs: ['CSCE 221', 'CSCE 312'] },
  'CSCE 314': { title: 'Programming Languages', prereqs: ['CSCE 221'] },
  'CSCE 331': { title: 'Foundations of Software Eng', prereqs: ['CSCE 221'] },
  'CSCE 411': { title: 'Design/Analysis of Algorithms', prereqs: ['CSCE 221', 'CSCE 222'] },
  'CSCE 420': { title: 'Artificial Intelligence', prereqs: ['CSCE 411'] },
  'MATH 304': { title: 'Linear Algebra', prereqs: ['MATH 151'] },
  'STAT 211': { title: 'Prin of Statistics I', prereqs: [] },
  'STAT 212': { title: 'Prin of Statistics II', prereqs: [] },
  'MATH 251': { title: 'Engineering Math III', prereqs: [] },
  'MATH 308': { title: 'Differential Equations', prereqs: [] },
  'CSCE 421': { title: 'Machine Learning', prereqs: ['MATH 304', 'STAT 211', 'CSCE 221', 'CSCE 120'] },
  'CSCE 431': { title: 'Software Engineering', prereqs: ['CSCE 331'] },
  'CSCE 434': { title: 'Compiler Design', prereqs: ['CSCE 331'] },
  'CSCE 441': { title: 'Computer Graphics', prereqs: ['CSCE 221'] },
  'CSCE 442': { title: 'Scientific Programming', prereqs: ['CSCE 221', 'MATH 304'] },
  'CSCE 448': { title: 'Computational Photography', prereqs: ['CSCE 331', 'MATH 304'] },
  'CSCE 451': { title: 'Software Reverse Engineering', prereqs: ['CSCE 313'] },
  'CSCE 463': { title: 'Networks & Distributed Processing', prereqs: ['CSCE 313'] },
  'CSCE 465': { title: 'Computer & Network Security', prereqs: ['CSCE 331', 'CSCE 313'] },
  'CSCE 481': { title: 'Seminar', prereqs: [] },
  'CSCE 482': { title: 'Senior Capstone Design', prereqs: ['CSCE 411', 'CSCE 331'] }
};

const buildTranscriptIndex = (terms, excludedTransfers = new Set()) => {
  const map = new Map();
  terms.forEach((term) => {
    term.courses.forEach((course) => {
      if (!course.code) return;
      if (course.transfer && excludedTransfers.has(course.code)) return;
      const isInProgress = isCourseMarkedInProgress({ ...course, termStatus: term.status });
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
      // Also register under equivalent codes so lookups by either name work
      const equivalents = getEquivalents(course.code);
      equivalents.forEach((eqCode) => {
        if (!map.has(eqCode)) {
          map.set(eqCode, {
            status,
            grade: course.grade,
            transfer: Boolean(course.transfer),
            honors: Boolean(course.honors)
          });
        }
      });
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

  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem('tamuPlannerAuthUser') ? 'planner' : 'login';
    } catch {
      return 'login';
    }
  });
  const [displayStudentName, setDisplayStudentName] = useState(() => {
    const saved = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY);
    return saved || '';
  });
  const [selectedEmphasis, setSelectedEmphasis] = useState('Undecided');
  const [selectedMinor, setSelectedMinor] = useState('None');
  const [hasHsLanguage, setHasHsLanguage] = useState(false);
  const [hasSabrCourse, setHasSabrCourse] = useState(false);
  const [studentId, setStudentId] = useState(() => localStorage.getItem('studentId') || '');
  const AUTH_STORAGE_KEY = 'tamuPlannerAuthUser';
  const AUTH_TOKEN_STORAGE_KEY = 'tamuPlannerAuthToken';
  const [authUser, setAuthUser] = useState(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '');
  const authHeaders = useCallback(
    (extras = {}) => ({
      ...extras,
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    }),
    [authToken]
  );
  const [storageError, setStorageError] = useState('');
  const [transcriptTerms, setTranscriptTerms] = useState([]);
  const [transcriptPdfName, setTranscriptPdfName] = useState('');
  const [transcriptTotals, setTranscriptTotals] = useState(null);
  const [showTranscriptReview, setShowTranscriptReview] = useState(false);
  const [reviewTerms, setReviewTerms] = useState([]);
  const [reviewTotals, setReviewTotals] = useState(null);
  const [isTranscriptDirty, setIsTranscriptDirty] = useState(false);
  const [isTranscriptSaving, setIsTranscriptSaving] = useState(false);
  const draggedReviewCourseRef = useRef(null);
  const dragOverTermLabelRef = useRef(null);
  const reviewScrollRef = useRef(null);
  const [reviewContextMenu, setReviewContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    courseCode: '',
    fromTermLabel: ''
  });
  const [selectedSemester, setSelectedSemester] = useState(() => {
    const now = new Date();
    const month = now.getMonth(); // 0-indexed
    const year = now.getFullYear();
    // Jan-May = Spring, Jun-Jul = Summer, Aug-Dec = Fall
    if (month <= 4) return `Spring ${year}`;
    if (month <= 6) return `Summer ${year}`;
    return `Fall ${year}`;
  });
  const [isFlowFullscreen, setIsFlowFullscreen] = useState(false);
  const [semesterPlans, setSemesterPlans] = useState(() => initSemesterPlans({}));
  const [searchQuery, setSearchQuery] = useState('');
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [planError, setPlanError] = useState('');
  const [toast, setToast] = useState(null); // { message, type: 'success' | 'error' | 'info' }
  const toastTimerRef = useRef(null);
  const showToast = useCallback((message, type = 'success', duration = 3000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), duration);
  }, []);
  const [selectedPlanYear, setSelectedPlanYear] = useState(() => {
    const now = new Date();
    const month = now.getMonth(); // 0-indexed
    const year = now.getFullYear();
    // Academic year starts in Fall: Aug (7) onwards = current year, before Aug = previous year
    const startYear = month >= 7 ? year : year - 1;
    return `${startYear}-${startYear + 1}`;
  });
  const [selectedTranscriptYear, setSelectedTranscriptYear] = useState('');
  // Set of transfer course codes excluded from degree evaluation (user-toggled)
  const [excludedTransferCourses, setExcludedTransferCourses] = useState(() => new Set());
  const [excludedFromEval, setExcludedFromEval] = useState(() => new Set());
  const [transcriptError, setTranscriptError] = useState('');
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptLoadingMessage, setTranscriptLoadingMessage] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(320);
  const [chatHeight, setChatHeight] = useState(400);
  const [isResizingChat, setIsResizingChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [requirementsResult, setRequirementsResult] = useState(null);
  const [degreeResult, setDegreeResult] = useState(null);
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState('');
  const [reqWarning, setReqWarning] = useState('');
  const [minorResult, setMinorResult] = useState(null);
  const [coursesIndex, setCoursesIndex] = useState(new Map());
  const [emphasisOptions, setEmphasisOptions] = useState(['Undecided']);
  const [minorOptions, setMinorOptions] = useState(['None']);
  const [emphases, setEmphases] = useState([]);
  const [minors, setMinors] = useState([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [pendingChatActions, setPendingChatActions] = useState(null);
  const [consentPendingFile, setConsentPendingFile] = useState(null);
  const uploadInputRef = useRef(null);
  const chatUploadInputRef = useRef(null);

  const updateDisplayStudentName = useCallback((rawName) => {
    const normalized = normalizeDisplayStudentName(rawName);
    if (!normalized) return;
    setDisplayStudentName(normalized);
    localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, normalized);
  }, []);

  // Derived catalog lookup keyed by course code (string -> meta)
  const COURSES = useMemo(() => {
    const out = {};
    coursesIndex.forEach((meta, code) => {
      out[code] = meta;
    });
    return out;
  }, [coursesIndex]);
  const transcriptYears = useMemo(() => normalizeTranscript(transcriptTerms), [transcriptTerms]);
  const transcriptIndex = useMemo(() => buildTranscriptIndex(transcriptTerms), [transcriptTerms]);

  const handleChatResize = useCallback((e) => {
    if (!isResizingChat) return;
    const newWidth = Math.min(500, Math.max(280, window.innerWidth - e.clientX - 12));
    const newHeight = Math.min(600, Math.max(280, window.innerHeight - e.clientY - 24));
    setChatWidth(newWidth);
    setChatHeight(newHeight);
  }, [isResizingChat]);
  useEffect(() => {
    if (!isResizingChat) return;
    const onMove = (e) => handleChatResize(e);
    const onUp = () => setIsResizingChat(false);
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizingChat, handleChatResize]);


  const saveTranscriptToStorage = useCallback(
    async (terms) => {
      try {
        setStorageError('');
        const currentAuth = JSON.parse(localStorage.getItem('tamuPlannerAuthUser') || 'null');
        const email = currentAuth?.email || '';
        const name = currentAuth?.name || '';
        const response = await fetch(`${API_BASE}/storage/transcript`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            studentEmail: email,
            studentName: name,
            terms
          })
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.studentId) {
          localStorage.setItem('studentId', String(data.studentId));
          setStudentId(String(data.studentId));
          return String(data.studentId);
        }
        const detail = data.error || `Server returned ${response.status}`;
        setStorageError(`Unable to save transcript: ${detail}`);
        return null;
      } catch (err) {
        setStorageError(`Unable to save transcript: ${err.message || 'network error'}`);
        return null;
      }
    },
    [authHeaders]
  );

  const savePlanToStorage = useCallback(async () => {
    try {
      setStorageError('');
      let currentId = studentId;
      if (!currentId && transcriptTerms.length > 0) {
        currentId = await saveTranscriptToStorage(transcriptTerms);
      } else if (currentId && transcriptTerms.length > 0) {
        await saveTranscriptToStorage(transcriptTerms);
      }

      if (!currentId) {
        setStorageError('No student ID found. Upload a transcript before saving.');
        return;
      }

      const response = await fetch(`${API_BASE}/storage/planner/${currentId}`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          semesterPlans,
          transcriptTerms,
          transcriptTotals,
          selectedPlanYear,
          selectedTranscriptYear,
          selectedEmphasis,
          selectedMinor,
          hasHsLanguage,
          hasSabrCourse
        })
      });

      if (!response.ok) {
        setStorageError('Unable to save planner data.');
      }
    } catch (err) {
      setStorageError('Unable to save planner data.');
    }
  }, [
    studentId,
    transcriptTerms,
    transcriptTotals,
    semesterPlans,
    selectedPlanYear,
    selectedTranscriptYear,
    selectedEmphasis,
    selectedMinor,
    hasHsLanguage,
    hasSabrCourse,
    saveTranscriptToStorage,
    authHeaders
  ]);

  const [evalSaving, setEvalSaving] = useState(false);
  const saveEvaluationToStorage = useCallback(async () => {
    try {
      setEvalSaving(true);
      setStorageError('');
      let currentId = studentId;
      if (!currentId) {
        setStorageError('No student ID found. Upload a transcript before saving.');
        return;
      }

      const response = await fetch(`${API_BASE}/storage/planner/${currentId}`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          semesterPlans,
          transcriptTerms,
          transcriptTotals,
          selectedPlanYear,
          selectedTranscriptYear,
          selectedEmphasis,
          selectedMinor,
          hasHsLanguage,
          hasSabrCourse,
          savedEvaluation: {
            degreeResult,
            requirementsResult,
            minorResult,
            reqWarning
          }
        })
      });

      if (!response.ok) {
        setStorageError('Unable to save evaluation.');
      } else {
        showToast('Evaluation saved!', 'success');
      }
    } catch (err) {
      setStorageError('Unable to save evaluation.');
    } finally {
      setEvalSaving(false);
    }
  }, [
    studentId,
    semesterPlans,
    transcriptTerms,
    transcriptTotals,
    selectedPlanYear,
    selectedTranscriptYear,
    selectedEmphasis,
    selectedMinor,
    hasHsLanguage,
    hasSabrCourse,
    degreeResult,
    requirementsResult,
    minorResult,
    reqWarning,
    authHeaders,
    showToast
  ]);

  const loadUserData = useCallback(async (email, name) => {
    try {
      if (name) {
        updateDisplayStudentName(name);
      }
      const resp = await fetch(`${API_BASE}/storage/login`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email, name })
      });
      if (!resp.ok) return false;
      const data = await resp.json();

      if (data.studentId) {
        localStorage.setItem('studentId', String(data.studentId));
        setStudentId(String(data.studentId));
      }

      if (data.transcript?.terms?.length > 0) {
        const sanitizedTerms = sanitizeTranscriptTermsForDisplay(data.transcript.terms);
        setTranscriptTerms(sanitizedTerms);
        setReviewTerms(sanitizedTerms);
        setIsTranscriptDirty(false);
        const normalized = normalizeTranscript(sanitizedTerms);
        if (normalized.length > 0) {
          setSelectedTranscriptYear(normalized[normalized.length - 1].year);
        }
      }

      if (data.planner) {
        if (data.planner.semesterPlans) {
          suppressDirtyRef.current = true;
          setSemesterPlans(initSemesterPlans(data.planner.semesterPlans));
        }
        if (data.planner.selectedPlanYear) {
          setSelectedPlanYear(data.planner.selectedPlanYear);
        }
        if (data.planner.selectedTranscriptYear) {
          setSelectedTranscriptYear(data.planner.selectedTranscriptYear);
        }
        if (data.planner.transcriptTotals) {
          setTranscriptTotals(data.planner.transcriptTotals);
        }
        if (data.planner.selectedEmphasis) {
          setSelectedEmphasis(data.planner.selectedEmphasis);
        }
        if (data.planner.selectedMinor) {
          setSelectedMinor(data.planner.selectedMinor);
        }
        if (data.planner.hasHsLanguage != null) {
          setHasHsLanguage(data.planner.hasHsLanguage);
        }
        if (data.planner.hasSabrCourse != null) {
          setHasSabrCourse(data.planner.hasSabrCourse);
        }
        if (data.planner.savedEvaluation) {
          const ev = data.planner.savedEvaluation;
          if (ev.degreeResult) setDegreeResult(ev.degreeResult);
          if (ev.requirementsResult) setRequirementsResult(ev.requirementsResult);
          if (ev.minorResult) setMinorResult(ev.minorResult);
          if (ev.reqWarning) setReqWarning(ev.reqWarning);
        }
      }
      return true;
    } catch (err) {
      console.error('Failed to load user data:', err);
      return false;
    }
  }, [authHeaders, updateDisplayStudentName]);

  const logout = () => {
    signOut(firebaseAuth).catch(() => {});
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(DISPLAY_NAME_STORAGE_KEY);
    localStorage.removeItem('studentId');
    setAuthUser(null);
    setAuthToken('');
    setDisplayStudentName('');
    setStudentId('');
    setTranscriptTerms([]);
    setReviewTerms([]);
    setTranscriptTotals(null);
    setTranscriptPdfName('');
    setSemesterPlans(initSemesterPlans({}));
    setSelectedTranscriptYear('');
    setActiveTab('login');
  };

  const googleLogin = async () => {
    try {
      const credential = await signInWithPopup(firebaseAuth, googleProvider);
      const user = {
        provider: 'google',
        uid: credential.user.uid,
        name: credential.user.displayName || '',
        email: credential.user.email || '',
        picture: credential.user.photoURL || ''
      };

      const token = await credential.user.getIdToken();
      setAuthToken(token);
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);

      setAuthUser(user);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));

      const loaded = await loadUserData(user.email, user.name);
      if (loaded) dataLoadedRef.current = true;
      setActiveTab('dashboard');
    } catch {
      alert('Google sign-in failed. Please try again.');
    }
  };

  useEffect(() => {
    const unsubscribe = firebaseAuth.onIdTokenChanged(async (user) => {
      if (user) {
        const freshToken = await user.getIdToken();
        setAuthToken(freshToken);
        localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, freshToken);
      }
    });
    return () => unsubscribe();
  }, []);

  const dataLoadedRef = useRef(false);
  useEffect(() => {
    if (authUser?.email && authToken && !dataLoadedRef.current) {
      loadUserData(authUser.email, authUser.name).then((ok) => {
        if (ok) dataLoadedRef.current = true;
      });
    }
    if (!authUser) {
      dataLoadedRef.current = false;
    }
  }, [authToken, authUser, loadUserData]);

  const buildCourseIndex = (courses) => {
    const map = new Map();
    courses.forEach((c) => {
      const normalizeCredits = () => {
        const cr = c.credits;
        if (typeof cr === 'number') return cr;
        if (typeof cr === 'string') {
          const parsed = Number(cr);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        if (cr && typeof cr === 'object') {
          const val = cr.max ?? cr.min ?? 0;
          return Number.isFinite(val) ? val : 0;
        }
        return 0;
      };
      const primary =
        c.code ||
        (c.codes && c.codes[0]) ||
        (c.primary_subject && c.primary_number
          ? `${c.primary_subject} ${c.primary_number}`
          : c.department?.code && c.primary_number
          ? `${c.department.code} ${c.primary_number}`
          : null);
      const aliases = c.aliases || c.codes || [];
      [primary, ...aliases].filter(Boolean).forEach((code) => {
        map.set(code.toUpperCase(), {
          title: c.title || c.name || '',
          credits: normalizeCredits(),
          categories: Array.isArray(c.categories) ? c.categories : [],
          department:
            typeof c.department === 'string'
              ? c.department
              : c.department?.code || c.primary_subject || '',
          course_number: c.primary_number || c.course_number || '',
          prereqs: Array.isArray(c.prereq_courses || c.prereqs)
            ? c.prereq_courses || c.prereqs
            : [],
          status: 'available',
          difficulty: c.difficulty || 0
        });
      });
    });
    return map;
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [coursesRes, emphasesRes, minorsRes] = await Promise.all([
          fetch(`${API_BASE}/api/courses`),
          fetch(`${API_BASE}/api/emphases`),
          fetch(`${API_BASE}/api/minors`)
        ]);
        if (coursesRes.ok) {
          const { courses } = await coursesRes.json();
          setCoursesIndex(buildCourseIndex(courses || []));
        }
        if (emphasesRes.ok) {
          const { emphases } = await emphasesRes.json();
          setEmphases(emphases || []);
          const names = (emphases || [])
            .map((e) => e.emphasis_name || e.name)
            .filter(Boolean);
          setEmphasisOptions(['Undecided', ...names]);
        }
        if (minorsRes.ok) {
          const { minors } = await minorsRes.json();
          setMinors(minors || []);
          const names = (minors || [])
            .map((m) => m.minor_name || m.name)
            .filter(Boolean);
          setMinorOptions(['None', ...names]);
        }
      } catch (err) {
        console.warn('Failed to load catalog data', err);
      }
    };
    load();
  }, []);

  const evaluateRequirementsLocal = async () => {
    setReqLoading(true);
    setReqError('');
    setReqWarning('');
    try {
      if (coursesIndex.size === 0) {
        throw new Error('Catalog not loaded yet. Try again in a moment.');
      }
      // Build combined course list: transcript (completed + in-progress) + planned (manual adds too)
      const combined = new Map();
      transcriptCourseList.forEach((course) => {
        const code = normalizeCode(course.code);
        if (!code) return;
        if (excludedFromEval.has(code)) return;
        const meta = coursesIndex.get(code) || {};
        const userCategories = Array.isArray(course.categories) ? course.categories : [];
        const catalogCategories = Array.isArray(meta.categories) ? meta.categories : [];
        combined.set(code, {
          code,
          department: code.split(' ')[0],
          course_number: code.split(' ')[1],
          credits: Number(course.credits) || Number(meta.credits) || 0,
          categories: Array.from(new Set([...catalogCategories, ...userCategories])),
          grade: course.grade || null,
          status: isCourseMarkedInProgress(course) ? 'in-progress' : 'completed'
        });
      });

      Object.entries(semesterPlans).forEach(([, codes]) => {
        (codes || []).forEach((raw) => {
          const code = normalizeCode(raw);
          if (!code) return;
          if (excludedFromEval.has(code)) return;
          if (combined.has(code)) return; // prefer transcript/in-progress copy
          const meta = coursesIndex.get(code) || {};
          combined.set(code, {
            code,
            department: code.split(' ')[0],
            course_number: code.split(' ')[1],
            credits: Number(meta.credits) || 0,
            categories: Array.isArray(meta.categories) ? meta.categories : [],
            grade: null,
            status: 'planned'
          });
        });
      });

      const selectedEmphasisId =
        selectedEmphasis && selectedEmphasis !== 'Undecided'
          ? emphases.find((e) => (e.emphasis_name || e.name) === selectedEmphasis)?.emphasis_id ||
            null
          : null;
      const selectedMinorId =
        selectedMinor && selectedMinor !== 'None'
          ? minors.find((m) => (m.minor_name || m.name) === selectedMinor)?.minor_id || null
          : null;

      // Degree-level evaluation — pass degreeEmphasisId so the backend can
      // populate emphasisCourseIds for the emphasisCredits sub-rule in
      // Supporting Coursework without switching to the emphasis requirement set.
      const degreePayload = {
        catalogYear: null,
        emphasisId: null,
        degreeEmphasisId: selectedEmphasisId ?? null,
        minorId: null,
        courses: Array.from(combined.values()),
        hasHsLanguage,
        hasSabrCourse
      };

      //console.log('Sending degree evaluation payload', degreePayload);

      const degreeRes = await fetch(`${API_BASE}/api/requirements/evaluate-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(degreePayload)
      });
      if (!degreeRes.ok) {
        const msg = await degreeRes.json().catch(() => ({}));
        throw new Error(msg.error || `Degree evaluate failed (${degreeRes.status})`);
      }
      const degreeData = await degreeRes.json();
      setDegreeResult(degreeData);
      if (degreeData.warnings?.length) setReqWarning(degreeData.warnings.join(' | '));

      const hasTrackSelection = Boolean(selectedEmphasisId || selectedMinorId);
      if (!hasTrackSelection) {
        setRequirementsResult(null);
        setMinorResult(null);
        return;
      }

      const payload = {
        catalogYear: null,
        emphasisId: selectedEmphasisId,
        minorId: selectedMinorId,
        courses: Array.from(combined.values()),
        hasHsLanguage,
        hasSabrCourse
      };

      const res = await fetch(`${API_BASE}/api/requirements/evaluate-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.error || `Evaluate failed (${res.status})`);
      }
      const data = await res.json();
      //console.log('requirements evaluation result', data);
      setRequirementsResult(data);
      // Evaluate minor separately (if selected) to show minor-specific progress
      if (selectedMinorId) {
        const minorPayload = { ...payload, emphasisId: null, minorId: selectedMinorId };
        const minorRes = await fetch(`${API_BASE}/api/requirements/evaluate-local`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(minorPayload)
        });
        if (minorRes.ok) {
          const minorData = await minorRes.json();
          setMinorResult(minorData);
        } else {
          setMinorResult(null);
        }
      } else {
        setMinorResult(null);
      }
      if (data.warnings?.length) setReqWarning(data.warnings.join(' | '));
    } catch (err) {
      setReqError(err.message);
      setMinorResult(null);
    } finally {
      setReqLoading(false);
    }
  };


  // Ensure modal state and errors clear when leaving Planner tab
  useEffect(() => {
    if (activeTab !== 'planner') {
      setShowCourseModal(false);
      setPlanError('');
    }
  }, [activeTab]);

  useEffect(() => {
    if (transcriptYears.length === 0) {
      if (selectedTranscriptYear) setSelectedTranscriptYear('');
      return;
    }
    if (!selectedTranscriptYear) {
      setSelectedTranscriptYear(transcriptYears[transcriptYears.length - 1].year);
      return;
    }
    const normalizedSelection = selectedTranscriptYear.trim();
    const exists = transcriptYears.some((year) => year.year === normalizedSelection);
    if (!exists) {
      setSelectedTranscriptYear(transcriptYears[transcriptYears.length - 1].year);
    }
  }, [transcriptYears, selectedTranscriptYear]);
  // Sanitize credits: a single course should never exceed 10 credit hours.
  // Bad data from a previous AI parse may have set the course number as credits.
  const sanitizeCredits = (c) => {
    const cr = Number(c);
    return Number.isFinite(cr) && cr >= 0 && cr <= 10 ? cr : 0;
  };

  const transcriptCourseList = useMemo(
    () =>
      transcriptTerms.flatMap((term) =>
        (term.courses || [])
          .filter((course) => !isExcludedTranscriptGrade(course?.grade))
          .map((course) => ({
            ...course,
            credits: sanitizeCredits(course.credits),
            termLabel: term.label,
            termStatus: term.status || ''
          }))
      ),
    [transcriptTerms]
  );
  // Filtered list that excludes transfer courses the user toggled off
  const effectiveTranscriptCourseList = useMemo(
    () => transcriptCourseList.filter(
      (course) => !(course.transfer && excludedTransferCourses.has(course.code))
    ),
    [transcriptCourseList, excludedTransferCourses]
  );
  const transcriptCourseCodes = useMemo(
    () => new Set(effectiveTranscriptCourseList.map((course) => course.code)),
    [effectiveTranscriptCourseList]
  );
  const transcriptCreditsSummary = useMemo(() => {
    let completedCredits = 0;
    let inProgressCredits = 0;
    let totalTranscriptCredits = 0;

    effectiveTranscriptCourseList.forEach((course) => {
      const credits = Number(course.credits) || 0;
      totalTranscriptCredits += credits;
      if (course.grade === 'IP' || course.grade === 'TIP') {
        inProgressCredits += credits;
      } else {
        completedCredits += credits;
      }
    });

    return { completedCredits, inProgressCredits, totalTranscriptCredits };
  }, [effectiveTranscriptCourseList]);
  const plannedCreditsSummary = useMemo(() => {
    let plannedCredits = 0;
    let plannedCourses = 0;
    const seen = new Set();

    Object.values(semesterPlans).forEach((courses) => {
      (courses || []).forEach((code) => {
        if (seen.has(code) || transcriptCourseCodes.has(code)) return;
        const credits = Number(COURSES[code]?.credits) || 0;
        plannedCredits += credits;
        plannedCourses += 1;
        seen.add(code);
      });
    });

    return { plannedCredits, plannedCourses };
  }, [semesterPlans, transcriptCourseCodes]);

  const transcriptGpa = useMemo(() => {
    if (transcriptTotals?.overall?.gpa) return transcriptTotals.overall.gpa;
    const gradePoints = {
      A: 4.0,
      'A-': 3.7,
      'B+': 3.3,
      B: 3.0,
      'B-': 2.7,
      'C+': 2.3,
      C: 2.0,
      'C-': 1.7,
      'D+': 1.3,
      D: 1.0,
      'D-': 0.7,
      F: 0
    };
    let qualityPoints = 0;
    let attemptedCredits = 0;

    transcriptCourseList.forEach((course) => {
      if (course.transfer) return;
      if (!course.grade || course.grade === 'IP' || course.grade === 'TIP') return;
      const points = gradePoints[course.grade];
      if (points === undefined) return;
      const credits = Number(course.credits) || 0;
      if (!credits) return;
      qualityPoints += points * credits;
      attemptedCredits += credits;
    });

    if (!attemptedCredits) return null;
    return Number((qualityPoints / attemptedCredits).toFixed(2));
  }, [transcriptCourseList, transcriptTotals]);
  const classification = useMemo(() => {
    const credits =
      transcriptTotals?.overall?.earnedHours ?? transcriptCreditsSummary.completedCredits;
    if (credits < 30) return 'Freshman';
    if (credits < 60) return 'Sophomore';
    if (credits < 90) return 'Junior';
    return 'Senior';
  }, [transcriptCreditsSummary.completedCredits, transcriptTotals]);

  const transcriptTermMap = useMemo(() => {
    const map = new Map();
    transcriptTerms.forEach((term) => {
      if (!term?.label) return;
      map.set(term.label, term);
    });
    return map;
  }, [transcriptTerms]);

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
    return transcriptTerms.some((term) => {
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
  const isCoursePlanned = (courseCode) =>
    Object.values(semesterPlans).some((courses) => courses?.includes(courseCode));

  // Checks if a prerequisite is satisfied for a given semester, considering:
  // 1. Already completed (on transcript)
  // 2. In progress (on transcript)
  // 3. Planned in an earlier semester
  const isPrereqSatisfiedForSemester = (prereqCode, semester) => {
    if (isCourseCompleted(prereqCode) || isCourseInProgress(prereqCode)) return true;
    return isCoursePlannedInEarlierSemester(prereqCode, semester);
  };

  const deriveTermStatus = (courses = []) => {
    let status = 'Evaluated';
    for (const course of courses) {
      if (isCourseMarkedInProgress(course)) return 'In Progress';
      if (course?.transfer || isTransferGrade(course?.grade)) status = 'Transfer';
    }
    return status;
  };

  const moveReviewedCourse = (courseCode, fromTermLabel, toTermLabel) => {
    if (!courseCode || !fromTermLabel || !toTermLabel) return;
    if (fromTermLabel === toTermLabel) return;
    setReviewTerms((prev) => {
      const next = prev.map((term) => ({
        ...term,
        courses: [...(term.courses || [])]
      }));
      const fromTerm = next.find((term) => term.label === fromTermLabel);
      let toTerm = next.find((term) => term.label === toTermLabel);
      if (!fromTerm) return prev;
      if (!toTerm) {
        toTerm = {
          label: toTermLabel,
          status: fromTerm.status || 'Evaluated',
          courses: []
        };
        next.push(toTerm);
      }
      const courseIndex = fromTerm.courses.findIndex((course) => course.code === courseCode);
      if (courseIndex === -1) return prev;
      if (toTerm.courses.some((course) => course.code === courseCode)) return prev;
      const [course] = fromTerm.courses.splice(courseIndex, 1);
      toTerm.courses.push(course);
      fromTerm.status = deriveTermStatus(fromTerm.courses);
      toTerm.status = deriveTermStatus(toTerm.courses);
      setIsTranscriptDirty(true);
      return next;
    });
  };

  const applyReviewedTranscript = async () => {
    // Allow saving even with empty reviewTerms (to persist a cleared record)
    setIsTranscriptSaving(true);
    const savedId = await saveTranscriptToStorage(reviewTerms);
    setIsTranscriptSaving(false);
    if (!savedId && reviewTerms.length > 0) return; // Only bail on error if we had data
    const sanitizedReviewTerms = sanitizeTranscriptTermsForDisplay(reviewTerms);
    setTranscriptTerms(sanitizedReviewTerms);
    setReviewTerms(sanitizedReviewTerms);
    setTranscriptTotals(reviewTotals ?? transcriptTotals);
    const normalized = normalizeTranscript(sanitizedReviewTerms);
    if (normalized.length > 0) {
      setSelectedTranscriptYear(normalized[normalized.length - 1].year);
    }
    setIsTranscriptDirty(false);
    setShowTranscriptReview(false);
    draggedReviewCourseRef.current = null;
    dragOverTermLabelRef.current = null;
    setReviewContextMenu((prev) => ({ ...prev, open: false }));
    showToast('Academic record updated!', 'success');
  };

  // Track unsaved planner changes
  const [plannerDirty, setPlannerDirty] = useState(false);
  const prevPlansRef = useRef(null);
  const suppressDirtyRef = useRef(false);
  useEffect(() => {
    // Skip initial render
    if (prevPlansRef.current === null) {
      prevPlansRef.current = semesterPlans;
      return;
    }
    if (prevPlansRef.current !== semesterPlans) {
      if (suppressDirtyRef.current) {
        suppressDirtyRef.current = false;
      } else {
        setPlannerDirty(true);
      }
      prevPlansRef.current = semesterPlans;
    }
  }, [semesterPlans]);

  const handleSavePlan = async () => {
    await savePlanToStorage();
    setPlannerDirty(false);
    showToast('Plan saved successfully!', 'success');
  };

  const clearTermHighlight = () => {
    const prev = dragOverTermLabelRef.current;
    if (prev) {
      const el = document.querySelector(`[data-term-label="${CSS.escape(prev)}"]`);
      if (el) {
        el.style.borderColor = '';
        el.style.boxShadow = '';
      }
      dragOverTermLabelRef.current = null;
    }
  };

  const highlightTerm = (termLabel) => {
    if (dragOverTermLabelRef.current === termLabel) return;
    clearTermHighlight();
    const el = document.querySelector(`[data-term-label="${CSS.escape(termLabel)}"]`);
    if (el) {
      el.style.borderColor = '#500000';
      el.style.boxShadow = '0 0 0 2px rgba(80, 0, 0, 0.3)';
    }
    dragOverTermLabelRef.current = termLabel;
  };

  const handleReviewDragOver = (event) => {
    const container = reviewScrollRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const edge = 60;
    const scrollSpeed = 18;
    if (event.clientY < rect.top + edge) {
      container.scrollTop -= scrollSpeed;
    } else if (event.clientY > rect.bottom - edge) {
      container.scrollTop += scrollSpeed;
    }
  };

  const parseReviewDragPayload = (event) => {
    if (!event?.dataTransfer) return null;
    const json = event.dataTransfer.getData('application/json');
    if (json) {
      try {
        const parsed = JSON.parse(json);
        if (parsed?.code && parsed?.fromTermLabel) return parsed;
      } catch (err) {
        // Ignore malformed payloads.
      }
    }
    const text = event.dataTransfer.getData('text/plain');
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (parsed?.code && parsed?.fromTermLabel) return parsed;
      } catch (err) {
        // Fallback for older payloads that stored only the code.
        if (draggedReviewCourseRef.current?.fromTermLabel) {
          return { code: text, fromTermLabel: draggedReviewCourseRef.current.fromTermLabel };
        }
      }
    }
    return null;
  };

  const handleTermDragOver = (termLabel, event) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    highlightTerm(termLabel);
  };

  const handleTermDragEnter = (termLabel, event) => {
    event.preventDefault();
    highlightTerm(termLabel);
  };

  const handleTermDragLeave = (termLabel, event) => {
    if (!event.currentTarget?.contains(event.relatedTarget)) {
      if (dragOverTermLabelRef.current === termLabel) {
        clearTermHighlight();
      }
    }
  };

  const handleTermDrop = (termLabel, event) => {
    event.preventDefault();
    event.stopPropagation();
    const payload = parseReviewDragPayload(event) || draggedReviewCourseRef.current;
    const courseCode = payload?.code;
    const fromTermLabel = payload?.fromTermLabel;
    clearTermHighlight();
    draggedReviewCourseRef.current = null;
    if (!courseCode || !fromTermLabel) return;
    moveReviewedCourse(courseCode, fromTermLabel, termLabel);
  };

  const handleCourseDragStart = (course, termLabel, event) => {
    const payload = { code: course.code, fromTermLabel: termLabel };
    draggedReviewCourseRef.current = payload;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/json', JSON.stringify(payload));
      event.dataTransfer.setData('text/plain', JSON.stringify(payload));
    }
    // Visual feedback: make the dragged card semi-transparent
    event.currentTarget.style.opacity = '0.6';
  };

  useEffect(() => {
    if (!reviewContextMenu.open) return undefined;
    const handleClose = () => {
      setReviewContextMenu((prev) => ({ ...prev, open: false }));
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setReviewContextMenu((prev) => ({ ...prev, open: false }));
      }
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('keydown', handleKey);
    };
  }, [reviewContextMenu.open]);


  const handleTranscriptPdf = async (file) => {
    if (!file) return;
    setTranscriptPdfName(file.name);
    setTranscriptError('');
    setTranscriptLoading(true);

    const endpoint = `${API_BASE}/storage/parse-transcript`;
    setTranscriptLoadingMessage('Uploading transcript…');

    try {
      const dataBase64 = await fileToBase64(file);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, dataBase64 })
      });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.terms)) {
        setTranscriptError(result?.error || 'Unable to parse this transcript.');
        return;
      }
      if (result.terms.length === 0) {
        setTranscriptError('No terms detected. Please try a different transcript file.');
        return;
      }
      if (result.studentName) {
        updateDisplayStudentName(result.studentName);
      }
      const sanitizedTerms = sanitizeTranscriptTermsForDisplay(result.terms);
      setTranscriptTerms(sanitizedTerms);
      setTranscriptTotals(result.totals ?? null);
      setReviewTerms(sanitizedTerms);
      setReviewTotals(result.totals ?? null);
      setIsTranscriptDirty(false);
      setShowTranscriptReview(false);
    } catch (err) {
      setTranscriptError('Unable to parse this PDF. Please try a different transcript file.');
    } finally {
      setTranscriptLoading(false);
      setTranscriptLoadingMessage('');
    }
  };

  const queueTranscriptUpload = useCallback(
    (file) => {
      if (!file) return;
      const name = String(file.name || '').toLowerCase();
      const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
      if (!isPdf) {
        setTranscriptError('Please upload a PDF transcript file.');
        showToast('Please select a PDF file.', 'error');
        return;
      }
      setConsentPendingFile(file);
    },
    [showToast]
  );

  const normalizeCode = (code) => code?.replace(/\s+/g, ' ').trim().toUpperCase();
  const formatPlannerActionLabel = (action) =>
    `${action.type === 'add' ? 'Add' : 'Remove'} ${action.courseCode} ${
      action.type === 'add' ? 'to' : 'from'
    } ${action.term}`;
  const parsePlannerActionsFromResponse = (rawText) => {
    if (!rawText || typeof rawText !== 'string') {
      return { cleanText: '', actions: [] };
    }
    const match = rawText.match(CHAT_ACTION_BLOCK_REGEX);
    if (!match) {
      return { cleanText: rawText.trim(), actions: [] };
    }

    let payload = null;
    try {
      payload = JSON.parse((match[1] || '').trim());
    } catch {
      payload = null;
    }

    let rawActions = [];
    if (Array.isArray(payload?.actions)) {
      rawActions = payload.actions;
    } else if (payload && typeof payload === 'object' && payload.type) {
      rawActions = [payload];
    }

    const actions = rawActions
      .map((item) => {
        const type = String(item?.type || item?.action || '').trim().toLowerCase();
        const courseCode = normalizeCode(item?.courseCode || item?.course || item?.code || '');
        const term = String(item?.term || item?.semester || item?.termLabel || '').trim();
        const reason = String(item?.reason || '').trim();
        if ((type !== 'add' && type !== 'remove') || !courseCode || !term) return null;
        return { type, courseCode, term, reason };
      })
      .filter(Boolean);

    const index = match.index ?? 0;
    const cleanText = `${rawText.slice(0, index)}${rawText.slice(index + match[0].length)}`
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return {
      cleanText: cleanText || rawText.replace(match[0], '').trim(),
      actions
    };
  };
  const parsePlannerActionFromUserMessage = (rawText) => {
    if (!rawText || typeof rawText !== 'string') return [];

    const text = rawText.trim();
    const addIdx = text.search(/\b(add|include|insert|schedule|plan)\b/i);
    const removeIdx = text.search(/\b(remove|delete|drop|take\s+out)\b/i);
    let type = '';
    if (addIdx >= 0 && removeIdx >= 0) {
      type = addIdx < removeIdx ? 'add' : 'remove';
    } else if (addIdx >= 0) {
      type = 'add';
    } else if (removeIdx >= 0) {
      type = 'remove';
    }
    if (!type) return [];

    const courseMatch = text.match(COURSE_REGEX);
    const termMatch = text.match(TERM_REGEX);
    if (!courseMatch || !termMatch) return [];

    const courseCode = normalizeCode(`${courseMatch[1]} ${courseMatch[2]}`);
    const season = termMatch[1];
    const year = termMatch[2];
    const term = `${season.charAt(0).toUpperCase()}${season.slice(1).toLowerCase()} ${year}`;
    if (!courseCode || !term) return [];

    return [
      {
        type,
        courseCode,
        term,
        reason: 'Requested in chat'
      }
    ];
  };

  const sendChatMessage = async (userMessage) => {
    if (!userMessage.trim()) return;
    if (pendingChatActions) {
      showToast('Please confirm or cancel the pending planner action first.', 'info');
      return;
    }
    
    const userMsg = { id: `user-${Date.now()}`, role: 'user', text: userMessage };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const contextParts = [];
      
      contextParts.push('STUDENT PROFILE:');
      contextParts.push(`- Texas A&M University Computer Science student`);
      contextParts.push(`- Major: Computer Science`);
      contextParts.push(`- Selected Emphasis: ${selectedEmphasis || 'Undecided'}`);
      contextParts.push(`- Selected Minor: ${selectedMinor || 'None'}`);
      contextParts.push(`- Planner terms available for edits: ${semesterOrder.join(', ')}`);
      
      const transcriptCoursesForChat = transcriptTerms.flatMap((term) =>
        (term.courses || [])
          .filter((course) => normalizeCode(course.code) && !isExcludedTranscriptGrade(course?.grade))
          .map((course) => {
            const code = normalizeCode(course.code);
            const catalogMeta = COURSES[code] || {};
            const grade = normalizeGrade(course.grade);
            const transfer = Boolean(course.transfer || isTransferGrade(grade));
            const inProgress = isCourseMarkedInProgress({ grade, transfer, termStatus: term.status });
            return {
              code,
              title: course.title || catalogMeta.title || '',
              grade: grade || 'N/A',
              credits: sanitizeCredits(course.credits ?? catalogMeta.credits ?? 0),
              transfer,
              status: inProgress ? 'in-progress' : 'completed',
              termLabel: term.label || 'Unknown Term',
              termStatus: term.status || ''
            };
          })
      );

      if (transcriptCoursesForChat.length > 0) {
        const completedCourses = transcriptCoursesForChat.filter((course) => course.status === 'completed');
        const inProgressCourses = transcriptCoursesForChat.filter((course) => course.status === 'in-progress');
        const transferCourses = transcriptCoursesForChat.filter((course) => course.transfer);

        contextParts.push('\nTRANSCRIPT DATA:');
        contextParts.push(`- Current GPA: ${transcriptGpa ?? 'N/A'}`);
        contextParts.push(`- Credits Completed: ${transcriptCreditsSummary.completedCredits}`);
        contextParts.push(`- Credits In Progress: ${transcriptCreditsSummary.inProgressCredits}`);
        contextParts.push(
          `- Transfer Credits: ${
            transferCourses.length > 0
              ? transferCourses.map((course) => `${course.code} (${course.termLabel})`).join(', ')
              : 'None'
          }`
        );
        contextParts.push(`- Classification: ${classification}`);
        
        if (completedCourses.length > 0) {
          contextParts.push('\nCOMPLETED COURSES:');
          completedCourses.forEach((course) => {
            contextParts.push(
              `- ${course.code} (${course.termLabel}): ${course.title} (${course.grade}, ${course.credits} credits${
                course.transfer ? ', transfer' : ''
              })`
            );
          });
        }
        
        if (inProgressCourses.length > 0) {
          contextParts.push('\nIN PROGRESS COURSES:');
          inProgressCourses.forEach((course) => {
            contextParts.push(
              `- ${course.code} (${course.termLabel}): ${course.title} (${course.credits} credits${
                course.transfer ? ', transfer' : ''
              })`
            );
          });
        }
      }
      
      const allPlannedCourses = Object.entries(semesterPlans)
        .map(([semester, courses]) => [
          semester,
          Array.from(new Set((courses || []).map((code) => normalizeCode(code)).filter(Boolean)))
        ])
        .filter(([, courses]) => courses.length > 0);
      if (allPlannedCourses.length > 0) {
        contextParts.push('\nPLANNED COURSES:');
        allPlannedCourses.forEach(([semester, courses]) => {
          contextParts.push(`\n${semester}:`);
          courses.forEach((code) => {
            const course = COURSES[code] || {};
            const fromTranscript = transcriptCoursesForChat.find((item) => item.code === code);
            const title = course.title || fromTranscript?.title || 'Title unavailable';
            const courseCredits = Number(course.credits);
            const credits = Number.isFinite(courseCredits)
              ? courseCredits
              : sanitizeCredits(fromTranscript?.credits || 0);
            contextParts.push(`  - ${code}: ${title} (${credits} credits)`);
          });
        });
      }

      const appendEvaluationContext = (label, result) => {
        if (!result) {
          contextParts.push(`- ${label}: Not generated yet.`);
          return;
        }
        const requirementName = result.requirementSet?.name || label;
        const catalogYear = result.requirementSet?.catalog_year;
        const groups = Array.isArray(result.groups) ? result.groups : [];
        const satisfiedCount = groups.filter((group) => group?.satisfied).length;
        contextParts.push(`- ${label}: ${requirementName}${catalogYear ? ` (${catalogYear})` : ''}`);
        contextParts.push(`  Group Status: ${satisfiedCount}/${groups.length} satisfied`);
        groups.forEach((group) => {
          if (!group?.name) return;
          const earnedCredits = Number(group.earnedCredits) || 0;
          const requiredCreditsRaw = Number(group.requiredCredits);
          const requiredCredits =
            Number.isFinite(requiredCreditsRaw) && requiredCreditsRaw > 0
              ? requiredCreditsRaw
              : null;
          const remainingCredits = requiredCredits
            ? Math.max(requiredCredits - earnedCredits, 0)
            : null;
          const missing = (Array.isArray(group.missing) ? group.missing : [])
            .filter(Boolean)
            .map((item) => {
              if (!requiredCredits || remainingCredits === null) return String(item);
              const normalized = String(item).trim();
              if (/^Need\s+\d+(\.\d+)?\s+credits\s+from\s+/i.test(normalized)) {
                return normalized.replace(
                  /^Need\s+\d+(\.\d+)?\s+credits/i,
                  `Need ${remainingCredits} more credits`
                );
              }
              return normalized;
            });
          const groupSummary = requiredCredits
            ? `${group.name}: ${earnedCredits}/${requiredCredits} credits`
            : `${group.name}: ${group.satisfied ? 'Satisfied' : 'Not satisfied'}`;
          contextParts.push(`  - ${groupSummary}`);
          if (!group.satisfied && missing.length > 0) {
            contextParts.push(`    Missing: ${missing.join('; ')}`);
          }
        });
      };

      contextParts.push('\nDEGREE EVALUATION SNAPSHOT:');
      if (reqError) {
        contextParts.push(`- Unable to load evaluation results: ${reqError}`);
      }
      if (reqWarning) {
        contextParts.push(`- Planner evaluation warning: ${reqWarning}`);
      }
      appendEvaluationContext('Degree evaluation', degreeResult);
      appendEvaluationContext('Emphasis evaluation', requirementsResult);
      appendEvaluationContext('Minor evaluation', minorResult);
      
      contextParts.push('\nDEGREE REQUIREMENTS:');
      contextParts.push(`- Total Required: 126 credits`);
      contextParts.push(
        `- Completed + In Progress + Planned: ${
          transcriptCreditsSummary.completedCredits +
          transcriptCreditsSummary.inProgressCredits +
          plannedCreditsSummary.plannedCredits
        } credits`
      );
      contextParts.push(
        `- Remaining: ${Math.max(
          126 -
            (transcriptCreditsSummary.completedCredits +
              transcriptCreditsSummary.inProgressCredits +
              plannedCreditsSummary.plannedCredits),
          0
        )} credits`
      );
      
      const systemMessage = {
        role: 'system',
        content: `You are DegreeFlow Assistant, an AI advisor for Texas A&M University Computer Science students. 

IMPORTANT INSTRUCTIONS:
1. You have access to the internet and can search for current Texas A&M course catalog information, prerequisites, and degree requirements.
2. When asked about specific courses, look up the official TAMU course catalog for accurate information.
3. Use the student's current transcript and planner data (provided below) to give personalized advice.
4. Help with course planning, prerequisite checking, graduation requirements, and academic guidance.
4.1. Prioritize the "DEGREE EVALUATION SNAPSHOT" to identify missing requirement groups and recommend next courses.
4.2. Do not suggest courses already completed or currently in progress unless explicitly asked for alternatives/retakes.
4.3. For credit-based requirement groups, compute missing credits as (required - earned). Never interpret earned credits as remaining credits.
4.4. If the user explicitly asks to add/remove planned courses, append a machine-readable action block at the end using this exact format:
[DEGREEFLOW_ACTIONS]
{"actions":[{"type":"add|remove","courseCode":"SUBJ 123","term":"Fall 2026","reason":"optional short reason"}]}
[/DEGREEFLOW_ACTIONS]
4.5. Only include actions the user asked for, and only use term labels from "Planner terms available for edits".
4.6. For direct commands like "add/remove COURSE_CODE to/from TERM", always include the action block; do not refuse for ambiguity.
5. Format your responses with clear structure:
   - Use **bold** for emphasis (e.g., **Important:** or **Course Name**)
   - Use bullet points (•) or numbered lists for multiple items
   - Use line breaks to separate sections
   - Keep paragraphs short and scannable
6. If you're unsure about something specific to TAMU CS, search for it online before responding.

STUDENT CONTEXT:
${contextParts.join('\n')}

Now answer the student's question based on this context and any additional information you can find online about TAMU CS courses and requirements.`
      };

      const conversationMessages = chatMessages
        .slice(-8)
        .map(msg => ({ role: msg.role, content: msg.text }));
      
      const apiMessages = [
        systemMessage,
        ...conversationMessages,
        { role: 'user', content: userMessage }
      ];

      const response = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          model: 'protected.gemini-2.0-flash-lite',
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get response from AI');
      }

      const data = await response.json();
      const assistantText = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
      const { cleanText, actions } = parsePlannerActionsFromResponse(assistantText);
      const fallbackActions =
        actions.length > 0 ? actions : parsePlannerActionFromUserMessage(userMessage);
      const usedFallback = actions.length === 0 && fallbackActions.length > 0;
      
      let assistantReplyText = '';
      if (usedFallback) {
        assistantReplyText =
          'I prepared that planner change from your request. Please review and confirm below before I apply it.';
      } else if (cleanText) {
        assistantReplyText = cleanText;
      } else if (fallbackActions.length > 0) {
        assistantReplyText =
          'I prepared planner changes. Please review and confirm below before I apply them.';
      } else {
        assistantReplyText = assistantText;
      }

      const assistantMsg = { 
        id: `assistant-${Date.now()}`, 
        role: 'assistant', 
        text: assistantReplyText
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
      if (fallbackActions.length > 0) {
        setPendingChatActions({
          actions: fallbackActions,
          createdAt: Date.now()
        });
      }
    } catch (err) {
      console.error('[chat] Error:', err);
      const errorMsg = { 
        id: `error-${Date.now()}`, 
        role: 'assistant', 
        text: 'Sorry, I encountered an error. Please try again.' 
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const addCourseToSemester = (courseCode, semester) => {
    const normalized = normalizeCode(courseCode);
    if (!normalized) return;
    if (isCourseCompleted(normalized)) {
      setPlanError(`${normalized} has already been taken.`);
      return;
    }
    if (isCourseInProgress(normalized)) {
      setPlanError(`${normalized} is currently in progress.`);
      return;
    }
    if (isCourseSelectedInOtherSemester(normalized, semester)) {
      setPlanError(`${normalized} is already selected in another term.`);
      return;
    }
    // Block adding a course if an equivalent has already been taken or planned
    const equivalents = getEquivalents(normalized);
    for (const eq of equivalents) {
      if (isCourseCompleted(eq)) {
        setPlanError(`${normalized} is equivalent to ${eq}, which has already been taken.`);
        return;
      }
      if (isCourseInProgress(eq)) {
        setPlanError(`${normalized} is equivalent to ${eq}, which is currently in progress.`);
        return;
      }
      if (isCoursePlanned(eq)) {
        setPlanError(`${normalized} is equivalent to ${eq}, which is already planned.`);
        return;
      }
    }
    setSemesterPlans((prev) => ({
      ...prev,
      [semester]: [...(prev[semester] || []), normalized]
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

  const confirmPendingChatActions = () => {
    if (!pendingChatActions?.actions?.length) return;

    const actionsToApply = pendingChatActions.actions;
    const applied = [];
    const rejected = [];

    setSemesterPlans((prev) => {
      const next = {};
      Object.entries(prev).forEach(([term, codes]) => {
        next[term] = [...(codes || [])];
      });

      actionsToApply.forEach((action) => {
        const code = normalizeCode(action.courseCode);
        const term = String(action.term || '').trim();
        const type = action.type;

        if (!code || !term || (type !== 'add' && type !== 'remove')) {
          rejected.push(`${formatPlannerActionLabel(action)}: invalid action format`);
          return;
        }
        if (!Object.prototype.hasOwnProperty.call(next, term)) {
          rejected.push(`${formatPlannerActionLabel(action)}: invalid term`);
          return;
        }

        if (type === 'add') {
          if (!COURSES[code]) {
            rejected.push(`${formatPlannerActionLabel(action)}: course not found in catalog`);
            return;
          }
          if (isCourseCompleted(code)) {
            rejected.push(`${formatPlannerActionLabel(action)}: already completed`);
            return;
          }
          if (isCourseInProgress(code)) {
            rejected.push(`${formatPlannerActionLabel(action)}: currently in progress`);
            return;
          }
          if ((next[term] || []).includes(code)) {
            rejected.push(`${formatPlannerActionLabel(action)}: already in ${term}`);
            return;
          }
          const inOtherTerm = Object.entries(next).some(([otherTerm, codes]) => {
            if (otherTerm === term) return false;
            return (codes || []).includes(code);
          });
          if (inOtherTerm) {
            rejected.push(`${formatPlannerActionLabel(action)}: already planned in another term`);
            return;
          }
          next[term] = [...(next[term] || []), code];
          applied.push(`${formatPlannerActionLabel(action)}`);
          return;
        }

        if (!(next[term] || []).includes(code)) {
          rejected.push(`${formatPlannerActionLabel(action)}: not found in ${term}`);
          return;
        }
        next[term] = (next[term] || []).filter((item) => item !== code);
        applied.push(`${formatPlannerActionLabel(action)}`);
      });

      return next;
    });

    setPendingChatActions(null);

    if (applied.length > 0) {
      showToast(`Applied ${applied.length} planner action${applied.length > 1 ? 's' : ''}.`, 'success');
      setPlanError('');
    } else {
      showToast('No planner actions were applied.', 'info');
    }

    const summary = [];
    if (applied.length > 0) {
      summary.push('Planner changes applied:');
      applied.forEach((line) => summary.push(`- ${line}`));
    }
    if (rejected.length > 0) {
      summary.push('Planner changes not applied:');
      rejected.forEach((line) => summary.push(`- ${line}`));
    }
    if (summary.length > 0) {
      setChatMessages((prev) => [
        ...prev,
        { id: `assistant-action-result-${Date.now()}`, role: 'assistant', text: summary.join('\n') }
      ]);
    }
  };

  const cancelPendingChatActions = () => {
    if (!pendingChatActions?.actions?.length) return;
    const count = pendingChatActions.actions.length;
    setPendingChatActions(null);
    showToast('Cancelled planner action request.', 'info');
    setChatMessages((prev) => [
      ...prev,
      {
        id: `assistant-action-cancel-${Date.now()}`,
        role: 'assistant',
        text: `Cancelled ${count} pending planner action${count > 1 ? 's' : ''}.`
      }
    ]);
  };

  const validateSemester = (semester) => {
    const courses = semesterPlans[semester] || [];
    const warnings = [];
    const errors = [];

    let totalCredits = 0;
    let totalDifficulty = 0;

    courses.forEach((code) => {
      const course = COURSES[code];
      if (!course) return;
      totalCredits += course.credits ?? 0;
      totalDifficulty += course.difficulty ?? 0;

      if (isCourseCompleted(code) || isCourseInProgress(code) || isCoursePlannedInEarlierSemester(code, semester)) {
        errors.push(`${code} has already been taken or planned in a prior semester`);
      }

      (course.prereqs || []).forEach((prereq) => {
        if (isPrereqSatisfiedForSemester(prereq, semester)) return;
        if (isCoursePlanned(prereq)) {
          warnings.push(`${code}: prerequisite ${prereq} is planned but not in an earlier semester`);
        } else {
          errors.push(`${code} requires ${prereq} (not completed or planned)`);
        }
      });

      // Warn about equivalent courses already completed/planned
      const equivalents = getEquivalents(code);
      equivalents.forEach((eq) => {
        if (isCourseCompleted(eq) || isCourseInProgress(eq)) {
          warnings.push(`${code} is equivalent to ${eq} (already on transcript) — will not count separately`);
        } else if (isCoursePlanned(eq) && eq !== code) {
          warnings.push(`${code} is equivalent to ${eq} (also planned) — only one will count`);
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
    const q = (searchQuery || '').toLowerCase();
    if (q.length === 0) return [];
    return Object.entries(COURSES).filter(([code, course]) => {
      const title = (course.title || '').toLowerCase();
      const status = course.status || 'available';
      const matchesSearch = code.toLowerCase().includes(q) || title.includes(q);
      return matchesSearch && (status === 'available' || status === 'locked');
    });
  }, [searchQuery, COURSES]);

  const AreasEvaluation = ({ areas, transcriptCourseList, semesterPlans }) => {
    const [expandedAreas, setExpandedAreas] = useState(() => new Set(areas.map((a) => a.id)));
    const allExpanded = expandedAreas.size === areas.length && areas.length > 0;

    // Green: Taken/Registered = anything in transcript (including IP)
    const takenOrRegistered = useMemo(() => {
      const set = new Set();
      transcriptCourseList.forEach((c) => {
        if (!c?.code) return;
        set.add(c.code);
      });
      return set;
    }, [transcriptCourseList]);

    // Yellow: Planned = in semesterPlans but not already taken/registered
    const plannedSet = useMemo(() => {
      const set = new Set();
      Object.values(semesterPlans || {}).forEach((list) => {
        (list || []).forEach((code) => {
          if (!code) return;
          if (takenOrRegistered.has(code)) return;
          set.add(code);
        });
      });
      return set;
    }, [semesterPlans, takenOrRegistered]);

    const getCreditsFor = (code) => {
      const fromCatalog = Number(COURSES[code]?.credits);
      if (!Number.isNaN(fromCatalog) && fromCatalog > 0) return fromCatalog;

      const fromTranscript = transcriptCourseList.find((c) => c.code === code);
      const tc = Number(fromTranscript?.credits);
      if (!Number.isNaN(tc) && tc > 0) return tc;

      return 0;
    };

    const getTitleFor = (code) => COURSES[code]?.title || 'Course';

    const areaSummaries = useMemo(() => {
      return areas.map((area) => {
        const required = Number(area.requiredCredits) || 0;
        const eligible = Array.isArray(area.courses) ? area.courses : [];

        const takenCourses = eligible.filter((c) => takenOrRegistered.has(c));
        const plannedCourses = eligible.filter((c) => plannedSet.has(c));

        const takenCredits = takenCourses.reduce((sum, c) => sum + getCreditsFor(c), 0);
        const plannedCredits = plannedCourses.reduce((sum, c) => sum + getCreditsFor(c), 0);

        // Cap display so bar never exceeds required credits
        const displayGreen = Math.min(takenCredits, required);
        const remainingAfterGreen = Math.max(required - displayGreen, 0);
        const displayYellow = Math.min(plannedCredits, remainingAfterGreen);
        const displayRed = Math.max(required - displayGreen - displayYellow, 0);

        // Pick a small set of missing courses to show (until it covers missing credits)
        const missingCoursesAll = eligible.filter(
          (c) => !takenOrRegistered.has(c) && !plannedSet.has(c)
        );
        const missingPick = [];
        let picked = 0;
        for (const c of missingCoursesAll) {
          if (picked >= displayRed) break;
          missingPick.push(c);
          picked += getCreditsFor(c);
        }

        return {
          ...area,
          required,
          takenCourses,
          plannedCourses,
          missingCourses: missingPick,
          takenCredits,
          plannedCredits,
          displayGreen,
          displayYellow,
          displayRed,
          isMet: displayRed <= 0.00001
        };
      });
    }, [areas, takenOrRegistered, plannedSet, transcriptCourseList]);

    const toggleArea = (id) => {
      setExpandedAreas((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    const toggleExpandAll = () => {
      setExpandedAreas(() => {
        if (allExpanded) return new Set();
        return new Set(areas.map((a) => a.id));
      });
    };

    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold" style={{ color: '#500000' }}>
            Areas
          </h3>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="inline-block w-4 h-4 rounded" style={{ backgroundColor: '#2f9e44' }} />
                <span className="text-gray-700">Taken/Registered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-4 h-4 rounded" style={{ backgroundColor: '#f2c94c' }} />
                <span className="text-gray-700">Planned</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-4 h-4 rounded" style={{ backgroundColor: '#eb5757' }} />
                <span className="text-gray-700">Not Satisfied</span>
              </div>
            </div>

            <button
              onClick={toggleExpandAll}
              className="px-4 py-2 text-sm font-semibold text-white rounded shadow"
              style={{ backgroundColor: '#6b6b6b' }}
              type="button"
            >
              {allExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {areaSummaries.map((area) => {
            const expanded = expandedAreas.has(area.id);
            const pct = (v) => (area.required > 0 ? `${(v / area.required) * 100}%` : '0%');

            return (
              <div key={area.id} className="border rounded-lg" style={{ borderColor: '#2f9e44' }}>
                <button
                  type="button"
                  onClick={() => toggleArea(area.id)}
                  className="w-full flex items-center justify-between gap-4 p-4 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0">
                      {area.isMet ? (
                        <CheckCircle className="w-7 h-7 text-green-600" />
                      ) : (
                        <AlertTriangle className="w-7 h-7 text-red-600" />
                      )}
                    </div>

                    <div className="text-left min-w-0">
                      <div className="font-semibold text-gray-900 truncate">
                        {area.name} ({area.required}) {area.isMet ? 'Met' : 'Not Met'}
                      </div>
                      <div className="text-xs text-gray-600">
                        {Math.min(area.takenCredits + area.plannedCredits, area.required)}/{area.required}{' '}
                        credits accounted for
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-1 justify-end">
                    <div className="w-full max-w-xl">
                      <div className="h-10 rounded overflow-hidden flex bg-gray-100 border border-gray-200">
                        {area.displayGreen > 0 && (
                          <div
                            className="h-full flex items-center justify-center text-white font-semibold"
                            style={{ width: pct(area.displayGreen), backgroundColor: '#2f9e44' }}
                          >
                            {Math.round(area.displayGreen)}
                          </div>
                        )}
                        {area.displayYellow > 0 && (
                          <div
                            className="h-full flex items-center justify-center text-gray-900 font-semibold"
                            style={{ width: pct(area.displayYellow), backgroundColor: '#f2c94c' }}
                          >
                            {Math.round(area.displayYellow)}
                          </div>
                        )}
                        {area.displayRed > 0 && (
                          <div
                            className="h-full flex items-center justify-center text-white font-semibold"
                            style={{ width: pct(area.displayRed), backgroundColor: '#eb5757' }}
                          >
                            {Math.round(area.displayRed)}
                          </div>
                        )}
                        {area.displayGreen === 0 && area.displayYellow === 0 && area.displayRed === 0 && (
                          <div className="h-full flex items-center justify-center text-gray-600 w-full">—</div>
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      <ChevronDown
                        className="w-7 h-7 text-gray-600 transition-transform duration-200"
                        style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      />
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="px-6 pb-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <div className="text-sm font-semibold text-gray-900 mb-2">Taken/Registered</div>
                        {area.takenCourses.length === 0 ? (
                          <div className="text-sm text-gray-600">None</div>
                        ) : (
                          <ul className="space-y-1 text-sm">
                            {area.takenCourses.map((code) => (
                              <li key={code} className="flex items-start gap-2">
                                <span className="mt-1 inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#2f9e44' }} />
                                <span className="text-gray-900">
                                  {code} <span className="text-gray-500">— {getTitleFor(code)}</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-gray-900 mb-2">Planned</div>
                        {area.plannedCourses.length === 0 ? (
                          <div className="text-sm text-gray-600">None</div>
                        ) : (
                          <ul className="space-y-1 text-sm">
                            {area.plannedCourses.map((code) => (
                              <li key={code} className="flex items-start gap-2">
                                <span className="mt-1 inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f2c94c' }} />
                                <span className="text-gray-900">
                                  {code} <span className="text-gray-500">— {getTitleFor(code)}</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-gray-900 mb-2">Not Satisfied</div>
                        {area.displayRed <= 0.00001 ? (
                          <div className="text-sm text-gray-600">Satisfied</div>
                        ) : area.missingCourses.length === 0 ? (
                          <div className="text-sm text-gray-600">
                            Need {Math.round(area.displayRed)} more credits (no course list configured)
                          </div>
                        ) : (
                          <ul className="space-y-1 text-sm">
                            {area.missingCourses.map((code) => (
                              <li key={code} className="flex items-start gap-2">
                                <span className="mt-1 inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#eb5757' }} />
                                <span className="text-gray-900">
                                  {code} <span className="text-gray-500">— {getTitleFor(code)}</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const DashboardTab = () => {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{displayStudentName || 'Student'}</h2>
              <p className="text-gray-600">Computer Science • GPA: {transcriptGpa || '—'}</p>
            </div>
            <div className="flex gap-3">
              <div>
                <label className="text-sm text-gray-700">Emphasis</label>
                <select
                  className="mt-1 w-48 rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                  value={selectedEmphasis}
                  onChange={(e) => setSelectedEmphasis(e.target.value)}
                >
                  {emphasisOptions.map((option) => (
                    <option key={option || 'blank'} value={option}>
                      {option || '—'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-700">Minor</label>
                <select
                  className="mt-1 w-48 rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                  value={selectedMinor}
                  onChange={(e) => setSelectedMinor(e.target.value)}
                >
                  {minorOptions.map((option) => (
                    <option key={option || 'blank'} value={option}>
                      {option || '—'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasHsLanguage}
                onChange={(e) => setHasHsLanguage(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#500000] focus:ring-[#500000]/30 cursor-pointer"
              />
              <span className="text-sm text-gray-700">Completed 2 years of same foreign language in HS</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasSabrCourse}
                onChange={(e) => setHasSabrCourse(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#500000] focus:ring-[#500000]/30 cursor-pointer"
              />
              <span className="text-sm text-gray-700">Completed a Study Abroad (SABR) course</span>
            </label>
          </div>
          <div className="flex gap-4 text-sm text-gray-700">
            <span>Completed: {transcriptCreditsSummary.completedCredits}</span>
            <span>In Progress: {transcriptCreditsSummary.inProgressCredits}</span>
            <span>Planned: {plannedCreditsSummary.plannedCredits}</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Requirements Check</h3>
              <p className="text-sm text-gray-600">Generate an evaluation to check your degree progress.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={evaluateRequirementsLocal}
                disabled={reqLoading || coursesIndex.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded border border-[#500000] text-[#500000] bg-white hover:bg-[#500000]/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {reqLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {reqLoading ? 'Generating…' : 'Generate'}
              </button>
              {degreeResult && (
                <button
                  onClick={saveEvaluationToStorage}
                  disabled={evalSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {evalSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {evalSaving ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>
          </div>
          {reqError && <p className="text-sm text-red-600 mb-2">{reqError}</p>}
          {reqWarning && !reqError && <p className="text-sm text-amber-700 mb-2">{reqWarning}</p>}
          {degreeResult ? (() => {
            const allGroups = degreeResult.groups || [];
            const satisfiedGroups = allGroups.filter((g) => g.satisfied);
            const unsatisfiedGroups = allGroups.filter((g) => !g.satisfied);
            const totalSatisfied = satisfiedGroups.length;
            const totalGroups = allGroups.length;
            const pctDone = totalGroups > 0 ? Math.round((totalSatisfied / totalGroups) * 100) : 0;

            const renderGroup = (group) => {
              const earned = group.earnedCredits || 0;
              const required = group.requiredCredits || 0;
              const pct = required > 0 ? Math.min(Math.round((earned / required) * 100), 100) : (group.satisfied ? 100 : 0);
              const exceeded = required > 0 && earned > required;
              const extraCredits = exceeded ? earned - required : 0;
              const ariaLabel = required > 0
                ? `${earned} of ${required} credits completed${exceeded ? `, ${extraCredits} extra` : ''}`
                : (group.satisfied ? 'Satisfied' : 'Not satisfied');
              const hasOverflow = group.overflowCourses?.length > 0;
              const hasDetails = (group.missing?.length > 0) || (group.usedCourses?.length > 0) || hasOverflow;

              return (
                <details key={group.name} className="rounded border border-gray-200 group">
                  <summary className="cursor-pointer select-none px-3 py-2 hover:bg-gray-50 transition-colors rounded list-none">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronDown className="w-4 h-4 text-gray-400 details-chevron flex-shrink-0" />
                        <p className="text-sm font-semibold text-gray-900 truncate">{group.name}</p>
                      </div>
                      {group.satisfied ? (
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="ml-6">
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-600">
                          Earned {earned}{required ? ` / ${required} credits` : ''}
                        </p>
                        {exceeded && (
                          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            +{extraCredits} extra
                          </span>
                        )}
                        {group.satisfied && !exceeded && required > 0 && (
                          <span className="text-xs font-medium text-green-600">Completed</span>
                        )}
                      </div>
                      {required > 0 && (
                        <div
                          className={`mt-1.5 h-2 rounded-full overflow-hidden ${pct >= 100 ? 'bg-green-200' : 'bg-red-200'}`}
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={ariaLabel}
                          title={ariaLabel}
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: '#16a34a' }}
                          />
                        </div>
                      )}
                      {!required && (
                        <div
                          className="mt-1.5 h-2 rounded-full overflow-hidden"
                          role="progressbar"
                          aria-valuenow={group.satisfied ? 100 : 0}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={ariaLabel}
                          title={ariaLabel}
                          style={{ backgroundColor: group.satisfied ? '#bbf7d0' : '#fca5a5' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{ width: group.satisfied ? '100%' : '0%', backgroundColor: '#16a34a' }}
                          />
                        </div>
                      )}
                    </div>
                  </summary>
                  {hasDetails && (
                    <div className="px-3 pb-2 ml-6 border-t border-gray-100 mt-1 pt-2 space-y-1">
                      {group.usedCourses?.length > 0 && (
                        <p className="text-xs text-gray-500">Used: {group.usedCourses.join(', ')}</p>
                      )}
                      {hasOverflow && (
                        <p className="text-xs text-blue-600">Overflow: {group.overflowCourses.join(', ')}</p>
                      )}
                      {group.missing?.length > 0 && (
                        <p className="text-xs text-red-600">Missing: {group.missing.join(', ')}</p>
                      )}
                      {group.warnings?.length > 0 && group.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-amber-600">{w}</p>
                      ))}
                    </div>
                  )}
                </details>
              );
            };

            return (
              <div className="space-y-3 mb-4">
                <div className="text-sm text-gray-700">
                  <p className="font-semibold">
                    Degree: {degreeResult.requirementSet?.name || 'CSCE Degree'}
                  </p>
                  {degreeResult.requirementSet?.catalog_year && (
                    <p>Catalog year: {degreeResult.requirementSet.catalog_year}</p>
                  )}
                </div>

                {/* Progress summary bar */}
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      Degree Progress: {totalSatisfied}/{totalGroups} requirement groups satisfied
                    </span>
                    <span className="text-sm font-bold" style={{ color: pctDone === 100 ? '#16a34a' : '#500000' }}>
                      {pctDone}%
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pctDone}%`, backgroundColor: pctDone === 100 ? '#16a34a' : '#500000' }}
                    />
                  </div>
                </div>

                {/* Still Needed section */}
                {unsatisfiedGroups.length > 0 && (
                  <details open>
                    <summary className="cursor-pointer select-none flex items-center gap-2 text-sm font-semibold text-red-700 py-2 px-2 rounded hover:bg-red-50 transition-colors">
                      <ChevronDown className="w-4 h-4 details-chevron flex-shrink-0" />
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      Still Needed ({unsatisfiedGroups.length})
                    </summary>
                    <div className="space-y-2 mt-2">
                      {unsatisfiedGroups.map(renderGroup)}
                    </div>
                  </details>
                )}

                {/* Satisfied section */}
                {satisfiedGroups.length > 0 && (
                  <details open>
                    <summary className="cursor-pointer select-none flex items-center gap-2 text-sm font-semibold text-green-700 py-2 px-2 rounded hover:bg-green-50 transition-colors">
                      <ChevronDown className="w-4 h-4 details-chevron flex-shrink-0" />
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                      Completed / Satisfied ({satisfiedGroups.length})
                    </summary>
                    <div className="space-y-2 mt-2">
                      {satisfiedGroups.map(renderGroup)}
                    </div>
                  </details>
                )}

                {/* Work Not Applied section */}
                {degreeResult.workNotApplied?.length > 0 && (
                  <details>
                    <summary className="cursor-pointer select-none flex items-center gap-2 text-sm font-semibold text-blue-700 py-2 px-2 rounded hover:bg-blue-50 transition-colors">
                      <ChevronDown className="w-4 h-4 details-chevron flex-shrink-0" />
                      <Info className="w-4 h-4 flex-shrink-0" />
                      Work Not Applied ({degreeResult.workNotApplied.length} course{degreeResult.workNotApplied.length !== 1 ? 's' : ''})
                    </summary>
                    <div className="space-y-2 mt-2">
                      <p className="text-xs text-gray-500 ml-6">These courses are not currently being used to satisfy any degree requirement group.</p>
                      {degreeResult.workNotApplied.map((entry) => (
                        <div key={entry.code} className="rounded border border-blue-200 bg-blue-50/50 px-3 py-2 ml-6">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">{entry.code}</span>
                            <span className="text-xs text-gray-500">{entry.credits} credit{entry.credits !== 1 ? 's' : ''} · {entry.status}</span>
                          </div>
                          {entry.potentialGroups?.length > 0 && (
                            <p className="text-xs text-blue-700 mt-1">
                              Could apply to: {entry.potentialGroups.join(', ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })() : null}

          {requirementsResult ? (() => {
            const allGroups = requirementsResult.groups || [];
            const satisfiedGroups = allGroups.filter((g) => g.satisfied);
            const unsatisfiedGroups = allGroups.filter((g) => !g.satisfied);

            const renderGroup = (group) => {
              const earned = group.earnedCredits || 0;
              const required = group.requiredCredits || 0;
              const pct = required > 0 ? Math.min(Math.round((earned / required) * 100), 100) : (group.satisfied ? 100 : 0);
              const exceeded = required > 0 && earned > required;
              const extraCredits = exceeded ? earned - required : 0;
              const ariaLabel = required > 0
                ? `${earned} of ${required} credits completed${exceeded ? `, ${extraCredits} extra` : ''}`
                : (group.satisfied ? 'Satisfied' : 'Not satisfied');
              const hasOverflow = group.overflowCourses?.length > 0;
              const hasDetails = (group.missing?.length > 0) || (group.usedCourses?.length > 0) || hasOverflow;

              return (
                <details key={group.name} className="rounded border border-gray-200 group">
                  <summary className="cursor-pointer select-none px-3 py-2 hover:bg-gray-50 transition-colors rounded list-none">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronDown className="w-4 h-4 text-gray-400 details-chevron flex-shrink-0" />
                        <p className="text-sm font-semibold text-gray-900 truncate">{group.name}</p>
                      </div>
                      {group.satisfied ? (
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="ml-6">
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-600">
                          Earned {earned}{required ? ` / ${required} credits` : ''}
                        </p>
                        {exceeded && (
                          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            +{extraCredits} extra
                          </span>
                        )}
                        {group.satisfied && !exceeded && required > 0 && (
                          <span className="text-xs font-medium text-green-600">Completed</span>
                        )}
                      </div>
                      {required > 0 && (
                        <div
                          className={`mt-1.5 h-2 rounded-full overflow-hidden ${pct >= 100 ? 'bg-green-200' : 'bg-red-200'}`}
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={ariaLabel}
                          title={ariaLabel}
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: '#16a34a' }}
                          />
                        </div>
                      )}
                      {!required && (
                        <div
                          className="mt-1.5 h-2 rounded-full overflow-hidden"
                          role="progressbar"
                          aria-valuenow={group.satisfied ? 100 : 0}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={ariaLabel}
                          title={ariaLabel}
                          style={{ backgroundColor: group.satisfied ? '#bbf7d0' : '#fca5a5' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{ width: group.satisfied ? '100%' : '0%', backgroundColor: '#16a34a' }}
                          />
                        </div>
                      )}
                    </div>
                  </summary>
                  {hasDetails && (
                    <div className="px-3 pb-2 ml-6 border-t border-gray-100 mt-1 pt-2 space-y-1">
                      {group.usedCourses?.length > 0 && (
                        <p className="text-xs text-gray-500">Used: {group.usedCourses.join(', ')}</p>
                      )}
                      {hasOverflow && (
                        <p className="text-xs text-blue-600">Overflow: {group.overflowCourses.join(', ')}</p>
                      )}
                      {group.missing?.length > 0 && (
                        <p className="text-xs text-red-600">Missing: {group.missing.join(', ')}</p>
                      )}
                      {group.warnings?.length > 0 && group.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-amber-600">{w}</p>
                      ))}
                    </div>
                  )}
                </details>
              );
            };

            return (
              <div className="space-y-3">
                <div className="text-sm text-gray-700">
                  <p className="font-semibold">Set: {requirementsResult.requirementSet?.name}</p>
                  {requirementsResult.requirementSet?.catalog_year && (
                    <p>Catalog year: {requirementsResult.requirementSet.catalog_year}</p>
                  )}
                </div>

                {/* Still Needed section */}
                {unsatisfiedGroups.length > 0 && (
                  <details open>
                    <summary className="cursor-pointer select-none flex items-center gap-2 text-sm font-semibold text-red-700 py-2 px-2 rounded hover:bg-red-50 transition-colors">
                      <ChevronDown className="w-4 h-4 details-chevron flex-shrink-0" />
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      Still Needed ({unsatisfiedGroups.length})
                    </summary>
                    <div className="space-y-2 mt-2">
                      {unsatisfiedGroups.map(renderGroup)}
                    </div>
                  </details>
                )}

                {/* Satisfied section */}
                {satisfiedGroups.length > 0 && (
                  <details open>
                    <summary className="cursor-pointer select-none flex items-center gap-2 text-sm font-semibold text-green-700 py-2 px-2 rounded hover:bg-green-50 transition-colors">
                      <ChevronDown className="w-4 h-4 details-chevron flex-shrink-0" />
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                      Completed / Satisfied ({satisfiedGroups.length})
                    </summary>
                    <div className="space-y-2 mt-2">
                      {satisfiedGroups.map(renderGroup)}
                    </div>
                  </details>
                )}
              </div>
            );
          })() : !degreeResult ? (
            <p className="text-sm text-gray-500">Click Generate to evaluate your degree requirements.</p>
          ) : null}
        </div>

        {minorResult && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Minor Progress</h3>
                <p className="text-sm text-gray-600">
                  {minorResult.requirementSet?.name}{' '}
                  {minorResult.requirementSet?.catalog_year &&
                    `(${minorResult.requirementSet.catalog_year})`}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {minorResult.groups?.map((group) => {
                const earned = group.earnedCredits || 0;
                const required = group.requiredCredits || 0;
                const pct = required > 0 ? Math.min(Math.round((earned / required) * 100), 100) : (group.satisfied ? 100 : 0);
                const exceeded = required > 0 && earned > required;
                const extraCredits = exceeded ? earned - required : 0;
                const ariaLabel = required > 0
                  ? `${earned} of ${required} credits completed${exceeded ? `, ${extraCredits} extra` : ''}`
                  : (group.satisfied ? 'Satisfied' : 'Not satisfied');
                const hasOverflow = group.overflowCourses?.length > 0;
                const hasDetails = (group.missing?.length > 0) || (group.usedCourses?.length > 0) || hasOverflow;

                return (
                  <details
                    key={group.name}
                    className="rounded border border-gray-200 group"
                  >
                    <summary className="cursor-pointer select-none px-3 py-2 hover:bg-gray-50 transition-colors rounded list-none">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <ChevronDown className="w-4 h-4 text-gray-400 details-chevron flex-shrink-0" />
                          <p className="text-sm font-semibold text-gray-900 truncate">{group.name}</p>
                        </div>
                        {group.satisfied ? (
                          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                        )}
                      </div>
                      <div className="ml-6">
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-gray-600">
                            Earned {earned}{required ? ` / ${required} credits` : ''}
                          </p>
                          {exceeded && (
                            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                              +{extraCredits} extra
                            </span>
                          )}
                          {group.satisfied && !exceeded && required > 0 && (
                            <span className="text-xs font-medium text-green-600">Completed</span>
                          )}
                        </div>
                        {required > 0 && (
                          <div
                            className={`mt-1.5 h-2 rounded-full overflow-hidden ${pct >= 100 ? 'bg-green-200' : 'bg-red-200'}`}
                            role="progressbar"
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={ariaLabel}
                            title={ariaLabel}
                          >
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: '#16a34a' }}
                            />
                          </div>
                        )}
                      </div>
                    </summary>
                    {hasDetails && (
                      <div className="px-3 pb-2 ml-6 border-t border-gray-100 mt-1 pt-2 space-y-1">
                        {group.usedCourses?.length > 0 && (
                          <p className="text-xs text-gray-500">Used: {group.usedCourses.join(', ')}</p>
                        )}
                        {hasOverflow && (
                          <p className="text-xs text-blue-600">Overflow: {group.overflowCourses.join(', ')}</p>
                        )}
                        {group.missing?.length > 0 && (
                          <p className="text-xs text-red-600">Missing: {group.missing.join(', ')}</p>
                        )}
                      </div>
                    )}
                  </details>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const AcademicRecordPanel = () => {
    const [editingCourse, setEditingCourse] = useState(null); // { termLabel, courseCode }
    const [editingCredits, setEditingCredits] = useState('');
    const [moveMenuCourseKey, setMoveMenuCourseKey] = useState(null);
    useEffect(() => {
      if (!moveMenuCourseKey) return undefined;
      const handleClose = () => setMoveMenuCourseKey(null);
      const handleKey = (e) => { if (e.key === 'Escape') setMoveMenuCourseKey(null); };
      window.addEventListener('click', handleClose);
      window.addEventListener('keydown', handleKey);
      return () => {
        window.removeEventListener('click', handleClose);
        window.removeEventListener('keydown', handleKey);
      };
    }, [moveMenuCourseKey]);
    const CUSTOM_EMPHASIS_TAG = 'custom-emphasis';

    const updateCourseCredits = (termLabel, courseCode, newCredits) => {
      const credits = parseFloat(newCredits);
      if (isNaN(credits) || credits <= 0) {
        alert('Please enter a valid credit value (e.g., 3, 4)');
        return;
      }

      const updater = (prevTerms) =>
        prevTerms.map(term => {
          if (term.label !== termLabel) return term;
          return {
            ...term,
            courses: term.courses.map(course => {
              if (course.code !== courseCode) return course;
              return { ...course, credits };
            })
          };
        });

      // Update both reviewTerms (what the panel displays) and transcriptTerms (what the dashboard uses)
      setReviewTerms(updater);
      setTranscriptTerms(updater);
      setEditingCourse(null);
      setEditingCredits('');
    };

    const toggleCourseEmphasis = (termLabel, courseCode, enabled) => {
      const updater = (prevTerms) =>
        prevTerms.map((term) => {
          if (term.label !== termLabel) return term;
          return {
            ...term,
            courses: (term.courses || []).map((course) => {
              if (course.code !== courseCode) return course;
              const existing = new Set(Array.isArray(course.categories) ? course.categories : []);
              if (enabled) existing.add(CUSTOM_EMPHASIS_TAG);
              else existing.delete(CUSTOM_EMPHASIS_TAG);
              return { ...course, categories: Array.from(existing) };
            })
          };
        });

      setReviewTerms(updater);
      setTranscriptTerms(updater);
      setIsTranscriptDirty(true);
    };

    const transcriptYear =
      transcriptYears.find((year) => year.year === selectedTranscriptYear) ||
      transcriptYears[0];
    const transcriptYearLabels = transcriptYears.map((year) => year.year.trim());
    const termLookup = useMemo(() => {
      const map = new Map();
      reviewTerms.forEach((term) => {
        if (!term?.label) return;
        map.set(term.label, term);
      });
      return map;
    }, [reviewTerms]);
    const displayTerms = useMemo(() => {
      if (!transcriptYear) return [];
      return getTermsForAcademicYear(transcriptYear.year).map((label) => {
        const term = termLookup.get(label);
        return (
          term || {
            label,
            status: 'Evaluated',
            courses: []
          }
        );
      });
    }, [transcriptYear, termLookup]);
    const statusStyles = {
      Evaluated: 'bg-green-100 text-green-700',
      'In Progress': 'bg-blue-100 text-blue-700',
      Transfer: 'bg-gray-200 text-gray-700'
    };

    return (
      <div className="bg-white rounded-lg shadow p-6">
        {/* Header */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-900">Academic Record</h3>
          <p className="text-sm text-gray-600 mt-0.5">
            Transcript-aligned terms with grades. Drag courses between terms to correct parsing.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-100 cursor-pointer inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <input
              ref={uploadInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) queueTranscriptUpload(file);
                e.target.value = '';
              }}
            />
            Upload PDF
          </label>
          <div className="w-px h-5 bg-gray-300" />
          <button
            type="button"
            onClick={applyReviewedTranscript}
            disabled={isTranscriptSaving || (!isTranscriptDirty && reviewTerms.length === 0)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 ${
              isTranscriptSaving || (!isTranscriptDirty && reviewTerms.length === 0)
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'text-white'
            }`}
            style={
              isTranscriptSaving || (!isTranscriptDirty && reviewTerms.length === 0)
                ? {}
                : { backgroundColor: '#500000' }
            }
          >
            <Save className="w-4 h-4" />
            {isTranscriptSaving ? 'Saving...' : 'Update Record'}
          </button>
          {(reviewTerms.length > 0 || transcriptTerms.length > 0) && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Clear all academic record data? Press "Update Record" after to save this change.')) {
                  setReviewTerms([]);
                  setTranscriptTotals(null);
                  setReviewTotals(null);
                  setTranscriptPdfName('');
                  setTranscriptError('');
                  setIsTranscriptDirty(true);
                  setSelectedTranscriptYear('');
                }
              }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50"
            >
              Clear Record
            </button>
          )}
        </div>

        {/* Status indicators */}
        {(isTranscriptDirty || transcriptLoading || transcriptError || storageError || transcriptPdfName) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4 text-sm">
            {isTranscriptDirty && !isTranscriptSaving && (
              <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Unsaved changes
              </span>
            )}
            {transcriptLoading && (
              <span className="text-gray-500">{transcriptLoadingMessage || 'Parsing…'}</span>
            )}
            {transcriptError && <span className="text-red-600">{transcriptError}</span>}
            {storageError && <span className="text-red-600">{storageError}</span>}
            {transcriptPdfName && (
              <span className="text-gray-400 italic text-xs">PDF: {transcriptPdfName}</span>
            )}
          </div>
        )}

        {/* Year tabs row */}
        {transcriptYearLabels.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-5 border-b border-gray-200 pb-3">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1">Year:</span>
            {transcriptYearLabels.map((year) => (
              <button
                key={year}
                onClick={() => setSelectedTranscriptYear(year)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  selectedTranscriptYear === year
                    ? 'text-white border-transparent'
                    : 'text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
                style={selectedTranscriptYear === year ? { backgroundColor: '#500000' } : {}}
              >
                {year}
              </button>
            ))}
          </div>
        )}

        {transcriptTotals?.overall && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Institution', data: transcriptTotals.institution },
              { label: 'Transfer', data: transcriptTotals.transfer },
              { label: 'Overall', data: transcriptTotals.overall }
            ].map((entry) => (
              <div
                key={entry.label}
                className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
              >
                <p className="text-xs text-gray-500 uppercase">{entry.label} Totals</p>
                {entry.data ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-700">
                    <span>Earned Hours</span>
                    <span className="text-right font-semibold">{entry.data.earnedHours}</span>
                    <span>GPA Hours</span>
                    <span className="text-right font-semibold">{entry.data.gpaHours}</span>
                    <span>Points</span>
                    <span className="text-right font-semibold">{entry.data.points}</span>
                    <span>GPA</span>
                    <span className="text-right font-semibold">{entry.data.gpa}</span>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">Not reported</p>
                )}
              </div>
            ))}
          </div>
        )}

        {!transcriptYear ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
            Upload a transcript PDF to populate your academic record.
          </div>
        ) : (
          <div
            className="grid grid-cols-1 lg:grid-cols-3 gap-4"
            ref={reviewScrollRef}
            onDragOver={handleReviewDragOver}
          >
            {displayTerms.map((term) => {
              const termCourses = term.courses || [];
              const termCredits = termCourses.reduce((sum, c) => sum + c.credits, 0);
              return (
                <div
                  key={term.label}
                  data-term-label={term.label}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50 transition"
                  onDragOver={(event) => handleTermDragOver(term.label, event)}
                  onDragEnter={(event) => handleTermDragEnter(term.label, event)}
                  onDragLeave={(event) => handleTermDragLeave(term.label, event)}
                  onDrop={(event) => handleTermDrop(term.label, event)}
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
                      {term.status || 'Evaluated'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {termCourses.length === 0 ? (
                      <div
                        className="text-xs text-gray-500 border border-dashed border-gray-300 rounded-md px-3 py-4 text-center"
                        onDragOver={(event) => handleTermDragOver(term.label, event)}
                        onDragEnter={(event) => handleTermDragEnter(term.label, event)}
                        onDrop={(event) => handleTermDrop(term.label, event)}
                      >
                        Drag courses here
                      </div>
                    ) : (
                      termCourses.map((course) => (
                          <div
                            key={`${term.label}-${course.code}`}
                            className="rounded-md bg-white border border-gray-100 px-3 py-2 cursor-grab active:cursor-grabbing"
                            draggable
                            onDragStart={(event) => handleCourseDragStart(course, term.label, event)}
                            onDragEnd={(event) => {
                              event.currentTarget.style.opacity = '';
                              draggedReviewCourseRef.current = null;
                              clearTermHighlight();
                            }}
                            onDragOver={(event) => handleTermDragOver(term.label, event)}
                            onDrop={(event) => handleTermDrop(term.label, event)}
                            title="Drag to another term"
                          >
                            {(() => {
                              const courseKey = `${term.label}-${course.code}`;
                              const isEmphasis = Array.isArray(course.categories) && course.categories.includes(CUSTOM_EMPHASIS_TAG);
                              const moveOpen = moveMenuCourseKey === courseKey;
                              // All term labels across all years, excluding the current one
                              const allTermOptions = transcriptYears.flatMap((yr) =>
                                getTermsForAcademicYear(yr.year).filter((lbl) => lbl !== term.label)
                              );
                              return (
                                <>
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  {course.code}
                                </p>
                                <p className="text-xs text-gray-600">{toTitleCase(course.title)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-gray-900">
                                  {course.grade === 'TIP' ? 'TA / IP' : course.grade}
                                </p>
                                {editingCourse?.termLabel === term.label && editingCourse?.courseCode === course.code ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      value={editingCredits}
                                      onChange={(e) => setEditingCredits(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          updateCourseCredits(term.label, course.code, editingCredits);
                                        } else if (e.key === 'Escape') {
                                          setEditingCourse(null);
                                          setEditingCredits('');
                                        }
                                      }}
                                      className="w-12 px-1 py-0.5 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      autoFocus
                                      step="0.5"
                                      min="0"
                                      max="10"
                                    />
                                    <button
                                      onClick={() => updateCourseCredits(term.label, course.code, editingCredits)}
                                      className="text-green-600 hover:text-green-700"
                                      title="Save"
                                    >
                                      <CheckCircle className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingCourse(null);
                                        setEditingCredits('');
                                      }}
                                      className="text-red-600 hover:text-red-700"
                                      title="Cancel"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <p className="text-xs text-gray-500">
                                      {Number(course.credits).toFixed(0)} cr
                                    </p>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingCourse({ termLabel: term.label, courseCode: course.code });
                                        setEditingCredits(String(course.credits));
                                      }}
                                      className="text-gray-400 hover:text-blue-600 transition-colors"
                                      title="Edit credits"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    <div className="relative">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMoveMenuCourseKey((prev) =>
                                            prev === courseKey ? null : courseKey
                                          );
                                        }}
                                        className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                                          moveOpen
                                            ? 'border-[#500000] text-[#500000] bg-[#500000]/5'
                                            : 'border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                        }`}
                                        title="Move to another term"
                                      >
                                        ···
                                      </button>
                                      {moveOpen && (
                                        <div
                                          className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg w-40 max-h-48 overflow-y-auto py-1"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <p className="text-[9px] font-semibold text-gray-400 uppercase px-2 py-0.5 tracking-wide">
                                            Move to
                                          </p>
                                          {allTermOptions.length === 0 ? (
                                            <p className="text-[10px] text-gray-500 px-2 py-1">No other terms</p>
                                          ) : (
                                            transcriptYears.map((yr) => {
                                              const opts = getTermsForAcademicYear(yr.year).filter(
                                                (lbl) => lbl !== term.label
                                              );
                                              if (opts.length === 0) return null;
                                              return (
                                                <div key={yr.year}>
                                                  <p className="text-[9px] text-gray-400 px-2 pt-1 pb-0.5 font-medium">
                                                    {yr.year}
                                                  </p>
                                                  {opts.map((targetLabel) => (
                                                    <button
                                                      key={targetLabel}
                                                      type="button"
                                                      onClick={() => {
                                                        moveReviewedCourse(course.code, term.label, targetLabel);
                                                        setMoveMenuCourseKey(null);
                                                      }}
                                                      className="w-full text-left text-[10px] px-2 py-1 hover:bg-gray-50 text-gray-700 hover:text-gray-900"
                                                    >
                                                      {targetLabel}
                                                    </button>
                                                  ))}
                                                </div>
                                              );
                                            })
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            {(course.transfer || course.honors || isPassFailGrade(course.grade) || isCourseMarkedInProgress({ ...course, termStatus: term.status })) && (
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
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
                                  {!course.transfer && isPassFailGrade(course.grade) && (
                                    <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                                      {course.grade === 'S' ? 'Satisfactory' : course.grade === 'U' ? 'Unsatisfactory' : 'Pass'}
                                    </span>
                                  )}
                                  {isCourseMarkedInProgress({ ...course, termStatus: term.status }) && (
                                    <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                                      In Progress
                                    </span>
                                  )}
                                </div>
                                {course.transfer && (
                                  <label
                                    className="flex items-center gap-1.5 cursor-pointer select-none"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={!excludedTransferCourses.has(course.code)}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        const adding = !excludedTransferCourses.has(course.code);
                                        setExcludedTransferCourses((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(course.code)) {
                                            next.delete(course.code);
                                          } else {
                                            next.add(course.code);
                                          }
                                          return next;
                                        });
                                        // keep eval exclusion in sync: excluding from degree also excludes from eval
                                        setExcludedFromEval((prev) => {
                                          const next = new Set(prev);
                                          if (adding) {
                                            next.add(course.code);
                                          } else {
                                            next.delete(course.code);
                                          }
                                          return next;
                                        });
                                        setIsTranscriptDirty(true);
                                      }}
                                      className="w-3.5 h-3.5 rounded border-gray-300 text-[#500000] focus:ring-[#500000]/30 cursor-pointer"
                                    />
                                    <span className={`text-xs ${excludedTransferCourses.has(course.code) ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                                      Count toward degree
                                    </span>
                                  </label>
                                )}
                                {!course.transfer && (
                                  <label
                                    className="flex items-center gap-1.5 cursor-pointer select-none"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={!excludedFromEval.has(course.code)}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        setExcludedFromEval((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(course.code)) {
                                            next.delete(course.code);
                                          } else {
                                            next.add(course.code);
                                          }
                                          return next;
                                        });
                                      }}
                                      className="w-3.5 h-3.5 rounded border-gray-300 text-[#500000] focus:ring-[#500000]/30 cursor-pointer"
                                    />
                                    <span className={`text-xs ${excludedFromEval.has(course.code) ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                                      Use in evaluation
                                    </span>
                                  </label>
                                )}
                              </div>
                            )}
                            <div className="mt-2 flex items-center">
                              <label
                                className="flex items-center gap-1.5 cursor-pointer select-none"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={isEmphasis}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleCourseEmphasis(term.label, course.code, e.target.checked);
                                  }}
                                  className="w-3.5 h-3.5 rounded border-gray-300 text-[#500000] focus:ring-[#500000]/30 cursor-pointer"
                                />
                                <span className={`text-xs ${isEmphasis ? 'text-[#500000] font-medium' : 'text-gray-500'}`}>
                                  Count toward emphasis
                                </span>
                              </label>
                            </div>
                                </>
                              );
                            })()}
                          </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-900">Plan by Academic Year</h3>
              <p className="text-sm text-gray-600">
                Build Fall, Winter, and Spring schedules within each year
              </p>
              {plannerDirty && (
                <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  You have unsaved changes
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleSavePlan}
                disabled={!studentId}
                className={`px-3 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 ${
                  !studentId
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'text-white'
                }`}
                style={!studentId ? {} : { backgroundColor: '#500000' }}
              >
                <Save className="w-4 h-4" />
                Save Plan
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Are you sure you want to clear all planned courses? This cannot be undone.')) {
                    setSemesterPlans(initSemesterPlans({}));
                    setPlanError('');
                    setSelectedCourses([]);
                    if (filteredPlanYears.length > 0) {
                      setSelectedPlanYear(filteredPlanYears[0]);
                      const [fallTerm] = getTermsForAcademicYear(filteredPlanYears[0]);
                      if (fallTerm) {
                        setSelectedSemester(fallTerm);
                      }
                    }
                  }
                }}
                className="px-3 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50"
              >
                Clear All
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
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
                      type="button"
                      onClick={() => {
                        if (!isEditable) return;
                        setSelectedSemester(term);
                        setShowCourseModal(true);
                        setSearchQuery('');
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
                        const missingPrereqs = course.type === 'planned'
                          ? (courseMeta?.prereqs || []).filter((p) => !isPrereqSatisfiedForSemester(p, term))
                          : [];
                        const hasPrereqIssue = missingPrereqs.length > 0;
                        const plannedLaterPrereqs = hasPrereqIssue
                          ? missingPrereqs.filter((p) => isCoursePlanned(p))
                          : [];
                        const trulyMissing = hasPrereqIssue
                          ? missingPrereqs.filter((p) => !isCoursePlanned(p))
                          : [];

                        return (
                          <div
                            key={`${term}-${course.code}-${course.type}`}
                            className={`p-3 rounded-lg border ${
                              trulyMissing.length > 0
                                ? 'border-red-300 bg-red-50'
                                : plannedLaterPrereqs.length > 0
                                  ? 'border-yellow-300 bg-yellow-50'
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
                                {trulyMissing.length > 0 && (
                                  <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    Missing prerequisites: {trulyMissing.join(', ')}
                                  </p>
                                )}
                                {plannedLaterPrereqs.length > 0 && (
                                  <p className="text-xs text-yellow-700 mt-1 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    Prerequisite planned but not in earlier semester: {plannedLaterPrereqs.join(', ')}
                                  </p>
                                )}
                                <label
                                  className="flex items-center gap-1.5 mt-1.5 cursor-pointer select-none"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={!excludedFromEval.has(course.code)}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      setExcludedFromEval((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(course.code)) {
                                          next.delete(course.code);
                                        } else {
                                          next.add(course.code);
                                        }
                                        return next;
                                      });
                                    }}
                                    className="w-3.5 h-3.5 rounded border-gray-300 text-[#500000] focus:ring-[#500000]/30 cursor-pointer"
                                  />
                                  <span className={`text-xs ${excludedFromEval.has(course.code) ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                                    Use in evaluation
                                  </span>
                                </label>
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

        <AcademicRecordPanel />

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
                    autoFocus
                  />
                </div>
              </div>
              <div className="p-6 overflow-y-auto max-h-96">
                <div className="space-y-2">
                  {filteredCourses.length === 0 ? (
                    <div className="text-sm text-gray-600">
                      {searchQuery.trim().length === 0
                        ? 'Type to search (e.g., "CSCE 3").'
                        : 'No matching courses.'}
                    </div>
                  ) : (
                    filteredCourses.map(([code, course]) => {
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
                            {course.prereqs.length > 0 && (() => {
                              const satisfied = course.prereqs.filter((p) => isPrereqSatisfiedForSemester(p, selectedSemester));
                              const unsatisfied = course.prereqs.filter((p) => !isPrereqSatisfiedForSemester(p, selectedSemester));
                              return (
                                <div className="text-xs mt-1">
                                  <span className="text-gray-500">Prerequisites: </span>
                                  {satisfied.map((p) => (
                                    <span key={p} className="text-green-600 mr-1">{p} ✓</span>
                                  ))}
                                  {unsatisfied.map((p) => (
                                    <span key={p} className="text-red-600 mr-1">{p} ✗</span>
                                  ))}
                                </div>
                              );
                            })()}
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
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const PrerequisiteTab = ({ isFullscreen, onFullscreenChange }) => {
    const careerPaths = [
      {
        id: 'All',
        title: 'All'
      },
      {
        id: 'SWE',
        title: 'SWE',
        courses: EMPHASIS_TRACKS['Software Engineering']
      },
      {
        id: 'ML',
        title: 'ML',
        courses: EMPHASIS_TRACKS['AI/ML']
      },
      {
        id: 'Cyber',
        title: 'Cyber',
        courses: EMPHASIS_TRACKS.Cybersecurity
      }
    ];
    const [selectedPath, setSelectedPath] = useState('All');
    const [zoomLevel, setZoomLevel] = useState(1);
    const [hoveredCourse, setHoveredCourse] = useState(null);
    useEffect(() => {
      if (!isFullscreen) return undefined;
      const { overflow } = document.body.style;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = overflow || '';
      };
    }, [isFullscreen]);
    const toggleFullscreen = () => {
      onFullscreenChange?.(!isFullscreen);
    };
    const flowNodes = [
      { id: 'MATH 151', x: 40, y: 20 },
      { id: 'ENGR 102', x: 40, y: 110 },
      { id: 'MATH 152', x: 40, y: 200 },
      { id: 'CSCE 181', x: 40, y: 290 },
      { id: 'CSCE 120', x: 340, y: 20 },
      { id: 'CSCE 222', x: 340, y: 110 },
      { id: 'MATH 304', x: 340, y: 200 },
      { id: 'STAT 211', x: 340, y: 290 },
      { id: 'CSCE 221', x: 640, y: 20 },
      { id: 'CSCE 312', x: 640, y: 110 },
      { id: 'CSCE 314', x: 640, y: 200 },
      { id: 'STAT 212', x: 640, y: 290 },
      { id: 'MATH 251', x: 640, y: 380 },
      { id: 'MATH 308', x: 640, y: 470 },
      { id: 'CSCE 313', x: 940, y: 20 },
      { id: 'CSCE 331', x: 940, y: 110 },
      { id: 'CSCE 411', x: 940, y: 200 },
      { id: 'CSCE 121', x: 1240, y: 20 },
      { id: 'CSCE 310', x: 1240, y: 90 },
      { id: 'CSCE 420', x: 1240, y: 160 },
      { id: 'CSCE 421', x: 1240, y: 230 },
      { id: 'CSCE 431', x: 1240, y: 300 },
      { id: 'CSCE 434', x: 1240, y: 370 },
      { id: 'CSCE 441', x: 1240, y: 440 },
      { id: 'CSCE 442', x: 1240, y: 510 },
      { id: 'CSCE 448', x: 1240, y: 580 },
      { id: 'CSCE 451', x: 1240, y: 650 },
      { id: 'CSCE 463', x: 1240, y: 720 },
      { id: 'CSCE 465', x: 1240, y: 790 },
      { id: 'CSCE 481', x: 1240, y: 860 },
      { id: 'CSCE 482', x: 1240, y: 930 }
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
        course.prereqs.length === 0 ||
        course.prereqs.every((p) => isCourseCompleted(p) || isCourseInProgress(p) || isCoursePlanned(p));
      return prereqsMet ? 'available' : 'locked';
    };
    const collectPrereqs = (code, collected = new Set()) => {
      if (!code || collected.has(code)) return collected;
      collected.add(code);
      const course = FLOWCHART_COURSES[code] || COURSES[code];
      if (!course?.prereqs?.length) return collected;
      course.prereqs.forEach((prereq) => collectPrereqs(prereq, collected));
      return collected;
    };
    const collectMissingPrereqs = (code, collected = new Set()) => {
      const course = FLOWCHART_COURSES[code] || COURSES[code];
      if (!course?.prereqs?.length) return collected;
      course.prereqs.forEach((prereq) => {
        if (isCourseCompleted(prereq) || isCourseInProgress(prereq) || isCoursePlanned(prereq)) return;
        if (collected.has(prereq)) return;
        collected.add(prereq);
        collectMissingPrereqs(prereq, collected);
      });
      return collected;
    };
    const highlightedCourses = useMemo(() => {
      if (selectedPath === 'All') return new Set();
      const path = careerPaths.find((item) => item.id === selectedPath);
      const highlight = new Set();
      (path?.courses || []).forEach((course) => collectPrereqs(course, highlight));
      return highlight;
    }, [careerPaths, selectedPath]);
    const hoveredPrereqs = useMemo(() => {
      if (!hoveredCourse) return new Set();
      const missing = collectMissingPrereqs(hoveredCourse, new Set());
      missing.add(hoveredCourse);
      return missing;
    }, [hoveredCourse]);
    const handleZoom = (delta) => {
      setZoomLevel((prev) => {
        const next = Math.round((prev + delta) * 10) / 10;
        return Math.min(2, Math.max(0.6, next));
      });
    };
    const flowchartControls = (
      <div className="flex flex-wrap items-center justify-between gap-3 border border-gray-200 rounded-lg bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {careerPaths.map((path) => (
            <button
              key={path.id}
              onClick={() => setSelectedPath(path.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                selectedPath === path.id
                  ? 'text-white'
                  : 'text-gray-700 border-gray-200 hover:bg-gray-100'
              }`}
              style={selectedPath === path.id ? { backgroundColor: '#500000' } : {}}
            >
              {path.title}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleZoom(-0.1)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            −
          </button>
          <span className="text-xs font-semibold text-gray-600">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            type="button"
            onClick={() => handleZoom(0.1)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel(1)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>
    );
    const flowchartCanvas = (
      <div
        className={`border border-gray-200 rounded-lg bg-white p-4 ${
          isFullscreen ? 'h-full' : 'h-[420px]'
        } overflow-auto`}
      >
        <div
          className={`flex items-center justify-center ${
            isFullscreen ? 'min-w-[2600px] min-h-[1200px]' : 'min-w-[2000px] min-h-[900px]'
          }`}
        >
          <svg
            viewBox="0 0 1800 1050"
            className={isFullscreen ? 'w-[2400px] h-auto' : 'w-[1800px] h-auto'}
            role="img"
            aria-label="Course prerequisite flowchart"
            style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center' }}
          >
            <defs>
              <marker
                id="arrow"
                markerWidth="6"
                markerHeight="6"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#9ca3af" />
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
              const isHoveredEdge =
                hoveredPrereqs.size > 0 &&
                hoveredPrereqs.has(edge.from) &&
                hoveredPrereqs.has(edge.to);
              return (
                <line
                  key={`${edge.from}-${edge.to}`}
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke={isHoveredEdge ? '#f97316' : '#94a3b8'}
                  strokeWidth={isHoveredEdge ? '2' : '1'}
                  strokeOpacity={isHoveredEdge ? '0.85' : '0.35'}
                  markerEnd="url(#arrow)"
                />
              );
            })}

            {flowNodes.map((node) => {
              const course = FLOWCHART_COURSES[node.id] || COURSES[node.id];
              if (!course) return null;
              const status = getStatus(node.id);
              const isPathHighlighted =
                selectedPath === 'All' ? false : highlightedCourses.has(node.id);
              const isHoveredHighlight =
                hoveredPrereqs.size > 0 && hoveredPrereqs.has(node.id);
              const dimmed =
                (selectedPath !== 'All' && !isPathHighlighted && hoveredPrereqs.size === 0) ||
                (hoveredPrereqs.size > 0 && !isHoveredHighlight);
              return (
                <g
                  key={node.id}
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
                    opacity={dimmed ? 0.35 : 1}
                    stroke={
                      isHoveredHighlight ? '#f97316' : isPathHighlighted ? '#500000' : undefined
                    }
                    strokeWidth={isHoveredHighlight ? 3 : isPathHighlighted ? 3 : undefined}
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
    );

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold mb-2">Course Prerequisite Flowchart</h3>
          <p className="text-sm text-gray-600 mb-6">
            Flowchart-style prerequisites for the CS core. Boxes show status based on transcript.
          </p>

          <div className="space-y-3">
            {flowchartControls}
            {flowchartCanvas}
          </div>
        </div>

        {isFullscreen && (
          <div className="fixed inset-0 z-50 bg-white">
            <div className="flex h-full w-full flex-col">
              <div className="border-b border-gray-200 px-6 py-4 bg-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Prerequisite Flowchart</h3>
                  <button
                    type="button"
                    onClick={() => onFullscreenChange?.(false)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-100"
                  >
                    Exit Fullscreen
                  </button>
                </div>
                <div className="mt-3">{flowchartControls}</div>
              </div>
              <div className="flex-1 overflow-auto p-6">{flowchartCanvas}</div>
            </div>
          </div>
        )}

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

  const TranscriptConsentModal = () => {
    if (!consentPendingFile) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-3">Data Storage Consent</h2>
          <p className="text-sm text-gray-700 mb-4">
            By uploading your transcript, you consent to DegreeFlow storing your course history
            (course codes, grades, and credit hours) to power your degree plan. Your data is
            associated with your TAMU Google account and is used solely for academic planning
            within this application.
          </p>
          <ul className="text-xs text-gray-500 space-y-1 mb-6 list-disc list-inside">
            <li>Only course codes, titles, grades, and credit hours are stored.</li>
            <li>Your PDF is never saved — it is processed and discarded immediately.</li>
            <li>You can clear your data at any time from the Academic Record tab.</li>
          </ul>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => {
                setConsentPendingFile(null);
                if (uploadInputRef.current) uploadInputRef.current.value = '';
                if (chatUploadInputRef.current) chatUploadInputRef.current.value = '';
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const file = consentPendingFile;
                setConsentPendingFile(null);
                if (uploadInputRef.current) uploadInputRef.current.value = '';
                if (chatUploadInputRef.current) chatUploadInputRef.current.value = '';
                handleTranscriptPdf(file);
              }}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: '#500000' }}
            >
              I Consent — Upload
            </button>
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
            onClick={() => googleLogin()}
            className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50"
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white border border-gray-200 text-sm font-bold">
              G
            </span>
            Continue with Google
          </button>

          <p className="mt-6 text-sm text-gray-500 text-center">
            Sign in with your Google account to get started.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {!isFlowFullscreen && (
        <>
          <header className="shadow-lg" style={{ backgroundColor: '#500000' }}>
            <div className="max-w-7xl mx-auto px-4 py-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setActiveTab(authUser ? 'dashboard' : 'login')}
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
                  {authUser ? (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 bg-white/10 border border-white/25 px-3 py-2 rounded-lg text-white">
                        {authUser.picture ? (
                          <img
                            src={authUser.picture}
                            alt="avatar"
                            className="w-6 h-6 rounded-full bg-white"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-white/80" />
                        )}
                        <div className="leading-tight">
                          <div className="text-sm font-semibold">{authUser.name || 'Student'}</div>
                          <div className="text-[11px] text-white/80">{authUser.email}</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Are you sure you want to log out?')) {
                            logout();
                          }
                        }}
                        className="flex items-center gap-2 border border-white/60 px-4 py-2 rounded-lg text-white hover:bg-white/10"
                      >
                        Logout
                      </button>
                    </div>
                  ) : (
                    <button
                      className="flex items-center gap-2 border border-white/60 px-4 py-2 rounded-lg text-white hover:bg-white/10"
                      type="button"
                      onClick={() => setActiveTab('login')}
                    >
                      Login
                    </button>
                  )}
                </div>
              </div>
            </div>
          </header>

          {authUser && (
            <nav className="bg-white shadow">
              <div className="max-w-7xl mx-auto px-4">
                <div className="flex gap-6">
                  {[
                    { id: 'dashboard', label: 'Dashboard' },
                    { id: 'planner', label: 'Planner' },
                    { id: 'prerequisites', label: 'Prerequisites' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        if (activeTab === 'planner' && tab.id !== 'planner' && plannerDirty) {
                          if (!window.confirm('You have unsaved planner changes. Leave without saving?')) {
                            return;
                          }
                        }
                        setActiveTab(tab.id);
                      }}
                      className={`py-4 px-2 border-b-2 font-medium capitalize ${
                        activeTab === tab.id
                          ? 'text-gray-900'
                          : 'border-transparent text-gray-600 hover:text-gray-900'
                      }`}
                      style={
                        activeTab === tab.id ? { borderColor: '#500000', color: '#500000' } : {}
                      }
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </nav>
          )}
        </>
      )}

      <main className={isFlowFullscreen ? 'p-0' : 'max-w-7xl mx-auto px-4 py-8'}>
        <div key={activeTab} className="animate-fade-in">
          {activeTab === 'dashboard' && (authUser ? <DashboardTab /> : <LoginPage />)}
          {activeTab === 'planner' && (authUser ? <PlannerTab /> : <LoginPage />)}
          {activeTab === 'prerequisites' && (authUser ? (
            <PrerequisiteTab
              isFullscreen={isFlowFullscreen}
              onFullscreenChange={setIsFlowFullscreen}
            />
          ) : <LoginPage />)}
          {activeTab === 'login' && <LoginPage />}
        </div>
      </main>

      <TranscriptConsentModal />

      {!isFlowFullscreen && (
        <div className="fixed right-0 bottom-6 z-50 flex items-end pointer-events-none">
          {isChatOpen && (
          <div
            className="mr-3 rounded-2xl border border-gray-200 bg-white shadow-xl flex relative pointer-events-auto"
            style={{ width: chatWidth, height: chatHeight }}
          >
              <div
                role="button"
                tabIndex={0}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsResizingChat(true);
                }}
                className={`absolute -top-3 -left-3 w-7 h-7 rounded-full bg-white border-2 border-gray-200 shadow-md cursor-nwse-resize hover:border-[#500000]/40 hover:shadow-lg flex items-center justify-center z-20 transition-shadow ${
                  isResizingChat ? 'border-[#500000]/60 shadow-lg ring-2 ring-[#500000]/20' : ''
                }`}
                aria-label="Drag to resize chat panel"
              >
                <span className="flex -rotate-45 gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                </span>
              </div>
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
              <div className="flex items-center justify-between border-b px-4 py-3 flex-shrink-0">
                <div>
                  <p className="text-sm font-semibold text-gray-900">DegreeFlow Assistant</p>
                  <p className="text-xs text-gray-500">Ask anything about your plan</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                    setChatWidth((w) => (w <= 320 ? 420 : 320));
                    setChatHeight((h) => (h <= 400 ? 500 : 400));
                  }}
                    className="p-1.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                    title={chatWidth <= 320 ? 'Expand chat' : 'Shrink chat'}
                    aria-label={chatWidth <= 320 ? 'Expand chat' : 'Shrink chat'}
                  >
                    {chatWidth <= 320 ? (
                      <PanelRightOpen className="w-4 h-4" />
                    ) : (
                      <PanelRightClose className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsChatOpen(false)}
                    className="text-xs text-gray-500 hover:text-gray-800"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 px-4 py-3 text-xs text-gray-600 space-y-2 overflow-y-auto">
                {chatMessages.length === 0 ? (
                  <div className="text-center text-gray-400 mt-8">
                    <p className="font-semibold mb-1">Welcome to DegreeFlow Assistant!</p>
                    <p className="text-xs">Ask me anything about course planning, requirements, or your degree.</p>
                  </div>
                ) : (
                  chatMessages.map((message) => {
                    // Simple markdown-like formatting for assistant messages
                    const formatText = (text) => {
                      if (message.role !== 'assistant') return text;
                      
                      // Split by lines and process each
                      return text.split('\n').map((line, idx) => {
                        // Convert **text** to bold
                        const parts = line.split(/(\*\*[^*]+\*\*)/g);
                        const formatted = parts.map((part, i) => {
                          if (part.startsWith('**') && part.endsWith('**')) {
                            return <strong key={i}>{part.slice(2, -2)}</strong>;
                          }
                          return part;
                        });
                        
                        return (
                          <div key={idx} className={idx > 0 ? 'mt-2' : ''}>
                            {formatted}
                          </div>
                        );
                      });
                    };

                    return (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                            message.role === 'user'
                              ? 'bg-[#500000] text-white'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {message.role === 'user' ? message.text : formatText(message.text)}
                        </div>
                      </div>
                    );
                  })
                )}
                {pendingChatActions?.actions?.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <p className="font-semibold">Confirm planner update</p>
                    <p className="mt-1">The assistant requested these changes:</p>
                    <div className="mt-2 space-y-1">
                      {pendingChatActions.actions.map((action, idx) => (
                        <p key={`${action.type}-${action.courseCode}-${action.term}-${idx}`}>
                          • {formatPlannerActionLabel(action)}
                          {action.reason ? ` (${action.reason})` : ''}
                        </p>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={confirmPendingChatActions}
                        className="rounded-full bg-[#500000] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#3d0000]"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={cancelPendingChatActions}
                        className="rounded-full border border-amber-400 bg-white px-3 py-1.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <span className="max-w-[85%] rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-500">
                      <span className="inline-flex gap-1">
                        <span className="animate-bounce">●</span>
                        <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
                        <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                      </span>
                    </span>
                  </div>
                )}
              </div>
              <div className="border-t px-3 py-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    ref={chatUploadInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        queueTranscriptUpload(file);
                        setChatMessages((prev) => [
                          ...prev,
                          {
                            id: `assistant-upload-${Date.now()}`,
                            role: 'assistant',
                            text: `I can parse ${file.name}. Please confirm the consent dialog to continue.`
                          }
                        ]);
                      }
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => chatUploadInputRef.current?.click()}
                    disabled={isChatLoading || transcriptLoading}
                    className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                    title="Upload transcript PDF"
                  >
                    PDF
                  </button>
                  <input
                    type="text"
                    placeholder="Type your question..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isChatLoading) {
                        e.preventDefault();
                        sendChatMessage(chatInput);
                      }
                    }}
                    disabled={isChatLoading}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#500000]/20 disabled:bg-gray-50 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => sendChatMessage(chatInput)}
                    disabled={isChatLoading || !chatInput.trim()}
                    className="rounded-full bg-[#500000] px-3 py-2 text-xs font-semibold text-white hover:bg-[#3d0000] disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isChatLoading ? '...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </div>
          )}

          <button
            type="button"
            onClick={() => setIsChatOpen((prev) => !prev)}
            className="pointer-events-auto flex items-center justify-center h-14 w-7 rounded-l-full bg-[#500000] text-white shadow-lg hover:bg-[#3d0000]"
            aria-label="Toggle chat assistant"
          >
            {isChatOpen ? '›' : '‹'}
          </button>
        </div>
      )}
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 left-6 z-[9999] flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg transition-all animate-slide-in ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : toast.type === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-gray-800 text-white'
          }`}
        >
          {toast.type === 'success' && <CheckCircle className="w-5 h-5 flex-shrink-0" />}
          {toast.type === 'error' && <X className="w-5 h-5 flex-shrink-0" />}
          {toast.type === 'info' && <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-white/70 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
