import json
import os
import re
from dataclasses import asdict, dataclass
from typing import Optional, Tuple, List, Dict
import requests
from bs4 import BeautifulSoup
from yarl import URL


INDEX_URL = "https://catalog.tamu.edu/undergraduate/course-descriptions/"
BASE = "https://catalog.tamu.edu"

COURSE_BLOCK_SEL = "#sc_sccoursedescs .courseblock"
TITLE_SEL = "h2.courseblocktitle"
DESC_SEL = "p.courseblockdesc"
HOURS_SEL = "span.hours strong"

# --- parsing helpers ---

NBSP = "\xa0"

def get_subjects():
    """Return subject metadata: url, code, name (from index link text if present)."""
    html = requests.get(INDEX_URL, timeout=30).text
    soup = BeautifulSoup(html, "lxml")

    subjects = []
    seen = set()

    # subject pages look like: /undergraduate/course-descriptions/csce/
    pat = re.compile(r"^/undergraduate/course-descriptions/[^/]+/$")

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not pat.match(href):
            continue

        url = BASE + href
        if url in seen:
            continue
        seen.add(url)

        # Try to parse link text like "Computer Science and Engineering (CSCE)"
        link_text = normalize_space(a.get_text(" ", strip=True))
        code_from_href = href.strip("/").split("/")[-1].upper()
        name = link_text or code_from_href
        code = code_from_href
        m = re.search(r"(.+?)\s*\(([^)]+)\)", link_text)
        if m:
            name = m.group(1).strip()
            code = m.group(2).strip().upper()

        subjects.append({"url": url, "code": code, "name": name})

    return subjects

def normalize_space(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace(NBSP, " ")).strip()

def parse_range_int(text: str) -> Optional[Tuple[int, int]]:
    """
    Parses:
      'Credits 4.' -> (4,4)
      'Credit 1.' -> (1,1)
      'Credits 0 to 4.' -> (0,4)
      '0 to 4 Lecture Hours.' -> (0,4)
    """
    text = normalize_space(text)
    m = re.search(r"(\d+)\s*to\s*(\d+)", text, flags=re.I)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"\b(\d+)\b", text)
    if m:
        v = int(m.group(1))
        return v, v
    return None

def extract_hours_blocks(hours_text: str) -> Dict[str, Optional[Tuple[int,int]]]:
    """
    Given the hours strong text (may include multiple sentences),
    extracts credits + lecture/lab/other ranges.
    """
    hours_text = normalize_space(hours_text)
    out = {"credits": None, "lecture_hours": None, "lab_hours": None, "other_hours": None}

    # split into sentences-ish chunks
    parts = [p.strip() for p in re.split(r"\.\s*", hours_text) if p.strip()]
    for p in parts:
        if re.search(r"\bCredit(s)?\b", p, re.I):
            out["credits"] = parse_range_int(p)
        elif re.search(r"\bLecture Hour", p, re.I):
            out["lecture_hours"] = parse_range_int(p)
        elif re.search(r"\bLab Hour", p, re.I):
            out["lab_hours"] = parse_range_int(p)
        elif re.search(r"\bOther Hour", p, re.I):
            out["other_hours"] = parse_range_int(p)

    return out

def parse_title_codes_and_name(title_text: str) -> Tuple[List[str], str]:
    """
    Example:
      'CSCE 110 Programming I' -> (['CSCE 110'], 'Programming I')
      'CSCE 201/CYBR 201 Fundamentals of Cybersecurity' -> (['CSCE 201','CYBR 201'], 'Fundamentals of Cybersecurity')
      'CSCE 222/ECEN 222 Discrete...' -> (['CSCE 222','ECEN 222'], 'Discrete...')
    """
    t = normalize_space(title_text)

    # Grab leading code chunk: SUBJECT NUM possibly repeated with / between
    # Pattern like: CSCE 201/CYBR 201 or CSCE 222/ECEN 222
    code_chunk_match = re.match(r"^([A-Z]{2,5}\s*\d{3}(?:\s*/\s*[A-Z]{2,5}\s*\d{3})*)\s+(.*)$", t)
    if not code_chunk_match:
        return [], t

    code_chunk = code_chunk_match.group(1)
    name = code_chunk_match.group(2).strip()

    codes = [normalize_space(c) for c in re.split(r"\s*/\s*", code_chunk)]
    return codes, name

def extract_labeled_section(text: str, label: str) -> Optional[str]:
    """
    Extracts substring after a label like 'Prerequisite:' or 'Cross Listing:'.
    Returns until end (these catalog snippets usually put it at end).
    """
    # normalize strong labels spacing
    t = normalize_space(text)
    m = re.search(rf"\b{re.escape(label)}\b\s*:?\s*(.*)$", t, flags=re.I)
    return m.group(1).strip() if m else None

COURSE_CODE_RE = re.compile(r"\b([A-Z]{2,5})\s*(\d{3})\b")


