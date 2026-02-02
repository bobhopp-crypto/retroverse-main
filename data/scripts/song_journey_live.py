# song_journey_live.py
# v1 — live DB query for one song journey (no CSV workflow)
# Output: console summary + JSON file for visualization input

import sqlite3
import json
from pathlib import Path

DB_PATH = "/Users/bobhopp/Sites/retroverse-data/databases/billboard-hot-100-1958-present.db"
OUT_JSON = "/Users/bobhopp/Sites/retroverse-data/exports/hot100/song_journey.json"

# ---- INPUT (edit these two lines to test different songs) ----
TITLE = "All I Want For Christmas Is You"
ARTIST = "Mariah Carey"
# --------------------------------------------------------------

def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # 1) Find work_id (exact display match for v1)
    find_sql = """
    SELECT w.work_id, w.title_display, p.name_display
    FROM work w
    JOIN person p ON p.person_id = w.primary_person_id
    WHERE w.title_display = ?
      AND p.name_display = ?
    LIMIT 1;
    """
    found = conn.execute(find_sql, (TITLE, ARTIST)).fetchone()
    if not found:
        print("Not found (exact match).")
        print("TIP: verify title/artist spelling from your week export.")
        conn.close()
        return

    work_id = found["work_id"]

    # 2) Pull full journey
    journey_sql = """
    SELECT
      e.issue_date      AS issue_date,
      ee.rank           AS rank,
      ee.last_week      AS last_week,
      ee.peak_pos       AS peak_pos,
      ee.weeks_on_chart AS weeks_on_chart
    FROM event_entry ee
    JOIN event e ON e.event_id = ee.event_id
    WHERE ee.work_id = ?
    ORDER BY e.issue_date;
    """
    rows = conn.execute(journey_sql, (work_id,)).fetchall()
    conn.close()

    if not rows:
        print("No journey rows found.")
        return

    # Summary stats
    debut = rows[0]["issue_date"]
    last  = rows[-1]["issue_date"]
    best_rank = min(r["rank"] for r in rows if r["rank"] is not None)
    total_weeks = rows[-1]["weeks_on_chart"]

    # Years charted (for quick “seasonal” detection)
    years = sorted({int(r["issue_date"][:4]) for r in rows if r["issue_date"]})
    year_span = f"{years[0]}–{years[-1]}" if years else "n/a"

    print("SONG JOURNEY (v1)")
    print("----------------")
    print(f"Title : {TITLE}")
    print(f"Artist: {ARTIST}")
    print(f"Debut : {debut}")
    print(f"Last  : {last}")
    print(f"Best  : #{best_rank}")
    print(f"Weeks : {total_weeks} (cumulative)")
    print(f"Years : {len(years)} years ({year_span})")

    # JSON for visualization
    out = {
        "title": TITLE,
        "artist": ARTIST,
        "work_id": work_id,
        "debut": debut,
        "last": last,
        "best_rank": best_rank,
        "weeks_cumulative": total_weeks,
        "years": years,
        "points": [{"date": r["issue_date"], "rank": r["rank"]} for r in rows],
    }

    out_path = Path(OUT_JSON)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\nWrote JSON to:")
    print(out_path)

if __name__ == "__main__":
    main()
