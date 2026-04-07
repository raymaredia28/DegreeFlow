#!/usr/bin/env python3
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from typing import List, Optional

import pdfplumber

TERM_RE = re.compile(r"\b(Fall|Spring|Summer|Winter)\s*-?\s*(20\d{2})\b")
HEADER_RE = re.compile(r"Subj\s+No\.?\s+Course\s*Title", re.IGNORECASE)
TERM_TOTALS_RE = re.compile(r"(Term|Transcript)\s*Totals", re.IGNORECASE)
IN_PROGRESS_RE = re.compile(r"COURSES\s*IN\s*PROGRESS", re.IGNORECASE)
TERM_CODE_RE = re.compile(r"\((\d{6})\)")

TERM_CODE_MAP = {
    "11": "Spring",
    "21": "Summer",
    "31": "Fall",
    "41": "Winter",
}

NOISE_RE = re.compile(
    r"^(College:|Department:|Engineering\s*-|Curriculum|Semester$)",
    re.IGNORECASE,
)

TRAILING_MARKER_RE = re.compile(
    r"\b(EHRS|Ehrs|GPA|Q\s*pts|Qpts|INSTITUTION|TOTAL|TOTALS|OVERALL|UndergraduateTotals)\b",
    re.IGNORECASE,
)

SUMMARY_LINE_RE = re.compile(
    r"(Term|Transcript)\s*Totals|UndergraduateTotals|EarnedHrs|GPA[-\s]*Hrs|Q\s*pts|Qpts|"
    r"TOTALINSTITUTION|TOTALTRANSFER|OVERALL|Page\s*\d+\s*of\s*\d+",
    re.IGNORECASE,
)

GRADE_TOKENS = {
    "A",
    "A-",
    "B+",
    "B",
    "B-",
    "C+",
    "C",
    "C-",
    "D+",
    "D",
    "D-",
    "F",
    "S",
    "U",
    "P",
    "W",
    "Q",
    "IP",
    "TA",
    "TB",
    "TC",
    "TD",
    "TF",
    "TCR",
    "TIP",
}

IN_PROGRESS_GRADES = {"IP", "TIP"}
TRANSFER_GRADES = {"TA", "TB", "TC", "TD", "TF", "TCR", "TIP"}
EXCLUDED_GRADES = {"Q"}

CREDIT_RE = re.compile(r"^\d+\.\d{3}$")

TERM_ORDER = {"Spring": 1, "Summer": 2, "Fall": 3, "Winter": 4}

# Totals extraction patterns
TOTALS_INSTITUTION_RE = re.compile(
    r"TOTAL\s*INSTITUTION\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)", re.IGNORECASE
)
TOTALS_TRANSFER_RE = re.compile(
    r"TOTAL\s*TRANSFER\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)", re.IGNORECASE
)
TOTALS_OVERALL_RE = re.compile(
    r"OVERALL\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)", re.IGNORECASE
)

@dataclass
class Course:
    code: str
    title: str
    credits: float
    grade: str
    transfer: bool = False

@dataclass
class TermBlock:
    label: Optional[str]
    courses: List[Course] = field(default_factory=list)
    status: str = "Evaluated"
    term_code: Optional[str] = None
    in_progress_mode: bool = False


def group_lines(words):
    lines = defaultdict(list)
    for w in words:
        key = round(w["top"] / 2) * 2
        lines[key].append(w)
    output = []
    for y in sorted(lines.keys()):
        row = sorted(lines[y], key=lambda w: w["x0"])
        text = " ".join(w["text"] for w in row)
        output.append((y, text))
    return output


def clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def strip_trailing_noise(line: str) -> str:
    match = TERM_TOTALS_RE.search(line)
    if match:
        return line[: match.start()].strip()
    match = SUMMARY_LINE_RE.search(line)
    if match:
        return line[: match.start()].strip()
    match = TRAILING_MARKER_RE.search(line)
    if match:
        return line[: match.start()].strip()
    return line


def normalize_grade_token(token: str) -> str:
    return re.sub(r"[^A-Z0-9+\-]", "", str(token or "").strip().upper())


def is_in_progress_grade(grade: str) -> bool:
    return normalize_grade_token(grade) in IN_PROGRESS_GRADES


def is_transfer_grade(grade: str) -> bool:
    return normalize_grade_token(grade) in TRANSFER_GRADES


