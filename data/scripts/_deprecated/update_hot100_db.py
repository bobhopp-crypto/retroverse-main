#!/usr/bin/env python3
"""
RetroVerse Hot 100 Updater v1.1 (safe + noisy)
- Updates: /Users/bobhopp/Sites/retroverse-data/databases/billboard-hot-100.db
- Logs:    /Users/bobhopp/Sites/retroverse-data/logs/update_hot100_db.log
- Notifies on failure via macOS Notification Center (osascript)
- Guards against source/schema drift
"""
import json
import os
import sqlite3
import subprocess
import sys
import traceback
import urllib.request
from datetime import datetime

DB_PATH = "/Users/bobhopp/Sites/retroverse-data/databases/billboard-hot-100.db"
LOG_PATH = "/Users/bobhopp/Sites/retroverse-data/logs/update_hot100_db.log"

VALID_DATES_URL = "https://raw.githubusercontent.com/mhollingshead/billboard-hot-100/main/valid_dates.json"
DATE_JSON_URL_TMPL = "https://raw.githubusercontent.com/mhollingshead/billboard-hot-100/main/date/{date}.json"

EXPECTED_ROW_KEYS = {"song", "artist", "this_week", "last_week", "peak_position", "weeks_on_chart"}

def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(line + "\n")

def notify_failure(title: str, message: str):
    # Keep it short; Notification Center truncates long messages.
    try:
        subprocess.run(
            ["osascript", "-e", f'display notification "{message}" with title "{title}"'],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        # Notification failure should never hide the real failure.
        pass

def to_int(v, default=0):
    if v is None:
        return default
    try:
        return int(v)
    except Exception:
        return default

def ymd_parts(d):
    dt = datetime.strptime(d, "%Y-%m-%d")
    return dt.year, dt.month, dt.day

def fetch_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "RetroVerseHot100Updater/1.1"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status} for {url}")
        return json.loads(resp.read().decode("utf-8"))

def validate_valid_dates(obj):
    if not isinstance(obj, list):
        raise RuntimeError(f"valid_dates.json changed: expected list, got {type(obj).__name__}")
    # Dates should be YYYY-MM-DD strings
    for i, d in enumerate(obj[:5]):
        if not (isinstance(d, str) and len(d) == 10 and d[4] == "-" and d[7] == "-"):
            raise RuntimeError(f"valid_dates.json unexpected format at index {i}: {repr(d)}")

def validate_chart_json(obj):
    if not isinstance(obj, dict):
        raise RuntimeError(f"date JSON changed: expected dict, got {type(obj).__name__}")
    if "date" not in obj or "data" not in obj:
        raise RuntimeError(f"date JSON missing keys. Found keys: {list(obj.keys())}")
    if not isinstance(obj["date"], str) or len(obj["date"]) != 10:
        raise RuntimeError(f"date JSON 'date' invalid: {repr(obj['date'])}")
    if not isinstance(obj["data"], list):
        raise RuntimeError(f"date JSON 'data' changed: expected list, got {type(obj['data']).__name__}")
    if len(obj["data"]) < 50:
        raise RuntimeError(f"date JSON 'data' too small ({len(obj['data'])}); source may be incomplete.")
    first = obj["data"][0]
    if not isinstance(first, dict):
        raise RuntimeError(f"date JSON row changed: expected dict, got {type(first).__name__}")
    missing = EXPECTED_ROW_KEYS - set(first.keys())
    if missing:
        raise RuntimeError(f"date JSON row missing expected keys: {sorted(missing)}. Found: {sorted(first.keys())}")

def main():
    log("=== RetroVerse Hot 100 Update START ===")

    # Open DB
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    # Determine current max date
    cur.execute("SELECT MAX(chart_date) FROM hot100;")
    max_date = cur.fetchone()[0]
    if not max_date:
        raise RuntimeError("hot100 table is empty; expected existing data.")

    log(f"DB max chart_date: {max_date}")

    # Fetch valid dates list
    valid_dates = fetch_json(VALID_DATES_URL)
    validate_valid_dates(valid_dates)

    # Worklist
    todo = [d for d in valid_dates if d > max_date]
    log(f"Valid dates after max: {len(todo)}")

    inserted_dates = 0
    inserted_rows = 0
    skipped_dates = 0

    for d in todo:
        # Idempotent check
        cur.execute("SELECT COUNT(*) FROM hot100 WHERE chart_date = ?", (d,))
        if cur.fetchone()[0] > 0:
            skipped_dates += 1
            continue

        url = DATE_JSON_URL_TMPL.format(date=d)
        obj = fetch_json(url)
        validate_chart_json(obj)

        chart_date = obj["date"]
        year, month, day = ymd_parts(chart_date)

        rows = []
        for r in obj["data"]:
            rows.append((
                chart_date, year, month, day,
                to_int(r.get("this_week")),
                r.get("song", ""),
                r.get("artist", ""),
                to_int(r.get("peak_position")),
                to_int(r.get("last_week"), 0),
                to_int(r.get("weeks_on_chart")),
            ))

        cur.executemany(
            "INSERT INTO hot100 (chart_date,year,month,day,rank,title,artist,peak_pos,last_week,weeks_on_chart) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            rows
        )
        con.commit()  # commit per date (safer if an error happens later)

        inserted_dates += 1
        inserted_rows += len(rows)
        log(f"Inserted {chart_date}: {len(rows)} rows")

    con.close()

    log(f"DONE. Inserted dates: {inserted_dates}, rows: {inserted_rows}, skipped(existing): {skipped_dates}")
    log("=== RetroVerse Hot 100 Update END ===\n")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # Log with traceback
        log("ERROR: Hot 100 update failed.")
        log(str(e))
        tb = traceback.format_exc()
        for line in tb.rstrip().splitlines():
            log(line)

        # Quick “how to fix” hints
        hint = "Check log for details."
        msg = str(e).lower()
        if "http" in msg or "timed out" in msg or "temporary failure" in msg:
            hint = "Network/source issue. Re-run later."
        elif "missing keys" in msg or "changed" in msg:
            hint = "Source format changed. Mapping needs update."
        elif "database is locked" in msg:
            hint = "Close apps using the DB, then re-run."
        notify_failure("RetroVerse Hot 100 update FAILED", "Open Applications → RetroVerse → RetroVerse Check Logs.command. " + hint)

        sys.exit(1)
