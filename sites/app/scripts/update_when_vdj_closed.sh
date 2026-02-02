#!/bin/zsh
set -euo pipefail

VDJ_PROC="VirtualDJ"
DB="/Users/bobhopp/Library/Application Support/VirtualDJ/database.xml"
OUT="/Users/bobhopp/Sites/retroverse-design/public/data/VideoFiles.json"

# If VDJ is running → skip
if pgrep -x "$VDJ_PROC" >/dev/null 2>&1; then
  exit 0
fi

# If DB is newer than JSON → update + publish
if [[ ! -f "$OUT" ]] || [[ "$DB" -nt "$OUT" ]]; then
  /Users/bobhopp/Sites/retroverse-design/scripts/update_videofiles.sh
fi

exit 0