def is_excluded_grade(grade: str) -> bool:
    return normalize_grade_token(grade) in EXCLUDED_GRADES


def clean_department_code(dept: str) -> str:
    """Fix garbled department codes from PDF extraction."""
    dept = str(dept or "").strip().upper()

    # Common OCR/extraction errors in TAMU transcripts
    corrections = {
        "ANTOH": "ANTH",
        "NCSCE": "CSCE",
        "UCSCE": "CSCE",
        "UHIST": "HIST",
        "UENDS": "ENDS",
        "NMKTG": "MKTG",
        "NFINC": "FINC",
        "NMATH": "MATH",
        "NPHYS": "PHYS",
        "NENGL": "ENGL",
    }
    if dept in corrections:
        return corrections[dept]

    # Some unofficial transcript PDFs prepend a spurious leading character
    # (often U/N) to the department token. Normalize those when the remainder
    # is a known TAMU department code used in evaluation rules.
    known_codes = {
        "AFST",
        "ANTH",
        "ARCH",
        "ARTS",
        "COMM",
        "CSCE",
        "DCED",
        "ENDS",
        "ENGL",
        "FILM",
        "FINC",
        "FREN",
        "GEOL",
        "GLST",
        "HISP",
        "HIST",
        "HORT",
        "INTA",
        "KINE",
        "MATH",
        "MKTG",
        "MSTC",
        "MUSC",
        "PERF",
        "PHIL",
        "PHYS",
        "POLS",
        "RELS",
        "THEA",
    }
    if len(dept) >= 4 and dept[0] in {"U", "N"}:
        candidate = dept[1:]
        if candidate in known_codes:
            return candidate

    return dept


def normalize_student_name(raw: str) -> str:
    name = clean_line(raw)
    name = re.sub(r"^\s*(Student\s+)?Name\s*:\s*", "", name, flags=re.IGNORECASE)
    if not name:
        return ""

    # Handle "Last, First Middle" style.
    if "," in name:
        last, rest = name.split(",", 1)
        if rest.strip():
            name = f"{rest.strip()} {last.strip()}"

    # If fully uppercase, convert to title case for display.
    if name == name.upper():
        small_words = {"de", "da", "del", "la", "van", "von", "of", "the"}
        parts = []
        for idx, token in enumerate(name.split()):
            if idx > 0 and token.lower() in small_words:
                parts.append(token.lower())
            else:
                parts.append(token.capitalize())
        name = " ".join(parts)

    return name


def extract_student_name(pages) -> Optional[str]:
    # Transcripts commonly include "Name (UIN)" near the top of page 1.
    for page in pages[:2]:
        text = page.extract_text() or ""
        for raw_line in text.split("\n"):
            line = clean_line(raw_line)
            if not line:
                continue
            match = re.search(r"(.+?)\s*\(\s*(\d{6,12})\s*\)", line)
            if not match:
                continue
            candidate = clean_line(match.group(1))
            if not candidate:
                continue
            if re.search(r"\b(Fall|Spring|Summer|Winter)\b", candidate):
                continue
            if "Texas A&M University" in candidate:
                continue
            return normalize_student_name(candidate)
    return None


def title_case_course_title(title: str) -> str:
    """Convert ALL CAPS course title to Title Case."""
    if not title:
        return title
    
    # Words that should stay lowercase (except at start)
    lowercase_words = {
        'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into',
        'of', 'on', 'or', 'the', 'to', 'with', '&'
    }
    
    # Roman numerals that should stay uppercase
    roman_numerals = {'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'}
    
    words = title.split()
    result = []
    
    for i, word in enumerate(words):
        # Check if it's a Roman numeral
        if word.upper() in roman_numerals:
            result.append(word.upper())
        # First word is always capitalized
        elif i == 0:
            result.append(word.capitalize())
        # Check if it should be lowercase
        elif word.lower() in lowercase_words:
            result.append(word.lower())
        else:
            result.append(word.capitalize())
    
    return ' '.join(result)


