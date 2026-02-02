# Game Engine Guide

This guide is the implementation reference for all RetroVerse game engines. All field names, examples, and validation rules are based on `docs/schemas/song-registry.schema.json` and `docs/schemas/video-index.schema.json`.

## 1. Introduction

### What "game engine" means in RetroVerse
A RetroVerse game engine is a deterministic ruleset that converts a curated subset of the data layer into interactive game rounds. It does not own media assets. It consumes canonical metadata and delegates video resolution and playback.

### Layer relationship
```
Data Layer
  song-registry.json  (canonical song metadata)
  video-index.json    (canonical video lookup)
       |
       v
Core Services
  RegistryLoader  VideoLookup  Randomizer  Scoring
       |
       v
Game Logic Layer (engine-specific rules)
       |
       v
Playback Bridge (video playback adapter)
```

### songId is the join key
`songId` is the stable identifier that links every layer. Game engines always select songs by `songId`, and video resolution happens by `songId` through the Video Lookup service.

## 2. Core Shared Services

### RegistryLoader service
- Loads `song-registry.json`.
- Validates against `song-registry.schema.json`.
- Provides indexed access by `songId`, `year`, `decade`, and `artist`.
- Rejects or flags entries missing required fields:
  - `songId`, `title`, `artist`, `year`, `chartHistory`.

Suggested interface:
```
loadRegistry(path): Registry
getSong(songId): Song
filterByYear(year): Song[]
filterByDecade(decadeLabel): Song[]
```

### VideoLookup service
- Loads `video-index.json`.
- Validates against `video-index.schema.json`.
- Resolves video entries by `songId`.
- Provides fallback resolution when a `songId` match is missing.

Suggested interface:
```
loadVideoIndex(path): VideoIndex
resolveBySongId(songId): VideoRecord | null
resolveFallback(title, artist, year): VideoRecord | null
```

### Randomizer service
- Provides deterministic randomness per session/seed.
- Supports weighted selection (by `peakPosition` or chart position).
- Prevents repeats within a round or session window.

Suggested interface:
```
pickOne(list, options): Item
pickMany(list, count, options): Item[]
```

### Scoring service template
- Scoring is engine-specific but uses a shared template:
  - base points
  - time factor
  - streak multiplier
  - hint penalty

Suggested interface:
```
scoreAttempt({ base, timeMs, hintsUsed, streak }): ScoreResult
```

## 3. Hit Parade Engine (full implementation guide)

### Rules of the game
- Player is presented with a song prompt (video or metadata).
- Player must identify the correct `title` and `artist`.
- Correct answers score more when the song is more difficult (older year, lower chart position, or less common).

### Required fields from song-registry.json
- `songId` (identity)
- `title` (answer)
- `artist` (answer)
- `year` (difficulty weighting)
- `peakPosition` (optional difficulty weighting)
- `chartHistory[]` (for tie-break and validation)

### How to resolve videos
1. Call `VideoLookup.resolveBySongId(songId)`.
2. If not found, attempt `resolveFallback(title, artist, year)` using `video-index.json` fields.
3. If still not found, return a "missing video" state to the Playback Bridge.

### Pseudocode for question generation
```
function buildHitParadeQuestion(registry, videoLookup, randomizer):
  pool = registry.allSongs()
  candidate = randomizer.pickOne(pool, { weightBy: "peakPosition", avoidRecent: true })

  video = videoLookup.resolveBySongId(candidate.songId)
  if video is null:
    video = videoLookup.resolveFallback(candidate.title, candidate.artist, candidate.year)

  return {
    songId: candidate.songId,
    prompt: {
      title: candidate.title,
      artist: candidate.artist,
      year: candidate.year
    },
    video: video
  }
```

### Difficulty scaling
- Easy: newer years, high `peakPosition` (1-10), full metadata shown.
- Medium: wider year range, `peakPosition` up to 40, partial metadata shown.
- Hard: any year, all `peakPosition`, video-only prompt with no text.

## 4. Name That Year Engine

### Rules
- Player sees a song prompt (title/artist or video).
- Player must guess the `year`.

### How to derive decades and year hints
- `decade` is derived from `year` (e.g., 1984 -> "1980s") if not supplied.
- Hints can reveal the decade label or a +/- range around the year.

### Implementation recipe
1. Select a `songId` using Randomizer.
2. Determine `year` and derive `decade` if missing.
3. Generate hint text from `year` and `decade`.
4. Resolve video using VideoLookup.

