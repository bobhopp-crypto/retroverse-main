#!/usr/bin/env python3
# rv_vdj_export_videos.py (v1)
# Export VirtualDJ database.xml -> videolibrary.csv + videolibrary.json (videos only)

from __future__ import annotations

import csv
import json
import os
import re
import time
from datetime import datetime
from pathlib import Path
import xml.etree.ElementTree as ET

BASE = Path("/Users/bobhopp/Sites/retroverse-data")
VDJ_XML = Path("/Users/bobhopp/Library/Application Support/VirtualDJ/database.xml")

OUT_DIR = BASE / "exports" / "vdj"
OUT_CSV = OUT_DIR / "videolibrary.csv"
OUT_JSON = OUT_DIR / "videolibrary.json"

VIDEO_ROOT = "/Users/bobhopp/Library/CloudStorage/Dropbox/VIDEO"
VIDEO_EXTS = {".mp4", ".m4v", ".mov", ".mkv", ".avi", ".wmv", ".webm"}  # adjust if needed

def norm(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"\s+", " ", s)
    return s

def is_video_path(p: str) -> bool:
    if not p:
        return False
    # VirtualDJ often stores file:// URLs or raw paths depending on version/config.
    # We'll detect by extension.
    p2 = p
    if p2.startswith("file://"):
        p2 = p2[7:]
    _, ext = os.path.splitext(p2.lower())
    return ext in VIDEO_EXTS

def should_lookup_youtube(record):
    if record.get("youtube_id"):
        return False
    last = record.get("youtube_last_verified")
    if not last:
        return True
    try:
        last_dt = datetime.fromisoformat(last.replace("Z", ""))
        return (datetime.utcnow() - last_dt).days >= 30
    except Exception:
        return True


def fake_youtube_search(artist, title):
    """
    Placeholder search.
    Replace later with real API.
    """
    if not artist or not title:
        return None
    # deterministic fake ID so behavior is stable
    return f"yt_{abs(hash(artist + title)) % 10_000_000}"


def enrich_youtube(rows, batch_limit=25):
    updated = 0
    for r in rows:
        if updated >= batch_limit:
            break
        if not should_lookup_youtube(r):
            continue

        yt_id = fake_youtube_search(r.get("Artist"), r.get("Title"))
        if yt_id:
            r["youtube_id"] = yt_id
            r["youtube_source"] = "search"
            r["youtube_last_verified"] = datetime.utcnow().isoformat() + "Z"
        else:
            r["youtube_last_verified"] = datetime.utcnow().isoformat() + "Z"

        updated += 1
        time.sleep(0.1)  # rate-safe

def main() -> int:
    if not VDJ_XML.exists():
        print(f"ERROR: Not found: {VDJ_XML}")
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Parse XML
    tree = ET.parse(str(VDJ_XML))
    root = tree.getroot()

    rows = []

    # VirtualDJ DB structure commonly includes <Song> nodes with attributes.
    # We'll collect best-effort fields: FilePath, Artist, Title, Year, Genre, Length, PlayCount, BPM, Key, Comment.
    for song in root.iter("Song"):
        # File path attribute names vary; these are common:
        filepath = song.get("FilePath") or song.get("Path") or song.get("file") or song.get("File") or ""
        if not is_video_path(filepath):
            continue

        # Only include MP4 files
        if not (filepath or "").lower().endswith(".mp4"):
            continue

        # Tags are often nested under <Tags ... />
        tags = song.find("Tags")
        get_tag = (lambda k: (tags.get(k) if tags is not None else None))

        artist = norm(get_tag("Author") or get_tag("Artist") or song.get("Artist") or "")
        title  = norm(get_tag("Title")  or song.get("Title")  or "")
        year   = norm(get_tag("Year")   or song.get("Year")   or "")
        genre  = norm(get_tag("Genre")  or song.get("Genre")  or "")
        length = norm(get_tag("Length") or song.get("Length") or "")
        bpm    = norm(get_tag("Bpm")    or get_tag("BPM")     or song.get("Bpm") or song.get("BPM") or "")
        key    = norm(get_tag("Key")    or song.get("Key")    or "")
        comment = norm(get_tag("Comment") or get_tag("Comments") or song.get("Comment") or "")

        # PlayCount sometimes lives on <Infos> or as attribute; try common places
        infos = song.find("Infos")
        playcount = ""
        if infos is not None:
            playcount = norm(infos.get("PlayCount") or infos.get("Played") or infos.get("Playcount") or "")
        if not playcount:
            playcount = norm(song.get("PlayCount") or song.get("Played") or "")

        # Cue 8 timestamp (milliseconds)
        cue8_ms = None
        pois = song.findall("Poi")
        if not pois:
            pois = song.findall("POI")
        for poi in pois:
            if poi.get("Type") == "cue" and poi.get("Num") == "8":
                try:
                    pos_s = float(poi.get("Pos"))
                    cue8_ms = int(pos_s * 1000)
                except (TypeError, ValueError):
                    cue8_ms = None
                break

        rows.append({
            "FilePath": filepath,
            "Artist": artist,
            "Title": title,
            "Year": year,
            "Genre": genre,
            "Length": length,
            "PlayCount": playcount,
            "BPM": bpm,
            "Key": key,
            "Comment": comment,
            "Cue8Timestamp": cue8_ms,
        })

    # Filter: only include files that exist; only MP4 (already filtered above)
    video_root = Path(VIDEO_ROOT).expanduser().resolve()
    total_seen = len(rows)
    included = []
    skipped_not_found = 0
    for r in rows:
        raw = (r.get("FilePath") or "").strip()
        if raw.startswith("file://"):
            raw = raw[7:]
        if not raw:
            continue
        p = Path(raw).expanduser().resolve()
        if not p.exists():
            skipped_not_found += 1
            continue
        included.append(r)
    rows = included

    print(f"Filter (root={video_root}): total seen={total_seen}, included={len(rows)}, skipped not-found={skipped_not_found}")

    # Write CSV
    fieldnames = ["Title", "Artist", "Year", "PlayCount", "Genre", "Length", "BPM", "Key", "Comment", "FilePath"]
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})

    # Incremental YouTube enrichment (safe, capped)
    enrich_youtube(rows)

    # Write JSON
    OUT_JSON.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    exported = len(rows)
    print("\nExport complete")
    print("----------------------------")
    print(f"Source folder: {VIDEO_ROOT}")
    print(f"Videos exported: {exported}")
    print(f"JSON: {OUT_JSON}")
    print(f"CSV:  {OUT_CSV}")
    print("----------------------------")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