def parse_course(line: str, in_progress_mode: bool) -> Optional[Course]:
    line = strip_trailing_noise(line)
    tokens = line.split()
    if len(tokens) < 3:
        return None
    dept = tokens[0]
    num = tokens[1]
    
    # Clean department code
    dept = clean_department_code(dept)
    
    if not dept.isalpha() or not num.isdigit():
        return None
    if len(dept) > 6:
        return None
    if dept.upper().startswith(("TOTAL", "TRANSCRIPT")):
        return None

    rest = tokens[2:]
    credit_idx = None
    for i, tok in enumerate(rest):
        if CREDIT_RE.match(tok):
            credit_idx = i
            break
    if credit_idx is None:
        return None

    grade = "IP" if in_progress_mode else ""
    grade_idx = None

    if credit_idx + 1 < len(rest):
        next_grade = normalize_grade_token(rest[credit_idx + 1])
        if next_grade in GRADE_TOKENS:
            grade_idx = credit_idx + 1
            grade = next_grade

    if grade_idx is None:
        # Fallback: choose a grade token only if it is close to the credit field.
        # This avoids falsely reading stray OCR tokens (e.g., split "Q pts") as
        # a dropped-course grade for valid zero-credit courses.
        nearby = []
        for i, tok in enumerate(rest):
            normalized = normalize_grade_token(tok)
            if normalized in GRADE_TOKENS and abs(i - credit_idx) <= 2:
                # Prefer tokens to the right of credits, then nearest distance.
                side_rank = 0 if i > credit_idx else 1
                nearby.append((side_rank, abs(i - credit_idx), i, normalized))
        if nearby:
            nearby.sort()
            _, _, grade_idx, grade = nearby[0]

    if is_excluded_grade(grade):
        return None

    title_end = credit_idx
    if grade_idx is not None and grade_idx < credit_idx:
        title_end = min(title_end, grade_idx)
    title_tokens = rest[:title_end]
    while title_tokens and title_tokens[-1] in {"R", "N", "L", "T", "O", "TEhrs:16.000"}:
        title_tokens.pop()
    title = " ".join(title_tokens).strip()
    
    # Convert to title case
    title = title_case_course_title(title)

    try:
        credits = float(rest[credit_idx])
    except ValueError:
        return None

    code = f"{dept} {num}"
    transfer = is_transfer_grade(grade)
    return Course(code=code, title=title, credits=credits, grade=grade, transfer=transfer)


def prev_primary_term(term: str, year: int):
    if term == "Spring":
        return "Fall", year - 1
    if term == "Summer":
        return "Spring", year
    if term == "Fall":
        return "Summer", year
    if term == "Winter":
        return "Fall", year
    return term, year


def next_primary_term(term: str, year: int):
    if term == "Fall":
        return "Spring", year + 1
    if term == "Spring":
        return "Fall", year
    if term == "Summer":
        return "Fall", year
    if term == "Winter":
        return "Spring", year + 1
    return term, year


def term_label_from_code(code: str) -> Optional[str]:
    if len(code) != 6:
        return None
    year = int(code[:4])
    suffix = code[-2:]
    term = TERM_CODE_MAP.get(suffix)
    if not term:
        return None
    return f"{term} {year}"


def parse_page_columns(page, split_columns: bool = True) -> List[TermBlock]:
    """Parse page by extracting words from cropped columns."""
    all_blocks = []
    
    if split_columns:
        # Crop page into left and right halves with margin to avoid bleed
        mid = page.width / 2
        margin = 10
        left_crop = page.crop((0, 0, mid - margin, page.height))
        right_crop = page.crop((mid + margin, 0, page.width, page.height))
        
        for crop in [left_crop, right_crop]:
            # Use extract_words to preserve spacing, then group into lines
            words = crop.extract_words(x_tolerance=1, y_tolerance=2)
            if not words:
                continue
            lines_dict = defaultdict(list)
            for w in words:
                key = round(w["top"] / 2) * 2
                lines_dict[key].append(w)
            lines = []
            for y in sorted(lines_dict.keys()):
                row = sorted(lines_dict[y], key=lambda w: w["x0"])
                text = " ".join(w["text"] for w in row)
                cleaned = clean_line(text)
                if cleaned:
                    lines.append(cleaned)
            blocks = parse_lines(lines)
            all_blocks.extend(blocks)
    else:
        text = page.extract_text() or ""
        lines = [clean_line(l) for l in text.split("\n") if clean_line(l)]
        blocks = parse_lines(lines)
        all_blocks.extend(blocks)
    
    return all_blocks


