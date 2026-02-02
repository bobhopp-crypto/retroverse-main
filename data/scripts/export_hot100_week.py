# export_hot100_week.py
# v1 — export one Billboard Hot 100 week to CSV
# Safe: read-only, schema-aligned to your DB
print(">>> RUNNING export_hot100_week.py <<<")

import sqlite3
import csv
from pathlib import Path

# ---- CONFIG ----
DB_PATH = "/Users/bobhopp/Sites/retroverse-data/databases/billboard-hot-100-1958-present.db"
ISSUE_DATE = "2025-06-14"   # change later if you want
OUT_DIR = "/Users/bobhopp/Sites/retroverse-data/exports"
# ----------------

def main():
    out_path = Path(OUT_DIR) / f"hot100_week_{ISSUE_DATE}.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    sql = """
    SELECT
      e.issue_date        AS issue_date,
      ee.rank             AS rank,
      w.title_display     AS title,
      p.name_display      AS artist,
      ee.last_week        AS last_week,
      ee.peak_pos         AS peak_pos,
      ee.weeks_on_chart   AS weeks_on_chart
    FROM event_entry ee
    JOIN event  e ON e.event_id = ee.event_id
    JOIN work   w ON w.work_id = ee.work_id
    JOIN person p ON p.person_id = w.primary_person_id
    WHERE e.issue_date = ?
    ORDER BY ee.rank;
    """

    rows = conn.execute(sql, (ISSUE_DATE,)).fetchall()
    conn.close()

    if not rows:
        print(f"No rows found for issue date {ISSUE_DATE}")
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
