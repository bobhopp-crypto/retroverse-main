#!/bin/zsh
set -e
cd "$(dirname "$0")"
python3 data/scripts/rv_vdj_export_videos.py
python3 data/scripts/rv_generate_thumbnails.py
cd site && ./sync-data.sh
echo "DATA + THUMBNAILS SYNCED"
