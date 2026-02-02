---
type: data-model
title: Video Library Data Model
version: 1
---

# Video Library Data Model (RetroVerse Workbench)

This schema defines the **VideoFile** object — the core entity powering the RetroVerse Video Library (workbench mode).  
All fields are guaranteed by the VirtualDJ export or derived during normalization.

---

## Entities

### VideoFile
The core entity representing a video file in the RetroVerse library.

**Identification:**
- `id: string` - Stable ASCII ID used internally for rendering and playlist persistence.

**Core Metadata:**
- `title: string`
- `artist: string`
- `year: number` - `0` allowed (unknown year)

**File Info:**
- `path: string` - Local or cloud pathname to the MP4 file
- `filesize: number`

**Play & Rating Data:**
- `playCount: number` - Defaults to `0` if missing
- `stars: number` - 0–5 internal rating
- `popularity: "HEAVY" | "MED" | "LIGHT" | "NEW"` - Derived from playCount and stars during normalization

**Musical Data:**
- `bpm: number | null`
- `key: string | null`
- `durationSec: number` - From VDJ Scan/Infos → SongLength

**Discovery & Organization:**
- `genre: string | null`
- `grouping: string | null` - Used for Midnight Special / live categories, etc.
- `decade: string` - Derived ("1950s", "1960s", etc.) - Anything <1950 → "1950s" bucket, Anything >2020 → "2020s+"

**Thumbnail Data:**
- `thumbnailTime: number` - Default 30s, overridden when Cue 8 is set in VirtualDJ
- `thumbnailUrl: string | null` - Local or cloud URL, cached filename based on ID + timestamp

**Derived UI Fields:**
- `sortArtist: string` - Normalized for A–Z dial
- `sortTitle: string`
- `searchTokens: string[]` - Title, Artist, Genre, Grouping → pre-tokenized for fast search

### VideoLibrary
The top-level collection of VideoFile entities. Represents the complete video library managed by RetroVerse.

---

## Relationships

- VideoLibrary contains many VideoFile