### Pseudocode for generating a round
```
function buildNameThatYearRound(registry, videoLookup, randomizer):
  song = randomizer.pickOne(registry.allSongs(), { avoidRecent: true })
  decade = song.decade ?? (floor(song.year / 10) * 10 + "s")

  video = videoLookup.resolveBySongId(song.songId)
  if video is null:
    video = videoLookup.resolveFallback(song.title, song.artist, song.year)

  return {
    songId: song.songId,
    year: song.year,
    decade: decade,
    hints: [decade],
    video: video
  }
```

## 5. Song Journey Engine

### How sequential chart history works
- `chartHistory[]` is an ordered list of chart weeks.
- Each entry includes `week` (YYYY-MM-DD) and `position`.
- The engine progresses through the sequence by `week`.

### Navigation rules
- Player moves forward or backward by week.
- Jumping is allowed only within the known `chartHistory[]`.
- If `chartHistory[]` has gaps, the engine skips missing weeks.

### Use of chartHistory[]
- Sort by `week` ascending.
- Use `position` to compute difficulty (lower numbers are harder).

### Pseudocode for step-by-step progression
```
function buildSongJourneyState(song):
  history = sortByWeek(song.chartHistory)
  return { songId: song.songId, index: 0, history: history }

function nextStep(state):
  if state.index + 1 >= state.history.length:
    return { done: true }
  state.index += 1
  return { done: false, week: state.history[state.index].week, position: state.history[state.index].position }
```

## 6. Wayback Console Core

### Real-time random year navigation
- On "surprise me", pick a random `year` from the registry range.
- Select a random song from that year.

### Video resolution flow
1. Resolve by `songId`.
2. Fallback by `title`, `artist`, `year`.
3. If unresolved, pass a missing video state to the Playback Bridge.

### Integrating the Video Playback Bridge
The Wayback Console core never plays media directly. It delegates the resolved `paths` or `playback` info to the Playback Bridge.

### Pseudocode
```
function goToYear(registry, year):
  songs = registry.filterByYear(year)
  return randomizer.pickOne(songs)

function nextVideo(state, registry):
  songs = registry.filterByYear(state.year)
  state.index = (state.index + 1) % songs.length
  return songs[state.index]

function surpriseMe(registry, randomizer):
  year = randomizer.pickOne(registry.availableYears())
  return goToYear(registry, year)
```

## 7. Integration with Video Playback Bridge

### How engines call the Video Lookup Service
- Engine selects a `songId`.
- Engine calls `VideoLookup.resolveBySongId(songId)`.
- Engine passes the resolved `videoId`, `paths`, and `playback` to the Playback Bridge.

### Missing video behavior
- If resolution fails, return a structured error with `songId`.
- The Playback Bridge should display a placeholder and allow skip or retry.

### Fallback order
1. `playback.localFile` (if present)
2. `playback.streamUrl` (if present)
3. `paths.absolute`
4. `paths.relative`
5. `playback.fallback` (if present)

## 8. Data Validation and Error Handling

### No chartHistory
- Reject the entry during RegistryLoader validation.
- If already loaded, block Song Journey Engine for that `songId`.

### Video resolution fails
- Mark the round as "videoMissing".
- Provide text-only prompt as fallback.

### Malformed metadata
- Log the `songId` or `videoId`.
- Skip the entry and report in a validation summary.

### Logging for repair
- Maintain a structured log:
  - `type` (missing_video | invalid_song | invalid_video)
  - `songId` or `videoId`
  - `details`

## 9. Performance Considerations

### Caching strategies
- Cache `songId -> Song` and `songId -> VideoRecord`.
- Cache by `year` and `decade` indexes.

### Preloading registry subsets
- For each engine, preload only the fields used:
  - Hit Parade: `songId`, `title`, `artist`, `year`, `peakPosition`
  - Name That Year: `songId`, `title`, `artist`, `year`
  - Song Journey: `songId`, `chartHistory`
  - Wayback Console: `songId`, `year`

### Minimizing lookup latency
- Resolve video once per round and reuse.
- Avoid repeated sorting of `chartHistory[]`.

### Preparing for many files
- Stream-load the registry and index to build in-memory maps.
- Keep indexes compact (strings and integers only).

## 10. Implementation Checklist

### Engine implementation requirements
- RegistryLoader (schema validation in place)
- VideoLookup (schema validation in place)
- Randomizer (seeded)
- Scoring template integrated
- Playback Bridge connection

### Data checklist
- Every song has `songId`, `title`, `artist`, `year`, `chartHistory[]`.
- `chartHistory[].week` is valid date and ordered.
- Every video has `songId`, `videoId`, `source`, and `paths`.

### Testing stages
- Schema validation tests (registry and video index).
- Unit tests for services (RegistryLoader, VideoLookup, Randomizer, Scoring).
- Engine simulation tests (round generation).
- Playback integration tests (missing video handling).
