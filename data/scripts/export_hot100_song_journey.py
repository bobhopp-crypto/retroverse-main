# export_hot100_song_journey.py
# v1 — export full Hot 100 chart journey for one song (CSV)
# Safe: read-only, DB-aligned

import sqlite3
import csv
from pathlib import Path

# ---- CONFIG ----
DB_PATH = "/Users/bobhopp/Sites/retroverse-data/databases/billboard-hot-100-1958-present.db"
TITLE = "All I Want For Christmas Is You"
ARTIST = "Mariah Carey"
OUT_DIR = "/Users/bobhopp/Sites/retroverse-data/exports"
# ----------------

def main():
    out_path = Path(OUT_DIR) / "hot100_song_journey_all_i_want_for_christmas_is_you.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Find the work_id first (display-safe match)
    find_sql = """
    SELECT w.work_id
    FROM work w
    JOIN person p ON p.person_id = w.primary_person_id
    WHERE w.title_display = ?
      AND p.name_display = ?
    LIMIT 1;
    """

    row = conn.execute(find_sql, (TITLE, ARTIST)).fetchone()
    if not row:
        print("Song not found.")
        conn.close()
        return

    work_id = row["work_id"]

    journey_sql = """
    SELECT
      e.issue_date        AS issue_date,
      ee.rank             AS rank,
      ee.last_week        AS last_week,
      ee.peak_pos         AS peak_pos,
      ee.weeks_on_chart   AS weeks_on_chart
    FROM event_entry ee
    JOIN event e ON e.event_id = ee.event_id
    WHERE ee.work_id = ?
    ORDER BY e.issue_date;
    """

    rows = conn.execute(journey_sql, (work_id,)).fetchall()
    conn.close()

    if not rows:
        print("No chart history found.")
        return

    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        for r in rows:
            writer.writerow(dict(r))

    print(f"Wrote {len(rows)} rows to:")
    print(out_path)

if __name__ == "__main__":
    main()
