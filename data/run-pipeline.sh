#!/usr/bin/env bash
set -euo pipefail

################################################################################
# VDJ Supervised Pipeline — Git-Staging Approval Gate
# Phase 2.5 Implementation (CLEANED & FIXED)
################################################################################

# ==========================================================================
# CONFIGURATION
# ==========================================================================

PROJECT_ROOT="$HOME/Sites/retroverse-data"
VDJ_DATABASE="/Users/bobhopp/Library/Application Support/VirtualDJ/database.xml"

# Your confirmed working export script
PYTHON_SCRIPT="$PROJECT_ROOT/scripts/rv_vdj_export_videos.py"

# Optional thumbnail script
THUMBNAIL_SCRIPT="$PROJECT_ROOT/generate-thumbnails.js"

SNAPSHOT_DIR="$PROJECT_ROOT/snapshots"
LOG_DIR="$PROJECT_ROOT/logs"
STAGING_AREA="$PROJECT_ROOT/staging-area"
PUBLIC_DATA="$PROJECT_ROOT/public/data"
PUBLIC_THUMBNAILS="$PROJECT_ROOT/public/thumbnails"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RUN_SNAPSHOT="$SNAPSHOT_DIR/pre-run/$TIMESTAMP"
LOG_FILE="$LOG_DIR/vdj-run-$TIMESTAMP.log"

# ==========================================================================
# INITIALIZATION
# ==========================================================================

mkdir -p "$SNAPSHOT_DIR/pre-run" "$LOG_DIR" "$STAGING_AREA" "$PUBLIC_DATA" "$PUBLIC_THUMBNAILS"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "VDJ Supervised Pipeline — $TIMESTAMP"

# ==========================================================================
# STAGE 1 — SNAPSHOT
# ==========================================================================

mkdir -p "$RUN_SNAPSHOT"

[ -f "$VDJ_DATABASE" ] && cp "$VDJ_DATABASE" "$RUN_SNAPSHOT/database.xml"
[ -f "$PUBLIC_DATA/VideoFiles.json" ] && cp "$PUBLIC_DATA/VideoFiles.json" "$RUN_SNAPSHOT/VideoFiles.json"
[ -d "$PUBLIC_THUMBNAILS" ] && cp -R "$PUBLIC_THUMBNAILS" "$RUN_SNAPSHOT/" 2>/dev/null || true

echo "Snapshot saved: $RUN_SNAPSHOT"

# ==========================================================================
# STAGE 2 — DATA EXTRACTION
# ==========================================================================

echo "Running VDJ export script…"
python3 "$PYTHON_SCRIPT"

# ==========================================================================
# LOCATE GENERATED VideoFiles.json (FIXED)
# ==========================================================================

GENERATED_JSON="$PROJECT_ROOT/exports/vdj/VideoFiles.json"

if [ ! -f "$GENERATED_JSON" ]; then
  echo "ERROR: Expected VideoFiles.json not found at:" >&2
  echo "  $GENERATED_JSON" >&2
  exit 1
fi

cp "$GENERATED_JSON" "$STAGING_AREA/VideoFiles.json"

echo "Staged VideoFiles.json"

# ==========================================================================
# STAGE 2B — THUMBNAILS (OPTIONAL)
# ==========================================================================

if [ -f "$THUMBNAIL_SCRIPT" ]; then
  export THUMBNAIL_SOURCE_JSON="$STAGING_AREA/VideoFiles.json"
  export THUMBNAIL_OUTPUT_DIR="$STAGING_AREA/thumbnails"
  export THUMBNAIL_CUE8_PRIORITY=true
  mkdir -p "$STAGING_AREA/thumbnails"
  python3 scripts/rv_generate_thumbnails.py || echo "Thumbnail generation failed (non-fatal)"
fi

# ==========================================================================
# STAGE 3 — GIT STAGING
# ==========================================================================

cd "$PROJECT_ROOT"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || git init

git checkout main 2>/dev/null || git checkout -b main

git branch -D data-staging 2>/dev/null || true
git checkout -b data-staging

cp "$STAGING_AREA/VideoFiles.json" "$PUBLIC_DATA/VideoFiles.json"
[ -d "$STAGING_AREA/thumbnails" ] && cp -R "$STAGING_AREA/thumbnails/"* "$PUBLIC_THUMBNAILS/" 2>/dev/null || true

git add "$PUBLIC_DATA/VideoFiles.json" "$PUBLIC_THUMBNAILS" || true

if git diff --cached --quiet; then
  echo "No changes detected. Exiting."
  git checkout main
  exit 0
fi

git commit -m "VDJ Pipeline Run $TIMESTAMP"

git checkout main

# ==========================================================================
# STAGE 4 — APPROVAL GATE
# ==========================================================================

echo ""
echo "PIPELINE COMPLETE — AWAITING APPROVAL"
echo "Review: git diff main..data-staging"
echo "Approve: git merge data-staging"
echo "Reject: git branch -D data-staging"
