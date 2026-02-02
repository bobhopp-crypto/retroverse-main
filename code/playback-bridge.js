/*
RetroVerse Playback Bridge (LOCKED)

Purpose:
- Translate a VirtualDJ FilePath into a remotely playable R2 URL.

Reads:
- retroverse-config.json
- VideoFiles.json (pipeline output, READ-ONLY)

Source of Truth:
- VirtualDJ filenames (FilePath field)
- This module does NOT normalize, scrub, or infer metadata.

Public API:
- createPlaybackBridge()
- bridge.getPlayable(FilePath) → { url }

Guarantees:
- No dependency on video-index.json
- No schema enforcement
- No filesystem writes
- No side effects

Non-Goals (Do NOT add):
- Matching logic
- Validation layers
- Index rebuilding
- Metadata enrichment

If this file works, DO NOT TOUCH IT.
*/

import fs from "fs";
import path from "path";

export function createPlaybackBridge() {
  const configPath = new URL("./retroverse-config.json", import.meta.url);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  const { vdjVideoFilesPath, videoRoot, r2BaseUrl } = config;

  if (!vdjVideoFilesPath || !videoRoot || !r2BaseUrl) {
    throw new Error("retroverse-config.json must define vdjVideoFilesPath, videoRoot, and r2BaseUrl");
  }

  const vdjData = JSON.parse(fs.readFileSync(vdjVideoFilesPath, "utf8"));

  const map = new Map();

  for (const entry of vdjData) {
    if (!entry.FilePath) continue;

    const relative = path.relative(videoRoot, entry.FilePath);
    const url =
      r2BaseUrl.replace(/\/$/, "") +
      "/" +
      relative.replace(/\\/g, "/");

    map.set(entry.FilePath, url);
  }

  return {
    getPlayable(localPath) {
      if (!map.has(localPath)) {
        throw new Error("Video not found");
      }
      return { url: map.get(localPath) };
    }
  };
}
