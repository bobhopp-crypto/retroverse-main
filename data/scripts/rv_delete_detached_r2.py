#!/usr/bin/env python3
# rv_delete_detached_r2.py
# Delete R2 video files that no longer exist locally (detached/orphaned files).
# DRY-RUN by default; use --execute to perform deletions.

import argparse
import json
import subprocess
import sys
from pathlib import Path
from datetime import datetime

# Configuration
VIDEO_SOURCE_NAS = Path("/Volumes/DJ  MAIN/DJ MEDIA/VIDEO")
VIDEO_SOURCE_DROPBOX = Path("/Users/bobhopp/Library/CloudStorage/Dropbox/VIDEO")
R2_REMOTE = "R2media"
R2_PATH = "charttube/video"
REPORTS_DIR = Path("/Users/bobhopp/Sites/retroverse-data/exports/reports")
LOG_FILE = REPORTS_DIR / "r2_detached_delete.log"

# Video extensions to consider
VIDEO_EXTS = {".mp4", ".m4v", ".mov", ".mkv", ".avi", ".wmv", ".webm"}


def select_video_source(explicit_source: str = None) -> tuple[Path, str]:
    """Select video source: explicit > NAS (if mounted) > abort."""
    if explicit_source:
        source_path = Path(explicit_source)
        if not source_path.exists():
            print(f"❌ ERROR: Explicit source not found: {source_path}")
            sys.exit(1)
        return source_path, "EXPLICIT"
    
    if VIDEO_SOURCE_NAS.exists():
        return VIDEO_SOURCE_NAS, "NAS"
    
    print(f"❌ ERROR: NAS not mounted at {VIDEO_SOURCE_NAS}")
    print("   NAS is the primary source. Mount NAS or use --source to specify path.")
    sys.exit(1)


def get_local_video_files(video_root: Path):
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
                pass
    return videos


def get_r2_video_files():
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


def log_message(msg: str, log_handle):
    """Write timestamped line to log handle."""
    line = f"{datetime.now().isoformat()} {msg}\n"
    log_handle.write(line)
    log_handle.flush()


def main():
    parser = argparse.ArgumentParser(
        description="Delete detached R2 video files (exist in R2 but not locally)."
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Perform deletions; default is dry-run."
    )
    parser.add_argument(
        "--source",
        type=str,
        help="Explicit VIDEO source path (overrides NAS/Dropbox selection)"
    )
    args = parser.parse_args()
    do_execute = args.execute

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n--- Delete Detached R2 Videos ---")
    print(f"   Mode: {'EXECUTE (delete)' if do_execute else 'DRY-RUN (preview only)'}\n")

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

    # Select source
    video_source, source_type = select_video_source(args.source)
    print(f"   Source: {source_type} ({video_source})")

    # Get file lists
    print("   Scanning local VIDEO folder...")
    local_videos = get_local_video_files(video_source)
    print(f"   Found {len(local_videos)} local video files")

    print("   Scanning R2 bucket...")
    r2_videos = get_r2_video_files()
    print(f"   Found {len(r2_videos)} R2 video files")

    # Find detached files (in R2 but not local)
    detached = r2_videos - local_videos
    detached = sorted(detached)

    if not detached:
        print("\n   ✅ No detached files found. R2 is in sync with local.")
        return 0

    print(f"\n   Detached in R2: {len(detached)}")
    if len(detached) <= 20:
        for path in detached:
            print(f"      - {path}")
    else:
        for path in detached[:10]:
            print(f"      - {path}")
        print(f"      ... and {len(detached) - 10} more")

    # Write log
    with open(LOG_FILE, "a", encoding="utf-8") as log:
        log_message(f"start mode={'execute' if do_execute else 'dry-run'} detached={len(detached)}", log)

        if do_execute:
            # Create temporary file list for rclone delete
            import tempfile
            with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".txt") as tmp:
                for path in detached:
                    tmp.write(f"{path}\n")
                tmp_path = tmp.name

            try:
                # Delete using rclone delete --files-from
                print(f"\n   Deleting {len(detached)} files from R2...")
                result = subprocess.run(
                    ["rclone", "delete", f"{R2_REMOTE}:{R2_PATH}", "--files-from", tmp_path, "--verbose"],
                    capture_output=True,
                    text=True,
                    check=False
                )
                print(result.stdout)
                if result.stderr:
                    print(f"   STDERR: {result.stderr}")

                if result.returncode == 0:
                    deleted_count = len(detached)
                    log_message(f"deleted {deleted_count} files", log)
                    for path in detached:
                        log_message(f"deleted {path}", log)
                    print(f"\n   ✅ Deleted {deleted_count} detached files from R2")
                else:
                    log_message(f"error rclone returned {result.returncode}", log)
                    print(f"\n   ❌ ERROR: rclone delete failed with exit code {result.returncode}")
                    return 1
            finally:
                Path(tmp_path).unlink()
        else:
            # Dry-run: just log what would be deleted
            log_message(f"dry_run would_delete {len(detached)} files", log)
            for path in detached:
                log_message(f"dry_run would_delete {path}", log)
            print(f"\n   [dry-run] Would delete {len(detached)} files")
            print(f"   Run with --execute to apply deletions")

    print(f"\n   Log: {LOG_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