def extract_or_groups(prereq_raw: str) -> List[List[Dict]]:
    """
    Parse prerequisites into AND-of-OR groups.
    Returns list of groups; each group is a list of course dicts {code, concurrent_ok}.
    Example desired: [[CSCE 314, CSCE 350, ECEN 350], [CSCE 313]] becomes
    [[{"code": "CSCE 314", "concurrent_ok": False}, ...], [{"code": "CSCE 313", "concurrent_ok": True}]]
    """

    if not prereq_raw:
        return []

    text = normalize_space(prereq_raw.rstrip("."))
    clauses = [c.strip() for c in re.split(r";", text) if c.strip()]

    def codes_in_segment(segment: str) -> List[str]:
        codes = []
        for m in COURSE_CODE_RE.finditer(segment):
            code = f"{m.group(1)} {m.group(2)}"
            if code not in codes:
                codes.append(code)
        return codes

    groups: List[List[Dict]] = []
    connector_re = re.compile(r"\b(and|or)\b", re.I)

    for clause in clauses:
        parts = connector_re.split(clause)
        # parts looks like [segment, connector, segment, connector, segment, ...]
        current_group: List[Dict] = []
        last_connector = None
        for i in range(0, len(parts), 2):
            segment = parts[i]
            connector = parts[i + 1].lower() if i + 1 < len(parts) else None
            codes = codes_in_segment(segment)
            if not codes:
                last_connector = connector
                continue

            concurrent = bool(re.search(r"concurrent", segment, flags=re.I))
            entries = []
            for code in codes:
                # merge concurrent flag if duplicate within segment
                entries.append({"code": code, "concurrent_ok": concurrent})

            if last_connector == "and" and current_group:
                groups.append(current_group)
                current_group = entries
            else:
                # default + 'or' both mean same group (OR choices)
                # merge duplicates, prefer concurrent_ok if seen anywhere
                merged = {item["code"]: item for item in current_group}
                for entry in entries:
                    if entry["code"] in merged:
                        merged[entry["code"]]["concurrent_ok"] = (
                            merged[entry["code"]]["concurrent_ok"] or entry["concurrent_ok"]
                        )
                    else:
                        merged[entry["code"]] = entry
                current_group = list(merged.values())

            last_connector = connector

        if current_group:
            groups.append(current_group)

    return groups

def extract_course_codes(text: str) -> List[str]:
    t = normalize_space(text)
    found = []
    for m in COURSE_CODE_RE.finditer(t):
        found.append(f"{m.group(1)} {m.group(2)}")
    # unique while preserving order
    seen = set()
    out = []
    for c in found:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out

CLASSIFICATION_RE = re.compile(
    r"((?:freshman|sophom?ore|junior|senior)(?:\s+or\s+(?:freshman|sophom?ore|junior|senior))*)\s+classification",
    re.I,
)


def extract_classifications(prereq_raw: Optional[str]) -> List[str]:
    """Return list of allowed classifications (e.g., ['Junior', 'Senior'])."""
    if not prereq_raw:
        return []
    m = CLASSIFICATION_RE.search(prereq_raw)
    if not m:
        return []
    words = re.split(r"\s+or\s+", m.group(1), flags=re.I)
    seen = set()
    out = []
    for w in words:
        norm = w.strip().title()
        if norm and norm not in seen:
            seen.add(norm)
            out.append(norm)
    return out

# --- main scrape ---