def parse_page_columns_words(page, split_columns: bool = True) -> List[TermBlock]:
    """Fallback word-based extraction for comparison."""
    words = page.extract_words(x_tolerance=1, y_tolerance=2)
    columns = []
    column_sets = []
    if split_columns:
        mid = page.width / 2
        column_sets = [
            [w for w in words if w["x0"] < mid],
            [w for w in words if w["x0"] >= mid]
        ]
    else:
        column_sets = [words]

    for col_words in column_sets:
        lines = group_lines(col_words)
        blocks: List[TermBlock] = []
        current: Optional[TermBlock] = None
        pending_label: Optional[str] = None
        pending_code: Optional[str] = None
        in_progress_mode = False
        last_was_course = False

        for _, raw in lines:
            line = clean_line(raw)
            if not line:
                continue

            if IN_PROGRESS_RE.search(line):
                in_progress_mode = True
                continue

            term_code_match = TERM_CODE_RE.search(line)
            if term_code_match:
                pending_code = term_code_match.group(1)

            term_match = TERM_RE.search(line)
            if term_match:
                term, year = term_match.groups()
                label = f"{term} {year}"
                if current and not current.courses:
                    current.label = label
                else:
                    if current and current.courses:
                        blocks.append(current)
                    current = TermBlock(label=label, status="Evaluated", term_code=pending_code, in_progress_mode=in_progress_mode)
                pending_label = None
                pending_code = None
                last_was_course = False
                continue

            if NOISE_RE.search(line):
                last_was_course = False
                continue

            if HEADER_RE.search(line):
                if current and current.courses:
                    blocks.append(current)
                    current = None
                if current is None:
                    current = TermBlock(label=pending_label, status="Evaluated", term_code=pending_code, in_progress_mode=in_progress_mode)
                    pending_label = None
                    pending_code = None
                last_was_course = False
                continue

            if TERM_TOTALS_RE.search(line):
                if current and current.courses:
                    blocks.append(current)
                    current = None
                in_progress_mode = False
                last_was_course = False
                continue

            if SUMMARY_LINE_RE.search(line):
                last_was_course = False
                continue

            tokens = line.split()
            if len(tokens) == 1:
                tok = normalize_grade_token(tokens[0])
                if tok in {"R", "N", "L", "I"}:
                    # Marker can appear between a course row and its grade.
                    # Keep last_was_course so a following standalone grade is still attached.
                    continue
                if tok in GRADE_TOKENS:
                    grade_tok = tok
                    if current and current.courses and last_was_course:
                        if is_excluded_grade(grade_tok) and current.courses[-1].grade in ("", "IP"):
                            current.courses.pop()
                        elif current.courses[-1].grade in ("", "IP"):
                            current.courses[-1].grade = grade_tok
                    last_was_course = False
                    continue

            course = parse_course(line, in_progress_mode)
            if course:
                if current is None:
                    current = TermBlock(label=pending_label, status="Evaluated", term_code=pending_code, in_progress_mode=in_progress_mode)
                    pending_label = None
                    pending_code = None
                current.courses.append(course)
                if is_in_progress_grade(course.grade):
                    current.status = "In Progress"
                elif course.transfer and current.status != "In Progress":
                    current.status = "Transfer"
                last_was_course = True
                continue
            
            # If parsing failed, check if it's a title continuation
            if current and current.courses and last_was_course:
                # Skip if it looks like a term header, totals, or noise
                if (TERM_RE.search(line) or HEADER_RE.search(line) or 
                    TERM_TOTALS_RE.search(line) or TRAILING_MARKER_RE.search(line) or 
                    SUMMARY_LINE_RE.search(line)):
                    last_was_course = False
                    continue
                # Skip Ehrs/GPA lines
                if line.startswith("Ehrs") or line.startswith("GPA") or line.startswith("EHRS"):
                    last_was_course = False
                    continue
                # Skip lines with more than 4 tokens (likely a new course line that failed to parse)
                tokens = line.split()
                if len(tokens) > 4:
                    last_was_course = False
                    continue
                # Skip if contains credit pattern or multiple grade tokens
                if CREDIT_RE.search(line) or sum(1 for tok in tokens if tok in GRADE_TOKENS) > 1:
                    last_was_course = False
                    continue
                # Looks like a legitimate continuation - append to title
                current.courses[-1].title = f"{current.courses[-1].title} {line}".strip()
                # Re-apply title case
                current.courses[-1].title = title_case_course_title(current.courses[-1].title)
                continue
            
            last_was_course = False

        if current and current.courses:
            blocks.append(current)

        columns.append(blocks)

    if not columns:
        return []
    return [block for col in columns for block in col]


