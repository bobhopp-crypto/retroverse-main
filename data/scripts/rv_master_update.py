#!/usr/bin/env python3
# rv_master_update.py
# RetroVerse Archive – Hot 100 importer (v1.1)
# Fixes duplicate-rank historical weeks safely

from __future__ import annotations

import json
import shutil
import sqlite3
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import Dict, Tuple, Optional, List

# =========================================================
# CONFIG
# =========================================================

BASE = Path("/Users/bobhopp/Sites/retroverse-data")

SRC_DB = BASE / "databases" / "billboard-hot-100.db"
MASTER_DB = BASE / "databases" / "retroverse-master.db"

BACKUPS = BASE / "backups"
EXPORT_DIR = BASE / "exports" / "hot100"
LOGS = BASE / "logs"

FAMILY_CODE = "RVA"
CHART_TYPE_CODE = "HOT100"
ISSUE_LABEL = "RVA – Hot 100"

DERIVE_SPAN = True

# =========================================================
# UTILITIES
# =========================================================

def log(msg: str, lines: List[str]) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    lines.append(line)

def norm_text(s: str) -> str:
    s = (s or "").strip().lower()
    return " ".join(s.split())

def make_id(prefix: str, n: int) -> str:
    return f"{prefix}{n:06d}"

def make_issue_id(issue_date: date, chart_seq: int) -> str:
    return f"{FAMILY_CODE}-{CHART_TYPE_CODE}-{issue_date.year}-{chart_seq:04d}"

def unique_entry_id(issue_id: str, rank: int, used: Dict[str, int]) -> str:
    base = f"{issue_id}:{rank:02d}"
    n = used.get(base, 0)
    used[base] = n + 1
    if n == 0:
        return base
    return f"{base}{chr(ord('a') + n)}"

# =========================================================
# MASTER SCHEMA
# =========================================================

