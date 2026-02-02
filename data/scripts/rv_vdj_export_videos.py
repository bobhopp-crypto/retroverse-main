#!/usr/bin/env python3
import os
import re
import shutil
import unicodedata
import csv
import json
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------
# CONFIG
# ---------------------------------------------------------
DATA_DIR = Path(__file__).resolve().parent.parent


def sanitize_for_filename(s: str) -> str:
    """Keep letters, numbers, spaces, dashes, underscores. Remove / : * ? \" < > |. Normalize unicode.
    Safety: never produce decade-prefixed like 1960's_Artist."""
    s = unicodedata.normalize("NFC", str(s))
    s = re.sub(r"(\d{4})'s", r"\1s", s)
    for c in r'/:\*?"<>|':
        s = s.replace(c, "")
    result = []
    for c in s:
        if c.isalnum() or c in " _-'":
            result.append(c)
    s = "".join(result)
    s = re.sub(r"[\s_]+", "_", s).strip("_")
    return s or "video"


def filepath_to_thumbnail_basename(filepath: Path, video_root: Path) -> str:
    rel = filepath.relative_to(video_root)
    parts = rel.with_suffix("").parts
    return sanitize_for_filename("_".join(parts))
VDJ_DB = Path.home() / "Library/Application Support/VirtualDJ/database.xml"
VIDEO_ROOT = Path(os.environ.get("VIDEO_ROOT", str(Path.home() / "Library/CloudStorage/Dropbox/VIDEO")))

EXPORT_DIR = DATA_DIR / "exports" / "vdj"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

OUT_JSON = EXPORT_DIR / "videolibrary.json"
OUT_CSV = EXPORT_DIR / "videolibrary.csv"

# Which subfolders count as real videos (first level under VIDEO_ROOT)
ALLOWED_FOLDERS = {
    "1950's", "1960's", "1970's", "1980's",
    "1990's", "2000's", "2010's", "2020's",
    "COUNTRY", "TECHNO",
}


# ---------------------------------------------------------
# PARSE DATABASE.XML
# ---------------------------------------------------------
print(f"Loading VDJ database: {VDJ_DB}")
tree = ET.parse(VDJ_DB)
root = tree.getroot()

def has_cue8(song_elem) -> bool:
    for poi in song_elem.findall(".//POI"):
        if poi.get("Type") == "cue" and poi.get("Num") == "8":
            return True
    return False

videos = []
count = 0

for song in root.findall("Song"):
    filepath = (song.get("FilePath") or "").strip()

    # Only export videos inside the official DJ library
    if not filepath.startswith(str(VIDEO_ROOT)):
        continue

    if not filepath.lower().endswith(".mp4"):
        continue

    # First-level folder under VIDEO_ROOT must be an allowed music-video folder
    rel = Path(filepath).relative_to(VIDEO_ROOT)
    top_folder = rel.parts[0] if len(rel.parts) > 0 else ""
    if top_folder not in ALLOWED_FOLDERS:
        continue

    # Must exist on disk
    if not os.path.exists(filepath):
        continue

    # Build clean metadata block
    tags = song.find("Tags")
    infos = song.find("Infos")

    # ---- FIRSTSEEN UPGRADE ----
    # VirtualDJ stores FirstSeen as a Unix epoch *in seconds*
    firstseen_epoch = None
    firstseen_date = None
    if infos is not None and infos.get("FirstSeen"):
        try:
            firstseen_epoch = int(infos.get("FirstSeen"))
            firstseen_date = datetime.utcfromtimestamp(firstseen_epoch).strftime("%Y-%m-%d")
        except Exception:
            firstseen_epoch = None
            firstseen_date = None

    thumb_basename = filepath_to_thumbnail_basename(Path(filepath), VIDEO_ROOT)
    relative_path = rel.as_posix()
    relative_jpg = rel.with_suffix(".jpg").as_posix()
    thumbnail_url = "https://media.retroverse.live/video/" + relative_jpg
    cue8_exists = has_cue8(song)
    r2_url = "https://media.retroverse.live/video/" + relative_path

    item = {
        "file_path": filepath,
        "r2_url": r2_url,
        "title": tags.get("Title") if tags is not None else None,
        "artist": tags.get("Author") if tags is not None else None,
        "album": tags.get("Album") if tags is not None else None,
        "genre": tags.get("Genre") if tags is not None else None,
        "year": int(tags.get("Year")) if (tags is not None and tags.get("Year") and tags.get("Year").isdigit()) else None,
        "playcount": int(infos.get("PlayCount")) if (infos is not None and infos.get("PlayCount") and infos.get("PlayCount").isdigit()) else 0,
        "songlength": float(infos.get("SongLength")) if (infos is not None and infos.get("SongLength")) else None,
        "bitrate": int(infos.get("Bitrate")) if (infos is not None and infos.get("Bitrate") and infos.get("Bitrate").isdigit()) else None,
        "key": tags.get("Key") if tags is not None else None,
        "cover": int(infos.get("Cover")) if (infos is not None and infos.get("Cover") and infos.get("Cover").isdigit()) else None,
        "firstseen_epoch": firstseen_epoch,
        "firstseen_date": firstseen_date,
        "thumbnail": thumbnail_url,
    }
    if cue8_exists:
        item["cue8_thumbnail_path"] = thumbnail_url

    videos.append(item)
    count += 1


