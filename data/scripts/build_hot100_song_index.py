#!/usr/bin/env python3
"""
build_hot100_song_index.py

Build a flat, deduplicated Billboard Hot 100 song index from hot100-flat.csv.
Output: output/reports/hot100_song_index.json
Deterministic, repeatable. No database, no timelines, no matching logic.
"""

from __future__ import annotations

import csv
import json
import re
import unicodedata
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
INPUT_CSV = BASE / "billboard-raw" / "hot100-flat.csv"
OUTPUT_JSON = BASE / "output" / "reports" / "hot100_song_index.json"

# CSV column indices (positional, no header)
COL_ISSUE_DATE = 0
COL_TITLE_DISPLAY = 5
COL_ARTIST_DISPLAY = 6


def normalize_for_match(text: str) -> str:
    """
    Match VDJ/video matching normalization:
    lowercase, remove () [] {}, strip punctuation, collapse spaces, ASCII.
    """
    if text is None:
        return ""
    text = str(text).lower()
    while True:
        n = re.sub(r"\([^()]*\)", "", text)
        if n == text:
            break
        text = n
    while True:
        n = re.sub(r"\[[^\]]*\]", "", text)
        if n == text:
            break
        text = n
    while True:
        n = re.sub(r"\{[^}]*\}", "", text)
        if n == text:
            break
        text = n
    text = re.sub(r"[-_\[\]{}.]", " ", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    try:
        text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    except Exception:
        pass
    return text


def parse_year(date_str: str) -> int | None:
    """Extract 4-digit year from YYYY-MM-DD."""
    if not date_str:
        return None
    m = re.match(r"(\d{4})", str(date_str))
    return int(m.group(1)) if m else None


def main() -> int:
    if not INPUT_CSV.exists():
        print(f"ERROR: Input not found: {INPUT_CSV}")
        return 1

    # Group by (artist_display, title_display), track min/max issue_date
    # key -> (artist_display, title_display, min_date, max_date)
    groups: dict[tuple[str, str], tuple[str, str, str, str]] = {}
    row_count = 0

    with open(INPUT_CSV, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            row_count += 1
            if len(row) <= max(COL_ISSUE_DATE, COL_TITLE_DISPLAY, COL_ARTIST_DISPLAY):
                continue
            issue_date = (row[COL_ISSUE_DATE] or "").strip()
            title = (row[COL_TITLE_DISPLAY] or "").strip()
            artist = (row[COL_ARTIST_DISPLAY] or "").strip()
            if not title and not artist:
                continue
            key = (artist, title)
            if key not in groups:
                groups[key] = (artist, title, issue_date, issue_date)
            else:
                _, _, mn, mx = groups[key]
                if issue_date:
                    new_mn = issue_date if (not mn or issue_date < mn) else mn
                    new_mx = issue_date if (not mx or issue_date > mx) else mx
                    groups[key] = (artist, title, new_mn, new_mx)

    # Build output records
    records = []
    for (artist_display, title_display), (_, _, first_date, last_date) in sorted(groups.items()):
        artist_norm = normalize_for_match(artist_display)
        title_norm = normalize_for_match(title_display)
        song_id = f"hot100:{artist_norm}|{title_norm}"
        first_chart_year = parse_year(first_date)
        last_chart_year = parse_year(last_date)
        if first_chart_year is None:
            first_chart_year = 0
        if last_chart_year is None:
            last_chart_year = 0
        records.append({
            "song_id": song_id,
            "artist_display": artist_display,
            "title_display": title_display,
            "artist_norm": artist_norm,
            "title_norm": title_norm,
            "first_chart_year": first_chart_year,
            "last_chart_year": last_chart_year,
        })

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Loaded {row_count} rows from hot100-flat.csv")
    print(f"Generated {len(records)} unique Hot 100 songs")
    print(f"Wrote {OUTPUT_JSON}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