def infer_missing_labels(blocks: List[TermBlock]) -> List[TermBlock]:
    def split_term_year(label: Optional[str]):
        if not label:
            return None, None
        parts = label.split(" ")
        if len(parts) != 2 or not parts[1].isdigit():
            return None, None
        return parts[0], int(parts[1])

    for idx, block in enumerate(blocks):
        if block.label:
            continue

        if block.term_code:
            inferred = term_label_from_code(block.term_code)
            if inferred:
                block.label = inferred
                continue

        next_label = None
        for j in range(idx + 1, len(blocks)):
            if blocks[j].label:
                next_label = blocks[j].label
                break
        prev_label = None
        for j in range(idx - 1, -1, -1):
            if blocks[j].label:
                prev_label = blocks[j].label
                break

        prev_term, prev_year = split_term_year(prev_label)
        next_term, next_year = split_term_year(next_label)
        
        # If a trailing unlabeled block follows an in-progress block, treat it as
        # the same in-progress term rather than inventing a future labeled term.
        if idx > 0 and not next_label:
            prev_block = blocks[idx - 1]
            if prev_block.label and prev_block.status == "In Progress":
                block.label = prev_block.label
                block.status = "In Progress"
                for course in block.courses:
                    if not course.grade:
                        course.grade = "IP"
                continue

        # In many TAMU transcripts, an unlabeled block between Spring and Fall
        # is a continuation of the current Spring term (split across columns),
        # not a standalone Summer term.
        if (
            prev_term == "Spring"
            and next_term == "Fall"
            and prev_year is not None
            and next_year is not None
            and prev_year == next_year
        ):
            block.label = prev_label
            continue

        if next_label:
            parts = next_label.split(" ")
            if len(parts) == 2 and parts[1].isdigit():
                term, year = parts
                inferred_term, inferred_year = prev_primary_term(term, int(year))
                block.label = f"{inferred_term} {inferred_year}"
                continue
        if prev_label:
            parts = prev_label.split(" ")
            if len(parts) == 2 and parts[1].isdigit():
                term, year = parts
                inferred_term, inferred_year = next_primary_term(term, int(year))
                block.label = f"{inferred_term} {inferred_year}"
                continue

        block.label = "Unknown Term"

    return blocks


def term_sort_key(label: str):
    parts = label.split(" ")
    if len(parts) != 2 or not parts[1].isdigit():
        return (9999, 99)
    term, year = parts
    return (int(year), TERM_ORDER.get(term, 99))


def score_blocks(blocks: List[TermBlock]) -> int:
    if not blocks:
        return 0
    labeled = sum(1 for b in blocks if b.label and b.label != "Unknown Term")
    courses = sum(len(b.courses) for b in blocks)
    return labeled * 10 + courses


def merge_continuation_blocks(blocks: List[TermBlock]) -> List[TermBlock]:
    """Merge unlabeled blocks into preceding labeled block (for page breaks)."""
    if not blocks:
        return blocks
    merged: List[TermBlock] = []
    for block in blocks:
        if not block.label and merged and merged[-1].label:
            # Continuation of previous term
            merged[-1].courses.extend(block.courses)
            if block.status == "In Progress":
                merged[-1].status = "In Progress"
        else:
            merged.append(block)
    return merged


def extract_totals(pages) -> Optional[dict]:
    """Scan all pages for TRANSCRIPT TOTALS section."""
    totals: Dict[str, dict] = {}
    for page in pages:
        text = page.extract_text() or ""
        for line in text.split("\n"):
            line = clean_line(line)
            
            m = TOTALS_INSTITUTION_RE.search(line)
            if m:
                totals["institution"] = {
                    "earnedHours": float(m.group(1)),
                    "gpaHours": float(m.group(2)),
                    "points": float(m.group(3)),
                    "gpa": float(m.group(4)),
                }
                continue
            
            m = TOTALS_TRANSFER_RE.search(line)
            if m:
                totals["transfer"] = {
                    "earnedHours": float(m.group(1)),
                    "gpaHours": float(m.group(2)),
                    "points": float(m.group(3)),
                    "gpa": float(m.group(4)),
                }
                continue
            
            m = TOTALS_OVERALL_RE.search(line)
            if m:
                totals["overall"] = {
                    "earnedHours": float(m.group(1)),
                    "gpaHours": float(m.group(2)),
                    "points": float(m.group(3)),
                    "gpa": float(m.group(4)),
                }
                continue
    
    return totals if totals else None


