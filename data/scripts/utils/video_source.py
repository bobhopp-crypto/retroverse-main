#!/usr/bin/env python3
"""
Shared video source detection for R2 uploads.
NAS is preferred; Dropbox is fallback. No credentials stored.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional

# Known paths (no credentials, mount points only)
NAS_VIDEO_PATH = Path("/Volumes/RetroVerseNAS/VIDEO")
DROPBOX_VIDEO_PATH = Path("/Users/bobhopp/Library/CloudStorage/Dropbox/VIDEO")


def _count_mp4_and_newest(root: Path) -> tuple[int, Optional[float], Optional[str]]:
    """Return (count, newest_mtime, newest_name). mtime is seconds since epoch."""
    if not root.exists() or not root.is_dir():
        return 0, None, None
    count = 0
    newest_mtime: Optional[float] = None
    newest_name: Optional[str] = None
    for f in root.rglob("*.mp4"):
        if f.is_file():
            count += 1
            try:
                m = f.stat().st_mtime
                if newest_mtime is None or m > newest_mtime:
                    newest_mtime = m
                    newest_name = f.name
            except OSError:
                pass
    return count, newest_mtime, newest_name


def detect_video_source(explicit_path: Optional[str] = None) -> dict:
    """
    Resolve VIDEO source for R2 operations.
    Returns {"source": "NAS"|"DROPBOX"|"EXPLICIT"|"NONE", "path": Path|None, "message": str}.
    Valid source requires path to exist and contain at least one .mp4 file.
    """
    # Explicit path
    if explicit_path:
        p = Path(explicit_path).resolve()
        if not p.exists():
            return {"source": "NONE", "path": None, "message": f"Explicit path does not exist: {p}"}
        if not p.is_dir():
            return {"source": "NONE", "path": None, "message": f"Explicit path is not a directory: {p}"}
        count, mtime, name = _count_mp4_and_newest(p)
        if count == 0:
            return {"source": "NONE", "path": None, "message": f"No .mp4 files in {p}"}
        from datetime import datetime
        mtime_str = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S") if mtime else "unknown"
        msg = f"Explicit source: {p} ({count} .mp4 files, newest: {name or '?'} @ {mtime_str})"
        return {"source": "EXPLICIT", "path": p, "message": msg}

    # NAS
    if NAS_VIDEO_PATH.exists() and NAS_VIDEO_PATH.is_dir():
        count, mtime, name = _count_mp4_and_newest(NAS_VIDEO_PATH)
        if count > 0:
            from datetime import datetime
            mtime_str = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S") if mtime else "unknown"
            msg = f"NAS: {NAS_VIDEO_PATH} ({count} .mp4 files, newest: {name or '?'} @ {mtime_str})"
            return {"source": "NAS", "path": NAS_VIDEO_PATH, "message": msg}

    # Dropbox fallback
    if DROPBOX_VIDEO_PATH.exists() and DROPBOX_VIDEO_PATH.is_dir():
        count, mtime, name = _count_mp4_and_newest(DROPBOX_VIDEO_PATH)
        if count > 0:
            from datetime import datetime
            mtime_str = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S") if mtime else "unknown"
            msg = f"Dropbox (fallback): {DROPBOX_VIDEO_PATH} ({count} .mp4 files, newest: {name or '?'} @ {mtime_str})"
            return {"source": "DROPBOX", "path": DROPBOX_VIDEO_PATH, "message": msg}

    # None available
    return {
        "source": "NONE",
        "path": None,
        "message": "No valid VIDEO source: NAS not mounted or empty, Dropbox missing or empty.",
    }


def main_for_cli() -> int:
    """
    CLI entry: read optional VIDEO_SOURCE from env, run detect_video_source,
    print VIDEO_SOURCE= and SOURCE_TYPE= for shell consumption; exit 1 if NONE.
    """
    explicit = os.environ.get("VIDEO_SOURCE") or None
    if explicit and explicit.strip() == "":
        explicit = None
    d = detect_video_source(explicit)
    if d["source"] == "NONE":
        print(d["message"], file=sys.stderr)
        return 1
    # Machine-parseable for shell
    print(f"VIDEO_SOURCE={d['path']}")
    print(f"SOURCE_TYPE={d['source']}")
    return 0


if __name__ == "__main__":
    sys.exit(main_for_cli())
