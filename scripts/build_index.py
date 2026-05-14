#!/usr/bin/env python3
"""Build law-index.json from Legalize KR markdown files.

Walks data/legalize-kr/kr/**/*.md, parses YAML front matter + article headings,
emits extension/data/law-index.json (and law-index.json.br if brotli is
installed — see /docs/KNOWN_ISSUES.md #8 for browser caveats).

Schema: /docs/DATA_SCHEMA.md
Source structure: /docs/LEGALIZE_SAMPLE.md
"""

import argparse
import json
import os
import re
import sys
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

# ── Configuration ──────────────────────────────────────────────────────────
SKIP_FILENAMES = {"README.md", "CHANGELOG.md", "INDEX.md", "index.md"}

FRONT_MATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)

ARTICLE_HEADING_RE = re.compile(
    r"^(#{2,6})\s+제\s*(\d+조(?:의\d+)?)\s*\(([^)]*)\)", re.MULTILINE
)
ARTICLE_HEADING_NO_TITLE_RE = re.compile(
    r"^(#{2,6})\s+제\s*(\d+조(?:의\d+)?)\s*$", re.MULTILINE
)

# Field name aliases — Legalize KR uses several conventions historically.
# Real files (as of 2026) use Korean keys: 제목, 법령구분, 시행일자, 상태, 출처.
TITLE_KEYS = ("제목", "title", "name", "법령명")
TYPE_KEYS = ("법령구분", "type", "law_type", "법령종류")
EFFECTIVE_KEYS = ("시행일자", "enforcement_date", "effective_date", "시행일")
STATUS_KEYS = ("상태", "status")
SOURCE_URL_KEYS = ("출처", "source_url", "url", "법령정보")


def parse_front_matter(text: str) -> dict:
    """Minimal YAML-front-matter parser. Avoids PyYAML dep for the simple
    flat-key form Legalize KR uses. Returns {} on no front matter."""
    m = FRONT_MATTER_RE.match(text)
    if not m:
        return {}
    block = m.group(1)
    result: dict = {}
    for raw_line in block.splitlines():
        line = raw_line.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()
        # Strip surrounding quotes.
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1]
        result[key] = val
    return result


def pick(d: dict, keys) -> str:
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return str(d[k])
    return ""


def normalize_effective_date(raw: str) -> str:
    """Best-effort normalization to YYYY-MM-DD. Returns "—" if unparseable."""
    if not raw:
        return "—"
    raw = raw.strip()
    # Common patterns: 2024-03-15, 2024.03.15, 20240315, 2024년 3월 15일
    m = re.match(r"^(\d{4})[-./]?\s*(\d{1,2})[-./]?\s*(\d{1,2})", raw)
    if m:
        y, mo, d = m.groups()
        return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"
    m = re.match(r"^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일", raw)
    if m:
        y, mo, d = m.groups()
        return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"
    return raw if raw else "—"


def build_source_url(law_name: str, existing: str) -> str:
    if existing:
        return existing
    if not law_name:
        return ""
    no_space = law_name.replace(" ", "")
    return "https://www.law.go.kr/법령/" + urllib.parse.quote(no_space, safe="")


def extract_articles(body: str) -> dict:
    """Return dict { '15조': { 'title': '...', 'status': '현행' }, ... }
    Primary regex captures (number, title); fallback captures number only."""
    seen: dict = {}
    for m in ARTICLE_HEADING_RE.finditer(body):
        art_no, title = m.group(2), m.group(3).strip()
        # First occurrence wins (avoids duplicate revision-marker headings).
        if art_no not in seen:
            seen[art_no] = {"title": title, "status": "현행"}
    for m in ARTICLE_HEADING_NO_TITLE_RE.finditer(body):
        art_no = m.group(2)
        if art_no not in seen:
            seen[art_no] = {"title": "", "status": "현행"}
    return seen


def compute_max_article_no(articles: dict) -> int:
    """Extract numeric part of each article key (e.g. '44조의7' → 44) and
    return the max. Returns 0 if no articles."""
    max_no = 0
    for key in articles.keys():
        m = re.match(r"^(\d+)조", key)
        if m:
            n = int(m.group(1))
            if n > max_no:
                max_no = n
    return max_no