def parse_lines(lines: List[str]) -> List[TermBlock]:
    """Parse a list of text lines into TermBlocks."""
    blocks: List[TermBlock] = []
    current: Optional[TermBlock] = None
    pending_label: Optional[str] = None
    pending_code: Optional[str] = None
    pending_dept: Optional[str] = None
    in_progress_mode = False
    last_was_course = False

    for line in lines:
        if not line:
            continue

        # Some transcripts split a course row into two lines, e.g.:
        #   NCSCE
        #   399 HIGH-IMPACT EXPERIENCE 0.000
        # Carry a standalone department token to the next line.
        if pending_dept:
            rebuilt = f"{pending_dept} {line}"
            rebuilt_course = parse_course(rebuilt, in_progress_mode)
            if rebuilt_course:
                if current is None:
                    current = TermBlock(label=pending_label, status="Evaluated", term_code=pending_code, in_progress_mode=in_progress_mode)
                    pending_label = None
                    pending_code = None
                current.courses.append(rebuilt_course)
                if is_in_progress_grade(rebuilt_course.grade):
                    current.status = "In Progress"
                elif rebuilt_course.transfer and current.status != "In Progress":
                    current.status = "Transfer"
                pending_dept = None
                last_was_course = True
                continue
            if line.split() and line.split()[0].isdigit():
                pending_dept = None

        if IN_PROGRESS_RE.search(line):
            pending_dept = None
            in_progress_mode = True
            continue

        term_code_match = TERM_CODE_RE.search(line)
        if term_code_match:
            pending_code = term_code_match.group(1)

        term_match = TERM_RE.search(line)
        if term_match:
            term, year = term_match.groups()
            label = f"{term} {year}"
            if current and not current.courses:
                current.label = label
            else:
                if current and current.courses:
                    blocks.append(current)
                current = TermBlock(label=label, status="Evaluated", term_code=pending_code, in_progress_mode=in_progress_mode)
            pending_label = None
            pending_code = None
            pending_dept = None
            last_was_course = False
            continue

        if NOISE_RE.search(line):
            pending_dept = None
            last_was_course = False
            continue

        if HEADER_RE.search(line):
            if current and current.courses:
                blocks.append(current)
                current = None
            if current is None:
                current = TermBlock(label=pending_label, status="Evaluated", term_code=pending_code, in_progress_mode=in_progress_mode)
                pending_label = None
                pending_code = None
            pending_dept = None
            last_was_course = False
            continue

        if TERM_TOTALS_RE.search(line):
            if current and current.courses:
                blocks.append(current)
                current = None
            pending_dept = None
            in_progress_mode = False
            last_was_course = False
            continue

        if SUMMARY_LINE_RE.search(line):
            pending_dept = None
            last_was_course = False
            continue

        tokens = line.split()
        if len(tokens) == 1:
            tok = normalize_grade_token(tokens[0])
            if tok in {"R", "N", "L", "I"}:
                # Marker can appear between a course row and its grade.
                # Keep last_was_course so a following standalone grade is still attached.
                continue
            if tok in GRADE_TOKENS:
                if current and current.courses and last_was_course:
                    if is_excluded_grade(tok) and current.courses[-1].grade in ("", "IP"):
                        current.courses.pop()
                    elif current.courses[-1].grade in ("", "IP"):
                        current.courses[-1].grade = tok
                pending_dept = None
                last_was_course = False
                continue
            dept_candidate = clean_department_code(tokens[0].upper())
            if dept_candidate.isalpha() and 2 <= len(dept_candidate) <= 6:
                pending_dept = dept_candidate
                last_was_course = False
                continue

        course = parse_course(line, in_progress_mode)
        if course:
            if current is None:
                current = TermBlock(label=pending_label, status="Evaluated", term_code=pending_code, in_progress_mode=in_progress_mode)
                pending_label = None
                pending_code = None
            current.courses.append(course)
            if is_in_progress_grade(course.grade):
                current.status = "In Progress"
            elif course.transfer and current.status != "In Progress":
                current.status = "Transfer"
            pending_dept = None
            last_was_course = True
            continue
        
        # If parsing failed, check if it's a title continuation
        if current and current.courses and last_was_course:
            # Skip if it looks like a term header, totals, or noise
            if (TERM_RE.search(line) or HEADER_RE.search(line) or 
                TERM_TOTALS_RE.search(line) or TRAILING_MARKER_RE.search(line) or 
                SUMMARY_LINE_RE.search(line)):
                last_was_course = False
                continue
            # Skip Ehrs/GPA lines
            if line.startswith("Ehrs") or line.startswith("GPA") or line.startswith("EHRS"):
                last_was_course = False
                continue
            # Skip lines with more than 4 tokens (likely a new course line that failed to parse)
            tokens = line.split()
            if len(tokens) > 4:
                last_was_course = False
                continue
            # Skip if contains credit pattern or multiple grade tokens
            if CREDIT_RE.search(line) or sum(1 for tok in tokens if tok in GRADE_TOKENS) > 1:
                last_was_course = False
                continue
            # Looks like a legitimate continuation - append to title
            current.courses[-1].title = f"{current.courses[-1].title} {line}".strip()
            # Re-apply title case
            current.courses[-1].title = title_case_course_title(current.courses[-1].title)
            continue
        
        last_was_course = False

    if current and current.courses:
        blocks.append(current)

    return blocks


