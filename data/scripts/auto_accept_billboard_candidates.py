#!/usr/bin/env python3
# scripts/auto_accept_billboard_candidates.py
# Auto-accepts high-confidence Billboard match candidates (rank=1, score>=0.75) and appends to curated matches.

import csv
import json
import sys
from pathlib import Path

# Paths relative to project root (parent of scripts/)
_ROOT = Path(__file__).resolve().parent.parent
CANDIDATES_CSV = _ROOT / "output" / "reports" / "video_billboard_match_candidates.csv"
CURATED_JSON = _ROOT / "output" / "reports" / "video_billboard_matches.curated.json"
_THRESHOLD = 0.75


def _parse_int_or_none(val) -> int | None:
    if val is None or val == "":
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _parse_float(val) -> float:
    if val is None or val == "":
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def main() -> int:
    # Load candidate CSV
    if not CANDIDATES_CSV.exists():
        print(f"ERROR: Candidate CSV not found at {CANDIDATES_CSV}", file=sys.stderr)
        return 1

    candidates = []
    total_rows = 0
    with open(CANDIDATES_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_rows += 1
            rank = _parse_int_or_none(row.get("candidate_rank"))
            score = _parse_float(row.get("match_score"))
            if rank == 1 and score >= _THRESHOLD:
                candidates.append(row)

    print(f"Loaded {total_rows} candidate rows")
    print(f"Eligible rank-1 candidates ≥ {_THRESHOLD}: {len(candidates)}")

    # Load existing curated matches
    curated_video_ids = set()
    curated_list = []
    if CURATED_JSON.exists():
        with open(CURATED_JSON, "r", encoding="utf-8") as f:
            curated_list = json.load(f)
        if isinstance(curated_list, list):
            for r in curated_list:
                vid = r.get("video_id")
                if vid:
                    curated_video_ids.add(str(vid))
        print(f"Loaded {len(curated_video_ids)} existing curated matches")
    else:
        print("Loaded 0 existing curated matches (file missing)")

    # Filter: only candidates not already curated
    new_matches = []
    skipped = 0
    for c in candidates:
        video_id = c.get("video_id", "").strip()
        if not video_id or video_id in curated_video_ids:
            skipped += 1
            continue

        score = _parse_float(c.get("match_score"))
        confidence_pct = round(score * 100)

        new_matches.append({
            "video_id": video_id,
            "video_artist": c.get("video_artist", "").strip(),
            "video_title": c.get("video_title", "").strip(),
            "video_year": _parse_int_or_none(c.get("video_year")),
            "billboard_song_id": c.get("billboard_song_id", "").strip(),
            "billboard_artist": c.get("billboard_artist", "").strip(),
            "billboard_title": c.get("billboard_title", "").strip(),
            "first_chart_year": _parse_int_or_none(c.get("first_chart_year")),
            "last_chart_year": _parse_int_or_none(c.get("last_chart_year")),
            "match_method": "candidate_auto",
            "confidence_pct": confidence_pct,
        })

    print(f"Auto-accepted matches added: {len(new_matches)}")
    print(f"Skipped (already curated): {skipped}")

    # Append to curated list
    curated_list.extend(new_matches)

    # Write updated curated file
    CURATED_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(CURATED_JSON, "w", encoding="utf-8") as f:
        json.dump(curated_list, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print("Wrote updated curated file")
    return 0


if __name__ == "__main__":
    sys.exit(main())
