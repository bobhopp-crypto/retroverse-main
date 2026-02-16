#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_FILE="${ROOT_DIR}/artifacts/output/video-index.json"
DEST_DIR="${ROOT_DIR}/public/data"
DEST_FILE="${DEST_DIR}/video-index.json"

if [[ ! -f "${SOURCE_FILE}" ]]; then
  echo "Error: source file not found: ${SOURCE_FILE}" >&2
  exit 1
fi

mkdir -p "${DEST_DIR}"
cp "${SOURCE_FILE}" "${DEST_FILE}"

echo "Synced ${SOURCE_FILE} -> ${DEST_FILE}"
