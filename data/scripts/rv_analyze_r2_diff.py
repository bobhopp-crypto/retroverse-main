#!/usr/bin/env python3
# rv_analyze_r2_diff.py
# Analyze R2 differences (read-only, no deletes).
# Compares local VIDEO_SOURCE vs R2 object list and writes CSV reports.
# Uses shared detect_video_source: NAS preferred, Dropbox fallback.

import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path

# Resolve scripts dir for utils import
_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from utils.video_source import detect_video_source

# Configuration
R2_REMOTE = "R2media"
R2_PATH = "charttube/video"
REPORTS_DIR = _SCRIPTS.parent / "exports" / "reports"

# Video extensions to consider
VIDEO_EXTS = {".mp4", ".m4v", ".mov", ".mkv", ".avi", ".wmv", ".webm"}


def get_local_video_files(video_root: Path) -> set[str]:
    """Return set of relative paths (from video_root) for all local video files."""
    if not video_root.exists():
        return set()
    videos = set()
    for ext in VIDEO_EXTS:
        for video_file in video_root.rglob(f"*{ext}"):
            try:
                rel_path = video_file.relative_to(video_root)
                videos.add(str(rel_path))
            except ValueError:
                # File not under video_root (shouldn't happen with rglob)
                pass
    return videos


def get_r2_video_files() -> set[str]:
    """Return set of relative paths for all video files in R2."""
    try:
        result = subprocess.run(
            ["rclone", "lsjson", f"{R2_REMOTE}:{R2_PATH}"],
            capture_output=True,
            text=True,
            check=True
        )
        r2_files = json.loads(result.stdout)
        videos = set()
        for item in r2_files:
            if item.get("IsDir"):
                continue
            path = item.get("Path", "")
            if any(path.lower().endswith(ext) for ext in VIDEO_EXTS):
                videos.add(path)
        return videos
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: Failed to list R2 files: {e}")
        return set()
    except json.JSONDecodeError as e:
        print(f"❌ ERROR: Failed to parse R2 file list: {e}")
        return set()


def write_csv_report(filename: Path, rows: list[dict], fieldnames: list[str]):
    """Write CSV report file."""
    if not rows:
        print(f"  No entries for {filename.name}")
        return
    
    filename.parent.mkdir(parents=True, exist_ok=True)
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"  ✅ {filename.name}: {len(rows)} entries")


def main():
    parser = argparse.ArgumentParser(
        description="Analyze R2 differences (read-only, no deletes)."
    )
    parser.add_argument(
        "--source",
        type=str,
        help="Explicit VIDEO source path (overrides NAS/Dropbox selection)"
    )
    args = parser.parse_args()

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n--- Analyze R2 Differences (Read-Only) ---")
    
    # Validate rclone
    if subprocess.run(["which", "rclone"], capture_output=True).returncode != 0:
        print("❌ ERROR: rclone not found. Install with: brew install rclone")
        return 1

    # Validate R2 remote
    result = subprocess.run(
        ["rclone", "listremotes"],
        capture_output=True,
        text=True
    )
    if R2_REMOTE + ":" not in result.stdout:
        print(f"❌ ERROR: R2 remote '{R2_REMOTE}' not configured.")
        print("   Configure with: rclone config")
        return 1

    # Resolve source via shared helper (NAS > Dropbox)
    d = detect_video_source(args.source)
    if d["source"] == "NONE":
        print(f"❌ ERROR: {d['message']}")
        return 1
    video_source = d["path"]
    source_type = d["source"]
    print(f"Video source: {source_type} ({video_source})")

    # Get file lists
    print("\nScanning local VIDEO folder...")
    local_videos = get_local_video_files(video_source)
    print(f"  Found {len(local_videos)} local video files")

    print("Scanning R2 bucket...")
    r2_videos = get_r2_video_files()
    print(f"  Found {len(r2_videos)} R2 video files")

    # Find differences
    missing_in_r2 = sorted(local_videos - r2_videos)
    orphaned_in_r2 = sorted(r2_videos - local_videos)

    print(f"\n--- Differences ---")
    print(f"  Missing in R2 (local but not in R2): {len(missing_in_r2)}")
    print(f"  Orphaned in R2 (in R2 but not local): {len(orphaned_in_r2)}")

    # Write CSV reports
    print(f"\n--- Writing Reports ---")

    # r2_missing.csv: files that exist locally but not in R2
    missing_rows = [{"relative_path": path} for path in missing_in_r2]
    missing_file = REPORTS_DIR / "r2_missing.csv"
    write_csv_report(missing_file, missing_rows, ["relative_path"])

    # r2_orphaned.csv: files that exist in R2 but not locally
    orphaned_rows = [{"relative_path": path} for path in orphaned_in_r2]
    orphaned_file = REPORTS_DIR / "r2_orphaned.csv"
    write_csv_report(orphaned_file, orphaned_rows, ["relative_path"])

    print(f"\n✅ Analysis complete. Reports in: {REPORTS_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
