import re
import requests
from bs4 import BeautifulSoup

INDEX_URL = "https://catalog.tamu.edu/undergraduate/course-descriptions/"
BASE = "https://catalog.tamu.edu"

def get_subject_urls():
    html = requests.get(INDEX_URL, timeout=30).text
    soup = BeautifulSoup(html, "lxml")

    urls = []
    seen = set()

    # subject pages look like: /undergraduate/course-descriptions/csce/
    pat = re.compile(r"^/undergraduate/course-descriptions/[^/]+/$")

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if pat.match(href):
            full = BASE + href
            if full not in seen:
                seen.add(full)
                urls.append(full)

    return urls

if __name__ == "__main__":
    subject_urls = get_subject_urls()
    print(f"Found {len(subject_urls)} subject pages")
    print(subject_urls[:10])  # preview
