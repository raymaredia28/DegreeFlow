import json
import re
import sys
from typing import List, Dict

import requests
from bs4 import BeautifulSoup

URL = "https://catalog.tamu.edu/undergraduate/arts-and-sciences/global-languages-cultures/#coursestext"


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def parse_title(text: str) -> Dict[str, str]:
    """
    Example title text: 'ARAB 101 Arabic for Communication I'
    Returns {"code": "ARAB 101", "name": "Arabic for Communication I"}
    """
    t = normalize_space(text)
    m = re.match(r"^([A-Z]{2,5}\s*\d{3}[A-Z]?)\s+(.*)$", t)
    if not m:
        return {"code": "", "name": t}
    code = normalize_space(m.group(1).replace(" ", " ", 1))
    name = m.group(2).strip()
    return {"code": code, "name": name}


def scrape(url: str) -> List[Dict[str, str]]:
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")
    blocks = soup.select(".courseblock")
    courses: List[Dict[str, str]] = []
    seen = set()
    for block in blocks:
        title_el = block.select_one(".courseblocktitle")
        if not title_el:
            continue
        title_text = title_el.get_text(" ", strip=True)
        parsed = parse_title(title_text)
        if not parsed["code"]:
            continue
        if parsed["code"] in seen:
            continue
        seen.add(parsed["code"])
        courses.append(parsed)
    return courses


if __name__ == "__main__":
    mode = "codes" if "--codes" in sys.argv else "full"
    try:
        courses = scrape(URL)
    except Exception as exc:  # pragma: no cover
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)

    if mode == "codes":
        json.dump([c["code"] for c in courses], sys.stdout, ensure_ascii=False, indent=2)
    else:
        json.dump(courses, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
