---
type: design-model
title: Video Library Design Model
version: 1
---

## Data Source
dataset: /data/VideoFiles.json

# Video Library – Design Specification

## Overview

The RetroVerse Video Library is the fast, DJ-oriented browsing interface used to search, filter, and explore music videos from the VirtualDJ export. This is a **v1 design** focused on speed, simplicity, and minimal friction, while allowing future RetroVerse features to plug in later.

## User Flows

- Load VideoLibrary data as JSON on page init and display all videos
- Search videos using text input filtering against tokenized search fields (title, artist, genre, grouping)
- Filter videos by decade using filter chips (1950s, 1960s, ... 2020s)
- Sort videos by A–Z (sortTitle), Popularity (playCount), or Year
- View video details by clicking on a VideoFileListItem, which opens VideoDetailOverlay
- Close VideoDetailOverlay by pressing ESC, clicking outside, or clicking the close button

## UI Requirements

### VideoLibraryHome Screen
- Header: "Video Library"
- Subheader: Count of videos displayed vs total
- Main Pane: Scrollable list of VideoFileListItem components
- Filters Bar:
  - Search box (text input)
  - Decade filter chips ("1950s", "1960s", etc.)
  - Sort buttons (A–Z, Popularity, Year)
- Footer placeholder for future timeline / nostalgia navigation (inactive in v1)
- All filters apply client-side with instant updates, no page reload

### VideoFileListItem Component
- Compact 3-line list element optimized for scanning
- Line 1: Title (bold)
- Line 2: Artist (smaller)
- Line 3: Metadata bar with Year, Duration (MM:SS), Genre, and PlayCount (right-aligned)
- Thumbnail (if local cached or URL exists; otherwise placeholder)
- On click: opens VideoDetailOverlay
- On hover (desktop): shows quick actions placeholder (not active)

### VideoDetailOverlay (Simple Modal)
- Modal centered on screen with darkened backdrop
- Thumbnail (full width)
- Title, Artist, Year, Genre, Duration, PlayCount
- File path (optional)
- Close button (top right)
- ESC closes modal, clicking outside closes modal
- Data maps directly from VideoFile fields

### FiltersDrawer / FilterBar Component
- Search box filtering against searchTokens
- Decade chips: "1950s", "1960s", … "2020s"
- Sort toggle group: A–Z (sortTitle), Popularity (playCount), Year
- Search filters against searchTokens, decade filters reduce dataset, sort applies last

## Future Feature Hooks (v2+, inactive)

These are **design placeholders only** — no functionality required in v1. They allow DesignOS to evolve the UI later without rewriting everything.

- Era Lens (inactive): Adds decade-based ambient visuals and transitions
- Nostalgia Timeline Mode (inactive): Shows a horizontal, scrollable timeline of videos by year
- Related Videos / More Like This (inactive): Similarity-based suggestions
- Playlist Drawer (inactive): Right-side panel for building a playlist
- Metadata Enhancement Ribbon (inactive): Shows missing fields and suggested enrichments
- "Era Lens" toggle button (inactive in v1)
- "More Like This" context panel (inactive in v1)
- Timeline slider (inactive in v1)
- Animated transitions between decades (inactive in v1)
- Add-to-playlist button (inactive in VideoDetailOverlay)
- "More Like This" recommendation preview (inactive in VideoDetailOverlay)
- Link to RetroVerse entity graph (inactive in VideoDetailOverlay)
