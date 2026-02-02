#!/usr/bin/env python3
"""
fix_r2_paths.py

Reads retroverse-site/data/VideoFiles.json and adds R2Url for each entry.
Overwrites the file safely with a temp file + replace.
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote
import tempfile
import os

R2_BASE = "https://pub-5c80acab1a7448259a26f1161a3fe649.r2.dev/charttube/"
VIDEOFILES = Path("/Users/bobhopp/Sites/retroverse-site/data/VideoFiles.json")


def build_r2_url(file_path: str) -> str:
    encoded = quote(file_path, safe="/")
    return f"{R2_BASE}{encoded}"


def main() -> int:
    if not VIDEOFILES.exists():
        print(f"❌ ERROR: File not found: {VIDEOFILES}")
        return 1

    try:
        with open(VIDEOFILES, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ ERROR: Failed to read {VIDEOFILES}: {e}")
        return 1

    if not isinstance(data, list):
        print(f"❌ ERROR: Expected list in {VIDEOFILES}")
        return 1

    fixed = 0
    for v in data:
        if not isinstance(v, dict):
            continue
        file_path = v.get("FilePath")
        if not file_path:
            continue
        v["R2Url"] = build_r2_url(str(file_path))
        fixed += 1

    try:
        with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8") as tmp:
            json.dump(data, tmp, indent=2, ensure_ascii=False)
            tmp.write("\n")
            tmp_path = tmp.name
        os.replace(tmp_path, VIDEOFILES)
    except Exception as e:
        print(f"❌ ERROR: Failed to write {VIDEOFILES}: {e}")
        return 1

    print(f"Fixed {fixed} video paths")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
