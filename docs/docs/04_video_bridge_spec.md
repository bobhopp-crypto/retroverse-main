# Video Playback Bridge Specification

This document is the authoritative specification for the RetroVerse Video Playback Bridge. All field references and examples are defined by `docs/schemas/video-index.schema.json`. The bridge is read-only and consumes only `video-index.json`. It must never modify `VideoFiles.json`, never write to the Video Library, and never depend on the Video Library’s internal structures.

## 1. Purpose of the Video Playback Bridge

### Safety layer
The bridge isolates game engines and UI components from the Video Library. It enforces a read-only contract and validates video metadata before any playback attempt.

### Read-only guarantee
- Never writes to disk.
- Never updates `video-index.json` or `VideoFiles.json`.
- Never assumes any internal directory structure of the Video Library.

### Single interface for games
RetroVerse games interface ONLY through the bridge. Game engines never access the Video Library directly.

## 2. Architecture Overview

### Components
- VideoIndexLoader
  - Loads and validates `video-index.json` against `video-index.schema.json`.
- VideoLookupService
  - Resolves `songId` to video records and handles deterministic fallback rules.
- VideoPlayerAdapter
  - Converts a resolved video record into a safe playback object for UI consumption.

### Relationship to game engines
```
Game Engine -> VideoLookupService -> VideoPlayerAdapter -> Video Player System
                     ^
                     |
               VideoIndexLoader
```

## 3. Data Flow Specification

### Step-by-step flow
1. Game Engine requests a video by `songId`.
2. VideoLookupService resolves to a video record from `video-index.json`.
3. VideoPlayerAdapter produces a playback object.
4. UI hands the playback object to the Video Player system.

### Sequence diagram
```
Game Engine      VideoLookupService     VideoPlayerAdapter     Video Player System
    |                    |                      |                      |
    | getVideoBySongId() |                      |                      |
    |------------------->|                      |                      |
    |                    | resolve record       |                      |
    |                    |--------------------->|                      |
    |                    |                      | build playback       |
    |                    |                      |--------------------->|
    |                    |                      | playback object       |
    |<-------------------|                      |                      |
```

## 4. API Specification (very important)

### Function signatures
```
loadVideoIndex(path): VideoIndex
getVideoBySongId(songId): VideoRecord | null
getVideosByArtist(artist): VideoRecord[]
getRandomVideo(): VideoRecord | null
validateVideoRecord(record): ValidationResult
```

### Example request/response payloads

Request:
```
getVideoBySongId("PRINCE_1999")
```

Response:
```
{
  "songId": "PRINCE_1999",
  "videoId": "vdj-000123",
  "title": "1999",
  "artist": "Prince",
  "year": 1982,
  "source": "vdj",
  "paths": {
    "relative": "Prince/1999.mp4",
    "absolute": "/Volumes/VideoLibrary/Prince/1999.mp4"
  },
  "playback": {
    "localFile": "file:///Volumes/VideoLibrary/Prince/1999.mp4",
    "streamUrl": null,
    "fallback": null
  }
}
```

Request:
```
getVideosByArtist("Prince")
```

Response:
```
[
  { "songId": "PRINCE_1999", "videoId": "vdj-000123", "paths": { "...": "..." } }
]
```

Request:
```
validateVideoRecord(record)
```

Response:
```
{ "valid": true, "errors": [] }
```

## 5. Fallback Rules

### Deterministic fallback logic
1. Primary: exact `songId` match.
2. Secondary: match by `title` + `artist` + `year` (if provided in index).
3. Tertiary: match by `title` + `artist`.
4. If multiple results remain, select the one with:
   - `source` preference order: `vdj`, `itunes`, `manual`, `unknown`.
   - If still tied, lowest lexical `videoId`.

### Missing songId in video-index.json
- Return `null`.
- Emit a structured log entry with `songId`.

### Video file doesn’t exist
- Do not attempt to repair or write to disk.
- Return a missing-video playback object (see Error Handling).

### Multiple videos qualify
- Apply deterministic selection rules above.
- Never randomize unless `getRandomVideo()` is explicitly called.

### Metadata malformed
- Mark record invalid using `validateVideoRecord`.
- Exclude from lookup results.

## 6. Error Handling

### Logging requirements
- Log at the bridge boundary (not the UI):
  - `type` (missing_video | invalid_video | resolution_error)
  - `songId` or `videoId`
  - `details`

### Fail-safe behaviors
- Game engines never crash on missing video.
- Provide safe null or placeholder playback object.

### Placeholder video policy
- If a placeholder is configured, use `playback.fallback`.
- If none configured, return a text-only prompt flag to UI.

## 7. Security & Safety Requirements

### Read-only enforcement
- No write operations to any file system path.
- No updates to `video-index.json` or any library metadata.

### No internal Video Library paths exposed to UI
- UI receives only playback-safe URLs or a placeholder.
- `paths.absolute` may be used internally but must not be surfaced in UI state.

### Normalized songIds
- `songId` must be treated as uppercase and pattern-validated as in schema.
- Reject any `songId` outside the schema’s allowed pattern.

## 8. Performance Considerations

### Caching strategy
- Load `video-index.json` once at startup.
- Store in a `songId -> record` map.
- Use an optional LRU cache for derived lookups by `artist`.

### Pre-warming lookups
- Game engine can pre-warm with current session playlist `songId`s.

### Handling large datasets
- Avoid repeated scans for `getVideoBySongId`.
- Keep a secondary index for `artist` to support `getVideosByArtist`.

## 9. Versioning & Evolution Plan

### Forward-compatible expansion
- New optional fields may be added to `video-index.json`.
- The bridge ignores unknown fields but preserves them in memory.

### Recommended version field
- Add `version` at the top level of `video-index.json` in future releases.
- Bridge should tolerate missing `version` and assume `"1.0"`.

## 10. Implementation Checklist

### Required before any game can use the bridge
- VideoIndexLoader implemented with schema validation.
- VideoLookupService implemented with deterministic fallback logic.
- VideoPlayerAdapter returns a safe playback object.
- Read-only enforcement verified.

### Required automated tests
- Schema validation tests for `video-index.json`.
- Deterministic selection tests for fallback rules.
- Missing video tests (null handling).

### Manual testing workflow
1. Load video index and validate.
2. Request a known `songId`.
3. Request a missing `songId` (expect safe null).
4. Request `getVideosByArtist` for a known artist.
5. Verify UI receives no internal path exposure.
