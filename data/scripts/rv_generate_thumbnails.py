#!/usr/bin/env python3
import os
import re
import shutil
import subprocess
import unicodedata
from pathlib import Path

# ---------------------------------------------------------
# CONFIG
# ---------------------------------------------------------
DATA_DIR = Path(__file__).resolve().parent.parent
ROOT = DATA_DIR.parent
VIDEO_ROOT = Path(os.environ.get("VIDEO_ROOT", str(Path.home() / "Library/CloudStorage/Dropbox/VIDEO")))
VDJ_DB = Path.home() / "Library/Application Support/VirtualDJ/database.xml"
THUMBNAILS_DIR = DATA_DIR / "thumbnails"
EXPORTS_THUMBNAILS_DIR = DATA_DIR / "exports" / "thumbnails"
SITE_PUBLIC_THUMBNAILS = ROOT / "site" / "public" / "thumbnails"
THUMB_SIZE = "320x180"
BEST_FRAME_PERCENT = 0.23

ALLOWED_FOLDERS = {
    "1950's", "1960's", "1970's", "1980's",
    "1990's", "2000's", "2010's", "2020's",
    "COUNTRY", "TECHNO",
}


def sanitize_for_filename(s: str) -> str:
    """Keep letters, numbers, spaces, dashes, underscores. Remove / : * ? \" < > |. Normalize unicode.
    Safety: never produce decade-prefixed like 1960's_Artist - use 1960s_Artist."""
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


def load_cue8_from_vdj():
    import xml.etree.ElementTree as ET
    cue_data = {}
    try:
        tree = ET.parse(VDJ_DB)
        root = tree.getroot()
        for song in root.findall("Song"):
            path = song.get("FilePath")
            if not path:
                continue
            for poi in song.findall(".//POI"):
                if poi.get("Type") == "cue" and poi.get("Num") == "8":
                    cue_data[path] = float(poi.get("Pos")) / 1000.0
                    break
    except Exception:
        pass
    return cue_data


def run_ffmpeg(input_file, timestamp, output_file):
    subprocess.run(
        [
            "ffmpeg", "-y", "-ss", str(timestamp),
            "-i", str(input_file), "-vframes", "1",
            "-qscale:v", "2", "-vf", f"scale={THUMB_SIZE}",
            str(output_file)
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )


def _copy_to_all_destinations(src: Path, thumb_filename: str):
    for d in [THUMBNAILS_DIR, SITE_PUBLIC_THUMBNAILS, EXPORTS_THUMBNAILS_DIR]:
        d.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, d / thumb_filename)


def process_video(index, total, video_path, cue_data):
    video_path = Path(video_path)
    if not os.path.exists(video_path):
        return "skip"

    thumb_basename = filepath_to_thumbnail_basename(video_path, VIDEO_ROOT)
    if "'s" in thumb_basename or re.search(r"\d{4}'", thumb_basename):
        return "skip"
    thumb_filename = thumb_basename + ".jpg"

    out_thumbnails = THUMBNAILS_DIR / thumb_filename
    out_next_to_mp4 = video_path.parent / thumb_filename

    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
    cue_seconds = cue_data.get(str(video_path))

    if cue_seconds is not None:
        ts = cue_seconds
        try:
            run_ffmpeg(video_path, ts, out_thumbnails)
            shutil.copyfile(out_thumbnails, out_next_to_mp4)
            _copy_to_all_destinations(out_thumbnails, thumb_filename)
            return "cue8"
        except Exception:
            return "error"
    else:
        if out_thumbnails.exists():
            if not out_next_to_mp4.exists() or out_next_to_mp4.name == thumb_filename:
                shutil.copyfile(out_thumbnails, out_next_to_mp4)
            return "skipped"
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(video_path)],
            capture_output=True, text=True
        )
        try:
            duration = float(result.stdout.strip())
            ts = duration * BEST_FRAME_PERCENT
        except Exception:
            return "error"
        try:
            run_ffmpeg(video_path, ts, out_thumbnails)
            if not out_next_to_mp4.exists() or out_next_to_mp4.name == thumb_filename:
                shutil.copyfile(out_thumbnails, out_next_to_mp4)
            _copy_to_all_destinations(out_thumbnails, thumb_filename)
            return "created"
        except Exception:
            return "error"


def main():
    print(f"Loading VDJ database: {VDJ_DB}")
    cue_data = load_cue8_from_vdj()
    print(f"Thumbnails output: {THUMBNAILS_DIR}")

    video_files = []
    for folder in ALLOWED_FOLDERS:
        folder_path = VIDEO_ROOT / folder
        if folder_path.exists():
            video_files.extend(folder_path.rglob("*.mp4"))
    video_files = sorted(set(video_files))
    total = len(video_files)
    print(f"Found {total} video files")

    stats = {"created": 0, "cue8": 0, "skipped": 0, "error": 0, "skip": 0}
    for i, video_path in enumerate(video_files, start=1):
        result = process_video(i, total, video_path, cue_data)
        stats[result] = stats.get(result, 0) + 1
        if (i % 50 == 0) or result in ("created", "cue8"):
            print(f"  {i}/{total} {Path(video_path).name} -> {result}")

    print(f"Cue8 overwrites: {stats.get('cue8', 0)}, Created: {stats.get('created', 0)}, Skipped: {stats.get('skipped', 0)}, Errors: {stats.get('error', 0)}")


if __name__ == "__main__":
    main()
