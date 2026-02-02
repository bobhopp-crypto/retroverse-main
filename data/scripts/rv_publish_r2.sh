#!/usr/bin/env bash
# rv_publish_r2.sh
# Uploads VIDEO folder to R2 using rclone copy (append-only, safe).
# Uses shared detect_video_source: NAS preferred, Dropbox fallback. No credentials in code.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
R2_REMOTE="R2media"
R2_PATH="charttube/video"
LOG_DIR="${REPO_ROOT}/exports/reports"
LOG_FILE="${LOG_DIR}/r2_upload.log"
mkdir -p "${LOG_DIR}"

# Resolve VIDEO_SOURCE: use env if set and valid, else run shared helper (NAS > Dropbox)
if [ -n "${VIDEO_SOURCE:-}" ] && [ -d "${VIDEO_SOURCE}" ]; then
    SOURCE_TYPE="${VIDEO_SOURCE_TYPE:-EXPLICIT}"
else
    REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
    DETECT_OUT="$(python3 "${REPO_ROOT}/scripts/utils/video_source.py" 2>/dev/null)" || true
    if [ -z "${DETECT_OUT}" ]; then
        echo "❌ ERROR: No valid VIDEO source (NAS not mounted or empty, Dropbox missing or empty)."
        echo "   Mount NAS at /Volumes/RetroVerseNAS or set VIDEO_SOURCE to a path with .mp4 files."
        exit 1
    fi
    eval "${DETECT_OUT}"
    if [ -z "${VIDEO_SOURCE:-}" ] || [ ! -d "${VIDEO_SOURCE}" ]; then
        echo "❌ ERROR: VIDEO source missing or invalid: ${VIDEO_SOURCE:-<unset>}"
        exit 1
    fi
fi

# Validate rclone is available
if ! command -v rclone &> /dev/null; then
    echo "❌ ERROR: rclone not found. Install with: brew install rclone"
    exit 1
fi

# Validate R2 remote exists
if ! rclone listremotes | grep -q "^${R2_REMOTE}:$"; then
    echo "❌ ERROR: R2 remote '${R2_REMOTE}' not configured."
    echo "   Configure with: rclone config"
    exit 1
fi

# Preflight: count .mp4 and newest file (informational only; must never abort)
echo "--- Preflight Validation ---"
echo "Video source: ${SOURCE_TYPE} (${VIDEO_SOURCE})"
echo "Counting .mp4 files..."
MP4_COUNT=$(find "${VIDEO_SOURCE}" -type f -name "*.mp4" 2>/dev/null | wc -l | tr -d ' ') || MP4_COUNT=0
echo "  Total .mp4 files: ${MP4_COUNT}"

if [ "${MP4_COUNT}" -eq 0 ]; then
    echo "⚠️  WARNING: No .mp4 files found in ${VIDEO_SOURCE}"
    echo "   Continuing anyway..."
else
    echo "Finding newest file..."
    NEWEST_FILE=""
    # Must not abort: run fragile pipeline with set +e
    set +e
    NEWEST_FILE=$(find "${VIDEO_SOURCE}" -type f -name "*.mp4" -print0 2>/dev/null | \
        xargs -0 stat -f "%m %N" 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
    set -e
    if [ -n "${NEWEST_FILE}" ] && [ -f "${NEWEST_FILE}" ]; then
        NEWEST_MTIME=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "${NEWEST_FILE}" 2>/dev/null) || NEWEST_MTIME="unknown"
        echo "  Newest file: $(basename "${NEWEST_FILE}")"
        echo "  Modified: ${NEWEST_MTIME}"
    else
        echo "  (Could not determine newest file)"
    fi
fi
echo ""

# Log and run rclone
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
echo "[${TIMESTAMP}] Starting R2 upload from ${SOURCE_TYPE}:${VIDEO_SOURCE} to ${R2_REMOTE}:${R2_PATH}" | tee -a "${LOG_FILE}"
echo ""
echo "Starting R2 upload (this may take many hours)..."
echo ""

R2_OUTPUT=$(mktemp)
trap 'rm -f "${R2_OUTPUT}"' EXIT

set +e
rclone copy \
    "${VIDEO_SOURCE}/" \
    "${R2_REMOTE}:${R2_PATH}/" \
    --ignore-existing \
    --checksum \
    --fast-list \
    --progress \
    --stats=30s \
    --stats-one-line \
    --log-file "${LOG_FILE}" \
    --log-level INFO 2>&1 | tee "${R2_OUTPUT}"
RCLONE_EXIT=${PIPESTATUS[0]}
set -e

if [ "${RCLONE_EXIT}" -eq 0 ]; then
    TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
    echo ""
    echo "R2 upload completed successfully."
    if grep -qE "Transferred:[\t ]+0 / 0" "${R2_OUTPUT}" 2>/dev/null || grep -qE "Transferred:.*0 / 0.*0 B," "${R2_OUTPUT}" 2>/dev/null; then
        echo "(No new or changed files detected.)"
    else
        echo "[${TIMESTAMP}] ✅ R2 upload completed successfully" | tee -a "${LOG_FILE}"
    fi
    exit 0
else
    TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
    echo "[${TIMESTAMP}] ❌ R2 upload FAILED" | tee -a "${LOG_FILE}"
    exit 1
fi
