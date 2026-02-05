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
    r"\b(EHRS|Ehrs|GPA|Qpts|INSTITUTION|TOTAL|TOTALS|OVERALL|UndergraduateTotals)\b",
    re.IGNORECASE,
)

SUMMARY_LINE_RE = re.compile(
    r"(Term|Transcript)\s*Totals|UndergraduateTotals|EarnedHrs|GPA[-\s]*Hrs|Qpts|"
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
    "IP",
    "TA",
}

CREDIT_RE = re.compile(r"^\d+\.\d{3}$")

TERM_ORDER = {"Spring": 1, "Summer": 2, "Fall": 3, "Winter": 4}

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


def parse_course(line: str, in_progress_mode: bool) -> Optional[Course]:
    line = strip_trailing_noise(line)
    tokens = line.split()
    if len(tokens) < 3:
        return None
    dept = tokens[0]
    num = tokens[1]
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
    if credit_idx + 1 < len(rest) and rest[credit_idx + 1] in GRADE_TOKENS:
        grade_idx = credit_idx + 1
        grade = rest[grade_idx]
    else:
        grade_candidates = [i for i, tok in enumerate(rest) if tok in GRADE_TOKENS]
        if grade_candidates:
            before = [i for i in grade_candidates if i < credit_idx]
            if before:
                grade_idx = before[-1]
            else:
                grade_idx = grade_candidates[0]
            grade = rest[grade_idx]

    title_end = credit_idx
    if grade_idx is not None and grade_idx < credit_idx:
        title_end = min(title_end, grade_idx)
    title_tokens = rest[:title_end]
    while title_tokens and title_tokens[-1] in {"R"}:
        title_tokens.pop()
    title = " ".join(title_tokens).strip()

    try:
        credits = float(rest[credit_idx])
    except ValueError:
        return None

    code = f"{dept} {num}"
    transfer = grade == "TA"
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
                last_was_course = False
                continue

            if SUMMARY_LINE_RE.search(line):
                last_was_course = False
                continue

            tokens = line.split()
            if len(tokens) == 1 and tokens[0] in {"R", "N", "L", "I"}:
                last_was_course = False
                continue
            if len(tokens) == 1 and tokens[0] in GRADE_TOKENS:
                if (
                    current
                    and current.courses
                    and last_was_course
                    and current.courses[-1].grade in ("", "IP")
                ):
                    current.courses[-1].grade = tokens[0]
                last_was_course = False
                continue

            course = parse_course(line, in_progress_mode)
            if course:
                if current is None:
                    current = TermBlock(label=pending_label, status="Evaluated", term_code=pending_code, in_progress_mode=in_progress_mode)
                    pending_label = None
                    pending_code = None
                current.courses.append(course)
                if course.grade == "IP" or in_progress_mode:
                    current.status = "In Progress"
                elif course.transfer and current.status != "In Progress":
                    current.status = "Transfer"
                last_was_course = True
                continue
            last_was_course = False

            if current and current.courses and not TERM_RE.search(line) and not HEADER_RE.search(line):
                if TERM_TOTALS_RE.search(line) or TRAILING_MARKER_RE.search(line) or SUMMARY_LINE_RE.search(line):
                    continue
                if not line.startswith("Ehrs") and not line.startswith("GPA"):
                    current.courses[-1].title = f"{current.courses[-1].title} {line}".strip()

        if current and current.courses:
            blocks.append(current)

        columns.append(blocks)

    if not columns:
        return []
    return [block for col in columns for block in col]


def infer_missing_labels(blocks: List[TermBlock]) -> List[TermBlock]:
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


def parse_pdf(path: str):
    blocks: List[TermBlock] = []
    blocks_single: List[TermBlock] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            blocks.extend(parse_page_columns(page, split_columns=True))
            blocks_single.extend(parse_page_columns(page, split_columns=False))

    if score_blocks(blocks_single) > score_blocks(blocks):
        blocks = blocks_single

    blocks = infer_missing_labels(blocks)

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
        )
        if block.status == "In Progress":
            merged[label]["status"] = "In Progress"
        elif block.status == "Transfer" and merged[label]["status"] != "In Progress":
            merged[label]["status"] = "Transfer"

    terms = sorted(merged.values(), key=lambda t: term_sort_key(t["label"]))
    return {"terms": terms}


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
