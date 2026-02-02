#!/usr/bin/env python3
"""
rv_enrich_musicbrainz_ids_v1.py

Goal:
- Take your existing Hot100 rows from retroverse-master.db (latest issue_date for RVA-HOT100)
- Query MusicBrainz for best matching recording MBID using title + artist
- Write a CSV enrichment file you can review/import later (no DB writes in v1)

Notes:
- MusicBrainz rate limits; we sleep between calls.
- We keep this read-only for safety.
"""

from __future__ import annotations
import csv, json, sqlite3, time, urllib.parse, urllib.request
from pathlib import Path

BASE = Path("/Users/bobhopp/Sites/retroverse-data")
DB   = BASE / "databases" / "retroverse-master.db"
OUT  = BASE / "exports" / "enrichment"
OUT.mkdir(parents=True, exist_ok=True)

SOURCE_SYSTEM = "RVA-HOT100"
LIMIT = 250

MB_BASE = "https://musicbrainz.org/ws/2/recording/"
MB_UA = "RetroVerse/1.0 (bobmbp; contact: local)"  # keep non-empty

def mb_search_recording(title: str, artist: str) -> dict:
    # MusicBrainz search syntax: recording:"..." AND artist:"..."
    q = f'recording:"{title}" AND artist:"{artist}"'
    params = {
        "query": q,
        "fmt": "json",
        "limit": "5",
    }
    url = "https://musicbrainz.org/ws/2/recording/?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": MB_UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))

def load_latest_hot100(conn: sqlite3.Connection) -> list[dict]:
    cur = conn.cursor()
    cur.execute("SELECT MAX(issue_date) FROM event WHERE source_system=?", (SOURCE_SYSTEM,))
    max_date = cur.fetchone()[0]
    if not max_date:
        raise SystemExit(f"No events for source_system={SOURCE_SYSTEM}")

    cur.execute(
        "SELECT event_id, issue_id, issue_date FROM event WHERE source_system=? AND issue_date=?",
        (SOURCE_SYSTEM, max_date),
    )
    event_id, issue_id, issue_date = cur.fetchone()

    cur.execute(
        """
        SELECT ee.rank, w.title_display, p.name_display
        FROM event_entry ee
        JOIN work w ON w.work_id = ee.work_id
        LEFT JOIN person p ON p.person_id = w.primary_person_id
        WHERE ee.event_id = ?
        ORDER BY ee.rank ASC
        LIMIT ?
        """,
        (event_id, LIMIT),
    )

    rows = []
    for rank, title, artist in cur.fetchall():
        rows.append({
            "issue_date": issue_date,
            "issue_id": issue_id,
            "rank": int(rank),
            "title": title or "",
            "artist": artist or "",
        })
    return rows

def pick_best_mb(result: dict) -> dict:
    recs = result.get("recordings") or []
    if not recs:
        return {}
    # Basic heuristic: take first result (MusicBrainz ranks by score)
    best = recs[0]
    return {
        "mbid": best.get("id", ""),
        "mb_score": best.get("score", ""),
        "mb_title": best.get("title", ""),
        "mb_first_artist": ((best.get("artist-credit") or [{}])[0].get("name") if best.get("artist-credit") else ""),
    }

def main():
    conn = sqlite3.connect(str(DB))
    hot = load_latest_hot100(conn)
    conn.close()

    stamp = time.strftime("%Y%m%d-%H%M%S")
    out_csv = OUT / f"hot100_musicbrainz_enrichment_{stamp}.csv"

    with open(out_csv, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "issue_date","issue_id","rank","title","artist",
            "mbid","mb_score","mb_title","mb_first_artist"
        ])
        w.writeheader()

        for i, row in enumerate(hot, start=1):
            title = row["title"]
            artist = row["artist"]
            mbid = mb_score = mb_title = mb_first_artist = ""

            if title and artist:
                try:
                    res = mb_search_recording(title, artist)
                    best = pick_best_mb(res)
                    mbid = best.get("mbid","")
                    mb_score = best.get("mb_score","")
                    mb_title = best.get("mb_title","")
                    mb_first_artist = best.get("mb_first_artist","")
                except Exception as e:
                    mbid = ""
                    mb_score = ""
                    mb_title = ""
                    mb_first_artist = f"ERROR: {e}"

                time.sleep(1.0)  # be polite to MusicBrainz

            w.writerow({**row,
                        "mbid": mbid,
                        "mb_score": mb_score,
                        "mb_title": mb_title,
                        "mb_first_artist": mb_first_artist})

            if i % 25 == 0:
                print(f"Processed {i}/{len(hot)}")

    print("Wrote:", out_csv)

if __name__ == "__main__":
    main()

