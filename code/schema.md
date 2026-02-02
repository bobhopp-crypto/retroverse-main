# Retroverse Shared Song Contract

## What a “song” means here
A “song” is a consistent identity used across Retroverse games, Wayback, and the Video Library. This layer does not load data, render UI, or assume a framework. It only defines stable identifiers and link formats.

## Why the ID exists
The canonical ID prevents:
- mismatched songs due to punctuation or case differences
- duplicate records across games and experiences
- accidental drift when multiple teams invent their own IDs

## Identity vs Context
**Song Identity (timeless):**
- ARTIST__TITLE
- Used for canonical matching and linking across Retroverse

**Song Context (situational):**
- year (release year, chart year, reissue year)
- chart metadata (peak, weeks, first/last week)
- variant or mix (live, extended, remaster, video edit)
- source or collection (chart run, playlist, dataset)

Context enriches discovery and filtering but never changes identity.

## ID format
ARTIST__TITLE

- ARTIST: required
- TITLE: required

Normalization rules:
- uppercase
- remove punctuation
- collapse whitespace
- spaces become underscores

Example:
- Input: { artist: "Michael Jackson", title: "Billie Jean", year: 1983 }
- ID: MICHAEL_JACKSON__BILLIE_JEAN

## Required vs optional fields
Required:
- artist
- title

## Parse and validation
- parseSongId(id) returns { artist, title }
- isValidSongId(id) enforces required parts and valid format

## Links and lanes
This shared layer only builds URLs as strings. Games, Wayback, and Video Library must consume these IDs directly without re-normalizing or inventing new formats.

Example links:
- /video-library/?song=MICHAEL_JACKSON__BILLIE_JEAN
- /video-library/?song=MICHAEL_JACKSON__BILLIE_JEAN&year=1983
- /games/hangman.html?song=MICHAEL_JACKSON__BILLIE_JEAN
- /wayback/?date=1984-06-23

## Rationale: Why year is excluded from identity
Year is contextual and inconsistent across sources. Chart year, release year, reissue year, and peak year can all differ for the same song. Retroverse is discovery-focused, so keeping identity stable while attaching year as context avoids accidental fragmentation and supports multiple versions without inventing new IDs.

## DO NOT rules
- Do not invent new song IDs outside this contract.
- Do not alter IDs at runtime.
- Do not use UI or framework assumptions here.
- Do not hardcode eras, colors, or game lists in this layer; those must come from the shared config file used by host apps.
