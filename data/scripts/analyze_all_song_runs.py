#!/usr/bin/env python3
"""
song_journey_live.py (v2)
Generate RetroVerse song_journey.json from the master Hot 100 DB.

Usage:
  python3 song_journey_live.py --work-id <WORK_ID>

Output (website reads this):
  /Users/bobhopp/Sites/retroverse/data/song_journey.json
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

DB = "/Users/bobhopp/Sites/retroverse-data/databases/billboard-hot-100.db"
OUT_JSON = "/Users/bobhopp/Sites/retroverse/data/song_journey.json"


def db_connect():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def build_journey(work_id: str) -> dict:
    conn = db_connect()

    head = conn.execute("""
        SELECT w.title_display AS title, p.name_display AS artist
        FROM work w
        LEFT JOIN person p ON p.person_id = w.primary_person_id
        WHERE w.work_id = ?
        LIMIT 1
    """, (work_id,)).fetchone()

    if not head:
        conn.close()
        raise SystemExit(f"No work found for work_id: {work_id}")

    rows = conn.execute("""
        SELECT
          e.issue_date AS date,
          ee.rank AS rank,
          ee.last_week AS last_week,
          ee.peak_pos AS peak_pos,
          ee.weeks_on_chart AS weeks_on_chart
        FROM event_entry ee
        JOIN event e ON e.event_id = ee.event_id
        WHERE ee.work_id = ?
        ORDER BY e.issue_date
    """, (work_id,)).fetchall()

    conn.close()

    points = []
    for r in rows:
        if not r["date"]:
            continue
        points.append({
            "date": r["date"],
            "rank": r["rank"],
            "last_week": r["last_week"],
            "peak_pos": r["peak_pos"],
            "weeks_on_chart": r["weeks_on_chart"],
        })

    if not points:
        raise SystemExit(f"No chart history found for work_id: {work_id}")

    ranks = [p["rank"] for p in points if p["rank"] is not None]
    best_rank = min(ranks) if ranks else None

    payload = {
        "work_id": work_id,
        "title": head["title"] or "",
        "artist": head["artist"] or "",
        "debut": points[0]["date"],
        "last": points[-1]["date"],
        "best_rank": best_rank,
        "weeks_cumulative": len(points),
        "points": points,
    }
    return payload


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work-id", required=True, help="work.work_id from works_index.json")
    args = ap.parse_args()

    payload = build_journey(args.work_id)

    Path(OUT_JSON).parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print("Wrote JSON to:")
    print(OUT_JSON)
    print(f"{payload['title']} — {payload['artist']} ({payload['weeks_cumulative']} weeks, best #{payload['best_rank']})")


if __name__ == "__main__":
    main()