def build_index(source_root: Path) -> dict:
    laws: dict = {}
    law_count = 0
    article_count = 0
    skipped = 0

    md_files = sorted(source_root.rglob("*.md"))
    for path in md_files:
        if path.name in SKIP_FILENAMES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except Exception as e:
            print(f"  ! skip {path}: {e}", file=sys.stderr)
            skipped += 1
            continue

        fm = parse_front_matter(text)
        body = text[FRONT_MATTER_RE.match(text).end() :] if FRONT_MATTER_RE.match(text) else text

        # Law name: prefer front matter, fall back to parent directory name.
        law_name = pick(fm, TITLE_KEYS) or path.parent.name
        law_name = law_name.strip()
        if not law_name:
            skipped += 1
            continue

        law_type = pick(fm, TYPE_KEYS) or "법률"
        effective_date = normalize_effective_date(pick(fm, EFFECTIVE_KEYS))
        status = pick(fm, STATUS_KEYS) or "현행"
        source_url = build_source_url(law_name, pick(fm, SOURCE_URL_KEYS))
        legalize_path = path.relative_to(source_root.parent).as_posix()

        articles = extract_articles(body)
        article_count += len(articles)
        max_article_no = compute_max_article_no(articles)

        entry = {
            "law_name": law_name,
            "law_type": law_type,
            "effective_date": effective_date,
            "status": status,
            "source_url": source_url,
            "legalize_path": legalize_path,
            "max_article_no": max_article_no,
            "articles": articles,
        }

        # Primary normalized key (whitespace collapsed).
        primary_key = re.sub(r"\s+", " ", law_name).strip()
        if primary_key in laws:
            # Duplicate law name across files — keep the larger article set.
            if len(articles) <= len(laws[primary_key].get("articles", {})):
                continue
        laws[primary_key] = entry
        law_count += 1

        # No-space alias (per /docs/DATA_SCHEMA.md). Points to same dict ref.
        no_space_key = primary_key.replace(" ", "")
        if no_space_key != primary_key and no_space_key not in laws:
            laws[no_space_key] = entry

    return {
        "meta": {
            "built_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "Legalize KR (github.com/legalize-kr/legalize-kr)",
            "law_count": law_count,
            "article_count": article_count,
            "version": "0.1.0",
            "skipped_files": skipped,
        },
        "laws": laws,
    }


def write_outputs(index: dict, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    plain_path = out_dir / "law-index.json"
    plain_bytes = json.dumps(index, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    plain_path.write_bytes(plain_bytes)
    print(f"  wrote {plain_path}  ({len(plain_bytes):,} bytes)")

    # Try brotli compression — fallback to plain copy if not installed.
    br_path = out_dir / "law-index.json.br"
    try:
        import brotli  # type: ignore

        br_bytes = brotli.compress(plain_bytes, quality=11)
        br_path.write_bytes(br_bytes)
        ratio = (1.0 - len(br_bytes) / len(plain_bytes)) * 100 if plain_bytes else 0
        print(f"  wrote {br_path}  ({len(br_bytes):,} bytes, -{ratio:.1f}%)")
    except ImportError:
        # Per KNOWN_ISSUES.md #8 option C: ship plain JSON under .br name as
        # fallback so downstream tooling doesn't break.
        br_path.write_bytes(plain_bytes)
        print(f"  brotli not installed — wrote {br_path} as plain copy")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build LexGuard KR index from Legalize KR.")
    parser.add_argument(
        "--source",
        default="data/legalize-kr/kr",
        help="Root of Legalize KR kr/ directory (default: data/legalize-kr/kr)",
    )
    parser.add_argument(
        "--out",
        default="extension/data",
        help="Output directory (default: extension/data)",
    )
    args = parser.parse_args()

    source_root = Path(args.source).resolve()
    out_dir = Path(args.out).resolve()
    if not source_root.exists():
        print(f"error: source directory not found: {source_root}", file=sys.stderr)
        return 1

    print(f"building index from {source_root}")
    index = build_index(source_root)
    meta = index["meta"]
    print(
        f"  {meta['law_count']:,} laws indexed, "
        f"{meta['article_count']:,} articles, "
        f"{meta['skipped_files']} files skipped"
    )
    write_outputs(index, out_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
