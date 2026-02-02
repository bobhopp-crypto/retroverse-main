#!/bin/zsh
set -euo pipefail

JSON="/Users/bobhopp/Sites/retroverse-design/public/data/VideoFiles.json"

echo "[1/3] Converting VirtualDJ database → JSON..."
/Users/bobhopp/Sites/retroverse-design/scripts/vdj_to_videofiles.py

echo "[2/3] Uploading to R2..."
rclone copyto "$JSON" "R2media:data/VideoFiles.json" --s3-no-head --progress

echo "[3/3] Done."
