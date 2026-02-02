#!/usr/bin/env python3
"""
build_artist_match_summary.py

Build a read-only artist summary from curated Billboard ↔ VDJ matches.
Output: output/reports/artist_match_summary.json
Input: output/reports/video_billboard_matches.curated.json (never modified).
Deterministic, repeatable. No genre assignment, no edits to curated data.
"""

from __future__ import annotations

import json
from pathlib import Path
from collections import defaultdict

BASE = Path(__file__).resolve().parent.parent
INPUT_JSON = BASE / "output" / "reports" / "video_billboard_matches.curated.json"
OUTPUT_JSON = BASE / "output" / "reports" / "artist_match_summary.json"


def title_case(s: str) -> str:
    """Title-case a string (e.g. 'madonna' -> 'Madonna')."""
    if not s:
        return ""
    return s.title()


def main() -> int:
    if not INPUT_JSON.exists():
        print(f"ERROR: Curated match file not found: {INPUT_JSON}")
        return 1

    with open(INPUT_JSON, "r", encoding="utf-8") as f:
        matches = json.load(f)

    if not isinstance(matches, list):
        matches = []

    n_loaded = len(matches)
    # Group by artist_norm (billboard_artist); collect display-name counts and years
    groups: dict[str, tuple[dict[str, int], list[int]]] = defaultdict(
        lambda: (defaultdict(int), [])
    )

    for r in matches:
        artist_norm = (r.get("billboard_artist") or r.get("video_artist") or "").strip()
        if not artist_norm:
            continue
        display = (r.get("artist_display") or "").strip() or title_case(artist_norm)
        year = r.get("billboard_year")
        if year is not None and isinstance(year, (int, float)):
            try:
                y = int(year)
                groups[artist_norm][1].append(y)
            except (TypeError, ValueError):
                pass
        groups[artist_norm][0][display] += 1

    records = []
    for artist_norm, (display_counts, years) in groups.items():
        video_count = sum(display_counts.values())
        artist_display = (
            max(display_counts.keys(), key=lambda d: display_counts[d])
            if display_counts
            else title_case(artist_norm)
        )
        first_chart_year = min(years) if years else None
        last_chart_year = max(years) if years else None
        records.append({
            "artist_norm": artist_norm,
            "artist_display": artist_display,
            "video_count": video_count,
            "first_chart_year": first_chart_year,
            "last_chart_year": last_chart_year,
        })

    # Sort: video_count descending, artist_norm ascending
    records.sort(key=lambda r: (-r["video_count"], r["artist_norm"]))

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)
        f.write("\n")

    m = len(records)
    print(f"Loaded {n_loaded} curated matches")
    print(f"Generated {m} artist summaries")
    print(f"Wrote {OUTPUT_JSON}")
    if records:
        top = records[0]
        print(f"Top artist: {top['artist_display']} ({top['video_count']} videos)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