def parse_courses_from_url(url: str, subject_code: str, subject_name: str) -> List[dict]:
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")
    blocks = soup.select(COURSE_BLOCK_SEL)

    courses = []
    for block in blocks:
        title_el = block.select_one(TITLE_SEL)
        desc_el = block.select_one(DESC_SEL)

        if not title_el or not desc_el:
            continue

        title_raw = normalize_space(title_el.get_text(" ", strip=True))
        codes, name = parse_title_codes_and_name(title_raw)

        # hours strong block
        hours_el = desc_el.select_one(HOURS_SEL)
        hours_text = normalize_space(hours_el.get_text(" ", strip=True)) if hours_el else ""
        hours = extract_hours_blocks(hours_text) if hours_text else {"credits": None, "lecture_hours": None, "lab_hours": None, "other_hours": None}

        # description text without the hours block
        desc_clone = BeautifulSoup(str(desc_el), "lxml")
        for s in desc_clone.select("span.hours"):
            s.decompose()
        # also remove leftover <br> artifacts
        description_full = normalize_space(desc_clone.get_text(" ", strip=True))

        # Pull prereq/crosslisting raw (if present)
        prereq_raw = extract_labeled_section(description_full, "Prerequisite") or extract_labeled_section(description_full, "Prerequisites")
        cross_raw = extract_labeled_section(description_full, "Cross Listing") or extract_labeled_section(description_full, "Cross Listing(s)")

        # Course codes referenced in prereqs / cross listing
        prereq_courses_raw = extract_course_codes(prereq_raw) if prereq_raw else []
        cross_courses = extract_course_codes(cross_raw) if cross_raw else []

        # Remove self/cross-list codes from prereq listings to avoid self-dependency
        self_codes = set(codes)
        cross_set = set(cross_courses)

        def is_self(code: str) -> bool:
            """Return True if code refers to this course or its cross-lists."""
            if code in self_codes:
                return True
            try:
                subj, num = code.split()
            except ValueError:
                return False
            primary_subj = codes[0].split()[0] if codes else None
            primary_num = codes[0].split()[1] if codes else None
            return primary_num == num and (subj == primary_subj or any(c.startswith(subj) and c.endswith(num) for c in self_codes))

        prereq_courses = [c for c in prereq_courses_raw if not is_self(c) and c not in cross_set]

        prereq_groups_raw = extract_or_groups(prereq_raw)
        prereq_groups = []
        for group in prereq_groups_raw:
            filtered = [entry for entry in group if not is_self(entry["code"]) and entry["code"] not in cross_set]
            if filtered:
                prereq_groups.append(filtered)

        classification_restrictions = extract_classifications(prereq_raw)

        courses.append({
            "department": {"code": subject_code, "name": subject_name},
            "codes": codes,  # handles cross-listed titles
            "primary_subject": codes[0].split()[0] if codes else None,
            "primary_number": codes[0].split()[1] if codes else None,
            "title": name,
            "credits": {"min": hours["credits"][0], "max": hours["credits"][1]} if hours["credits"] else None,
            "lecture_hours": {"min": hours["lecture_hours"][0], "max": hours["lecture_hours"][1]} if hours["lecture_hours"] else None,
            "lab_hours": {"min": hours["lab_hours"][0], "max": hours["lab_hours"][1]} if hours["lab_hours"] else None,
            "other_hours": {"min": hours["other_hours"][0], "max": hours["other_hours"][1]} if hours["other_hours"] else None,
            "description_raw": description_full,
            "prereq_raw": prereq_raw,
            "prereq_courses": prereq_courses,
            "prereq_groups": prereq_groups,
            "prereq_classifications": classification_restrictions,
            "cross_listing_raw": cross_raw,
            "cross_listing_courses": cross_courses,
            "source_url": url,
        })

    return courses

def save_json(data: list, path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def aggregate_courses(all_courses: List[List[dict]]) -> List[dict]:
    """
    Merge per-subject course lists into a single list with stable course_id and aliases.
    Dedupes cross-listed courses by sharing the same course_id if any code matches.
    """
    aggregated: List[dict] = []
    alias_to_id: Dict[str, int] = {}

    def add_course(course: dict):
        codes = [c for c in (course.get("codes") or []) if c]
        primary_subj = course.get("primary_subject")
        primary_num = course.get("primary_number")
        primary_code = f"{primary_subj} {primary_num}".strip() if primary_subj and primary_num else None
        if primary_code and primary_code not in codes:
            codes = [primary_code] + codes
        codes = [c.strip() for c in codes if c.strip()]
        if not codes:
            return

        existing_id = next((alias_to_id[c] for c in codes if c in alias_to_id), None)

        if existing_id:
            existing = next(c for c in aggregated if c["course_id"] == existing_id)
            for code in codes:
                if code not in alias_to_id:
                    alias_to_id[code] = existing_id
                if code not in existing["aliases"]:
                    existing["aliases"].append(code)
            return

        course_id = len(aggregated) + 1
        for code in codes:
            alias_to_id[code] = course_id

        record = {**course, "course_id": course_id, "aliases": codes}
        aggregated.append(record)

    for course_list in all_courses:
        for course in course_list:
            add_course(course)

    return aggregated

if __name__ == "__main__":
    # To scrape all subjects, uncomment:
    subjects = get_subjects()
    #
    # To test a single URL quickly, provide dicts with url/code/name:
    # subjects = [
    #     {
    #         "url": "https://catalog.tamu.edu/undergraduate/course-descriptions/csce/",
    #         "code": "CSCE",
    #         "name": "Computer Science and Engineering",
    #     }
    # ]

    print(f"Scraping {len(subjects)} subject(s)")
    all_courses: List[List[dict]] = []
    for subject in subjects:
        courses = parse_courses_from_url(subject["url"], subject["code"], subject["name"])
        all_courses.append(courses)
        save_json(courses, f"tamu_courses_{subject['code'].lower()}.json")
        print(f"  wrote tamu_courses_{subject['code'].lower()}.json ({len(courses)} courses)")

    # Aggregate into a single courses.json with course_id and aliases
    aggregated = aggregate_courses(all_courses)
    os.makedirs(os.path.join("backend", "data"), exist_ok=True)
    save_json(aggregated, os.path.join("backend", "data", "courses.json"))
    print(f"Aggregated {len(aggregated)} unique courses -> backend/data/courses.json")
    print("Done.")