# ---------------------------------------------------------
# WRITE JSON
# ---------------------------------------------------------
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(videos, f, indent=2)

# ---------------------------------------------------------
# WRITE CSV
# ---------------------------------------------------------
fieldnames = list(videos[0].keys()) if videos else []

with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(videos)

# ---------------------------------------------------------
# LEGACY PIPELINE EXPORT (VideoFiles.json)
# ---------------------------------------------------------
legacy_out = EXPORT_DIR / "VideoFiles.json"

legacy_records = []
for v in videos:
    legacy_records.append({
        "FilePath": v["file_path"],
        "Artist": v["artist"],
        "Title": v["title"],
        "Year": v["year"]
    })

with open(legacy_out, "w", encoding="utf-8") as f:
    json.dump(legacy_records, f, indent=2)

print(f"Legacy JSON (VideoFiles.json): {legacy_out}")

# ---------------------------------------------------------
# FINISH
# ---------------------------------------------------------
print("\nExport complete")
print("----------------------------")
print(f"Source folder: {VIDEO_ROOT}")
print(f"Videos exported: {count}")
print(f"JSON: {OUT_JSON}")
print(f"CSV:  {OUT_CSV}")
print("----------------------------")

# ------------------------------------------------------------
# OPTION B — AUTOMATICALLY COPY OUTPUT INTO SITE PUBLIC DATA
# ------------------------------------------------------------

print("Syncing data into site/public/data/ ...")

SITE_PUBLIC_DATA = DATA_DIR.parent / "site" / "public" / "data"
SITE_PUBLIC_DATA.mkdir(parents=True, exist_ok=True)


def sync_file(src, dest_folder=SITE_PUBLIC_DATA):
    src = Path(src)
    if not src.exists():
        print(f"  ❌ Missing source: {src}")
        return
    dest = dest_folder / src.name
    try:
        shutil.copyfile(src, dest)
        print(f"  ✓ Synced: {src.name}")
    except Exception as e:
        print(f"  ❌ Sync failed for {src.name}: {e}")


# MAIN OUTPUTS from this script
sync_file(OUT_JSON)
sync_file(OUT_CSV)
sync_file(DATA_DIR / "exports/vdj/VideoFiles.json")

# OPTIONAL FILES — sync only if present
optional_sources = [
    DATA_DIR / "exports/indexes/video-index.json",
    DATA_DIR / "exports/indexes/thumbnails-index.json",
    DATA_DIR / "exports/vdj/decisions.json",
]

for f in optional_sources:
    sync_file(f)

print("------------------------------------------------------")
print("Export + Auto-Sync complete.")
print("------------------------------------------------------")
