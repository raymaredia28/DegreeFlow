import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import tamuLogo from './assets/tamu-logo.svg';
import { DegreeProgress } from './components/DegreeProgress';
import { AdminPanel } from './components/AdminPanel';
import { signInWithPopup, signOut } from 'firebase/auth';
import { firebaseAuth, googleProvider } from './firebase';
import {
  Calendar,
  AlertTriangle,
  CheckCircle,
  MessageCircle,
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
  Info,
  Settings,
  Trash2
} from 'lucide-react';

import { computeEvaluationSignature } from './utils/evaluationFreshness.mjs';
import { computeCreditProgressFromEvalResult } from './utils/evalCreditProgress.mjs';
import { reconcileWorkNotApplied } from './utils/workNotApplied.mjs';

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

const normalizeTrackLabel = (rawLabel, type) => {
  const value = String(rawLabel || '').trim();
  if (!value) return '';
  if (type === 'minor') {
    return value
      .replace(/^Minor\s*-\s*/i, '')
      .replace(/\s+Minor$/i, '')
      .trim();
  }
  if (type === 'emphasis') {
    return value
      .replace(/^CSCE\s+Emphasis\s*-\s*/i, '')
      .replace(/^Emphasis\s*-\s*/i, '')
      .trim();
  }
  return value;
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

const COURSE_DIFFICULTY = {
  'CSCE 110': 'easy', 'CSCE 111': 'easy', 'CSCE 120': 'easy', 'CSCE 121': 'medium',
  'CSCE 181': 'easy', 'CSCE 206': 'easy',
  'CSCE 221': 'hard', 'CSCE 222': 'medium',
  'CSCE 312': 'hard', 'CSCE 313': 'hard', 'CSCE 314': 'medium', 'CSCE 315': 'medium',
  'CSCE 310': 'hard', 'CSCE 331': 'hard',
  'CSCE 410': 'hard', 'CSCE 411': 'hard', 'CSCE 412': 'medium',
  'CSCE 420': 'hard', 'CSCE 421': 'hard', 'CSCE 430': 'medium', 'CSCE 431': 'medium',
  'CSCE 433': 'medium', 'CSCE 435': 'hard', 'CSCE 436': 'medium',
  'CSCE 440': 'hard', 'CSCE 441': 'medium', 'CSCE 442': 'medium', 'CSCE 443': 'medium',
  'CSCE 444': 'medium', 'CSCE 445': 'medium', 'CSCE 446': 'medium',
  'CSCE 451': 'hard', 'CSCE 452': 'hard', 'CSCE 461': 'medium', 'CSCE 462': 'medium',
  'CSCE 463': 'hard', 'CSCE 464': 'medium', 'CSCE 465': 'hard',
  'CSCE 470': 'medium', 'CSCE 477': 'medium', 'CSCE 481': 'medium', 'CSCE 482': 'medium',
  'CSCE 483': 'medium', 'CSCE 489': 'medium',
  'MATH 131': 'easy', 'MATH 141': 'easy', 'MATH 142': 'medium',
  'MATH 147': 'medium', 'MATH 148': 'medium',
  'MATH 151': 'medium', 'MATH 152': 'hard', 'MATH 171': 'medium', 'MATH 172': 'hard',
  'MATH 251': 'medium', 'MATH 302': 'medium', 'MATH 304': 'medium',
  'MATH 308': 'medium', 'MATH 311': 'hard',
  'STAT 211': 'easy', 'STAT 212': 'easy', 'STAT 302': 'medium',
  'PHYS 206': 'medium', 'PHYS 207': 'medium', 'PHYS 208': 'hard', 'PHYS 209': 'hard',
  'PHYS 218': 'hard', 'PHYS 219': 'hard',
  'ENGR 102': 'easy', 'ENGR 216': 'medium', 'ENGR 217': 'medium',
  'ECEN 214': 'medium', 'ECEN 248': 'medium', 'ECEN 314': 'hard', 'ECEN 350': 'hard',
  'ENGL 104': 'easy', 'ENGL 210': 'easy', 'COMM 203': 'easy', 'COMM 205': 'easy',
  'CHEM 101': 'easy', 'CHEM 102': 'easy', 'CHEM 107': 'medium', 'CHEM 117': 'medium',
};

const getCourseDifficulty = (code) => {
  if (!code) return null;
  const upper = code.toUpperCase().replace(/\s+/g, ' ').trim();
  if (COURSE_DIFFICULTY[upper]) return COURSE_DIFFICULTY[upper];
  const num = parseInt(upper.replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(num)) return null;
  if (num >= 400) return 'hard';
  if (num >= 200) return 'medium';
  return 'easy';
};

const DIFFICULTY_CONFIG = {
  easy:   { label: 'Easy',   color: '#16a34a', bg: '#dcfce7', text: '#166534' },
  medium: { label: 'Medium', color: '#ca8a04', bg: '#fef9c3', text: '#854d0e' },
  hard:   { label: 'Hard',   color: '#dc2626', bg: '#fee2e2', text: '#991b1b' },
};

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
const normalizeCode = (code) => code?.replace(/\s+/g, ' ').trim().toUpperCase();

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

const buildExportHtmlFromDegreeResult = (degreeResult, transcriptTerms = [], sourceLabel = '', meta = {}) => {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const groups = Array.isArray(degreeResult?.groups) ? degreeResult.groups : [];

  const courseIndex = new Map();
  (transcriptTerms || []).forEach((term) => {
    (term.courses || []).forEach((c) => {
      const key = (c.code || '').replace(/\s+/g, ' ').trim().toUpperCase();
      if (key && !courseIndex.has(key)) {
        courseIndex.set(key, { ...c, termLabel: term.label, termStatus: term.status });
      }
    });
  });

  const overallSatisfied = groups.filter((g) => g.satisfied).length;
  const overallTotal = groups.length;
  const pctDone = overallTotal > 0 ? Math.round((overallSatisfied / overallTotal) * 100) : 0;

  const summaryRow = `<tr>
    <td><strong>Overall</strong></td>
    <td>${overallSatisfied === overallTotal ? 'Met' : 'Not Met'}</td>
    <td>${overallSatisfied}/${overallTotal} groups</td>
    <td>${pctDone}%</td>
  </tr>`;

  const areasSections = groups.map((group) => {
    const name = esc(group.name || '');
    const satisfied = group.satisfied;
    const metLabel = satisfied ? 'Met' : 'Not Met';
    const earned = Number(group.earnedCredits ?? 0);
    const required = Number(group.requiredCredits ?? 0);
    const pct = required > 0 ? Math.min(Math.round((earned / required) * 100), 100) : (satisfied ? 100 : 0);

    const creditLine = required > 0
      ? `Earned: ${earned} / ${required} credits (${pct}%)`
      : (satisfied ? 'Satisfied' : 'Not satisfied');

    const usedCourses = group.usedCourses || [];
    let courseRows = '';
    if (usedCourses.length > 0) {
      courseRows = usedCourses.map((code) => {
        const c = courseIndex.get(code) || {};
        const credits = c.credits != null ? Number(c.credits).toFixed(2) : '';
        const grade = esc(c.grade || '');
        const title = esc(c.title || '');
        const term = esc(c.termLabel || '');
        const transfer = c.transfer ? 'T' : 'H';
        return `<tr>
          <td>${esc(code)}</td><td>${title}</td><td>${credits}</td><td>${grade}</td><td>${term}</td><td>${transfer}</td>
        </tr>`;
      }).join('');
    }

    const missingHtml = (group.missing || []).length > 0
      ? `<p class="missing">Still needed: ${group.missing.map(esc).join('; ')}</p>`
      : '';

    return `<div class="area">
      <div class="area-hdr ${satisfied ? 'met' : 'notmet'}">
        <strong>${name}</strong> <span class="badge">${metLabel}</span>
      </div>
      <p class="area-summary">${creditLine}</p>
      ${courseRows ? `<table class="rows"><thead><tr>
        <th>Course</th><th>Title</th><th>Credits</th><th>Grade</th><th>Term</th><th>Source</th>
      </tr></thead><tbody>${courseRows}</tbody></table>` : ''}
      ${missingHtml}
    </div>`;
  }).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>DegreeFlow — Degree Evaluation Export</title>
<style>
  @page { margin: 16mm 12mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; padding: 24px 28px; color: #111827; font-size: 11px; }
  h1 { margin: 0; color: #500000; font-size: 18px; }
  .subtitle { margin: 2px 0 14px 0; color: #4b5563; font-size: 11px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 16px; font-size: 11px; }
  .info-grid span.label { font-weight: 600; }
  .progress-bar { height: 10px; border-radius: 5px; background: #e5e7eb; margin: 8px 0 16px 0; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 5px; }
  table.summary { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  table.summary th, table.summary td { border: 1px solid #d1d5db; padding: 6px 10px; font-size: 11px; text-align: left; }
  table.summary th { background: #500000; color: white; }
  .area { margin-bottom: 14px; page-break-inside: avoid; }
  .area-hdr { padding: 5px 10px; border-radius: 4px; font-size: 12px; }
  .area-hdr.met { background: #dcfce7; color: #166534; }
  .area-hdr.notmet { background: #fee2e2; color: #991b1b; }
  .badge { float: right; font-weight: 600; }
  .area-summary { margin: 4px 0 6px 0; color: #4b5563; font-size: 10px; }
  .missing { margin: 2px 0 6px 0; color: #991b1b; font-size: 10px; font-style: italic; }
  table.rows { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.rows th, table.rows td { border: 1px solid #d1d5db; padding: 3px 6px; font-size: 10px; text-align: left; }
  table.rows th { background: #f3f4f6; font-weight: 600; }
</style>
</head>
<body>
  <h1>Degree Evaluation Export</h1>
  <p class="subtitle">${esc(degreeResult?.requirementSet?.name || 'Degree Evaluation')}${degreeResult?.requirementSet?.catalog_year ? ' &mdash; Catalog ' + esc(degreeResult.requirementSet.catalog_year) : ''}</p>
  <div class="info-grid">
    <div><span class="label">Source:</span> ${esc(sourceLabel || 'Computed in DegreeFlow')}</div>
    <div><span class="label">Generated:</span> ${new Date().toLocaleString()}</div>
    ${meta?.minor ? `<div><span class="label">Minor:</span> ${esc(meta.minor)}</div>` : ''}
  </div>
  <div class="progress-bar"><div class="progress-fill" style="width:${pctDone}%;background:${pctDone === 100 ? '#16a34a' : '#500000'}"></div></div>
  <table class="summary"><thead><tr><th>Requirement</th><th>Status</th><th>Progress</th><th>%</th></tr></thead><tbody>${summaryRow}${groups.map((g) => {
    const e = Number(g.earnedCredits ?? 0), r = Number(g.requiredCredits ?? 0);
    const p = r > 0 ? Math.min(Math.round((e / r) * 100), 100) : (g.satisfied ? 100 : 0);
    return `<tr><td>${esc(g.name)}</td><td>${g.satisfied ? 'Met' : 'Not Met'}</td><td>${e}/${r} credits</td><td>${p}%</td></tr>`;
  }).join('')}</tbody></table>
  ${areasSections}
  ${(() => {
    const wna = Array.isArray(degreeResult?.workNotApplied) ? degreeResult.workNotApplied : [];
    if (wna.length === 0) return '';
    const wnaRows = wna.map((entry) => {
      const c = courseIndex.get(entry.code) || {};
      const credits = entry.credits != null ? Number(entry.credits).toFixed(2) : (c.credits != null ? Number(c.credits).toFixed(2) : '');
      const grade = esc(c.grade || '');
      const title = esc(c.title || '');
      const term = esc(c.termLabel || '');
      const transfer = c.transfer ? 'T' : 'H';
      const potential = (entry.potentialGroups || []).length > 0
        ? entry.potentialGroups.map(esc).join(', ')
        : '';
      return `<tr><td>${esc(entry.code)}</td><td>${title}</td><td>${credits}</td><td>${grade}</td><td>${term}</td><td>${transfer}</td><td>${potential}</td></tr>`;
    }).join('');
    const totalCredits = wna.reduce((sum, e) => sum + (Number(e.credits) || 0), 0);
    return `<h2 style="color:#500000;font-size:14px;margin:24px 0 8px 0;">Work Not Applied</h2>
    <p class="area-summary">${wna.length} course${wna.length !== 1 ? 's' : ''} (${totalCredits} credits) completed but not matched to any requirement group</p>
    <table class="rows"><thead><tr>
      <th>Course</th><th>Title</th><th>Credits</th><th>Grade</th><th>Term</th><th>Source</th><th>Could Apply To</th>
    </tr></thead><tbody>${wnaRows}</tbody></table>`;
  })()}
  ${(() => {
    const mr = meta?.minorResult;
    if (!mr || !Array.isArray(mr.groups) || mr.groups.length === 0) return '';
    const minorName = esc(mr.requirementSet?.name || 'Minor');
    const minorGroups = mr.groups;
    const minorSummaryRows = minorGroups.map((g) => {
      const e = Number(g.earnedCredits ?? 0), r = Number(g.requiredCredits ?? 0);
      const p = r > 0 ? Math.min(Math.round((e / r) * 100), 100) : (g.satisfied ? 100 : 0);
      return '<tr><td>' + esc(g.name) + '</td><td>' + (g.satisfied ? 'Met' : 'Not Met') + '</td><td>' + e + '/' + r + ' credits</td><td>' + p + '%</td></tr>';
    }).join('');
    const minorAreaSections = minorGroups.map((group) => {
      const gName = esc(group.name || '');
      const satisfied = group.satisfied;
      const metLabel = satisfied ? 'Met' : 'Not Met';
      const earned = Number(group.earnedCredits ?? 0);
      const required = Number(group.requiredCredits ?? 0);
      const pct = required > 0 ? Math.min(Math.round((earned / required) * 100), 100) : (satisfied ? 100 : 0);
      const creditLine = required > 0
        ? 'Earned: ' + earned + ' / ' + required + ' credits (' + pct + '%)'
        : (satisfied ? 'Satisfied' : 'Not satisfied');
      const usedCourses = group.usedCourses || [];
      let courseRows = '';
      if (usedCourses.length > 0) {
        courseRows = usedCourses.map((code) => {
          const c = courseIndex.get(code) || {};
          const credits = c.credits != null ? Number(c.credits).toFixed(2) : '';
          const grade = esc(c.grade || '');
          const title = esc(c.title || '');
          const term = esc(c.termLabel || '');
          const transfer = c.transfer ? 'T' : 'H';
          return '<tr><td>' + esc(code) + '</td><td>' + title + '</td><td>' + credits + '</td><td>' + grade + '</td><td>' + term + '</td><td>' + transfer + '</td></tr>';
        }).join('');
      }
      const missingHtml = (group.missing || []).length > 0
        ? '<p class="missing">Still needed: ' + group.missing.map(esc).join('; ') + '</p>'
        : '';
      return '<div class="area"><div class="area-hdr ' + (satisfied ? 'met' : 'notmet') + '"><strong>' + gName + '</strong> <span class="badge">' + metLabel + '</span></div><p class="area-summary">' + creditLine + '</p>' +
        (courseRows ? '<table class="rows"><thead><tr><th>Course</th><th>Title</th><th>Credits</th><th>Grade</th><th>Term</th><th>Source</th></tr></thead><tbody>' + courseRows + '</tbody></table>' : '') +
        missingHtml + '</div>';
    }).join('');
    return '<h2 style="color:#500000;font-size:14px;margin:24px 0 8px 0;">' + minorName + '</h2>' +
      '<table class="summary"><thead><tr><th>Requirement</th><th>Status</th><th>Progress</th><th>%</th></tr></thead><tbody>' + minorSummaryRows + '</tbody></table>' +
      minorAreaSections;
  })()}
</body>
</html>`;
};

const FLOWCHART_COURSES = {
  'ENGR 102': { title: 'Engr Lab I Computation', prereqGroups: [] },
  'CSCE 120': {
    title: 'Program Design & Concepts',
    prereqGroups: [['ENGR 102', 'CSCE 110', 'CSCE 111', 'CSCE 206', 'PHYS 150']]
  },
  'CSCE 121': { title: 'Intro to Program Design', prereqGroups: [] },
  'CSCE 181': { title: 'Intro to Computing', prereqGroups: [] },
  'MATH 151': { title: 'Engineering Math I', prereqGroups: [] },
  'MATH 152': { title: 'Calculus II', prereqGroups: [] },
  'CSCE 222': {
    title: 'Discrete Structures',
    prereqGroups: [['MATH 142', 'MATH 147', 'MATH 151', 'MATH 171']]
  },
  'CSCE 221': {
    title: 'Data Structures & Algorithms',
    prereqGroups: [
      ['CSCE 120', 'CSCE 121'],
      [{ code: 'CSCE 222', concurrentOk: true }, { code: 'ECEN 222', concurrentOk: true }]
    ]
  },
  'CSCE 310': { title: 'Database Systems', prereqGroups: [['CSCE 221']] },
  'CSCE 312': {
    title: 'Computer Organization',
    prereqGroups: [[{ code: 'CSCE 221', concurrentOk: true }]]
  },
  'CSCE 313': {
    title: 'Intro to Computer Systems',
    prereqGroups: [
      ['CSCE 221'],
      ['CSCE 312', { code: 'CSCE 350', concurrentOk: true }, { code: 'ECEN 350', concurrentOk: true }]
    ]
  },
  'CSCE 314': {
    title: 'Programming Languages',
    prereqGroups: [[{ code: 'CSCE 221', concurrentOk: true }]]
  },
  'CSCE 315': {
    title: 'Programming Studio',
    prereqGroups: [
      ['CSCE 312'],
      ['CSCE 314', 'CSCE 350', 'ECEN 350'],
      [{ code: 'CSCE 313', concurrentOk: true }]
    ]
  },
  'CSCE 331': {
    title: 'Foundations of Software Eng',
    prereqGroups: [
      ['CSCE 314', 'CSCE 350', 'ECEN 350'],
      [{ code: 'CSCE 313', concurrentOk: true }]
    ]
  },
  'CSCE 411': {
    title: 'Design/Analysis of Algorithms',
    prereqGroups: [['CSCE 221'], ['CSCE 222', 'ECEN 222']]
  },
  'CSCE 420': { title: 'Artificial Intelligence', prereqGroups: [['CSCE 411']] },
  'MATH 304': { title: 'Linear Algebra', prereqGroups: [] },
  'STAT 211': { title: 'Prin of Statistics I', prereqGroups: [] },
  'STAT 212': { title: 'Prin of Statistics II', prereqGroups: [] },
  'MATH 251': { title: 'Engineering Math III', prereqGroups: [] },
  'MATH 308': { title: 'Differential Equations', prereqGroups: [] },
  'CSCE 421': {
    title: 'Machine Learning',
    prereqGroups: [
      ['MATH 304', 'MATH 311', 'MATH 323'],
      ['STAT 211'],
      ['STAT 404', 'CSCE 221', 'ECEN 303'],
      ['CSCE 121', 'CSCE 120']
    ]
  },
  'CSCE 431': { title: 'Software Engineering', prereqGroups: [['CSCE 315', 'CSCE 331']] },
  'CSCE 434': { title: 'Compiler Design', prereqGroups: [['CSCE 315', 'CSCE 331']] },
  'CSCE 441': { title: 'Computer Graphics', prereqGroups: [['CSCE 221']] },
  'CSCE 442': {
    title: 'Scientific Programming',
    prereqGroups: [
      ['CSCE 221'],
      [{ code: 'MATH 304', concurrentOk: true }, { code: 'MATH 308', concurrentOk: true }]
    ]
  },
  'CSCE 448': {
    title: 'Computational Photography',
    prereqGroups: [['CSCE 315', 'CSCE 331'], ['MATH 304', 'MATH 311']]
  },
  'CSCE 451': { title: 'Software Reverse Engineering', prereqGroups: [['CSCE 313']] },
  'CSCE 463': { title: 'Networks & Distributed Processing', prereqGroups: [['CSCE 313']] },
  'CSCE 465': {
    title: 'Computer & Network Security',
    prereqGroups: [['CSCE 315', 'CSCE 331'], ['CSCE 313']]
  },
  'CSCE 481': { title: 'Seminar', prereqGroups: [] },
  'CSCE 482': {
    title: 'Senior Capstone Design',
    prereqGroups: [['CSCE 411'], ['CSCE 315', 'CSCE 331']]
  }
};

const normalizePrereqOption = (option) => {
  if (typeof option === 'string') {
    const code = normalizeCode(option);
    return code ? { code, concurrentOk: false } : null;
  }
  if (!option || typeof option !== 'object') return null;
  if (typeof option.code !== 'string') return null;
  const code = normalizeCode(option.code);
  if (!code) return null;
  return {
    code,
    concurrentOk: Boolean(option.concurrentOk ?? option.concurrent_ok)
  };
};

const getCoursePrereqGroups = (course) => {
  if (!course) return [];
  const grouped =
    (Array.isArray(course.prereqGroups) && course.prereqGroups) ||
    (Array.isArray(course.prereq_groups) && course.prereq_groups) ||
    null;

  if (grouped) {
    return grouped
      .map((group) => {
        if (!Array.isArray(group)) return [];
        return group.map(normalizePrereqOption).filter(Boolean);
      })
      .filter((group) => group.length > 0);
  }

  if (Array.isArray(course.prereqs)) {
    return course.prereqs
      .map((code) => normalizeCode(code))
      .filter(Boolean)
      .map((code) => [{ code, concurrentOk: false }]);
  }

  return [];
};

const formatPrereqGroupsForChat = (groups) => {
  if (!Array.isArray(groups) || groups.length === 0) return 'None';
  return groups
    .map((group) =>
      group
        .map((option) =>
          option.concurrentOk ? `${option.code} (or concurrent enrollment)` : option.code
        )
        .join(' OR ')
    )
    .map((segment) => `(${segment})`)
    .join(' AND ');
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
          // Summer 2026 should roll into Fall 2026 (same calendar year)
          return { term: 'Fall', year };
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
  const normalizePlannerTermLabel = useCallback(
    (rawTerm, candidateTerms = semesterOrder) => {
      const terms = (Array.isArray(candidateTerms) ? candidateTerms : [])
        .map((term) => String(term || '').trim())
        .filter(Boolean);
      if (terms.length === 0) return '';

      const pickExact = (value) => {
        const lowered = String(value || '').trim().toLowerCase();
        if (!lowered) return '';
        return terms.find((term) => term.toLowerCase() === lowered) || '';
      };

      const raw = String(rawTerm || '').trim();
      if (!raw) return '';
      const exactRaw = pickExact(raw);
      if (exactRaw) return exactRaw;

      const cleaned = raw.replace(/[.,;:!?]+$/g, '').replace(/\s+/g, ' ').trim();
      if (!cleaned) return '';
      const exactCleaned = pickExact(cleaned);
      if (exactCleaned) return exactCleaned;

      const normalizeSeason = (seasonValue) => {
        const season = String(seasonValue || '').trim().toLowerCase();
        if (!season) return '';
        if (season === 'autumn') return 'Fall';
        const normalized = season.charAt(0).toUpperCase() + season.slice(1);
        return ['Fall', 'Winter', 'Spring', 'Summer'].includes(normalized) ? normalized : '';
      };

      const seasonYearMatch = cleaned.match(/\b(fall|spring|summer|winter|autumn)\s*[-/]?\s*(20\d{2})\b/i);
      if (seasonYearMatch) {
        const season = normalizeSeason(seasonYearMatch[1]);
        const year = seasonYearMatch[2];
        const candidate = season ? `${season} ${year}` : '';
        if (candidate && terms.includes(candidate)) return candidate;
      }

      const yearSeasonMatch = cleaned.match(/\b(20\d{2})\s*[-/]?\s*(fall|spring|summer|winter|autumn)\b/i);
      if (yearSeasonMatch) {
        const year = yearSeasonMatch[1];
        const season = normalizeSeason(yearSeasonMatch[2]);
        const candidate = season ? `${season} ${year}` : '';
        if (candidate && terms.includes(candidate)) return candidate;
      }

      const academicYearMatch = cleaned.match(/\b(20\d{2})\s*[-/]\s*(20\d{2})\b/);
      if (academicYearMatch) {
        const firstYear = Number(academicYearMatch[1]);
        const secondYear = Number(academicYearMatch[2]);
        const startYear = secondYear === firstYear + 1 ? firstYear : Math.min(firstYear, secondYear);
        const candidates = [
          `Fall ${startYear}`,
          `Winter ${startYear}`,
          `Spring ${startYear + 1}`,
          `Summer ${startYear + 1}`
        ];
        const resolved = candidates.find((candidate) => terms.includes(candidate));
        if (resolved) return resolved;
      }

      const yearOnlyMatch = cleaned.match(/\b(20\d{2})\b/);
      if (yearOnlyMatch) {
        const year = yearOnlyMatch[1];
        const candidates = [
          `Fall ${year}`,
          `Winter ${year}`,
          `Spring ${year}`,
          `Summer ${year}`,
          `Spring ${Number(year) + 1}`,
          `Summer ${Number(year) + 1}`
        ];
        const resolved = candidates.find((candidate) => terms.includes(candidate));
        if (resolved) return resolved;
      }

      return '';
    },
    [semesterOrder]
  );

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
  const [fyexOverride, setFyexOverride] = useState(false);
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
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
  const [showDifficultyInfo, setShowDifficultyInfo] = useState(null);
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
  /** Normalized course code -> prefer this course when the evaluator breaks ties (anyOf, ordering). */
  const [evaluationPriorityByCode, setEvaluationPriorityByCode] = useState({});
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
  const [uploadedDocumentType, setUploadedDocumentType] = useState('');
  const [evaluationMode, setEvaluationMode] = useState('computed');
  // Tracks whether the currently displayed evaluation matches the current planner inputs.
  const [lastEvaluationSignature, setLastEvaluationSignature] = useState(null);
  const lastEvaluationSnapshotRef = useRef(null);
  const [exportPromptOpen, setExportPromptOpen] = useState(false);
  const [exportPromptStale, setExportPromptStale] = useState(false);
  const [exportPromptBusy, setExportPromptBusy] = useState(false);
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

  // ── Theme (dark / light) ────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('tamuPlannerTheme') || 'light'; } catch { return 'light'; }
  });

  // ── Profile dropdown ────────────────────────────────────────────────────
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef(null);

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
  const FLOWCHART_REFERENCE = useMemo(() => {
    const merged = {};

    const upsertCourse = (rawCode, sourceCourse, forceGroups = false) => {
      const code = normalizeCode(rawCode);
      if (!code) return;
      const existing = merged[code] || {};
      const existingGroups = Array.isArray(existing.prereqGroups) ? existing.prereqGroups : [];
      const incomingGroups = getCoursePrereqGroups(sourceCourse);
      const useIncomingGroups = forceGroups ? incomingGroups.length > 0 : existingGroups.length === 0;

      merged[code] = {
        ...existing,
        title:
          sourceCourse?.title ||
          sourceCourse?.name ||
          existing.title ||
          COURSES[code]?.title ||
          code,
        prereqGroups: useIncomingGroups ? incomingGroups : existingGroups
      };
    };

    // 1) Catalog-backed CSCE set (complete coverage).
    Object.entries(COURSES).forEach(([code, course]) => {
      if (!/^CSCE\s+\d{3}$/.test(code)) return;
      upsertCourse(code, course, false);
    });

    // 2) Manual overrides for known prerequisite/co-requisite corrections.
    Object.entries(FLOWCHART_COURSES).forEach(([code, course]) => {
      upsertCourse(code, course, true);
    });

    // 3) Pull in prerequisite option nodes referenced by CSCE courses so edges can render.
    const csceCodes = Object.keys(merged).filter((code) => /^CSCE\s+\d{3}$/.test(code));
    csceCodes.forEach((code) => {
      const groups = getCoursePrereqGroups(merged[code]);
      groups.forEach((group) => {
        group.forEach((option) => {
          const optionCode = normalizeCode(option?.code || '');
          if (!optionCode || merged[optionCode]) return;
          const catalogMeta = COURSES[optionCode];
          if (catalogMeta) {
            upsertCourse(optionCode, catalogMeta, false);
          } else {
            merged[optionCode] = {
              title: optionCode,
              prereqGroups: []
            };
          }
        });
      });
    });

    return merged;
  }, [COURSES]);
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
          hasSabrCourse,
          fyexOverride,
          evaluationPriorityByCode
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
    fyexOverride,
    evaluationPriorityByCode,
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
          fyexOverride,
          evaluationPriorityByCode,
          savedEvaluation: {
            degreeResult,
            requirementsResult,
            minorResult,
            reqWarning,
            uploadedDocumentType,
            evaluationMode
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
    fyexOverride,
    degreeResult,
    requirementsResult,
    minorResult,
    reqWarning,
    uploadedDocumentType,
    evaluationMode,
    evaluationPriorityByCode,
    authHeaders,
    showToast
  ]);

  const loadUserData = useCallback(async (email, name, tokenOverride) => {
    try {
      if (name) {
        updateDisplayStudentName(name);
      }
      const headers = tokenOverride
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenOverride}` }
        : authHeaders({ 'Content-Type': 'application/json' });
      const resp = await fetch(`${API_BASE}/storage/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, name })
      });
      if (!resp.ok) return false;
      const data = await resp.json();
      let loadedTranscriptTermsForEval = null;
      let loadedSemesterPlansForEval = null;

      if (data.studentId) {
        localStorage.setItem('studentId', String(data.studentId));
        setStudentId(String(data.studentId));
      }

      setIsAdmin(data.isAdmin === true);

      if (data.transcript?.terms?.length > 0) {
        const sanitizedTerms = sanitizeTranscriptTermsForDisplay(data.transcript.terms);
        setTranscriptTerms(sanitizedTerms);
        setReviewTerms(sanitizedTerms);
        setIsTranscriptDirty(false);
        loadedTranscriptTermsForEval = sanitizedTerms;
        const normalized = normalizeTranscript(sanitizedTerms);
        if (normalized.length > 0) {
          setSelectedTranscriptYear(normalized[normalized.length - 1].year);
        }
      }

      if (data.planner) {
        let loadedEvalPriority = {};
        if (
          data.planner.evaluationPriorityByCode &&
          typeof data.planner.evaluationPriorityByCode === 'object'
        ) {
          Object.entries(data.planner.evaluationPriorityByCode).forEach(([k, v]) => {
            const c = normalizeCode(k);
            if (c && v) loadedEvalPriority[c] = true;
          });
        }
        setEvaluationPriorityByCode(loadedEvalPriority);

        if (data.planner.semesterPlans) {
          suppressDirtyRef.current = true;
          const loadedPlans = initSemesterPlans(data.planner.semesterPlans);
          setSemesterPlans(loadedPlans);
          loadedSemesterPlansForEval = loadedPlans;
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
          setSelectedEmphasis(normalizeTrackLabel(data.planner.selectedEmphasis, 'emphasis'));
        }
        if (data.planner.selectedMinor) {
          setSelectedMinor(normalizeTrackLabel(data.planner.selectedMinor, 'minor'));
        }
        if (data.planner.hasHsLanguage != null) {
          setHasHsLanguage(data.planner.hasHsLanguage);
        }
        if (data.planner.hasSabrCourse != null) {
          setHasSabrCourse(data.planner.hasSabrCourse);
        }
        if (data.planner.fyexOverride != null) {
          setFyexOverride(data.planner.fyexOverride);
        }
        if (data.planner.savedEvaluation) {
          const ev = data.planner.savedEvaluation;
          if (ev.degreeResult) {
            const reconciled = reconcileWorkNotApplied(
              ev.degreeResult,
              ev.requirementsResult ?? null,
              ev.minorResult ?? null
            );
            setDegreeResult(reconciled);
          }
          if (ev.requirementsResult) setRequirementsResult(ev.requirementsResult);
          if (ev.minorResult) setMinorResult(ev.minorResult);
          if (ev.reqWarning) setReqWarning(ev.reqWarning);
          if (ev.uploadedDocumentType) setUploadedDocumentType(ev.uploadedDocumentType);
          if (ev.evaluationMode) setEvaluationMode(ev.evaluationMode);
          // Saved evaluation is assumed to match the saved transcript/planner inputs.
          const sig = computeEvaluationSignature({
            transcriptTerms: loadedTranscriptTermsForEval || [],
            semesterPlans: loadedSemesterPlansForEval || initSemesterPlans({}),
            selectedEmphasis: data.planner.selectedEmphasis,
            selectedMinor: data.planner.selectedMinor,
            hasHsLanguage: data.planner.hasHsLanguage,
            hasSabrCourse: data.planner.hasSabrCourse,
            evaluationPriorityCodes: Object.keys(loadedEvalPriority).sort()
          });
          setLastEvaluationSignature(sig);
          lastEvaluationSnapshotRef.current = {
            transcriptTerms: JSON.parse(JSON.stringify(loadedTranscriptTermsForEval || [])),
            semesterPlans: JSON.parse(JSON.stringify(loadedSemesterPlansForEval || initSemesterPlans({})))
          };
        }
      }
      setPlannerDirty(false);
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
    setIsAdmin(false);
    setDisplayStudentName('');
    setStudentId('');
    setTranscriptTerms([]);
    setReviewTerms([]);
    setTranscriptTotals(null);
    setTranscriptPdfName('');
    setUploadedDocumentType('');
    setEvaluationMode('computed');
    setDegreeResult(null);
    setRequirementsResult(null);
    setMinorResult(null);
    setSemesterPlans(initSemesterPlans({}));
    setEvaluationPriorityByCode({});
    setSelectedTranscriptYear('');
    setActiveTab('login');
  };

  const googleLogin = async () => {
    try {
      dataLoadedRef.current = true; // guard: prevent the useEffect from also calling loadUserData
      setIsLoadingData(true);
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

      const loaded = await loadUserData(user.email, user.name, token);
      if (!loaded) dataLoadedRef.current = false;
      setActiveTab('dashboard');
    } catch {
      dataLoadedRef.current = false;
      alert('Google sign-in failed. Please try again.');
    } finally {
      setIsLoadingData(false);
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
      setIsLoadingData(true);
      loadUserData(authUser.email, authUser.name).then((ok) => {
        if (ok) dataLoadedRef.current = true;
      }).finally(() => setIsLoadingData(false));
    }
    if (!authUser) {
      dataLoadedRef.current = false;
    }
  }, [authToken, authUser, loadUserData]);

  // Sync dark/light class to <html> and persist preference
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try { localStorage.setItem('tamuPlannerTheme', theme); } catch {}
  }, [theme]);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    if (!profileDropdownOpen) return;
    const handler = (e) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileDropdownOpen]);

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
          prereqGroups: Array.isArray(c.prereq_groups || c.prereqGroups)
            ? c.prereq_groups || c.prereqGroups
            : [],
          prereqRaw: c.prereq_raw || c.prereqRaw || '',
          status: 'available',
          difficulty: c.difficulty || 0
        });
      });
    });
    return map;
  };

  const CATALOG_CACHE_KEY = 'catalogCache';

  const applyCatalog = useCallback((data) => {
    if (data.courses) setCoursesIndex(buildCourseIndex(data.courses));
    if (data.emphases) {
      setEmphases(data.emphases);
      const names = data.emphases.map((e) => e.emphasis_name || e.name).filter(Boolean);
      setEmphasisOptions(['Undecided', ...names]);
    }
    if (data.minors) {
      setMinors(data.minors);
      const names = data.minors.map((m) => m.minor_name || m.name).filter(Boolean);
      setMinorOptions(['None', ...names]);
    }
  }, []);

  const refreshCatalog = useCallback(async () => {
    try {
      const [coursesRes, emphasesRes, minorsRes] = await Promise.all([
        fetch(`${API_BASE}/api/courses`),
        fetch(`${API_BASE}/api/emphases`),
        fetch(`${API_BASE}/api/minors`)
      ]);
      const freshData = {};
      if (coursesRes.ok) {
        const { courses } = await coursesRes.json();
        freshData.courses = courses || [];
      }
      if (emphasesRes.ok) {
        const { emphases } = await emphasesRes.json();
        freshData.emphases = emphases || [];
      }
      if (minorsRes.ok) {
        const { minors } = await minorsRes.json();
        freshData.minors = minors || [];
      }
      applyCatalog(freshData);
      try {
        localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(freshData));
      } catch { /* localStorage full — non-critical */ }
    } catch (err) {
      console.warn('Failed to load catalog data', err);
    }
  }, [applyCatalog]);

  useEffect(() => {
    // Stale-while-revalidate: instantly load from localStorage, then refresh from server
    try {
      const cached = localStorage.getItem(CATALOG_CACHE_KEY);
      if (cached) applyCatalog(JSON.parse(cached));
    } catch { /* ignore corrupt cache */ }
    refreshCatalog();
  }, [applyCatalog, refreshCatalog]);

  const evaluateRequirementsLocal = async () => {
    setReqLoading(true);
    setReqError('');
    setReqWarning('');
    try {
      if (coursesIndex.size === 0) {
        throw new Error('Catalog not loaded yet. Try again in a moment.');
      }
      // Snapshot the exact planner inputs that this evaluation uses.
      // This supports export-time staleness detection and keeps exported term placement consistent.
      const evaluationSignatureSnapshot = computeEvaluationSignature({
        transcriptTerms,
        semesterPlans,
        selectedEmphasis,
        selectedMinor,
        hasHsLanguage,
        hasSabrCourse,
        evaluationPriorityCodes: Object.keys(evaluationPriorityByCode)
          .filter((k) => evaluationPriorityByCode[k])
          .map((k) => normalizeCode(k))
          .sort()
      });
      const transcriptTermsSnapshot = JSON.parse(JSON.stringify(transcriptTerms || []));
      const semesterPlansSnapshot = JSON.parse(JSON.stringify(semesterPlans || {}));

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
          status: isCourseMarkedInProgress(course) ? 'in-progress' : 'completed',
          evaluationPriority: Boolean(evaluationPriorityByCode[code])
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
            status: 'planned',
            evaluationPriority: Boolean(evaluationPriorityByCode[code])
          });
        });
      });

      const normalizedSelectedEmphasis = normalizeTrackLabel(selectedEmphasis, 'emphasis');
      const normalizedSelectedMinor = normalizeTrackLabel(selectedMinor, 'minor');

      const selectedEmphasisId =
        normalizedSelectedEmphasis && normalizedSelectedEmphasis !== 'Undecided'
          ? emphases.find(
            (e) => normalizeTrackLabel((e.emphasis_name || e.name), 'emphasis') === normalizedSelectedEmphasis
          )?.emphasis_id || null
          : null;
      const selectedMinorId =
        normalizedSelectedMinor && normalizedSelectedMinor !== 'None'
          ? minors.find(
            (m) => normalizeTrackLabel((m.minor_name || m.name), 'minor') === normalizedSelectedMinor
          )?.minor_id || null
          : null;

      // Auto-detect transfer student: any course flagged as transfer credit
      const isTransferStudent = Array.from(combined.values()).some((c) => c.transfer === true);

      // Degree-level evaluation — pass degreeEmphasisId so the backend can
      // populate emphasisCourseIds for the emphasisCredits sub-rule in
      // Supporting Coursework without switching to the emphasis requirement set.
      const degreePayload = {
        catalogYear: null,
        emphasisId: null,
        degreeEmphasisId: selectedEmphasisId ?? null,
        degreeMinorId: selectedMinorId ?? null,
        minorId: null,
        courses: Array.from(combined.values()),
        hasHsLanguage,
        hasSabrCourse,
        isTransferStudent
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
      setEvaluationMode('computed');
      // Evaluation is now based on the snapped planner inputs from above.
      setLastEvaluationSignature(evaluationSignatureSnapshot);
      lastEvaluationSnapshotRef.current = {
        transcriptTerms: transcriptTermsSnapshot,
        semesterPlans: semesterPlansSnapshot
      };
      if (degreeData.warnings?.length) setReqWarning(degreeData.warnings.join(' | '));

      const hasTrackSelection = Boolean(selectedEmphasisId || selectedMinorId);
      if (!hasTrackSelection) {
        setRequirementsResult(null);
        setMinorResult(null);
        return { degreeResult: degreeData, requirementsResult: null, minorResult: null };
      }

      const payload = {
        catalogYear: null,
        emphasisId: selectedEmphasisId,
        minorId: selectedMinorId,
        courses: Array.from(combined.values()),
        hasHsLanguage,
        hasSabrCourse,
        isTransferStudent
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
      let computedMinorData = null;
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
          computedMinorData = minorData;
        } else {
          setMinorResult(null);
        }
      } else {
        setMinorResult(null);
      }
      if (data.warnings?.length) setReqWarning(data.warnings.join(' | '));

      const reconciledDegreeData = reconcileWorkNotApplied(
        degreeData,
        data,
        computedMinorData
      );
      setDegreeResult(reconciledDegreeData);

      return {
        degreeResult: reconciledDegreeData,
        requirementsResult: data,
        minorResult: computedMinorData
      };
    } catch (err) {
      setReqError(err.message);
      setMinorResult(null);
      return null;
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

  const getCourseCreditsForRequirementBar = (rawCode) => {
    const code = normalizeCode(rawCode);
    if (!code) return 0;

    const fromCatalogMap = Number(coursesIndex.get(code)?.credits);
    if (Number.isFinite(fromCatalogMap) && fromCatalogMap > 0) return fromCatalogMap;

    const fromCourses = Number(COURSES[code]?.credits);
    if (Number.isFinite(fromCourses) && fromCourses > 0) return fromCourses;

    const transcriptMatch = transcriptCourseList.find(
      (course) => normalizeCode(course?.code) === code
    );
    const fromTranscript = Number(transcriptMatch?.credits);
    if (Number.isFinite(fromTranscript) && fromTranscript > 0) return fromTranscript;

    return 3;
  };

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
        const norm = normalizeCode(code);
        if (!norm || seen.has(norm) || transcriptCourseCodes.has(norm)) return;
        plannedCredits += getCourseCreditsForRequirementBar(norm);
        plannedCourses += 1;
        seen.add(norm);
      });
    });

    return { plannedCredits, plannedCourses };
  }, [semesterPlans, transcriptCourseCodes, coursesIndex, transcriptCourseList]);

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
  const isCoursePlannedOnly = (courseCode) =>
    Boolean(courseCode) &&
    isCoursePlanned(courseCode) &&
    !isCourseCompleted(courseCode) &&
    !isCourseInProgress(courseCode);
  const getRequirementProgressBreakdown = (group) => {
    const required = Number(group?.requiredCredits) || 0;
    const earned = Number(group?.earnedCredits) || 0;

    if (required <= 0) {
      return {
        greenCredits: earned,
        plannedCredits: 0,
        greenPct: group?.satisfied ? 100 : 0,
        plannedPct: 0,
        combinedPct: group?.satisfied ? 100 : 0,
        plannedLabelCredits: 0
      };
    }

    if (group?.satisfied) {
      const combinedCredits = Math.min(Math.max(earned, 0), required);
      return {
        greenCredits: combinedCredits,
        plannedCredits: 0,
        greenPct: Math.min((combinedCredits / required) * 100, 100),
        plannedPct: 0,
        combinedPct: Math.min(Math.round((combinedCredits / required) * 100), 100),
        plannedLabelCredits: 0
      };
    }

    const usedCodes = Array.from(
      new Set(
        (Array.isArray(group?.usedCourses) ? group.usedCourses : [])
          .map((code) => normalizeCode(code))
          .filter(Boolean)
      )
    );

    let usedPlannedCredits = 0;
    usedCodes.forEach((code) => {
      const credits = getCourseCreditsForRequirementBar(code);
      if (credits <= 0) return;

      const isPlannedByEquivalent = getEquivalents(code).some((eq) => isCoursePlannedOnly(eq));
      const isPlannedOnlyCode = isCoursePlannedOnly(code) || isPlannedByEquivalent;

      if (isPlannedOnlyCode) {
        usedPlannedCredits += credits;
      }
    });

    // Keep total fill as "earned / required" and recolor the tail segment for planned credits.
    const combinedCredits = Math.min(Math.max(earned, 0), required);
    const plannedCredits = Math.min(Math.max(usedPlannedCredits, 0), combinedCredits);
    const greenCredits = Math.max(combinedCredits - plannedCredits, 0);

    return {
      greenCredits,
      plannedCredits,
      greenPct: Math.min((greenCredits / required) * 100, 100),
      plannedPct: Math.min((plannedCredits / required) * 100, 100),
      combinedPct: Math.min(Math.round((combinedCredits / required) * 100), 100),
      plannedLabelCredits: plannedCredits
    };
  };

  const getPrereqOptionSemesterState = (option, semester) => {
    const normalizedOption = normalizePrereqOption(option);
    if (!normalizedOption) {
      return {
        satisfied: false,
        completedOrInProgress: false,
        plannedEarlier: false,
        plannedThisSemester: false,
        plannedAnywhere: false
      };
    }

    const equivalentCodes = [normalizedOption.code, ...getEquivalents(normalizedOption.code)];
    const completedOrInProgress = equivalentCodes.some(
      (eqCode) => isCourseCompleted(eqCode) || isCourseInProgress(eqCode)
    );
    const plannedEarlier = equivalentCodes.some((eqCode) =>
      isCoursePlannedInEarlierSemester(eqCode, semester)
    );
    const plannedThisSemester = equivalentCodes.some((eqCode) =>
      (semesterPlans[semester] || []).includes(eqCode)
    );
    const plannedAnywhere = equivalentCodes.some((eqCode) => isCoursePlanned(eqCode));

    return {
      satisfied:
        completedOrInProgress ||
        plannedEarlier ||
        (normalizedOption.concurrentOk && plannedThisSemester),
      completedOrInProgress,
      plannedEarlier,
      plannedThisSemester,
      plannedAnywhere
    };
  };

  const isPrereqOptionSatisfiedForSemester = (option, semester) =>
    getPrereqOptionSemesterState(option, semester).satisfied;

  const isPrereqSatisfiedForSemester = (prereqCode, semester) =>
    isPrereqOptionSatisfiedForSemester({ code: prereqCode, concurrentOk: false }, semester);

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
      el.style.borderColor = theme === 'dark' ? '#f1a0a0' : '#500000';
      el.style.boxShadow = theme === 'dark' ? '0 0 0 2px rgba(241, 160, 160, 0.3)' : '0 0 0 2px rgba(80, 0, 0, 0.3)';
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

    try {
      let linesCache = null;
      let dataBase64Cache = null;

      const getLines = async () => {
        if (Array.isArray(linesCache)) return linesCache;
        setTranscriptLoadingMessage('Reading PDF text…');
        let rawLines = await extractPdfLines(file);
        if (shouldForceOcr(rawLines) || !hasTermInLines(rawLines)) {
          rawLines = await extractPdfOcrLines(file, setTranscriptLoadingMessage);
        }
        linesCache = preprocessTranscriptLines(rawLines);
        return linesCache;
      };

      const getDataBase64 = async () => {
        if (typeof dataBase64Cache === 'string' && dataBase64Cache.length > 0) {
          return dataBase64Cache;
        }
        dataBase64Cache = await fileToBase64(file);
        return dataBase64Cache;
      };

      const parseAsDegreeEvaluation = async () => {
        let lines = [];
        try {
          lines = await getLines();
        } catch {
          return {
            ok: false,
            error: 'Unable to read this PDF for degree evaluation parsing.'
          };
        }
        setTranscriptLoadingMessage('Extracting courses from degree evaluation…');
        const response = await fetch(`${API_BASE}/storage/parse-degree-evaluation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload?.terms)) {
          return {
            ok: false,
            error: payload?.error || 'Unable to extract courses from this degree evaluation PDF.'
          };
        }
        return { ok: true, payload };
      };

      const parseAsTranscript = async () => {
        const dataBase64 = await getDataBase64();
        setTranscriptLoadingMessage('Uploading transcript…');
        const response = await fetch(`${API_BASE}/storage/parse-transcript`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, dataBase64 })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload?.terms)) {
          return {
            ok: false,
            error: payload?.error || 'Unable to parse this transcript.'
          };
        }
        return { ok: true, payload };
      };

      let detectedType = 'unknown';
      try {
        const lines = await getLines();
        setTranscriptLoadingMessage('Detecting document type…');
        const detectResp = await fetch(`${API_BASE}/storage/detect-document-type`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines })
        });
        const detect = await detectResp.json().catch(() => ({}));
        detectedType = detect?.documentType || 'unknown';
      } catch {
        detectedType = 'unknown';
      }
      setUploadedDocumentType(detectedType);

      const parseOrder =
        detectedType === 'degree-evaluation'
          ? ['degree-evaluation', 'transcript']
          : detectedType === 'transcript'
            ? ['transcript', 'degree-evaluation']
            : ['transcript', 'degree-evaluation'];

      let result = null;
      let parsedAsType = '';
      let lastParseError = '';
      for (const parseType of parseOrder) {
        const attempt =
          parseType === 'degree-evaluation'
            ? await parseAsDegreeEvaluation()
            : await parseAsTranscript();
        if (attempt.ok) {
          result = attempt.payload;
          parsedAsType = parseType;
          break;
        }
        lastParseError = attempt.error || lastParseError;
      }

      if (!result || !Array.isArray(result?.terms)) {
        setTranscriptError(
          lastParseError ||
            'Unable to parse this PDF. Please upload again and choose the correct PDF type.'
        );
        return;
      }

      setUploadedDocumentType(parsedAsType || detectedType);

      if (!result.terms || result.terms.length === 0) {
        setTranscriptError('No terms/courses detected. Please try a different file.');
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
      setEvaluationMode('computed');
      if (parsedAsType === 'degree-evaluation') {
        showToast('Degree evaluation courses extracted. Run Generate to evaluate.', 'success');
      }
      if (detectedType === 'unknown' && parsedAsType === 'transcript') {
        setReqWarning('Document type detection uncertain. Parsed as transcript using Python parser.');
      }
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
        setTranscriptError('Please upload a PDF file.');
        showToast('Please select a PDF file.', 'error');
        return;
      }
      setConsentPendingFile(file);
    },
    [showToast]
  );

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
        const rawTerm = String(item?.term || item?.semester || item?.termLabel || '').trim();
        const term = normalizePlannerTermLabel(rawTerm, semesterOrder) || rawTerm;
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
    const term = normalizePlannerTermLabel(text, semesterOrder);
    if (!courseMatch || !term) return [];

    const courseCode = normalizeCode(`${courseMatch[1]} ${courseMatch[2]}`);
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
  const reconcilePlannerActionsWithUserIntent = (aiActions, userActions) => {
    const ai = (Array.isArray(aiActions) ? aiActions : []).filter(Boolean);
    const user = (Array.isArray(userActions) ? userActions : []).filter(Boolean);
    if (ai.length === 0 || user.length === 0) return ai;

    const userByKey = new Map();
    user.forEach((action) => {
      const key = `${action.type}::${normalizeCode(action.courseCode)}`;
      userByKey.set(key, action);
    });

    let adjusted = false;
    const reconciled = ai.map((action) => {
      const key = `${action.type}::${normalizeCode(action.courseCode)}`;
      const userAction = userByKey.get(key);
      if (!userAction) return action;

      const aiTerm = normalizePlannerTermLabel(action.term, semesterOrder) || String(action.term || '').trim();
      const userTerm =
        normalizePlannerTermLabel(userAction.term, semesterOrder) || String(userAction.term || '').trim();

      if (!userTerm || aiTerm === userTerm) {
        return { ...action, term: aiTerm };
      }

      adjusted = true;
      return {
        ...action,
        term: userTerm,
        reason: action.reason || userAction.reason || 'Requested in chat'
      };
    });

    if (adjusted) return reconciled;
    return ai;
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
      const mentionedCourseCodes = Array.from(
        new Set(
          [...userMessage.toUpperCase().matchAll(/\b([A-Z]{2,4})\s+(\d{3})\b/g)]
            .map((match) => normalizeCode(`${match[1]} ${match[2]}`))
            .filter(Boolean)
        )
      );
      const looksLikePrereqQuestion = /\b(prereq(?:uisite)?s?|pre[-\s]?req(?:uisite)?s?|pre[-\s]?requisite(?:s)?|co[-\s]?req(?:uisite)?s?|co[-\s]?requisite(?:s)?|coreq(?:uisite)?s?|co-?enroll(?:ment)?|concurrent|before)\b/i.test(
        userMessage
      );
      const looksLikePlannerEdit = /\b(add|remove|delete|drop|insert|schedule)\b/i.test(
        userMessage
      );
      if (looksLikePrereqQuestion && !looksLikePlannerEdit && mentionedCourseCodes.length > 0) {
        const askedCode = mentionedCourseCodes[0];
        const courseMeta = FLOWCHART_REFERENCE[askedCode] || COURSES[askedCode];
        const prereqGroups = getCoursePrereqGroups(courseMeta);
        if (courseMeta) {
          const lines = [];
          lines.push(
            `For **${askedCode}**${courseMeta.title ? ` (${courseMeta.title})` : ''}, here are the prerequisites from DegreeFlow's catalog data:`
          );
          if (prereqGroups.length === 0) {
            lines.push('');
            lines.push('• No prerequisite courses are listed.');
          } else {
            lines.push('');
            lines.push('All groups below are required (AND between groups):');
            prereqGroups.forEach((group, idx) => {
              const choices = group
                .map((option) =>
                  option.concurrentOk ? `${option.code} (or concurrent enrollment)` : option.code
                )
                .join(' OR ');
              lines.push(
                `${idx + 1}. Complete one of: ${choices}`
              );
            });
            lines.push('');
            lines.push('Your current status:');
            prereqGroups.forEach((group, idx) => {
              const optionStates = group.map((option) => {
                const completed = isCourseCompleted(option.code);
                const inProgress = isCourseInProgress(option.code);
                const planned = isCoursePlanned(option.code);
                const satisfied = completed || inProgress || (option.concurrentOk && planned);
                let status = 'not satisfied';
                if (completed) status = 'completed';
                else if (inProgress) status = 'in progress';
                else if (planned && option.concurrentOk) status = 'planned (co-req allowed)';
                else if (planned) status = 'planned';
                return `${option.code}: ${status}${satisfied ? ' ✓' : ''}`;
              });
              const groupSatisfied = group.some((option) => {
                if (isCourseCompleted(option.code) || isCourseInProgress(option.code)) return true;
                return option.concurrentOk && isCoursePlanned(option.code);
              });
              lines.push(`• Group ${idx + 1}: ${groupSatisfied ? 'satisfied' : 'not satisfied'} — ${optionStates.join('; ')}`);
            });
          }
          const assistantMsg = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            text: lines.join('\n')
          };
          setChatMessages((prev) => [...prev, assistantMsg]);
          return;
        }
        const assistantMsg = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: `I couldn't find **${askedCode}** in DegreeFlow's local catalog data, so I can't reliably answer prerequisites for it right now.`
        };
        setChatMessages((prev) => [...prev, assistantMsg]);
        return;
      }

      const extractCourseCodesFromText = (value) => {
        if (!value || typeof value !== 'string') return [];
        const matches = [...value.toUpperCase().matchAll(/\b([A-Z]{2,4})\s+(\d{3})\b/g)];
        return matches
          .map((match) => normalizeCode(`${match[1]} ${match[2]}`))
          .filter(Boolean);
      };

      const isCourseSatisfiedForGuidance = (code) => {
        if (!code) return false;
        if (isCourseCompleted(code) || isCourseInProgress(code) || isCoursePlanned(code)) return true;
        return getEquivalents(code).some(
          (eq) => isCourseCompleted(eq) || isCourseInProgress(eq) || isCoursePlanned(eq)
        );
      };

      const getCourseCreditsForGuidance = (code) => getCourseCreditsForRequirementBar(code);

      const collectGuidanceTargetsFromEvaluation = (...results) => {
        const out = new Set();
        const unmetGroups = [];

        const addCode = (rawCode) => {
          const code = normalizeCode(rawCode);
          if (!code) return;
          if (isCourseSatisfiedForGuidance(code)) return;
          out.add(code);
        };

        results.forEach((result) => {
          const groups = Array.isArray(result?.groups) ? result.groups : [];
          groups.forEach((group) => {
            if (group?.satisfied) return;

            const missingItems = Array.isArray(group?.missing) ? group.missing : [];
            const missingCodes = new Set();
            missingItems.forEach((item) => {
              extractCourseCodesFromText(String(item || '')).forEach((code) => {
                addCode(code);
                if (!isCourseSatisfiedForGuidance(code)) missingCodes.add(code);
              });
            });

            const requiredCreditsRaw = Number(group?.requiredCredits);
            const earnedCredits = Number(group?.earnedCredits) || 0;
            const remainingCredits =
              Number.isFinite(requiredCreditsRaw) && requiredCreditsRaw > 0
                ? Math.max(requiredCreditsRaw - earnedCredits, 0)
                : null;

            const recommendationBuckets = Array.isArray(group?.recommendationBuckets)
              ? group.recommendationBuckets
              : [];
            const optionCodes = new Set();
            const recommendedCodes = [];
            const selectedInGroup = new Set();

            const chooseFromOrSet = (codes, targetCredits) => {
              let creditBudget = Math.max(Number(targetCredits) || 0, 0);
              const sorted = [...codes].sort((a, b) => a.localeCompare(b));
              for (const code of sorted) {
                if (selectedInGroup.has(code)) continue;
                selectedInGroup.add(code);
                recommendedCodes.push(code);
                addCode(code);
                if (creditBudget > 0) {
                  creditBudget = Math.max(creditBudget - getCourseCreditsForGuidance(code), 0);
                }
                if (creditBudget <= 0) break;
              }
            };

            recommendationBuckets.forEach((bucket) => {
              const type = String(bucket?.type || '').toLowerCase();
              const bucketCodes = Array.from(
                new Set(
                  (Array.isArray(bucket?.codes) ? bucket.codes : [])
                    .map((code) => normalizeCode(code))
                    .filter(Boolean)
                )
              ).filter((code) => !isCourseSatisfiedForGuidance(code));

              bucketCodes.forEach((code) => optionCodes.add(code));

              if (type === 'required' || type === 'allof') {
                bucketCodes.forEach((code) => {
                  if (selectedInGroup.has(code)) return;
                  selectedInGroup.add(code);
                  recommendedCodes.push(code);
                  addCode(code);
                });
                return;
              }

              if (type === 'anyof' || type === 'pool') {
                const bucketCreditsRaw = Number(bucket?.minCredits);
                const bucketTargetCredits =
                  Number.isFinite(bucketCreditsRaw) && bucketCreditsRaw > 0
                    ? bucketCreditsRaw
                    : remainingCredits && remainingCredits > 0
                    ? Math.min(remainingCredits, 3)
                    : 3;
                chooseFromOrSet(bucketCodes, bucketTargetCredits);
              }
            });

            unmetGroups.push({
              name: group?.name || 'Requirement',
              remainingCredits,
              missingItems: missingItems.map((item) => String(item)),
              optionCodes: Array.from(optionCodes),
              recommendedCodes: Array.from(new Set(recommendedCodes)),
              missingCodes: Array.from(missingCodes)
            });
          });
        });

        return {
          codes: Array.from(out),
          unmetGroups
        };
      };

      const buildSequencingPlan = (rawCodes) => {
        const source = Array.from(new Set((rawCodes || []).map((code) => normalizeCode(code)).filter(Boolean)));
        const remaining = source.filter((code) => !isCourseSatisfiedForGuidance(code));
        const candidateSet = new Set(remaining);

        const strictNextByPrereq = new Map();
        const strictPrereqsByCourse = new Map();
        const coreqByCourse = new Map();
        const externalBlockersByCourse = new Map();
        const indegree = new Map();

        remaining.forEach((code) => {
          strictNextByPrereq.set(code, new Set());
          strictPrereqsByCourse.set(code, new Set());
          coreqByCourse.set(code, new Set());
          externalBlockersByCourse.set(code, new Set());
          indegree.set(code, 0);
        });

        remaining.forEach((code) => {
          const courseMeta = FLOWCHART_REFERENCE[code] || COURSES[code];
          const groups = getCoursePrereqGroups(courseMeta);
          groups.forEach((group) => {
            if (group.some((option) => isCourseSatisfiedForGuidance(option.code))) return;

            const strictMissing = group
              .filter((option) => !option.concurrentOk && candidateSet.has(option.code))
              .map((option) => option.code);

            if (strictMissing.length > 0) {
              strictMissing.forEach((pre) => {
                if (!pre || pre === code) return;
                if (!strictNextByPrereq.has(pre)) return;
                const nextSet = strictNextByPrereq.get(pre);
                const prereqSet = strictPrereqsByCourse.get(code);
                if (nextSet.has(code)) return;
                nextSet.add(code);
                prereqSet.add(pre);
                indegree.set(code, (indegree.get(code) || 0) + 1);
              });
              return;
            }

            const coreqCandidates = group
              .filter((option) => option.concurrentOk && candidateSet.has(option.code))
              .map((option) => option.code);
            if (coreqCandidates.length > 0) {
              const coreqSet = coreqByCourse.get(code);
              coreqCandidates.forEach((c) => coreqSet.add(c));
              return;
            }

            const externalStrict = group
              .filter((option) => !option.concurrentOk && !isCourseSatisfiedForGuidance(option.code))
              .map((option) => option.code);
            if (externalStrict.length > 0) {
              const blockerSet = externalBlockersByCourse.get(code);
              externalStrict.forEach((c) => blockerSet.add(c));
            }
          });
        });

        const queue = remaining
          .filter((code) => (indegree.get(code) || 0) === 0)
          .sort((a, b) => {
            const outA = strictNextByPrereq.get(a)?.size || 0;
            const outB = strictNextByPrereq.get(b)?.size || 0;
            if (outB !== outA) return outB - outA;
            return a.localeCompare(b);
          });

        const ordered = [];
        while (queue.length > 0) {
          const current = queue.shift();
          ordered.push(current);
          const neighbors = Array.from(strictNextByPrereq.get(current) || []);
          neighbors.forEach((neighbor) => {
            const nextValue = (indegree.get(neighbor) || 0) - 1;
            indegree.set(neighbor, nextValue);
            if (nextValue === 0) {
              queue.push(neighbor);
            }
          });
          queue.sort((a, b) => {
            const outA = strictNextByPrereq.get(a)?.size || 0;
            const outB = strictNextByPrereq.get(b)?.size || 0;
            if (outB !== outA) return outB - outA;
            return a.localeCompare(b);
          });
        }

        const unresolvedCycle = remaining
          .filter((code) => !ordered.includes(code))
          .sort((a, b) => a.localeCompare(b));
        const finalOrder = [...ordered, ...unresolvedCycle];

        return {
          source,
          remaining,
          finalOrder,
          strictNextByPrereq,
          strictPrereqsByCourse,
          coreqByCourse,
          externalBlockersByCourse
        };
      };

      const parseTermLabel = (termLabel) => {
        const match = String(termLabel || '').trim().match(/^(Fall|Winter|Spring|Summer)\s+(20\d{2})$/);
        if (!match) return null;
        return { season: match[1], year: Number(match[2]) };
      };

      const deriveCurrentTermForGuidance = () => {
        const transcriptCurrentTerms = (Array.isArray(transcriptTerms) ? transcriptTerms : [])
          .filter((term) => {
            const normalizedStatus = String(term?.status || '').trim().toLowerCase();
            if (normalizedStatus === 'in progress') return true;
            return (Array.isArray(term?.courses) ? term.courses : []).some((course) =>
              isCourseMarkedInProgress({ ...course, termStatus: term?.status })
            );
          })
          .map((term) => String(term?.label || '').trim())
          .filter((label) => semesterIndex.has(label));
        if (transcriptCurrentTerms.length > 0) {
          transcriptCurrentTerms.sort((a, b) => (semesterIndex.get(a) ?? 0) - (semesterIndex.get(b) ?? 0));
          return transcriptCurrentTerms[transcriptCurrentTerms.length - 1];
        }

        // Do not use selected planner tab as "current semester" for guidance.
        // Guidance should be anchored to the real current term when transcript
        // in-progress terms are unavailable.
        const now = new Date();
        const month = now.getMonth();
        const year = now.getFullYear();
        return month <= 4 ? `Spring ${year}` : `Fall ${year}`;
      };

      const getNextPrimaryTermLabel = (termLabel) => {
        const parsed = parseTermLabel(termLabel);
        if (!parsed) return null;
        // Required rule:
        // Spring Y -> Fall Y
        // Fall Y -> Spring Y+1
        // Summer Y -> Fall Y
        // Winter Y -> Spring Y+1
        if (parsed.season === 'Spring') return `Fall ${parsed.year}`;
        if (parsed.season === 'Fall') return `Spring ${parsed.year + 1}`;
        if (parsed.season === 'Summer') return `Fall ${parsed.year}`;
        return `Spring ${parsed.year + 1}`;
      };

      const advancePrimaryTermLabel = (termLabel) => {
        const parsed = parseTermLabel(termLabel);
        if (!parsed) return null;
        if (parsed.season === 'Fall') return `Spring ${parsed.year + 1}`;
        return `Fall ${parsed.year}`;
      };

      const buildSemesterizedPlan = (sequencing, startTermLabel) => {
        if (!startTermLabel || sequencing.finalOrder.length === 0) {
          return { terms: [], assignments: new Map() };
        }

        const MAX_COURSES_PER_TERM = 4;
        const termLabels = [startTermLabel];
        const termToCourses = new Map([[startTermLabel, []]]);
        const courseToTermIndex = new Map();

        const ensureTermLabel = (targetIndex) => {
          let guard = 0;
          while (termLabels.length <= targetIndex && guard < 200) {
            const last = termLabels[termLabels.length - 1];
            const next = advancePrimaryTermLabel(last);
            if (!next) break;
            termLabels.push(next);
            if (!termToCourses.has(next)) termToCourses.set(next, []);
            guard += 1;
          }
          return termLabels[targetIndex] || termLabels[termLabels.length - 1];
        };

        sequencing.finalOrder.forEach((code) => {
          let earliestIndex = 0;
          const strictDeps = Array.from(sequencing.strictPrereqsByCourse.get(code) || []);
          strictDeps.forEach((dep) => {
            const depIndex = courseToTermIndex.get(dep);
            if (depIndex !== undefined) earliestIndex = Math.max(earliestIndex, depIndex + 1);
          });

          let termIndex = earliestIndex;
          let guard = 0;
          while (guard < 200) {
            const label = ensureTermLabel(termIndex);
            const bucket = termToCourses.get(label) || [];
            if (bucket.length < MAX_COURSES_PER_TERM) {
              bucket.push(code);
              termToCourses.set(label, bucket);
              courseToTermIndex.set(code, termIndex);
              break;
            }
            termIndex += 1;
            guard += 1;
          }
        });

        const terms = termLabels
          .map((label) => ({ term: label, courses: termToCourses.get(label) || [] }))
          .filter((item) => item.courses.length > 0);

        return { terms, assignments: courseToTermIndex };
      };

      const buildPriorityCourseRecommendations = (sequencing, unmetGroups) => {
        const ordered = Array.isArray(sequencing?.finalOrder) ? sequencing.finalOrder : [];
        const strictNextByPrereq = sequencing?.strictNextByPrereq || new Map();
        const strictPrereqsByCourse = sequencing?.strictPrereqsByCourse || new Map();

        const unmetGroupsByCode = new Map();
        (Array.isArray(unmetGroups) ? unmetGroups : []).forEach((group) => {
          const groupName = String(group?.name || 'Requirement').trim();
          const candidateCodes = new Set(
            [
              ...(Array.isArray(group?.recommendedCodes) ? group.recommendedCodes : []),
              ...(Array.isArray(group?.missingCodes) ? group.missingCodes : []),
              ...(Array.isArray(group?.optionCodes) ? group.optionCodes : [])
            ]
              .map((code) => normalizeCode(code))
              .filter(Boolean)
          );
          candidateCodes.forEach((code) => {
            if (isCourseSatisfiedForGuidance(code)) return;
            if (!unmetGroupsByCode.has(code)) unmetGroupsByCode.set(code, new Set());
            unmetGroupsByCode.get(code).add(groupName);
          });
        });

        const targetCount =
          ordered.length >= 6 ? 6 : ordered.length >= 5 ? 5 : ordered.length;
        const selected = [];
        const seen = new Set();

        ordered.forEach((code) => {
          if (selected.length >= targetCount) return;
          if (!code || seen.has(code) || isCourseSatisfiedForGuidance(code)) return;
          selected.push(code);
          seen.add(code);
        });

        if (selected.length < targetCount) {
          const supplemental = Array.from(unmetGroupsByCode.keys()).sort((a, b) => {
            const unlockA = (strictNextByPrereq.get(a) || new Set()).size;
            const unlockB = (strictNextByPrereq.get(b) || new Set()).size;
            if (unlockB !== unlockA) return unlockB - unlockA;
            return a.localeCompare(b);
          });
          supplemental.forEach((code) => {
            if (selected.length >= targetCount) return;
            if (seen.has(code) || isCourseSatisfiedForGuidance(code)) return;
            selected.push(code);
            seen.add(code);
          });
        }

        return selected.map((code) => {
          const title = FLOWCHART_REFERENCE[code]?.title || COURSES[code]?.title || '';
          const unlocks = Array.from(strictNextByPrereq.get(code) || []);
          const strictDeps = Array.from(strictPrereqsByCourse.get(code) || []);
          const groups = Array.from(unmetGroupsByCode.get(code) || []);

          let reason = 'next best remaining course';
          if (unlocks.length > 0) {
            reason = `unlocks ${unlocks.slice(0, 2).join(', ')}${
              unlocks.length > 2 ? ', ...' : ''
            }`;
          } else if (groups.length > 0) {
            reason = `addresses ${groups[0]}`;
          } else if (strictDeps.length === 0) {
            reason = 'ready with no unmet strict prerequisites';
          } else {
            reason = `after ${strictDeps.join(', ')}`;
          }

          return { code, title, reason };
        });
      };

      const estimateCoursesNeededForCredits = (codes, remainingCredits) => {
        const neededCredits = Number(remainingCredits);
        if (!Number.isFinite(neededCredits) || neededCredits <= 0) return 0;

        const uniqueCodes = Array.from(
          new Set((Array.isArray(codes) ? codes : []).map((code) => normalizeCode(code)).filter(Boolean))
        ).filter((code) => !isCourseSatisfiedForGuidance(code));

        const creditValues = uniqueCodes
          .map((code) => getCourseCreditsForGuidance(code))
          .filter((credit) => Number.isFinite(credit) && credit > 0)
          .sort((a, b) => b - a);

        if (creditValues.length === 0) {
          return Math.max(1, Math.ceil(neededCredits / 3));
        }

        let coveredCredits = 0;
        let courseCount = 0;
        for (const credit of creditValues) {
          if (coveredCredits >= neededCredits) break;
          coveredCredits += credit;
          courseCount += 1;
        }

        if (coveredCredits < neededCredits) {
          courseCount += Math.ceil((neededCredits - coveredCredits) / 3);
        }

        return Math.max(courseCount, 1);
      };

      const guidanceTargets = collectGuidanceTargetsFromEvaluation(
        degreeResult,
        requirementsResult,
        minorResult
      );
      const missingFromEvaluation = guidanceTargets.codes;
      const unmetGroupsForGuidance = guidanceTargets.unmetGroups;
      const sequencingPlan = buildSequencingPlan(missingFromEvaluation);
      const currentGuidanceTerm = deriveCurrentTermForGuidance();
      const nextGuidanceTerm = getNextPrimaryTermLabel(currentGuidanceTerm);
      const semesterizedPlan = buildSemesterizedPlan(sequencingPlan, nextGuidanceTerm);
      const prioritizedGuidanceCourses = buildPriorityCourseRecommendations(
        sequencingPlan,
        unmetGroupsForGuidance
      );
      const guidanceCreditNeedSummaries = unmetGroupsForGuidance
        .map((group) => {
          const remainingCredits = Number(group?.remainingCredits);
          if (!Number.isFinite(remainingCredits) || remainingCredits <= 0) return null;
          const candidateCodes = [
            ...(Array.isArray(group?.recommendedCodes) ? group.recommendedCodes : []),
            ...(Array.isArray(group?.missingCodes) ? group.missingCodes : []),
            ...(Array.isArray(group?.optionCodes) ? group.optionCodes : [])
          ];
          const estimatedCourses = estimateCoursesNeededForCredits(candidateCodes, remainingCredits);
          return {
            name: String(group?.name || 'Requirement').trim() || 'Requirement',
            remainingCredits,
            estimatedCourses
          };
        })
        .filter(Boolean);
      const looksLikeGuidanceQuestion = /\b(what\s+should\s+i\s+take|what\s+courses?\s+should\s+i\s+plan|what\s+do\s+i\s+need|which\s+courses?\s+(should|do)|which\s+course.*first|what.*missing|next\s+courses?|future\s+semesters?|course\s+order|course\s+sequence|course\s+plan|plan\s+my|remaining\s+requirements?|requirements?\s+check|what\s+do\s+you\s+recommend|recommend(?:ed|ation)?(?:\s+for\s+me)?|recommend.*courses?)\b/i.test(
        userMessage
      );
      if (!looksLikePlannerEdit && looksLikeGuidanceQuestion && (sequencingPlan.finalOrder.length > 0 || unmetGroupsForGuidance.length > 0)) {
        const lines = [];
        lines.push('Here is your prioritized next-course list (highest priority first):');
        if (nextGuidanceTerm) {
          lines.push(`Start planning from **${nextGuidanceTerm}**.`);
        }
        if (guidanceCreditNeedSummaries.length === 1) {
          const summary = guidanceCreditNeedSummaries[0];
          const creditWord = summary.remainingCredits === 1 ? 'credit hour' : 'credit hours';
          const courseWord = summary.estimatedCourses === 1 ? 'course' : 'courses';
          lines.push(
            `You are missing **${summary.remainingCredits}** ${creditWord} in **${summary.name}**, so you only need to choose about **${summary.estimatedCourses}** ${courseWord} from the prioritized list below.`
          );
        } else if (guidanceCreditNeedSummaries.length > 1) {
          lines.push('Credit-hour needs by unmet requirement:');
          guidanceCreditNeedSummaries.forEach((summary) => {
            const creditWord = summary.remainingCredits === 1 ? 'credit hour' : 'credit hours';
            const courseWord = summary.estimatedCourses === 1 ? 'course' : 'courses';
            lines.push(
              `- **${summary.name}**: ${summary.remainingCredits} ${creditWord} remaining (about ${summary.estimatedCourses} ${courseWord}).`
            );
          });
        }
        lines.push('');
        if (prioritizedGuidanceCourses.length === 0) {
          lines.push('No remaining schedulable courses were detected from your current evaluation.');
        } else {
          prioritizedGuidanceCourses.forEach((course, idx) => {
            lines.push(
              `${idx + 1}. **${course.code}**${course.title ? ` (${course.title})` : ''} — ${course.reason}`
            );
          });
          lines.push('');
          lines.push(
            'Only remaining courses are included (completed, in-progress, and already planned courses are excluded).'
          );
        }

        const assistantMsg = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: lines.join('\n')
        };
        setChatMessages((prev) => [...prev, assistantMsg]);
        return;
      }

      const contextParts = [];
      
      contextParts.push('STUDENT PROFILE:');
      contextParts.push(`- Texas A&M University Computer Science student`);
      contextParts.push(`- Major: Computer Science`);
      contextParts.push(`- Selected Emphasis: ${selectedEmphasis || 'Undecided'}`);
      contextParts.push(`- Selected Minor: ${selectedMinor || 'None'}`);
      contextParts.push(`- Planner terms available for edits: ${semesterOrder.join(', ')}`);
      contextParts.push(`- Current term for guidance: ${currentGuidanceTerm}`);
      contextParts.push(`- Next recommendation term (must start here or later): ${nextGuidanceTerm || 'Unknown'}`);

      contextParts.push('\nAUTHORITATIVE PREREQUISITE REFERENCE (USE THIS AS SOURCE OF TRUTH):');
      Object.entries(FLOWCHART_REFERENCE).forEach(([code, course]) => {
        const groups = getCoursePrereqGroups(course);
        contextParts.push(`- ${code}: ${formatPrereqGroupsForChat(groups)}`);
      });
      mentionedCourseCodes.forEach((code) => {
        if (FLOWCHART_REFERENCE[code]) return;
        const course = COURSES[code];
        if (!course) return;
        const groups = getCoursePrereqGroups(course);
        contextParts.push(`- ${code}: ${formatPrereqGroupsForChat(groups)}`);
      });

      contextParts.push('\nPREREQUISITE-ORDERED COURSE GUIDANCE (DERIVED FROM MISSING REQUIREMENTS):');
      if (sequencingPlan.finalOrder.length === 0) {
        contextParts.push('- No unscheduled missing courses were detected from current evaluation results.');
      } else {
        contextParts.push(`- Missing course candidates: ${sequencingPlan.source.join(', ') || 'None'}`);
        contextParts.push(`- Remaining unscheduled candidates after completion/in-progress/planned filter: ${sequencingPlan.remaining.join(', ') || 'None'}`);
        sequencingPlan.finalOrder.forEach((code, idx) => {
          const title = FLOWCHART_REFERENCE[code]?.title || COURSES[code]?.title || 'Title unavailable';
          const strictDeps = Array.from(sequencingPlan.strictPrereqsByCourse.get(code) || []);
          const unlocks = Array.from(sequencingPlan.strictNextByPrereq.get(code) || []);
          const coreqs = Array.from(sequencingPlan.coreqByCourse.get(code) || []);
          const external = Array.from(sequencingPlan.externalBlockersByCourse.get(code) || []);
          contextParts.push(`${idx + 1}. ${code}: ${title}`);
          if (strictDeps.length > 0) {
            contextParts.push(`   strict prerequisites still in missing list: ${strictDeps.join(', ')}`);
          }
          if (unlocks.length > 0) {
            contextParts.push(`   unlocks: ${unlocks.join(', ')}`);
          }
          if (coreqs.length > 0) {
            contextParts.push(`   co-req options (can be same term): ${coreqs.join(', ')}`);
          }
          if (external.length > 0) {
            contextParts.push(`   additional unmet prerequisites outside missing list: ${external.join(', ')}`);
          }
        });
        if (semesterizedPlan.terms.length > 0) {
          contextParts.push('- Semesterized sequence (start from next recommendation term):');
          semesterizedPlan.terms.forEach(({ term, courses }) => {
            contextParts.push(`  - ${term}: ${courses.join(', ')}`);
          });
        }
      }
      if (unmetGroupsForGuidance.length > 0) {
        contextParts.push('- Unmet requirement groups and candidate options:');
        unmetGroupsForGuidance.forEach((group) => {
          const suffix =
            typeof group.remainingCredits === 'number'
              ? ` (remaining ${group.remainingCredits} credits)`
              : '';
          contextParts.push(`  - ${group.name}${suffix}`);
          if (group.optionCodes.length > 0) {
            contextParts.push(`    options (OR): ${group.optionCodes.join(' OR ')}`);
          }
          if (group.recommendedCodes.length > 0) {
            contextParts.push(`    selected for sequencing: ${group.recommendedCodes.join(', ')}`);
          }
          if (group.missingItems.length > 0) {
            contextParts.push(`    missing text: ${group.missingItems.join('; ')}`);
          }
        });
      }
      
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
        content: `You are DegreeFlow Assistant, an AI advisor for Texas A&M University students. 

IMPORTANT INSTRUCTIONS:
1. Use the student's current transcript/planner/evaluation context below to give personalized advice.
2. The "AUTHORITATIVE PREREQUISITE REFERENCE" in the context is the source of truth for prerequisite and co-requisite answers.
3. Do not invent or override prerequisites from memory, and do not claim requirements not present in the provided reference.
4. Help with course planning, prerequisite checking, graduation requirements, and academic guidance.
4.1. Prioritize the "DEGREE EVALUATION SNAPSHOT" to identify missing requirement groups and recommend next courses.
4.2. Do not suggest courses already completed or currently in progress unless explicitly asked for alternatives/retakes.
4.3. For credit-based requirement groups, compute missing credits as (required - earned). Never interpret earned credits as remaining credits.
4.4. For prerequisite questions, explicitly describe AND/OR logic and whether concurrent enrollment is allowed.
4.5. When giving course sequence guidance, follow "PREREQUISITE-ORDERED COURSE GUIDANCE" so prerequisites come before dependent courses.
4.6. If Course A is a prerequisite of Course B and both are missing, recommend A before B and explain the dependency.
4.7. If the user explicitly asks to add/remove planned courses, append a machine-readable action block at the end using this exact format:
[DEGREEFLOW_ACTIONS]
{"actions":[{"type":"add|remove","courseCode":"SUBJ 123","term":"Fall 2026","reason":"optional short reason"}]}
[/DEGREEFLOW_ACTIONS]
4.8. Only include actions the user asked for, and only use term labels from "Planner terms available for edits".
4.9. For direct commands like "add/remove COURSE_CODE to/from TERM", always include the action block; do not refuse for ambiguity.
4.10. For semester-by-semester recommendations, start at "Next recommendation term" and never suggest earlier terms.
4.11. For pool/choice requirements (e.g., Creative Arts), present options as OR choices; do not treat every option as required.
4.12. For future-planning/recommendation questions, prefer a concise ranked list of 5-6 remaining courses ordered highest-to-lowest by prerequisite dependency priority.
5. Format your responses with clear structure:
   - Use **bold** for emphasis (e.g., **Important:** or **Course Name**)
   - Use bullet points (•) or numbered lists for multiple items
   - Use line breaks to separate sections
   - Keep paragraphs short and scannable
6. If prerequisite data for a requested course is missing from context, say that clearly and ask the user to verify with catalog staff.

STUDENT CONTEXT:
${contextParts.join('\n')}

Now answer the student's question using only this context.`
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
      const parsedUserActions = parsePlannerActionFromUserMessage(userMessage);
      const fallbackActions =
        actions.length > 0
          ? reconcilePlannerActionsWithUserIntent(actions, parsedUserActions)
          : parsedUserActions;
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
    const nk = normalizeCode(courseCode);
    setEvaluationPriorityByCode((prev) => {
      if (!nk || !prev[nk]) return prev;
      const next = { ...prev };
      delete next[nk];
      return next;
    });
    setExcludedFromEval((prev) => {
      const next = new Set(prev);
      next.delete(nk);
      return next;
    });
    setSemesterPlans((prev) => ({
      ...prev,
      [semester]: (prev[semester] || []).filter((c) => normalizeCode(c) !== nk)
    }));
    setPlannerDirty(true);
  };

  /** Remove a course from the transcript for a given term (planner + academic record). */
  const removeCourseFromTranscriptRecord = (termLabel, courseCode) => {
    const nk = normalizeCode(courseCode);
    if (!termLabel || !nk) return;
    const filterCourses = (courses) =>
      (courses || []).filter((c) => normalizeCode(c?.code) !== nk);
    const updater = (prevTerms) =>
      (prevTerms || []).map((term) => {
        if (term.label !== termLabel) return term;
        return { ...term, courses: filterCourses(term.courses) };
      });
    setTranscriptTerms((prevT) => {
      const nextT = updater(prevT);
      setReviewTerms((prevR) => updater(prevR && prevR.length > 0 ? prevR : prevT));
      return nextT;
    });
    setExcludedFromEval((prev) => {
      const next = new Set(prev);
      next.delete(nk);
      return next;
    });
    setEvaluationPriorityByCode((prev) => {
      if (!nk || !prev[nk]) return prev;
      const next = { ...prev };
      delete next[nk];
      return next;
    });
    setExcludedTransferCourses((prev) => {
      const next = new Set(prev);
      next.delete(courseCode);
      next.delete(nk);
      return next;
    });
    setIsTranscriptDirty(true);
    setPlannerDirty(true);
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
        const rawTerm = String(action.term || '').trim();
        const term = normalizePlannerTermLabel(rawTerm, Object.keys(next)) || rawTerm;
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
      const norm = normalizeCode(code);
      totalCredits += getCourseCreditsForRequirementBar(norm);
      const course = COURSES[norm];
      totalDifficulty += typeof course?.difficulty === 'number' ? course.difficulty : 0;
      if (!course) return;

      if (isCourseCompleted(norm) || isCourseInProgress(norm) || isCoursePlannedInEarlierSemester(norm, semester)) {
        errors.push(`${norm} has already been taken or planned in a prior semester`);
      }

      const prereqGroups = getCoursePrereqGroups(course);
      prereqGroups.forEach((group) => {
        const optionStates = group.map((option) => ({
          option,
          state: getPrereqOptionSemesterState(option, semester)
        }));

        if (optionStates.some(({ state }) => state.satisfied)) return;

        const strictPlanned = optionStates.find(
          ({ option, state }) => !option.concurrentOk && state.plannedAnywhere
        );
        if (strictPlanned) {
          warnings.push(
            `${norm}: prerequisite ${strictPlanned.option.code} is planned but not in an earlier semester`
          );
          return;
        }

        const coreqPlannedLater = optionStates.find(
          ({ option, state }) =>
            option.concurrentOk &&
            state.plannedAnywhere &&
            !state.plannedEarlier &&
            !state.plannedThisSemester
        );
        if (coreqPlannedLater) {
          warnings.push(
            `${norm}: co-requisite ${coreqPlannedLater.option.code} is planned in a later semester`
          );
          return;
        }

        const requiredLabel = group
          .map((option) =>
            option.concurrentOk ? `${option.code} (or concurrent enrollment)` : option.code
          )
          .join(' or ');
        errors.push(`${norm} requires ${requiredLabel} (not completed or planned)`);
      });

      // Warn about equivalent courses already completed/planned
      const equivalents = getEquivalents(norm);
      equivalents.forEach((eq) => {
        if (isCourseCompleted(eq) || isCourseInProgress(eq)) {
          warnings.push(`${norm} is equivalent to ${eq} (already on transcript) — will not count separately`);
        } else if (isCoursePlanned(eq) && eq !== norm) {
          warnings.push(`${norm} is equivalent to ${eq} (also planned) — only one will count`);
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
        const n = normalizeCode(c?.code);
        if (n) set.add(n);
      });
      return set;
    }, [transcriptCourseList]);

    // Yellow: Planned = in semesterPlans but not already taken/registered
    const plannedSet = useMemo(() => {
      const set = new Set();
      Object.values(semesterPlans || {}).forEach((list) => {
        (list || []).forEach((code) => {
          const n = normalizeCode(code);
          if (!n) return;
          if (takenOrRegistered.has(n)) return;
          set.add(n);
        });
      });
      return set;
    }, [semesterPlans, takenOrRegistered]);

    const getCreditsFor = (code) => getCourseCreditsForRequirementBar(code);

    const getTitleFor = (code) => {
      const n = normalizeCode(code);
      return (n && COURSES[n]?.title) || COURSES[code]?.title || 'Course';
    };

    const areaSummaries = useMemo(() => {
      return areas.map((area) => {
        const required = Number(area.requiredCredits) || 0;
        const eligible = Array.isArray(area.courses) ? area.courses : [];

        const takenCourses = eligible.filter((c) => takenOrRegistered.has(normalizeCode(c)));
        const plannedCourses = eligible.filter((c) => plannedSet.has(normalizeCode(c)));

        const takenCredits = takenCourses.reduce((sum, c) => sum + getCreditsFor(c), 0);
        const plannedCredits = plannedCourses.reduce((sum, c) => sum + getCreditsFor(c), 0);

        // Cap display so bar never exceeds required credits
        const displayGreen = Math.min(takenCredits, required);
        const remainingAfterGreen = Math.max(required - displayGreen, 0);
        const displayYellow = Math.min(plannedCredits, remainingAfterGreen);
        const displayRed = Math.max(required - displayGreen - displayYellow, 0);

        // Pick a small set of missing courses to show (until it covers missing credits)
        const missingCoursesAll = eligible.filter((c) => {
          const n = normalizeCode(c);
          return !takenOrRegistered.has(n) && !plannedSet.has(n);
        });
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
    }, [areas, takenOrRegistered, plannedSet, transcriptCourseList, COURSES, coursesIndex]);

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
          <h3 className="text-lg font-bold" style={{ color: theme === 'dark' ? '#f1a0a0' : '#500000' }}>
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
              <div key={area.id} className="border rounded-lg" style={{ borderColor: theme === 'dark' ? '#4ade80' : '#2f9e44' }}>
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
                  className="mt-1 w-48 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100"
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
                  className="mt-1 w-48 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100"
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
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-[#500000] focus:ring-[#500000]/30 cursor-pointer"
              />
              <span className="text-sm text-gray-700">Completed 2 years of same foreign language in HS</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasSabrCourse}
                onChange={(e) => setHasSabrCourse(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-[#500000] focus:ring-[#500000]/30 cursor-pointer"
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
                onClick={() => void evaluateRequirementsLocal()}
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
                <>
                  <button
                    type="button"
                    onClick={handleExportPdfClick}
                    disabled={reqLoading || exportPromptBusy || coursesIndex.size === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded border border-white/60 text-white bg-white/10 hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    style={{ backgroundColor: '#500000' }}
                  >
                    Export PDF
                  </button>
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
                </>
              )}
            </div>
          </div>
          {reqError && <p className="text-sm text-red-600 mb-2">{reqError}</p>}
          {reqWarning && !reqError && <p className="text-sm text-amber-700 mb-2">{reqWarning}</p>}
          {degreeResult ? (() => {
            const isFyexGroup = (g) => g.name?.startsWith('First Year Experience');
            const allGroups = (degreeResult.groups || []).map((g) =>
              isFyexGroup(g) && fyexOverride ? { ...g, satisfied: true, missing: [] } : g
            );
            const satisfiedGroups = allGroups.filter((g) => g.satisfied);
            const unsatisfiedGroups = allGroups.filter((g) => !g.satisfied);
            const totalSatisfied = satisfiedGroups.length;
            const totalGroups = allGroups.length;
            const pctDone = totalGroups > 0 ? Math.round((totalSatisfied / totalGroups) * 100) : 0;

            const renderGroup = (group) => {
              const earned = group.earnedCredits || 0;
              const required = group.requiredCredits || 0;
              const progressBreakdown = getRequirementProgressBreakdown(group);
              const pct = required > 0 ? progressBreakdown.combinedPct : (group.satisfied ? 100 : 0);
              const exceeded = required > 0 && earned > required;
              const extraCredits = exceeded ? earned - required : 0;
              const plannedCredits = progressBreakdown.plannedLabelCredits || 0;
              const ariaLabel = required > 0
                ? `${earned} of ${required} credits counted${plannedCredits > 0 ? `, ${plannedCredits} planned` : ''}${exceeded ? `, ${extraCredits} extra` : ''}`
                : (group.satisfied ? 'Satisfied' : 'Not satisfied');
              const hasOverflow = group.overflowCourses?.length > 0;
              const isFyex = isFyexGroup(group);
              const hasDetails = (group.missing?.length > 0) || (group.usedCourses?.length > 0) || (group.warnings?.length > 0) || hasOverflow || isFyex;

              return (
                <details key={group.name} className="rounded border border-gray-200 dark:border-gray-700 group">
                  <summary className="cursor-pointer select-none px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded list-none">
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
                        {plannedCredits > 0 && (
                          <span className="text-xs font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                            +{plannedCredits} planned
                          </span>
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
                          <div className="h-full flex">
                            {progressBreakdown.greenPct > 0 && (
                              <div
                                className={`h-full ${progressBreakdown.plannedPct > 0 ? 'rounded-l-full' : 'rounded-full'} transition-all`}
                                style={{ width: `${progressBreakdown.greenPct}%`, backgroundColor: '#16a34a' }}
                              />
                            )}
                            {progressBreakdown.plannedPct > 0 && (
                              <div
                                className={`h-full ${progressBreakdown.greenPct > 0 ? '' : 'rounded-l-full'} ${pct >= 100 ? 'rounded-r-full' : ''} transition-all`}
                                style={{ width: `${progressBreakdown.plannedPct}%`, backgroundColor: '#2563eb' }}
                              />
                            )}
                          </div>
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
                          style={{ backgroundColor: group.satisfied ? (theme === 'dark' ? 'rgba(74,222,128,0.2)' : '#bbf7d0') : (theme === 'dark' ? 'rgba(248,113,113,0.2)' : '#fca5a5') }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{ width: group.satisfied ? '100%' : '0%', backgroundColor: theme === 'dark' ? '#4ade80' : '#16a34a' }}
                          />
                        </div>
                      )}
                    </div>
                  </summary>
                  {hasDetails && (
                    <div className="px-3 pb-2 ml-6 border-t border-gray-100 dark:border-gray-700 mt-1 pt-2 space-y-1">
                      {group.usedCourses?.length > 0 && (
                        <div className="text-xs text-gray-500">
                          <p className="font-medium text-gray-600">Used courses</p>
                          <ul className="mt-1 space-y-1">
                            {group.usedCourses.map((code) => (
                              <li key={code} className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                                <span className="font-semibold text-gray-700">{code}</span>
                                <span className="text-gray-500">{COURSES[code]?.title || ''}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {group.missing?.length > 0 && (
                        <div className="text-xs text-red-600 mt-1">
                          <p className="font-medium mb-0.5">Still needed:</p>
                          <ul className="space-y-0.5">
                            {group.missing.map((item, i) => {
                              const codeMatch = String(item).trim().match(/^([A-Z]{2,6}\s+\d{3,4}[A-Z]?)$/);
                              if (codeMatch) {
                                const code = codeMatch[1];
                                const meta = COURSES[code];
                                return (
                                  <li key={i}>
                                    • <span className="font-semibold">{code}</span>
                                    {meta?.title ? ` — ${meta.title}` : ''}
                                    {meta?.credits != null ? ` (${meta.credits} credits)` : ''}
                                  </li>
                                );
                              }
                              if (/^Need \d+ (credits?|courses?) from (pool|tag )/.test(String(item))) {
                                const usedSet = new Set(group.usedCourses || []);
                                const examples = (group.recommendationBuckets || [])
                                  .filter(b => b.type === 'pool' || b.type === 'anyOf')
                                  .flatMap(b => (b.codes || []).filter(c => !usedSet.has(c)))
                                  .filter((c, idx, arr) => arr.indexOf(c) === idx)
                                  .slice(0, 4);
                                return (
                                  <li key={i}>
                                    • {item}
                                    {examples.length > 0 && (
                                      <span className="text-red-400"> (e.g., {examples.join(', ')})</span>
                                    )}
                                  </li>
                                );
                              }
                              return <li key={i}>• {item}</li>;
                            })}
                          </ul>
                        </div>
                      )}
                      {group.warnings?.length > 0 && group.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-amber-600">{w}</p>
                      ))}
                      {isFyex && (
                        <label className="flex items-center gap-2 mt-1 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={fyexOverride}
                            onChange={(e) => setFyexOverride(e.target.checked)}
                            className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                          />
                          <span className="text-xs text-gray-600">Mark as completed (manual override)</span>
                        </label>
                      )}
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
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      Degree Progress: {totalSatisfied}/{totalGroups} requirement groups satisfied
                    </span>
                    <span className="text-sm font-bold" style={{ color: pctDone === 100 ? (theme === 'dark' ? '#4ade80' : '#16a34a') : (theme === 'dark' ? '#f1a0a0' : '#500000') }}>
                      {pctDone}%
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pctDone}%`, backgroundColor: pctDone === 100 ? '#16a34a' : (theme === 'dark' ? '#7f1d1d' : '#500000') }}
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
                {(() => {
                  const minorUsed = new Set();
                  if (minorResult) {
                    (minorResult.groups || []).forEach((g) =>
                      (g.usedCourses || []).forEach((c) => minorUsed.add(c))
                    );
                  }
                  const filtered = (degreeResult.workNotApplied || []).filter(
                    (entry) => !minorUsed.has(entry.code)
                  );
                  return filtered.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer select-none flex items-center gap-2 text-sm font-semibold text-blue-700 py-2 px-2 rounded hover:bg-blue-50 transition-colors">
                      <ChevronDown className="w-4 h-4 details-chevron flex-shrink-0" />
                      <Info className="w-4 h-4 flex-shrink-0" />
                      Work Not Applied ({filtered.length} course{filtered.length !== 1 ? 's' : ''})
                    </summary>
                    <div className="space-y-2 mt-2">
                      <p className="text-xs text-gray-500 ml-6">These courses are not currently being used to satisfy any degree or minor requirement group.</p>
                      {filtered.map((entry) => (
                        <div key={entry.code} className="rounded border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 px-3 py-2 ml-6">
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
                  ) : null;
                })()}
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
              const progressBreakdown = getRequirementProgressBreakdown(group);
              const pct = required > 0 ? progressBreakdown.combinedPct : (group.satisfied ? 100 : 0);
              const exceeded = required > 0 && earned > required;
              const extraCredits = exceeded ? earned - required : 0;
              const plannedCredits = progressBreakdown.plannedLabelCredits || 0;
              const ariaLabel = required > 0
                ? `${earned} of ${required} credits counted${plannedCredits > 0 ? `, ${plannedCredits} planned` : ''}${exceeded ? `, ${extraCredits} extra` : ''}`
                : (group.satisfied ? 'Satisfied' : 'Not satisfied');
              const hasDetails =
                (group.missing?.length > 0) ||
                (group.usedCourses?.length > 0) ||
                (group.warnings?.length > 0);

              return (
                <details key={group.name} className="rounded border border-gray-200 dark:border-gray-700 group">
                  <summary className="cursor-pointer select-none px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded list-none">
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
                        {plannedCredits > 0 && (
                          <span className="text-xs font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                            +{plannedCredits} planned
                          </span>
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
                          <div className="h-full flex">
                            {progressBreakdown.greenPct > 0 && (
                              <div
                                className={`h-full ${progressBreakdown.plannedPct > 0 ? 'rounded-l-full' : 'rounded-full'} transition-all`}
                                style={{ width: `${progressBreakdown.greenPct}%`, backgroundColor: '#16a34a' }}
                              />
                            )}
                            {progressBreakdown.plannedPct > 0 && (
                              <div
                                className={`h-full ${progressBreakdown.greenPct > 0 ? '' : 'rounded-l-full'} ${pct >= 100 ? 'rounded-r-full' : ''} transition-all`}
                                style={{ width: `${progressBreakdown.plannedPct}%`, backgroundColor: '#2563eb' }}
                              />
                            )}
                          </div>
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
                          style={{ backgroundColor: group.satisfied ? (theme === 'dark' ? 'rgba(74,222,128,0.2)' : '#bbf7d0') : (theme === 'dark' ? 'rgba(248,113,113,0.2)' : '#fca5a5') }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{ width: group.satisfied ? '100%' : '0%', backgroundColor: theme === 'dark' ? '#4ade80' : '#16a34a' }}
                          />
                        </div>
                      )}
                    </div>
                  </summary>
                  {hasDetails && (
                    <div className="px-3 pb-2 ml-6 border-t border-gray-100 dark:border-gray-700 mt-1 pt-2 space-y-1">
                      {group.usedCourses?.length > 0 && (
                        <div className="text-xs text-gray-500">
                          <p className="font-medium text-gray-600">Used courses</p>
                          <ul className="mt-1 space-y-1">
                            {group.usedCourses.map((code) => (
                              <li key={code} className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                                <span className="font-semibold text-gray-700">{code}</span>
                                <span className="text-gray-500">{COURSES[code]?.title || ''}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {group.missing?.length > 0 && (
                        <div className="text-xs text-red-600 mt-1">
                          <p className="font-medium mb-0.5">Still needed:</p>
                          <ul className="space-y-0.5">
                            {group.missing.map((item, i) => {
                              const codeMatch = String(item).trim().match(/^([A-Z]{2,6}\s+\d{3,4}[A-Z]?)$/);
                              if (codeMatch) {
                                const code = codeMatch[1];
                                const meta = COURSES[code];
                                return (
                                  <li key={i}>
                                    • <span className="font-semibold">{code}</span>
                                    {meta?.title ? ` — ${meta.title}` : ''}
                                    {meta?.credits != null ? ` (${meta.credits} credits)` : ''}
                                  </li>
                                );
                              }
                              if (/^Need \d+ (credits?|courses?) from (pool|tag )/.test(String(item))) {
                                const usedSet = new Set(group.usedCourses || []);
                                const examples = (group.recommendationBuckets || [])
                                  .filter(b => b.type === 'pool' || b.type === 'anyOf')
                                  .flatMap(b => (b.codes || []).filter(c => !usedSet.has(c)))
                                  .filter((c, idx, arr) => arr.indexOf(c) === idx)
                                  .slice(0, 4);
                                return (
                                  <li key={i}>
                                    • {item}
                                    {examples.length > 0 && (
                                      <span className="text-red-400"> (e.g., {examples.join(', ')})</span>
                                    )}
                                  </li>
                                );
                              }
                              return <li key={i}>• {item}</li>;
                            })}
                          </ul>
                        </div>
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

        {minorResult && (() => {
          const minorGroups = minorResult.groups || [];
          const minorSatisfied = minorGroups.filter((g) => g.satisfied).length;
          const minorTotal = minorGroups.length;
          const minorCreditProgress = computeCreditProgressFromEvalResult(minorResult);
          const minorPct = minorCreditProgress.requiredCredits > 0
            ? Math.round(minorCreditProgress.pct)
            : (minorTotal > 0 ? Math.round((minorSatisfied / minorTotal) * 100) : 0);
          return (
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
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {minorCreditProgress.requiredCredits > 0
                    ? `Minor Credits: ${minorCreditProgress.earnedCredits}/${minorCreditProgress.requiredCredits} credits`
                    : `Minor Progress: ${minorSatisfied}/${minorTotal} requirement groups satisfied`}
                </span>
                <span className="text-sm font-bold" style={{ color: minorPct === 100 ? (theme === 'dark' ? '#4ade80' : '#16a34a') : (theme === 'dark' ? '#f1a0a0' : '#500000') }}>
                  {minorPct}%
                </span>
              </div>
              <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${minorPct}%`, backgroundColor: minorPct === 100 ? '#16a34a' : (theme === 'dark' ? '#7f1d1d' : '#500000') }}
                />
              </div>
            </div>
            <div className="space-y-2">
              {minorResult.groups?.map((group) => {
                const earned = group.earnedCredits || 0;
                const required = group.requiredCredits || 0;
                const progressBreakdown = getRequirementProgressBreakdown(group);
                const pct = required > 0 ? progressBreakdown.combinedPct : (group.satisfied ? 100 : 0);
                const exceeded = required > 0 && earned > required;
                const extraCredits = exceeded ? earned - required : 0;
                const plannedCredits = progressBreakdown.plannedLabelCredits || 0;
                const ariaLabel = required > 0
                  ? `${earned} of ${required} credits counted${plannedCredits > 0 ? `, ${plannedCredits} planned` : ''}${exceeded ? `, ${extraCredits} extra` : ''}`
                  : (group.satisfied ? 'Satisfied' : 'Not satisfied');
                const hasDetails =
                  (group.missing?.length > 0) ||
                  (group.usedCourses?.length > 0) ||
                  (group.warnings?.length > 0);

                return (
                  <details
                    key={group.name}
                    className="rounded border border-gray-200 dark:border-gray-700 group"
                  >
                    <summary className="cursor-pointer select-none px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded list-none">
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
                          {plannedCredits > 0 && (
                            <span className="text-xs font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                              +{plannedCredits} planned
                            </span>
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
                            <div className="h-full flex">
                              {progressBreakdown.greenPct > 0 && (
                                <div
                                  className={`h-full ${progressBreakdown.plannedPct > 0 ? 'rounded-l-full' : 'rounded-full'} transition-all`}
                                  style={{ width: `${progressBreakdown.greenPct}%`, backgroundColor: '#16a34a' }}
                                />
                              )}
                              {progressBreakdown.plannedPct > 0 && (
                                <div
                                  className={`h-full ${progressBreakdown.greenPct > 0 ? '' : 'rounded-l-full'} ${pct >= 100 ? 'rounded-r-full' : ''} transition-all`}
                                  style={{ width: `${progressBreakdown.plannedPct}%`, backgroundColor: '#2563eb' }}
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </summary>
                    {hasDetails && (
                      <div className="px-3 pb-2 ml-6 border-t border-gray-100 dark:border-gray-700 mt-1 pt-2 space-y-1">
                        {group.usedCourses?.length > 0 && (
                          <div className="text-xs text-gray-500">
                            <p className="font-medium text-gray-600">Used courses</p>
                            <ul className="mt-1 space-y-1">
                              {group.usedCourses.map((code) => (
                                <li key={code} className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                                  <span className="font-semibold text-gray-700">{code}</span>
                                  <span className="text-gray-500">{COURSES[code]?.title || ''}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {group.missing?.length > 0 && (
                          <div className="text-xs text-red-600 mt-1">
                            <p className="font-medium mb-0.5">Still needed:</p>
                            <ul className="space-y-0.5">
                              {group.missing.map((item, i) => {
                                const codeMatch = String(item).trim().match(/^([A-Z]{2,6}\s+\d{3,4}[A-Z]?)$/);
                                if (codeMatch) {
                                  const code = codeMatch[1];
                                  const meta = COURSES[code];
                                  return (
                                    <li key={i}>
                                      • <span className="font-semibold">{code}</span>
                                      {meta?.title ? ` — ${meta.title}` : ''}
                                      {meta?.credits != null ? ` (${meta.credits} credits)` : ''}
                                    </li>
                                  );
                                }
                                if (/^Need \d+ (credits?|courses?) from (pool|tag )/.test(String(item))) {
                                  const usedSet = new Set(group.usedCourses || []);
                                  const examples = (group.recommendationBuckets || [])
                                    .filter(b => b.type === 'pool' || b.type === 'anyOf')
                                    .flatMap(b => (b.codes || []).filter(c => !usedSet.has(c)))
                                    .filter((c, idx, arr) => arr.indexOf(c) === idx)
                                    .slice(0, 4);
                                  return (
                                    <li key={i}>
                                      • {item}
                                      {examples.length > 0 && (
                                        <span className="text-red-400"> (e.g., {examples.join(', ')})</span>
                                      )}
                                    </li>
                                  );
                                }
                                return <li key={i}>• {item}</li>;
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </details>
                );
              })}
            </div>
          </div>
          );
        })()}
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
      if (isNaN(credits) || credits < 0) {
        alert('Please enter a valid credit value (e.g., 0, 3, 4)');
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
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
        {/* Header */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Academic Record</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            Transcript-aligned terms with grades. Drag courses between terms to correct parsing.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer inline-flex items-center gap-1.5">
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
            Upload Unofficial Transcript / Degree Evaluation PDF
          </label>
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
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
                  setUploadedDocumentType('');
                  setTranscriptError('');
                  setIsTranscriptDirty(true);
                  setSelectedTranscriptYear('');
                }
              }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
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
            {uploadedDocumentType && (
              <span className="text-xs text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                Detected: {uploadedDocumentType === 'degree-evaluation' ? 'Degree Evaluation' : uploadedDocumentType === 'transcript' ? 'Transcript' : 'Unknown'}
              </span>
            )}
          </div>
        )}

        {/* Year tabs row */}
        {transcriptYearLabels.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-5 border-b border-gray-200 dark:border-gray-700 pb-3">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mr-1">Year:</span>
            {transcriptYearLabels.map((year) => (
              <button
                key={year}
                onClick={() => setSelectedTranscriptYear(year)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  selectedTranscriptYear === year
                    ? 'text-white border-transparent'
                    : 'text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
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
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3"
              >
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">{entry.label} Totals</p>
                {entry.data ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-700 dark:text-gray-300">
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
          <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center text-gray-500">
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
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800 transition"
                  onDragOver={(event) => handleTermDragOver(term.label, event)}
                  onDragEnter={(event) => handleTermDragEnter(term.label, event)}
                  onDragLeave={(event) => handleTermDragLeave(term.label, event)}
                  onDrop={(event) => handleTermDrop(term.label, event)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white">{term.label}</h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{termCredits} credits</p>
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
                        className="text-xs text-gray-500 border border-dashed border-gray-300 dark:border-gray-600 rounded-md px-3 py-4 text-center"
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
                            className="rounded-md bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-600 px-3 py-2 cursor-grab active:cursor-grabbing"
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
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {course.code}
                                </p>
                                <p className="text-xs text-gray-600 dark:text-gray-400">{toTitleCase(course.title)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
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
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
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
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (
                                          !window.confirm(
                                            `Remove ${course.code} from ${term.label}? Click "Update Record" to save.`
                                          )
                                        ) {
                                          return;
                                        }
                                        removeCourseFromTranscriptRecord(term.label, course.code);
                                        setMoveMenuCourseKey(null);
                                      }}
                                      className="text-gray-400 hover:text-red-600 transition-colors"
                                      title="Remove course from record"
                                    >
                                      <Trash2 className="w-3 h-3" />
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
                                            : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                                        }`}
                                        title="Move to another term"
                                      >
                                        ···
                                      </button>
                                      {moveOpen && (
                                        <div
                                          className="absolute right-0 top-full mt-1 z-30 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg w-40 max-h-48 overflow-y-auto py-1"
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
                                                      className="w-full text-left text-[10px] px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
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
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
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
                            )}
                            <div className="mt-2 flex flex-col gap-1.5">
                              {course.transfer ? (
                                <>
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
                                        const nk = normalizeCode(course.code);
                                        setExcludedTransferCourses((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(course.code)) {
                                            next.delete(course.code);
                                          } else {
                                            next.add(course.code);
                                          }
                                          return next;
                                        });
                                        setExcludedFromEval((prev) => {
                                          const next = new Set(prev);
                                          if (adding) {
                                            next.add(nk);
                                          } else {
                                            next.delete(nk);
                                          }
                                          return next;
                                        });
                                        if (adding) {
                                          setEvaluationPriorityByCode((prev) => {
                                            if (!nk || !prev[nk]) return prev;
                                            const next = { ...prev };
                                            delete next[nk];
                                            return next;
                                          });
                                        }
                                        setIsTranscriptDirty(true);
                                      }}
                                      className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-[#500000] focus:ring-[#500000]/30 cursor-pointer"
                                    />
                                    <span className={`text-xs ${excludedTransferCourses.has(course.code) ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-600 dark:text-gray-400'}`}>
                                      Count toward degree
                                    </span>
                                  </label>
                                  <label
                                    className="flex items-center gap-1.5 cursor-pointer select-none"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={excludedTransferCourses.has(course.code)}
                                      checked={Boolean(evaluationPriorityByCode[normalizeCode(course.code)])}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        const nk = normalizeCode(course.code);
                                        const on = e.target.checked;
                                        setEvaluationPriorityByCode((prev) => {
                                          if (!on) {
                                            if (!prev[nk]) return prev;
                                            const next = { ...prev };
                                            delete next[nk];
                                            return next;
                                          }
                                          return { ...prev, [nk]: true };
                                        });
                                      }}
                                      className="w-3.5 h-3.5 rounded border-gray-300 text-[#500000] focus:ring-[#500000]/30 cursor-pointer disabled:opacity-40"
                                    />
                                    <span className={`text-xs ${excludedTransferCourses.has(course.code) ? 'text-gray-400' : 'text-gray-600'}`}>
                                      Prefer in requirements evaluation
                                    </span>
                                  </label>
                                </>
                              ) : (
                                <>
                                  <label
                                    className="flex items-center gap-1.5 cursor-pointer select-none"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={!excludedFromEval.has(normalizeCode(course.code))}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        const useInEval = e.target.checked;
                                        const nk = normalizeCode(course.code);
                                        setExcludedFromEval((prev) => {
                                          const next = new Set(prev);
                                          if (useInEval) next.delete(nk);
                                          else next.add(nk);
                                          return next;
                                        });
                                        if (!useInEval) {
                                          setEvaluationPriorityByCode((prev) => {
                                            if (!nk || !prev[nk]) return prev;
                                            const next = { ...prev };
                                            delete next[nk];
                                            return next;
                                          });
                                        }
                                      }}
                                      className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-[#500000] focus:ring-[#500000]/30 cursor-pointer"
                                    />
                                    <span className={`text-xs ${excludedFromEval.has(normalizeCode(course.code)) ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-600 dark:text-gray-400'}`}>
                                      Use in evaluation
                                    </span>
                                  </label>
                                  <label
                                    className="flex items-center gap-1.5 cursor-pointer select-none"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={excludedFromEval.has(normalizeCode(course.code))}
                                      checked={Boolean(evaluationPriorityByCode[normalizeCode(course.code)])}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        const nk = normalizeCode(course.code);
                                        const on = e.target.checked;
                                        setEvaluationPriorityByCode((prev) => {
                                          if (!on) {
                                            if (!prev[nk]) return prev;
                                            const next = { ...prev };
                                            delete next[nk];
                                            return next;
                                          }
                                          return { ...prev, [nk]: true };
                                        });
                                      }}
                                      className="w-3.5 h-3.5 rounded border-gray-300 text-[#500000] focus:ring-[#500000]/30 cursor-pointer disabled:opacity-40"
                                    />
                                    <span className={`text-xs ${excludedFromEval.has(normalizeCode(course.code)) ? 'text-gray-400' : 'text-gray-600'}`}>
                                      Prefer in requirements evaluation
                                    </span>
                                  </label>
                                </>
                              )}
                            </div>
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
                                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-[#500000] focus:ring-[#500000]/30 cursor-pointer"
                                />
                                <span className={`text-xs ${isEmphasis ? 'text-[#500000] dark:text-[#ff6666] font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
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
                    setEvaluationPriorityByCode((prev) => {
                      const transcriptCodes = new Set(
                        transcriptCourseList.map((c) => normalizeCode(c?.code)).filter(Boolean)
                      );
                      const next = {};
                      Object.entries(prev).forEach(([code, v]) => {
                        const nk = normalizeCode(code);
                        if (v && transcriptCodes.has(nk)) next[nk] = true;
                      });
                      return next;
                    });
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
                      : 'text-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  style={selectedPlanYear === year ? { backgroundColor: '#500000' } : {}}
                >
                  {year}
                </button>
              );
            })}
          </div>

          {(planError || validation.errors.length > 0) && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
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
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
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
                ...transcriptCourses.map((course) => {
                  const courseStatus = isCourseMarkedInProgress({ ...course, termStatus: transcriptTerm?.status })
                    ? 'In Progress'
                    : course.transfer || isTransferGrade(course.grade)
                      ? 'Transfer'
                      : 'Evaluated';
                  const tc = sanitizeCredits(course.credits);
                  const fallbackCr = getCourseCreditsForRequirementBar(course.code);
                  const credits = tc > 0 ? tc : fallbackCr;
                  return {
                    type: 'transcript',
                    code: course.code,
                    title: course.title,
                    credits,
                    grade: course.grade,
                    status: courseStatus
                  };
                }),
                ...plannedCourses
                  .filter(
                    (rawCode) =>
                      !transcriptCourses.some(
                        (c) => normalizeCode(c.code) === normalizeCode(rawCode)
                      )
                  )
                  .map((rawCode) => {
                    const norm = normalizeCode(rawCode);
                    return {
                      type: 'planned',
                      code: norm || rawCode,
                      title: (norm && COURSES[norm]?.title) || COURSES[rawCode]?.title,
                      credits: getCourseCreditsForRequirementBar(norm || rawCode)
                    };
                  })
              ];
              const termCreditsTotal = displayCourses.reduce(
                (sum, c) => sum + (Number.isFinite(Number(c.credits)) ? Number(c.credits) : 0),
                0
              );
              const termValidation = validateSemester(term);
              const termState = getTermState(term);
              const isEditable = true;
              const isViewOnly = termState === 'current';
              return (
                <div key={term} className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 overflow-hidden">
                  {/* ── Term Header ── */}
                  <div className="px-4 pt-4 pb-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <h4 className="font-bold text-gray-900 text-base truncate">{term}</h4>
                        {isViewOnly && (
                          <span className="shrink-0 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Current</span>
                        )}
                        {termState === 'past' && (
                          <span className="shrink-0 text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-medium">Past</span>
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
                        className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                          isEditable
                            ? 'text-white'
                            : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                        }`}
                        style={isEditable ? { backgroundColor: '#500000' } : {}}
                        onMouseEnter={(e) => { if (isEditable) e.currentTarget.style.backgroundColor = '#3d0000'; }}
                        onMouseLeave={(e) => { if (isEditable) e.currentTarget.style.backgroundColor = '#500000'; }}
                        disabled={!isEditable}
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-700">
                        {termCreditsTotal} credits
                      </span>
                      {(() => {
                        const planned = (semesterPlans[term] || []);
                        if (planned.length === 0) return null;
                        const counts = { easy: 0, medium: 0, hard: 0 };
                        planned.forEach((code) => {
                          const d = getCourseDifficulty(code);
                          if (d && counts[d] !== undefined) counts[d]++;
                        });
                        const total = counts.easy + counts.medium + counts.hard;
                        if (total === 0) return null;
                        const level = counts.hard >= 3 || (counts.hard >= 2 && counts.medium >= 2) ? 'hard'
                          : counts.hard === 0 && counts.medium <= 1 ? 'easy' : 'medium';
                        const cfg = DIFFICULTY_CONFIG[level];
                        return (
                          <>
                            <span className="text-gray-300 text-xs">|</span>
                            <span
                              className="text-xs font-bold px-2 py-0.5 rounded-md border"
                              style={{ borderColor: cfg.color, color: theme === 'dark' ? cfg.color : cfg.text, backgroundColor: theme === 'dark' ? 'transparent' : cfg.bg }}
                            >
                              ⚡ {cfg.label} Load
                            </span>
                            <span className="text-xs text-gray-400">
                              ({counts.easy > 0 ? `${counts.easy}E` : ''}{counts.easy > 0 && counts.medium > 0 ? '·' : ''}{counts.medium > 0 ? `${counts.medium}M` : ''}{(counts.easy > 0 || counts.medium > 0) && counts.hard > 0 ? '·' : ''}{counts.hard > 0 ? `${counts.hard}H` : ''})
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* ── Course List ── */}
                  <div className="p-3 space-y-2">
                    {displayCourses.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm">
                        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p>No courses planned</p>
                      </div>
                    ) : (
                      displayCourses.map((course) => {
                        const nk = normalizeCode(course.code);
                        const courseMeta = COURSES[nk] || COURSES[course.code];
                        const plannedLaterPrereqs = [];
                        const trulyMissing = [];
                        if (course.type === 'planned') {
                          const prereqGroups = getCoursePrereqGroups(courseMeta);
                          prereqGroups.forEach((group) => {
                            const optionStates = group.map((option) => ({
                              option,
                              state: getPrereqOptionSemesterState(option, term)
                            }));

                            if (optionStates.some(({ state }) => state.satisfied)) return;

                            const strictPlanned = optionStates.find(
                              ({ option, state }) => !option.concurrentOk && state.plannedAnywhere
                            );
                            if (strictPlanned) {
                              plannedLaterPrereqs.push(
                                `Prerequisite ${strictPlanned.option.code} is planned but not in an earlier semester`
                              );
                              return;
                            }

                            const coreqPlannedLater = optionStates.find(
                              ({ option, state }) =>
                                option.concurrentOk &&
                                state.plannedAnywhere &&
                                !state.plannedEarlier &&
                                !state.plannedThisSemester
                            );
                            if (coreqPlannedLater) {
                              plannedLaterPrereqs.push(
                                `Co-requisite ${coreqPlannedLater.option.code} is planned in a later semester`
                              );
                              return;
                            }

                            const groupLabel = optionStates
                              .map(({ option }) =>
                                option.concurrentOk
                                  ? `${option.code} (or concurrent enrollment)`
                                  : option.code
                              )
                              .join(' OR ');
                            trulyMissing.push(groupLabel);
                          });
                        }
                        const hasPrereqIssue = plannedLaterPrereqs.length > 0 || trulyMissing.length > 0;

                        const diffLevel = course.type === 'planned' ? getCourseDifficulty(course.code) : null;
                        const diffCfg = diffLevel ? DIFFICULTY_CONFIG[diffLevel] : null;

                        return (
                          <div
                            key={`${term}-${course.code}-${course.type}`}
                            className={`p-3 rounded-lg border ${
                              trulyMissing.length > 0
                                ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
                                : plannedLaterPrereqs.length > 0
                                  ? 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20'
                                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h4 className="font-semibold text-sm text-gray-900">{course.code}</h4>
                                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                                    {course.credits} cr
                                  </span>
                                  {course.type === 'transcript' && (
                                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                                      {course.status || 'Recorded'}
                                    </span>
                                  )}
                                  {diffCfg && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setShowDifficultyInfo(course.code); }}
                                      className="text-xs font-bold px-1.5 py-0.5 rounded-md border cursor-pointer hover:opacity-80 transition-opacity"
                                      style={{ borderColor: diffCfg.color, color: diffCfg.color, backgroundColor: 'transparent' }}
                                      title="Click for difficulty info"
                                    >
                                      ● {diffCfg.label}
                                    </button>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1 truncate">
                                  {course.title || courseMeta?.title}
                                </p>
                                {trulyMissing.length > 0 && (
                                  <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    Missing prerequisites: {trulyMissing.join('; ')}
                                  </p>
                                )}
                                {plannedLaterPrereqs.length > 0 && (
                                  <p className="text-xs text-yellow-700 mt-1 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    {plannedLaterPrereqs.join('; ')}
                                  </p>
                                )}
                                <label
                                  className="flex items-center gap-1.5 mt-2 cursor-pointer select-none"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={!excludedFromEval.has(normalizeCode(course.code))}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      const useInEval = e.target.checked;
                                      const nk = normalizeCode(course.code);
                                      setExcludedFromEval((prev) => {
                                        const next = new Set(prev);
                                        if (useInEval) next.delete(nk);
                                        else next.add(nk);
                                        return next;
                                      });
                                      if (!useInEval) {
                                        setEvaluationPriorityByCode((prev) => {
                                          if (!nk || !prev[nk]) return prev;
                                          const next = { ...prev };
                                          delete next[nk];
                                          return next;
                                        });
                                      }
                                    }}
                                    className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-[#500000] focus:ring-[#500000]/30 cursor-pointer"
                                  />
                                  <span className={`text-xs ${excludedFromEval.has(normalizeCode(course.code)) ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                                    Use in evaluation
                                  </span>
                                </label>
                                <label
                                  className="flex items-center gap-1.5 mt-1 cursor-pointer select-none"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={excludedFromEval.has(normalizeCode(course.code))}
                                    checked={Boolean(evaluationPriorityByCode[normalizeCode(course.code)])}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      const nk = normalizeCode(course.code);
                                      const on = e.target.checked;
                                      setEvaluationPriorityByCode((prev) => {
                                        if (!on) {
                                          if (!prev[nk]) return prev;
                                          const next = { ...prev };
                                          delete next[nk];
                                          return next;
                                        }
                                        return { ...prev, [nk]: true };
                                      });
                                    }}
                                    className="w-3.5 h-3.5 rounded border-gray-300 text-[#500000] focus:ring-[#500000]/30 cursor-pointer disabled:opacity-40"
                                  />
                                  <span className={`text-xs ${excludedFromEval.has(normalizeCode(course.code)) ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Prefer in requirements evaluation
                                  </span>
                                </label>
                              </div>
                              {course.type === 'planned' && (
                                <button
                                  type="button"
                                  title="Remove from plan"
                                  onClick={() => {
                                    if (!isEditable) return;
                                    removeCourseFromSemester(course.code, term);
                                  }}
                                  className={`shrink-0 p-1 rounded text-gray-400 ${
                                    isEditable
                                      ? 'hover:text-red-600 hover:bg-red-50'
                                      : 'cursor-not-allowed opacity-50'
                                  }`}
                                  disabled={!isEditable}
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                              {course.type === 'transcript' && (
                                <button
                                  type="button"
                                  title="Remove from academic record"
                                  onClick={() => {
                                    const nk = normalizeCode(course.code);
                                    if (
                                      !window.confirm(
                                        `Remove ${nk} from ${term} on your academic record? Click "Update Record" in Academic Record to save.`
                                      )
                                    ) {
                                      return;
                                    }
                                    removeCourseFromTranscriptRecord(term, course.code);
                                  }}
                                  className="shrink-0 p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
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

        {/* ── Difficulty Info Modal ── */}
        {showDifficultyInfo && (() => {
          const code = showDifficultyInfo;
          const diff = getCourseDifficulty(code);
          const cfg = diff ? DIFFICULTY_CONFIG[diff] : null;
          const meta = COURSES[code];
          const courseNum = parseInt(code.replace(/[^0-9]/g, ''), 10) || 0;
          return (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowDifficultyInfo(null)}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700" style={{ backgroundColor: cfg ? (theme === 'dark' ? `${cfg.color}22` : cfg.bg) : (theme === 'dark' ? '#334155' : '#f3f4f6') }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">{code}</h3>
                      <p className="text-sm text-gray-600">{meta?.title || 'Course'}</p>
                    </div>
                    {cfg && (
                      <span className="text-sm font-bold px-3 py-1 rounded-full border" style={{ borderColor: cfg.color, color: cfg.color }}>
                        ● {cfg.label}
                      </span>
                    )}
                  </div>
                </div>
                <div className="px-6 py-4 space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">Estimated Difficulty</h4>
                    <div className="flex gap-1">
                      {['easy', 'medium', 'hard'].map((lvl) => {
                        const c = DIFFICULTY_CONFIG[lvl];
                        const active = lvl === diff;
                        return (
                          <div key={lvl} className={`flex-1 text-center py-1.5 rounded text-xs font-semibold border ${active ? 'ring-2 ring-offset-1' : 'opacity-40'}`}
                            style={{ borderColor: c.color, color: active ? (theme === 'dark' ? c.color : c.text) : c.color, backgroundColor: active ? (theme === 'dark' ? 'transparent' : c.bg) : 'transparent', ...(active ? { ringColor: c.color } : {}) }}>
                            {c.label}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">How is this determined?</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {COURSE_DIFFICULTY[code]
                        ? 'This rating is based on a curated mapping of known course workloads, informed by historical student experiences and course characteristics.'
                        : `This is an estimated rating derived from the course number (${courseNum}). Upper-division courses (300-400 level) and graduate courses (500+) are generally rated as more difficult.`
                      }
                    </p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    <p className="text-xs text-amber-800">
                      <strong>Advisory only</strong> — This is an estimate for planning support. Actual difficulty varies by instructor, semester, and individual preparation. Not an official university rating.
                    </p>
                  </div>
                </div>
                <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 flex justify-end">
                  <button
                    onClick={() => setShowDifficultyInfo(null)}
                    className="px-4 py-1.5 text-sm font-medium rounded-lg text-white"
                    style={{ backgroundColor: '#500000' }}
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {showCourseModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b dark:border-gray-700">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900">Add Course to {selectedSemester}</h3>
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
                  <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-300">
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
                            e.currentTarget.style.borderColor = theme === 'dark' ? '#f1a0a0' : '#500000';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isDisabled) {
                            e.currentTarget.style.borderColor = theme === 'dark' ? '#334155' : '#e5e7eb';
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
                              <h4 className="font-bold text-gray-900">{code}</h4>
                              <span className="text-xs bg-gray-200 px-2 py-1 rounded">
                                {getCourseCreditsForRequirementBar(code)} cr
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

  const PrerequisiteTab = () => {
    const flowchartCourses = FLOWCHART_REFERENCE;
    const levelOptions = [100, 200, 300, 400];
    const [selectedLevel, setSelectedLevel] = useState(100);
    const [selectedFlowCourseCode, setSelectedFlowCourseCode] = useState('');
    const [flowSearchQuery, setFlowSearchQuery] = useState('');
    const [flowSearchError, setFlowSearchError] = useState('');
    const [hoveredFlowNodeKey, setHoveredFlowNodeKey] = useState('');

    const parseCodeParts = (rawCode) => {
      const match = normalizeCode(rawCode)?.match(/^([A-Z]{2,4})\s+(\d{3})$/);
      if (!match) return null;
      return {
        dept: match[1],
        number: Number(match[2])
      };
    };

    const compareCourseCodes = (a, b) => {
      const pa = parseCodeParts(a);
      const pb = parseCodeParts(b);
      if (!pa || !pb) return String(a).localeCompare(String(b));
      if (pa.dept !== pb.dept) return pa.dept.localeCompare(pb.dept);
      if (pa.number !== pb.number) return pa.number - pb.number;
      return String(a).localeCompare(String(b));
    };

    const isFlowPrereqOptionSatisfied = (option) => {
      if (!option?.code) return false;
      if (isCourseCompleted(option.code) || isCourseInProgress(option.code)) return true;
      return option.concurrentOk && isCoursePlanned(option.code);
    };

    const isCoursePlannedOnly = (code) =>
      isCoursePlanned(code) && !isCourseCompleted(code) && !isCourseInProgress(code);

    const getFlowCourseStatus = (code) => {
      if (isCourseCompleted(code)) return 'completed';
      if (isCourseInProgress(code)) return 'in-progress';
      if (isCoursePlannedOnly(code)) return 'planned';
      const course = flowchartCourses[code] || COURSES[code];
      if (!course) return 'locked';
      const prereqGroups = getCoursePrereqGroups(course);
      const prereqsMet =
        prereqGroups.length === 0 ||
        prereqGroups.every((group) => group.some((option) => isFlowPrereqOptionSatisfied(option)));
      return prereqsMet ? 'available' : 'locked';
    };

    const flowStatusClasses = {
      completed: 'bg-green-100 text-green-700 border-green-300',
      'in-progress': 'bg-blue-100 text-blue-700 border-blue-300',
      planned: 'bg-blue-100 text-blue-700 border-blue-300',
      available: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      locked: 'bg-white text-gray-600 border-gray-300'
    };
    const getFlowStatusLabel = (status) => {
      if (status === 'locked') return 'Locked';
      if (status === 'in-progress') return 'in progress';
      return status;
    };

    const csceCourseCodes = useMemo(
      () =>
        Object.keys(flowchartCourses)
          .filter((code) => /^CSCE\s+\d{3}$/.test(code))
          .sort(compareCourseCodes),
      [flowchartCourses]
    );

    const selectFlowCourse = (rawCode) => {
      const code = normalizeCode(rawCode);
      if (!code) return;
      const parsed = parseCodeParts(code);
      if (parsed) {
        const level = Math.floor(parsed.number / 100) * 100;
        if (levelOptions.includes(level)) setSelectedLevel(level);
      }
      setSelectedFlowCourseCode(code);
      setFlowSearchQuery(code);
      setFlowSearchError('');
    };

    const resolveFlowSearchCourse = (rawQuery) => {
      const query = String(rawQuery || '').trim();
      if (!query) return '';

      const compact = query.toUpperCase().replace(/\s+/g, '');
      const numericOnlyMatch = compact.match(/^(\d{3})$/);
      const compactCodeMatch = compact.match(/^([A-Z]{2,4})(\d{3})$/);

      const candidates = new Set();
      const normalized = normalizeCode(query);
      if (normalized) candidates.add(normalized);
      if (numericOnlyMatch) candidates.add(`CSCE ${numericOnlyMatch[1]}`);
      if (compactCodeMatch) candidates.add(`${compactCodeMatch[1]} ${compactCodeMatch[2]}`);

      for (const candidate of candidates) {
        if (csceCourseCodes.includes(candidate)) return candidate;
      }

      return '';
    };

    const handleFlowSearch = () => {
      const raw = flowSearchQuery.trim();
      if (!raw) {
        setFlowSearchError('Please enter a course code like CSCE 221.');
        return;
      }
      const match = resolveFlowSearchCourse(raw);
      if (!match) {
        setFlowSearchError(`"${raw}" was not found in the CSCE prerequisite flowchart.`);
        return;
      }
      selectFlowCourse(match);
    };

    const coursesByLevel = useMemo(() => {
      const buckets = new Map(levelOptions.map((level) => [level, []]));
      csceCourseCodes.forEach((code) => {
        const parsed = parseCodeParts(code);
        if (!parsed) return;
        const level = Math.floor(parsed.number / 100) * 100;
        if (!buckets.has(level)) return;
        buckets.get(level).push(code);
      });
      return buckets;
    }, [csceCourseCodes]);

    const levelCourses = coursesByLevel.get(selectedLevel) || [];

    useEffect(() => {
      if (!selectedFlowCourseCode) return;
      if (!levelCourses.includes(selectedFlowCourseCode)) {
        setSelectedFlowCourseCode('');
      }
    }, [selectedFlowCourseCode, levelCourses]);

    const selectedCourse = selectedFlowCourseCode
      ? flowchartCourses[selectedFlowCourseCode] || COURSES[selectedFlowCourseCode]
      : null;
    const selectedCourseGroups = useMemo(
      () => getCoursePrereqGroups(selectedCourse),
      [selectedCourse]
    );

    const selectedCourseGraph = useMemo(() => {
      if (!selectedFlowCourseCode || !selectedCourse || selectedCourseGroups.length === 0) return null;

      const optionWidth = 220;
      const optionHeight = 52;
      const targetWidth = 250;
      const targetHeight = 62;
      const optionX = 54;
      const targetX = 560;
      const optionSpacing = 72;
      const groupTopPadding = 40;
      const labelToNodeGap = 26;
      const groupGap = 34;

      const optionNodes = [];
      const groupLabels = [];
      let currentGroupTop = groupTopPadding;

      selectedCourseGroups.forEach((group, groupIndex) => {
        if (!Array.isArray(group) || group.length === 0) return;
        const hasCoreq = group.some((option) => Boolean(option?.concurrentOk));
        const hasPrereq = group.some((option) => !Boolean(option?.concurrentOk));
        const groupType = hasCoreq && hasPrereq ? 'mixed' : hasCoreq ? 'coreq' : 'prereq';
        const groupTitle =
          groupType === 'mixed'
            ? 'Mixed group'
            : groupType === 'coreq'
              ? 'Co-requisite group'
              : 'Prerequisite group';
        const labelY = currentGroupTop + 12;
        const firstNodeCenterY = currentGroupTop + labelToNodeGap + optionHeight / 2;

        groupLabels.push({
          groupIndex,
          labelY,
          groupType,
          groupTitle
        });

        group.forEach((option, optionIndex) => {
          optionNodes.push({
            key: `${groupIndex}-${optionIndex}-${option.code}`,
            code: normalizeCode(option.code),
            concurrentOk: Boolean(option.concurrentOk),
            showOptionType: groupType === 'mixed',
            groupIndex,
            centerY: firstNodeCenterY + optionIndex * optionSpacing
          });
        });

        const groupBottom =
          firstNodeCenterY + (group.length - 1) * optionSpacing + optionHeight / 2;
        currentGroupTop = groupBottom + groupGap;
      });

      const centerValues = optionNodes.map((node) => node.centerY);
      const optionTopValues = optionNodes.map((node) => node.centerY - optionHeight / 2);
      const optionBottomValues = optionNodes.map((node) => node.centerY + optionHeight / 2);
      const labelTopValues = groupLabels.map((group) => group.labelY - 14);
      const labelBottomValues = groupLabels.map((group) => group.labelY + 10);
      const targetCenterY =
        centerValues.length > 0
          ? centerValues.reduce((sum, value) => sum + value, 0) / centerValues.length
          : 220;

      const minRawY = Math.min(
        ...optionTopValues,
        ...labelTopValues,
        targetCenterY - targetHeight / 2
      );
      const maxRawY = Math.max(
        ...optionBottomValues,
        ...labelBottomValues,
        targetCenterY + targetHeight / 2
      );
      const rawHeight = Math.max(340, Math.ceil(maxRawY - minRawY + 90));
      const minCanvasY = minRawY - 20;
      const yShift = minCanvasY < 20 ? 20 - minCanvasY : 0;

      return {
        width: 840,
        height: rawHeight,
        optionX,
        optionWidth,
        optionHeight,
        targetX,
        targetY: targetCenterY - targetHeight / 2 + yShift,
        targetCenterY: targetCenterY + yShift,
        targetWidth,
        targetHeight,
        optionNodes: optionNodes.map((node) => ({
          ...node,
          centerY: node.centerY + yShift
        })),
        groupLabels: groupLabels.map((group) => ({
          ...group,
          labelY: group.labelY + yShift
        }))
      };
    }, [selectedFlowCourseCode, selectedCourse, selectedCourseGroups]);

    const getNodePalette = (code, statusOverride = '') => {
      const status = statusOverride || getFlowCourseStatus(code);
      if (status === 'completed') {
        return { fill: '#dcfce7', stroke: '#111827', text: '#111827' };
      }
      if (status === 'in-progress') {
        return { fill: '#dbeafe', stroke: '#111827', text: '#111827' };
      }
      if (status === 'planned') {
        return { fill: '#dbeafe', stroke: '#111827', text: '#111827' };
      }
      if (status === 'available') {
        return { fill: '#fef9c3', stroke: '#111827', text: '#111827' };
      }
      return { fill: '#ffffff', stroke: '#111827', text: '#111827' };
    };

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Course Prerequisite Flowchart</h3>
          <p className="text-sm text-gray-600 mb-6">
            Solid (full) lines indicate prerequisites; dashed lines indicate co-requisites.
          </p>

          <div className="mb-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={flowSearchQuery}
                  onChange={(e) => {
                    setFlowSearchQuery(e.target.value);
                    if (flowSearchError) setFlowSearchError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleFlowSearch();
                    }
                  }}
                  placeholder="Search a course code (e.g., CSCE 221 or 221)"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleFlowSearch}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: '#500000' }}
              >
                Search
              </button>
            </div>
            {flowSearchError && (
              <p className="text-xs text-red-600 mt-2">{flowSearchError}</p>
            )}
          </div>

          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs sm:text-sm text-gray-700">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-semibold text-gray-900">Legend:</span>
              <span className="inline-flex items-center">
                <span className="inline-block w-3 h-3 rounded-sm border border-green-300 bg-green-100 mr-1" />
                Green - Completed Course
              </span>
              <span className="inline-flex items-center">
                <span className="inline-block w-3 h-3 rounded-sm border border-yellow-300 bg-yellow-100 mr-1" />
                Yellow - Available Courses
              </span>
              <span className="inline-flex items-center">
                <span className="inline-block w-3 h-3 rounded-sm border border-blue-300 bg-blue-100 mr-1" />
                Blue - Planned Courses
              </span>
              <span className="inline-flex items-center">
                <span className="inline-block w-3 h-3 rounded-sm border border-gray-300 bg-white mr-1" />
                White - Locked Course
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 sm:pl-[72px]">
              <span className="inline-flex items-center">
                <span className="inline-block w-7 border-t-2 border-black mr-1" />
                Black / Solid Line - Pre-requisite
              </span>
              <span className="inline-flex items-center">
                <span className="inline-block w-7 border-t-2 border-black border-dashed mr-1" />
                Black / Dashed Line - Co-requisite
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {levelOptions.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setSelectedLevel(level)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  selectedLevel === level
                    ? 'text-white border-transparent'
                    : 'text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
                style={selectedLevel === level ? { backgroundColor: '#500000' } : {}}
              >
                {level}-Level
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-4">
            <div className="border border-gray-200 rounded-lg bg-white">
              <div className="px-4 py-3 border-b border-gray-200">
                <p className="font-semibold text-gray-900">{selectedLevel}-Level CSCE Courses</p>
                <p className="text-xs text-gray-500 mt-1">{levelCourses.length} courses</p>
              </div>
              <div className="max-h-[620px] overflow-auto p-2 space-y-2">
                {levelCourses.length === 0 ? (
                  <p className="text-sm text-gray-500 px-3 py-2">No courses found for this level.</p>
                ) : (
                  levelCourses.map((code) => {
                    const course = flowchartCourses[code] || COURSES[code];
                    const status = getFlowCourseStatus(code);
                    const selected = code === selectedFlowCourseCode;
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => selectFlowCourse(code)}
                        className={`w-full text-left p-3 rounded-lg border transition ${
                          selected
                            ? 'border-[#500000] bg-[#500000]/5'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900">{code}</p>
                            <p className="text-xs text-gray-600 truncate">{course?.title || code}</p>
                          </div>
                          <span
                            className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] border ${flowStatusClasses[status]}`}
                          >
                            {status === 'in-progress'
                              ? 'In Progress'
                              : status.charAt(0).toUpperCase() + status.slice(1)}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg bg-white min-h-[420px]">
              {!selectedFlowCourseCode || !selectedCourse ? (
                <div className="h-full min-h-[420px] flex items-center justify-center p-8 text-center">
                  <div>
                    <p className="text-sm text-gray-500">
                      Select a course from the {selectedLevel}-level list to view its prerequisite and co-requisite relationships.
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      Details stay hidden until a course is selected.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold text-gray-900">{selectedFlowCourseCode}</p>
                      <p className="text-sm text-gray-600">{selectedCourse.title || selectedFlowCourseCode}</p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs border ${flowStatusClasses[getFlowCourseStatus(selectedFlowCourseCode)]}`}
                    >
                      {getFlowCourseStatus(selectedFlowCourseCode) === 'in-progress'
                        ? 'In Progress'
                        : getFlowCourseStatus(selectedFlowCourseCode).charAt(0).toUpperCase() +
                          getFlowCourseStatus(selectedFlowCourseCode).slice(1)}
                    </span>
                  </div>

                  {selectedCourseGraph ? (
                    <div className="border border-gray-200 rounded-lg bg-gray-50 p-3 overflow-auto">
                      <svg
                        viewBox={`0 0 ${selectedCourseGraph.width} ${selectedCourseGraph.height}`}
                        className="w-full h-auto"
                        role="img"
                        aria-label={`Prerequisites for ${selectedFlowCourseCode}`}
                      >
                        <defs>
                          <marker
                            id="selected-flow-arrow"
                            markerWidth="10"
                            markerHeight="10"
                            viewBox="0 0 10 10"
                            refX="8"
                            refY="5"
                            orient="auto"
                            markerUnits="userSpaceOnUse"
                          >
                            <path d="M0,0 L10,5 L0,10 Z" fill="#111827" />
                          </marker>
                          <marker
                            id="selected-flow-arrow-coreq"
                            markerWidth="10"
                            markerHeight="10"
                            viewBox="0 0 10 10"
                            refX="8"
                            refY="5"
                            orient="auto"
                            markerUnits="userSpaceOnUse"
                          >
                            <path d="M0,0 L10,5 L0,10 Z" fill="#111827" />
                          </marker>
                          <marker
                            id="selected-flow-arrow-coreq-planned"
                            markerWidth="10"
                            markerHeight="10"
                            viewBox="0 0 10 10"
                            refX="8"
                            refY="5"
                            orient="auto"
                            markerUnits="userSpaceOnUse"
                          >
                            <path d="M0,0 L10,5 L0,10 Z" fill="#2563eb" />
                          </marker>
                        </defs>

                        {selectedCourseGraph.groupLabels.map((group) => {
                          const groupNodes = selectedCourseGraph.optionNodes.filter(
                            (node) => node.groupIndex === group.groupIndex
                          );
                          const groupSatisfied = groupNodes.some((node) =>
                            isFlowPrereqOptionSatisfied({
                              code: node.code,
                              concurrentOk: node.concurrentOk
                            })
                          );
                          const groupLabelBody = `Group ${group.groupIndex + 1}: ${group.groupTitle} (choose one)`;
                          const groupLabelWidth = Math.ceil(46 + groupLabelBody.length * 7);
                          return (
                            <g key={`group-label-${group.groupIndex}`}>
                              <rect
                                x="14"
                                y={group.labelY - 17}
                                width={groupLabelWidth}
                                height="28"
                                rx="6"
                                fill="#d1d5db"
                              />
                              <text
                                x="20"
                                y={group.labelY + 2}
                                fontSize="15"
                                fontWeight="700"
                              >
                                <tspan fill={groupSatisfied ? '#16a34a' : '#dc2626'}>
                                  {groupSatisfied ? '✅' : '❌'}
                                </tspan>
                                <tspan dx="6" fill="#111827">
                                  {groupLabelBody}
                                </tspan>
                              </text>
                            </g>
                          );
                        })}

                        {selectedCourseGraph.optionNodes.map((node) => {
                          const palette = getNodePalette(node.code);
                          const nodeStatus = getFlowCourseStatus(node.code);
                          const nodeStatusLabel = getFlowStatusLabel(nodeStatus);
                          const nodeIsNavigable = csceCourseCodes.includes(node.code);
                          const nodeIsHovered = hoveredFlowNodeKey === node.key;
                          const statusBadge = {
                            completed: { fill: '#dcfce7', stroke: '#111827', text: '#111827' },
                            planned: { fill: '#dbeafe', stroke: '#111827', text: '#111827' },
                            available: { fill: '#fef9c3', stroke: '#111827', text: '#111827' },
                            locked: { fill: '#ffffff', stroke: '#111827', text: '#111827' },
                            'in-progress': { fill: '#dbeafe', stroke: '#111827', text: '#111827' }
                          }[nodeStatus] || { fill: '#f3f4f6', stroke: '#111827', text: '#111827' };
                          const startX = selectedCourseGraph.optionX + selectedCourseGraph.optionWidth + 2;
                          const endX = selectedCourseGraph.targetX - 12;
                          const shouldRenderEdge =
                            nodeStatus === 'completed' ||
                            (node.concurrentOk && nodeStatus === 'planned');
                          const edgeStrokeColor =
                            node.concurrentOk && nodeStatus === 'planned' ? '#2563eb' : '#111827';
                          return (
                            <g key={node.key}>
                              {shouldRenderEdge && (
                                <line
                                  x1={startX}
                                  y1={node.centerY}
                                  x2={endX}
                                  y2={selectedCourseGraph.targetCenterY}
                                  stroke={edgeStrokeColor}
                                  strokeWidth="1.75"
                                  strokeOpacity="0.85"
                                  strokeDasharray={node.concurrentOk ? '6 4' : undefined}
                                  markerEnd={
                                    node.concurrentOk && nodeStatus === 'planned'
                                      ? 'url(#selected-flow-arrow-coreq-planned)'
                                      : node.concurrentOk
                                      ? 'url(#selected-flow-arrow-coreq)'
                                      : 'url(#selected-flow-arrow)'
                                  }
                                  strokeLinecap="round"
                                />
                              )}
                              <g
                                role={nodeIsNavigable ? 'button' : undefined}
                                tabIndex={nodeIsNavigable ? 0 : undefined}
                                onClick={nodeIsNavigable ? () => selectFlowCourse(node.code) : undefined}
                                onMouseEnter={
                                  nodeIsNavigable ? () => setHoveredFlowNodeKey(node.key) : undefined
                                }
                                onMouseLeave={
                                  nodeIsNavigable ? () => setHoveredFlowNodeKey('') : undefined
                                }
                                onKeyDown={
                                  nodeIsNavigable
                                    ? (event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault();
                                          selectFlowCourse(node.code);
                                        }
                                      }
                                    : undefined
                                }
                                style={{ cursor: nodeIsNavigable ? 'pointer' : 'default' }}
                              >
                                <title>
                                  {nodeIsNavigable
                                    ? `Open ${node.code} prerequisite flowchart`
                                    : `${node.code} prerequisite option`}
                                </title>
                                <rect
                                  x={selectedCourseGraph.optionX}
                                  y={node.centerY - selectedCourseGraph.optionHeight / 2}
                                  width={selectedCourseGraph.optionWidth}
                                  height={selectedCourseGraph.optionHeight}
                                  rx="8"
                                  fill={palette.fill}
                                  stroke="#111827"
                                  strokeWidth={nodeIsNavigable && nodeIsHovered ? '2' : '1.5'}
                                  style={
                                    nodeIsNavigable && nodeIsHovered
                                      ? { filter: 'drop-shadow(0px 3px 6px rgba(17,24,39,0.35))' }
                                      : undefined
                                  }
                                />
                                <rect
                                  x={selectedCourseGraph.optionX + selectedCourseGraph.optionWidth - 74}
                                  y={node.centerY - selectedCourseGraph.optionHeight / 2 + 6}
                                  width="64"
                                  height="14"
                                  rx="7"
                                  fill={statusBadge.fill}
                                  stroke={statusBadge.stroke}
                                  strokeWidth="1"
                                />
                                <text
                                  x={selectedCourseGraph.optionX + 10}
                                  y={node.centerY - 5}
                                  fill="#111827"
                                  fontSize="15"
                                  fontWeight="700"
                                >
                                  {node.code}
                                </text>
                                <text
                                  x={selectedCourseGraph.optionX + selectedCourseGraph.optionWidth - 42}
                                  y={node.centerY - 10}
                                  fill={statusBadge.text}
                                  fontSize="10"
                                  fontWeight="600"
                                  textAnchor="middle"
                                >
                                  {nodeStatusLabel}
                                </text>
                              </g>
                              {node.showOptionType && (
                                <text
                                  x={selectedCourseGraph.optionX + 10}
                                  y={node.centerY + 13}
                                  fill="#111827"
                                  fontSize="12"
                                  fontWeight="400"
                                >
                                  {node.concurrentOk ? 'Co-requisite option' : 'Prerequisite option'}
                                </text>
                              )}
                            </g>
                          );
                        })}

                        {(() => {
                          const targetPalette = getNodePalette(
                            selectedFlowCourseCode,
                            getFlowCourseStatus(selectedFlowCourseCode)
                          );
                          const targetCourseTitle = selectedCourse?.title || 'Target course';
                          return (
                            <g>
                              <rect
                                x={selectedCourseGraph.targetX}
                                y={selectedCourseGraph.targetY}
                                width={selectedCourseGraph.targetWidth}
                                height={selectedCourseGraph.targetHeight}
                                rx="9"
                                fill={targetPalette.fill}
                                stroke="#111827"
                                strokeWidth="2"
                              />
                              <text
                                x={selectedCourseGraph.targetX + 12}
                                y={selectedCourseGraph.targetY + 24}
                                fill="#111827"
                                fontSize="16"
                                fontWeight="700"
                              >
                                {selectedFlowCourseCode}
                              </text>
                              <text
                                x={selectedCourseGraph.targetX + 12}
                                y={selectedCourseGraph.targetY + 42}
                                fill="#374151"
                                fontSize="11"
                              >
                                {targetCourseTitle}
                              </text>
                            </g>
                          );
                        })()}
                      </svg>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg bg-gray-50 p-4">
                      <p className="text-sm text-gray-600">
                        No prerequisite or co-requisite courses are listed for this course.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const buildExportTermsFromSnapshot = (snapshot) => {
    const exportTerms = [];

    // Transcript terms already include term placement + in-progress/completed grades.
    const transcriptSnapTerms = Array.isArray(snapshot?.transcriptTerms)
      ? snapshot.transcriptTerms
      : transcriptTerms;
    exportTerms.push(...(transcriptSnapTerms || []));

    // Add planned future terms so exported PDFs include planner-aware course placement.
    const semPlansSnap = snapshot?.semesterPlans || semesterPlans;
    const entries = Object.entries(semPlansSnap || {});
    entries.forEach(([termLabel, codes]) => {
      if (!Array.isArray(codes) || codes.length === 0) return;

      const plannedCourses = codes
        .map((rawCode) => String(rawCode ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map((code) => {
          const codeUpper = code.toUpperCase();
          const meta = COURSES[codeUpper] || {};
          return {
            code,
            title: meta.title || '',
            credits: Number(meta.credits ?? 0),
            grade: 'PLANNED',
            transfer: false
          };
        });

      exportTerms.push({
        label: termLabel,
        status: 'Planned',
        courses: plannedCourses
      });
    });

    return exportTerms;
  };

  const exportDegreeEvaluationPdf = (degreeEvalResult) => {
    const snapshot = lastEvaluationSnapshotRef.current;
    const exportTerms = buildExportTermsFromSnapshot(snapshot);

    const html = buildExportHtmlFromDegreeResult(
      degreeEvalResult,
      exportTerms,
      'Computed in DegreeFlow',
      {
        minor:
          selectedMinor && selectedMinor !== 'None'
            ? selectedMinor
            : minorResult?.requirementSet?.name || '',
        minorResult: minorResult || null
      }
    );

    const printWindow = window.open('', '_blank', 'width=1100,height=900');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 200);
  };

  const handleExportPdfClick = () => {
    if (!degreeResult) return;

    const currentSig = computeEvaluationSignature({
      transcriptTerms,
      semesterPlans,
      selectedEmphasis,
      selectedMinor,
      hasHsLanguage,
      hasSabrCourse,
      evaluationPriorityCodes: Object.keys(evaluationPriorityByCode)
        .filter((k) => evaluationPriorityByCode[k])
        .map((k) => normalizeCode(k))
        .sort()
    });

    const stale = !lastEvaluationSignature || currentSig !== lastEvaluationSignature;
    setExportPromptStale(stale);
    setExportPromptOpen(true);
  };

  const ExportDecisionModal = () => {
    if (!exportPromptOpen) return null;

    const onClose = () => {
      setExportPromptOpen(false);
    };

    const onContinue = () => {
      setExportPromptOpen(false);
      exportDegreeEvaluationPdf(degreeResult);
    };

    const onCancel = () => {
      onClose();
    };

    const onRegenerate = async () => {
      if (exportPromptBusy) return;
      setExportPromptBusy(true);
      try {
        const regen = await evaluateRequirementsLocal();
        if (!regen?.degreeResult) return;
        setExportPromptOpen(false);
        exportDegreeEvaluationPdf(regen.degreeResult);
      } finally {
        setExportPromptBusy(false);
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            {exportPromptStale ? 'Export uses an outdated evaluation?' : 'Export uses the latest evaluation?'}
          </h2>
          <p className="text-sm text-gray-700 mb-5">
            {exportPromptStale
              ? 'Your planner has changed since this evaluation was generated. You can regenerate, or export the current evaluation anyway.'
              : 'This evaluation matches your current planner inputs. You can continue exporting.'}
          </p>

          <div className="flex gap-3 justify-end">
            {exportPromptStale ? (
              <>
                <button
                  type="button"
                  onClick={onRegenerate}
                  disabled={exportPromptBusy}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#500000' }}
                >
                  {exportPromptBusy ? 'Regenerating…' : 'Regenerate Degree Evaluation'}
                </button>
                <button
                  type="button"
                  onClick={onContinue}
                  disabled={exportPromptBusy}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Continue Export
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={exportPromptBusy}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onContinue}
                  disabled={exportPromptBusy}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#500000' }}
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={exportPromptBusy}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}
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
            By uploading your transcript or degree evaluation PDF, you consent to DegreeFlow
            storing your course history (course codes, grades, and credit hours) to power your
            degree plan. Your data is associated with your TAMU Google account and is used solely
            for academic planning within this application.
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

  const SettingsTab = () => {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Settings</h2>
          <p className="text-sm text-gray-500 mb-6">Manage your preferences for TAMU Academic Planner.</p>

          {/* Accessibility section */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
              Accessibility
            </h3>
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
              {/* Dark mode toggle */}
              <div className="flex items-center justify-between px-4 py-3.5 bg-white">
                <div>
                  <p className="text-sm font-medium text-gray-900">Dark mode</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Switch between light and dark interface
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={theme === 'dark'}
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#500000] focus:ring-offset-2 ${
                    theme === 'dark' ? 'bg-[#500000]' : 'bg-gray-300'
                  }`}
                >
                  <span className="sr-only">Toggle dark mode</span>
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                      theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>
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
                    <div className="relative" ref={profileDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setProfileDropdownOpen((prev) => !prev)}
                        className="flex items-center gap-2.5 bg-white/10 border border-white/25 pl-3 pr-2.5 py-2 rounded-lg text-white hover:bg-white/20 transition-colors"
                        aria-haspopup="true"
                        aria-expanded={profileDropdownOpen}
                      >
                        {authUser.picture ? (
                          <img
                            src={authUser.picture}
                            alt="avatar"
                            className="w-7 h-7 rounded-full ring-1 ring-white/30"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-white/40 flex items-center justify-center text-xs font-bold">
                            {(authUser.name || 'S')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="leading-tight text-left hidden sm:block">
                          <div className="text-sm font-semibold">{authUser.name || 'Student'}</div>
                          <div className="text-[11px] text-white/70">{authUser.email}</div>
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 text-white/60 transition-transform duration-150 ${profileDropdownOpen ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {profileDropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-50 animate-fade-in">
                          <div className="px-4 py-2.5 border-b border-gray-100">
                            <p className="text-sm font-semibold text-gray-900 truncate">{authUser.name || 'Student'}</p>
                            <p className="text-xs text-gray-500 truncate">{authUser.email}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setProfileDropdownOpen(false);
                              setActiveTab('settings');
                            }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Settings className="w-4 h-4 text-gray-500" />
                            Settings
                          </button>
                          <div className="my-1 border-t border-gray-100" />
                          <button
                            type="button"
                            onClick={() => {
                              setProfileDropdownOpen(false);
                              if (window.confirm('Are you sure you want to log out?')) {
                                logout();
                              }
                            }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <X className="w-4 h-4" />
                            Logout
                          </button>
                        </div>
                      )}
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
                    { id: 'prerequisites', label: 'Prerequisites' },
                    ...(isAdmin ? [{ id: 'admin', label: 'Admin' }] : []),
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
                        activeTab === tab.id ? { borderColor: theme === 'dark' ? '#f1a0a0' : '#500000', color: theme === 'dark' ? '#f1a0a0' : '#500000' } : {}
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

      {authUser && isTranscriptDirty && activeTab !== 'login' && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="text-sm text-amber-900 flex-1 min-w-0">
              You have unsaved academic record changes. Click{' '}
              <span className="font-semibold">Update Record</span> to save them so
              your evaluation reflects the latest data.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void applyReviewedTranscript()}
                disabled={isTranscriptSaving}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 ${
                  isTranscriptSaving
                    ? 'bg-amber-200 text-amber-700 cursor-not-allowed'
                    : 'bg-amber-600 text-white hover:bg-amber-700'
                }`}
              >
                <Save className="w-3.5 h-3.5" />
                {isTranscriptSaving ? 'Saving…' : 'Update Record'}
              </button>
              {activeTab !== 'planner' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('planner')}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-amber-300 text-amber-800 hover:bg-amber-100"
                >
                  Go to Planner
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <main className={isFlowFullscreen ? 'p-0' : 'max-w-7xl mx-auto px-4 py-8'}>
        <div key={activeTab} className="animate-fade-in">
          {isLoadingData && activeTab !== 'login' ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <div className="w-10 h-10 border-4 border-maroon/30 border-t-maroon rounded-full animate-spin" />
              <p className="text-gray-500 text-sm">Loading your data&hellip;</p>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (authUser ? <DashboardTab /> : <LoginPage />)}
              {activeTab === 'planner' && (authUser ? <PlannerTab /> : <LoginPage />)}
              {activeTab === 'prerequisites' && (authUser ? (
                <PrerequisiteTab
                  isFullscreen={isFlowFullscreen}
                  onFullscreenChange={setIsFlowFullscreen}
                />
              ) : <LoginPage />)}
              {activeTab === 'settings' && (authUser ? <SettingsTab /> : <LoginPage />)}
              {activeTab === 'admin' && (authUser && isAdmin ? <AdminPanel apiBase={API_BASE} authHeaders={authHeaders} onCatalogChange={refreshCatalog} /> : <LoginPage />)}
              {activeTab === 'login' && <LoginPage />}
            </>
          )}
        </div>
      </main>

      <TranscriptConsentModal />
      <ExportDecisionModal />

      {!isFlowFullscreen && (
        <div className="fixed right-6 bottom-6 z-50 flex items-end pointer-events-none">
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
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-gray-700">
                    <p className="font-semibold text-gray-900">Welcome to DegreeFlow Assistant!</p>
                    <p className="mt-1 text-xs text-gray-600">I can help you with:</p>
                    <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-gray-700">
                      <li>Identify which degree evaluation requirements are still not met.</li>
                      <li>Recommend future courses based on prerequisites and missing requirements.</li>
                      <li>Add or remove courses in your planner (with pre-requisite check and confirmation).</li>
                      <li>Explain prerequisites and co-requisites for a course.</li>
                      <li>Parse an uploaded transcript PDF and update your plan.</li>
                      <li>Parse a degree evaluation PDF and update your plan.</li>
                    </ul>
                    <p className="mt-2 text-xs text-gray-500">
                      Try asking: "What requirements am I still missing?" or "What should I take next semester?"
                    </p>
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
                            text: `I can parse ${file.name} after you confirm the consent dialog.`
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
                    title="Upload transcript or degree evaluation PDF"
                  >
                    Upload
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
            className={`pointer-events-auto flex flex-col items-center justify-center h-24 w-24 rounded-full border-2 border-white text-white shadow-xl transition-all ${
              isChatOpen ? 'bg-[#3d0000]' : 'bg-[#500000] hover:bg-[#3d0000]'
            }`}
            aria-label={isChatOpen ? 'Close chat assistant' : 'Open chat assistant'}
            title={isChatOpen ? 'Close chat' : 'Open chat'}
          >
            {isChatOpen ? (
              <>
                <X className="h-7 w-7" />
                <span className="mt-1 text-xs font-semibold leading-none">Close</span>
              </>
            ) : (
              <>
                <MessageCircle className="h-7 w-7" />
                <span className="mt-1 text-xs font-semibold leading-none">Chat</span>
              </>
            )}
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