def parse_pdf(path: str):
    blocks: List[TermBlock] = []
    blocks_single: List[TermBlock] = []
    totals = None
    student_name = None
    
    with pdfplumber.open(path) as pdf:
        # Extract using cropped columns (most accurate for TAMU transcripts)
        for page in pdf.pages:
            blocks.extend(parse_page_columns(page, split_columns=True))
            blocks_single.extend(parse_page_columns(page, split_columns=False))
        
        # Extract totals
        totals = extract_totals(pdf.pages)
        student_name = extract_student_name(pdf.pages)

    # Pick best strategy
    if score_blocks(blocks_single) > score_blocks(blocks):
        blocks = blocks_single

    # Post-process blocks
    # Infer labels before any continuation merge.
    # This prevents unlabeled right-column terms from being folded into
    # the previous left-column term.
    blocks = infer_missing_labels(blocks)

    # Only merge true unknown continuations after inference.
    unknown_only = []
    for block in blocks:
        if block.label == "Unknown Term":
            block.label = None
        unknown_only.append(block)
    blocks = merge_continuation_blocks(unknown_only)
    blocks = infer_missing_labels(blocks)

    # Merge blocks with same label
    merged = {}
    for block in blocks:
        if not block.courses:
            continue
        label = block.label or "Unknown Term"
        if label not in merged:
            merged[label] = {
                "label": label,
                "status": block.status,
                "courses": [],
            }
        merged[label]["courses"].extend(
            {
                "code": c.code,
                "title": c.title,
                "credits": c.credits,
                "grade": c.grade,
                "transfer": c.transfer,
            }
            for c in block.courses
            if not is_excluded_grade(c.grade)
        )
        if block.status == "In Progress":
            merged[label]["status"] = "In Progress"
        elif block.status == "Transfer" and merged[label]["status"] != "In Progress":
            merged[label]["status"] = "Transfer"

    terms = sorted((t for t in merged.values() if t.get("courses")), key=lambda t: term_sort_key(t["label"]))

    # Final normalization pass:
    # If the latest term has only blank grades, treat it as "In Progress" and
    # assign IP to blank-grade courses. This aligns unofficial transcript rows
    # that omit explicit grades for current-term coursework.
    if terms:
        latest_label = max((term.get("label", "") for term in terms), key=term_sort_key)
        for term in terms:
            courses = term.get("courses", [])
            if not courses:
                continue

            has_blank = any(not normalize_grade_token(c.get("grade", "")) for c in courses)
            has_nonblank = any(normalize_grade_token(c.get("grade", "")) for c in courses)
            has_in_progress = any(
                is_in_progress_grade(c.get("grade", "")) for c in courses
            )

            should_mark_in_progress = has_in_progress or (
                term.get("label") == latest_label and has_blank and not has_nonblank
            )

            if should_mark_in_progress:
                term["status"] = "In Progress"
                for course in courses:
                    if not normalize_grade_token(course.get("grade", "")):
                        course["grade"] = "IP"

    result = {"terms": terms}
    if totals:
        result["totals"] = totals
    if student_name:
        result["studentName"] = student_name
    
    return result


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing PDF path"}))
        sys.exit(1)
    path = sys.argv[1]
    try:
        result = parse_pdf(path)
        print(json.dumps(result))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
