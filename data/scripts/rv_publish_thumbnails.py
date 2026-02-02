#!/usr/bin/env python3
# rv_publish_thumbnails.py
# Copy generated thumbnails next to video files for MISSING_SIDECAR and DIFFERENT only.
# DRY-RUN by default; use --execute to perform copies.

import argparse
import csv
import shutil
import sys
from pathlib import Path
from datetime import datetime

# Configuration
REPORTS_DIR = Path("/Users/bobhopp/Sites/retroverse-data/exports/reports")
EXPORT_ROOT = Path("/Users/bobhopp/Sites/retroverse-data/exports/thumbnails")
LOG_FILE = REPORTS_DIR / "thumbnail_publish.log"

# Categories we are allowed to copy (policy: only these two)
COPY_CATEGORIES = {"MISSING_SIDECAR", "DIFFERENT"}


def find_latest_comparison_csv():
    """Return path to most recent thumbnail_comparison_*.csv, or None."""
    if not REPORTS_DIR.exists():
        return None
    candidates = list(REPORTS_DIR.glob("thumbnail_comparison_*.csv"))
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def log_message(msg: str, log_handle):
    """Write timestamped line to log handle."""
    line = f"{datetime.now().isoformat()} {msg}\n"
    log_handle.write(line)
    log_handle.flush()


def main():
    parser = argparse.ArgumentParser(
        description="Publish thumbnails (MISSING_SIDECAR/DIFFERENT) next to video files."
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Perform copies; default is dry-run."
    )
    args = parser.parse_args()
    do_execute = args.execute

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    csv_path = find_latest_comparison_csv()
    if not csv_path:
        print("❌ No thumbnail_comparison_*.csv found in exports/reports/")
        return 1

    print(f"\n--- Publish Thumbnails ---")
    print(f"   Comparison CSV: {csv_path.name}")
    print(f"   Mode: {'EXECUTE (copy)' if do_execute else 'DRY-RUN (no copies)'}\n")

    rows_to_copy = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Support both "category" and "status" for compatibility
            cat = row.get("category") or row.get("status", "")
            if cat in COPY_CATEGORIES:
                rows_to_copy.append(row)

    if not rows_to_copy:
        print("   No rows with MISSING_SIDECAR or DIFFERENT. Nothing to publish.")
        return 0

    print(f"   Candidates to publish: {len(rows_to_copy)}\n")

    copied = 0
    skipped = 0
    errors = 0

    with open(LOG_FILE, "a", encoding="utf-8") as log:
        log_message(f"start mode={'execute' if do_execute else 'dry-run'} csv={csv_path.name} n={len(rows_to_copy)}", log)

        for row in rows_to_copy:
            gen_path = Path(row.get("generated_path", "").strip())
            video_path = Path(row.get("video_path", "").strip())
            cat = row.get("category") or row.get("status", "")
            dest = video_path.parent / (video_path.stem + ".jpg")

            if not gen_path or not video_path:
                log_message(f"skip invalid_row video_path={video_path!r} generated_path={gen_path!r}", log)
                skipped += 1
                continue
            if not gen_path.exists():
                log_message(f"skip missing_source {gen_path}", log)
                skipped += 1
                continue

            if do_execute:
                try:
                    shutil.copy2(gen_path, dest)
                    copied += 1
                    log_message(f"copy {gen_path} -> {dest}", log)
                    print(f"   ✅ {video_path.name}")
                except Exception as e:
                    errors += 1
                    log_message(f"error {gen_path} -> {dest} {e!r}", log)
                    print(f"   ❌ {video_path.name}: {e}")
            else:
                copied += 1  # count as "would copy"
                log_message(f"dry_run would_copy {gen_path} -> {dest}", log)
                print(f"   [dry-run] {video_path.name}")

        log_message(f"end copied={copied} skipped={skipped} errors={errors}", log)

    print(f"\n   Log: {LOG_FILE}")
    if do_execute:
        print(f"   Copied: {copied}  Skipped: {skipped}  Errors: {errors}")
    else:
        print(f"   Would copy: {copied}  (run with --execute to apply)")
    print()
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