MASTER_SCHEMA_SQL = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS event (
  event_id TEXT PRIMARY KEY,
  source_system TEXT NOT NULL,
  issue_id TEXT NOT NULL UNIQUE,
  issue_label TEXT NOT NULL,
  chart_seq INTEGER NOT NULL,
  issue_date TEXT NOT NULL,
  span_start TEXT,
  span_end TEXT,
  span_is_derived INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS person (
  person_id TEXT PRIMARY KEY,
  name_display TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  role TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_person ON person(name_norm, role);

CREATE TABLE IF NOT EXISTS work (
  work_id TEXT PRIMARY KEY,
  work_type TEXT NOT NULL,
  title_display TEXT NOT NULL,
  title_norm TEXT NOT NULL,
  primary_person_id TEXT,
  work_key_text TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS event_entry (
  entry_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  work_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  last_week INTEGER,
  peak_pos INTEGER,
  weeks_on_chart INTEGER
);
"""

# =========================================================
# SOURCE READERS
# =========================================================

def fetch_issue_dates(src: sqlite3.Connection) -> List[date]:
    cur = src.cursor()
    cur.execute("SELECT DISTINCT chart_date FROM hot100 ORDER BY chart_date;")
    return [datetime.strptime(d, "%Y-%m-%d").date() for (d,) in cur.fetchall()]

def fetch_issue_entries(src: sqlite3.Connection, d: str) -> List[dict]:
    cur = src.cursor()
    cur.execute("""
        SELECT rank, title, artist, peak_pos, last_week, weeks_on_chart
        FROM hot100
        WHERE chart_date=?
        ORDER BY rank;
    """, (d,))
    rows = cur.fetchall()
    return [{
        "rank": r[0],
        "title": r[1] or "",
        "artist": r[2] or "",
        "pk": r[3],
        "lw": r[4],
        "woc": r[5]
    } for r in rows]

# =========================================================
# UPSERT HELPERS
# =========================================================

def get_next(master, table, col, prefix):
    cur = master.cursor()
    cur.execute(f"SELECT {col} FROM {table} WHERE {col} LIKE ? ORDER BY {col} DESC LIMIT 1;", (f"{prefix}%",))
    row = cur.fetchone()
    return 1 if not row else int(row[0].replace(prefix, "")) + 1

def get_person(master, name, cache):
    key = norm_text(name)
    if key in cache:
        return cache[key]
    cur = master.cursor()
    cur.execute("SELECT person_id FROM person WHERE name_norm=? AND role='artist';", (key,))
    row = cur.fetchone()
    if row:
        cache[key] = row[0]
        return row[0]
    pid = make_id("P", get_next(master, "person", "person_id", "P"))
    cur.execute("INSERT INTO person VALUES (?,?,?,?);", (pid, name.strip(), key, "artist"))
    cache[key] = pid
    return pid

def get_work(master, title, artist, pid, cache):
    key = f"{norm_text(title)}—{norm_text(artist)}"
    if key in cache:
        return cache[key]
    cur = master.cursor()
    cur.execute("SELECT work_id FROM work WHERE work_key_text=?;", (key,))
    row = cur.fetchone()
    if row:
        cache[key] = row[0]
        return row[0]
    wid = make_id("W", get_next(master, "work", "work_id", "W"))
    cur.execute("INSERT INTO work VALUES (?,?,?,?,?,?);",
                (wid, "song", title.strip(), norm_text(title), pid, key))
    cache[key] = wid
    return wid

# =========================================================
# IMPORT
# =========================================================

def import_hot100(src, master, lines):
    source = f"{FAMILY_CODE}-{CHART_TYPE_CODE}"

    master.executescript(MASTER_SCHEMA_SQL)
    master.commit()

    cur = master.cursor()
    cur.execute("DELETE FROM event_entry;")
    cur.execute("DELETE FROM event;")
    master.commit()

    dates = fetch_issue_dates(src)
    log(f"Importing {len(dates)} issues", lines)

    person_cache = {}
    work_cache = {}
    next_event = get_next(master, "event", "event_id", "E")

    for seq, d in enumerate(dates, start=1):
        issue_id = make_issue_id(d, seq)
        event_id = make_id("E", next_event)
        next_event += 1

        span_start = (d - timedelta(days=6)).isoformat() if DERIVE_SPAN else None
        span_end = d.isoformat()

        cur.execute("""
            INSERT INTO event VALUES (?,?,?,?,?,?,?,?,?)
        """, (event_id, source, issue_id, ISSUE_LABEL, seq, d.isoformat(),
              span_start, span_end, 1))

        used_ids = {}
        entries = fetch_issue_entries(src, d.isoformat())

        for e in entries:
            pid = get_person(master, e["artist"], person_cache)
            wid = get_work(master, e["title"], e["artist"], pid, work_cache)
            entry_id = unique_entry_id(issue_id, e["rank"], used_ids)

            cur.execute("""
                INSERT INTO event_entry VALUES (?,?,?,?,?,?,?)
            """, (entry_id, event_id, wid, e["rank"], e["lw"], e["pk"], e["woc"]))

        if seq % 250 == 0:
            master.commit()
            log(f"{seq} issues imported", lines)

    master.commit()

# =========================================================
# EXPORT
# =========================================================

def export_json(master, lines):
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    cur = master.cursor()

    cur.execute("""
        SELECT event_id, issue_id, issue_date, chart_seq, span_start, span_end
        FROM event ORDER BY chart_seq;
    """)

    issues = []
    for eid, iid, date_, seq, ss, se in cur.fetchall():
        cur.execute("""
            SELECT rank, entry_id, title_display, name_display
            FROM event_entry
            JOIN work USING(work_id)
            JOIN person ON person_id = primary_person_id
            WHERE event_id=?
            ORDER BY rank;
        """, (eid,))
        entries = [{
            "rank": r,
            "entry_id": eid_,
            "title": t,
            "artist": a
        } for r, eid_, t, a in cur.fetchall()]

        issues.append({
            "issue_id": iid,
            "issue_date": date_,
            "chart_seq": seq,
            "span_start": ss,
            "span_end": se,
            "entries": entries
        })

    (EXPORT_DIR / "issues.json").write_text(json.dumps(issues, ensure_ascii=False))
    log("Exported issues.json", lines)

# =========================================================
# MAIN
# =========================================================

def main():
    lines = []
    BACKUPS.mkdir(exist_ok=True)
    LOGS.mkdir(exist_ok=True)

    src = sqlite3.connect(SRC_DB)
    master = sqlite3.connect(MASTER_DB)

    try:
        import_hot100(src, master, lines)
        export_json(master, lines)
    finally:
        src.close()
        master.close()

    log_path = LOGS / f"rv-update-{datetime.now().strftime('%Y%m%d_%H%M')}.log"
    log_path.write_text("\n".join(lines))

if __name__ == "__main__":
    main()

