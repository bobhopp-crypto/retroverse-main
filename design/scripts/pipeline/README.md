# Thumbnail Generation Pipeline — v1 (LOCKED)

## Overview

Deterministic thumbnail generation pipeline that processes frozen VirtualDJ snapshots. Thumbnails are generated from Cue 8 when available, preserving existing thumbnails when Cue 8 is missing.

## Core Rules (LOCKED v1)

- **Source of truth**: Use `snapshots/latest/` only
- **Never read live files directly**
- **VirtualDJ must be closed** before pipeline runs
- **Cue 8 priority**: If Cue 8 exists, generate thumbnail from Cue 8 and overwrite existing
- **No cue fallback**: If Cue 8 does not exist, do not overwrite existing thumbnails
- **Every decision must be logged**

**Cue-8 overwrite behavior is intentional and locked for v1.**  
**VirtualDJ must be closed before execution.**  
**Snapshots guarantee a frozen source state.**

## Repository Roles (LOCKED v1)

- **retroverse-data** = **DATA AUTHORITY**
  - All data generation and freezing happens here
  - Contains `scripts/snapshot-freeze.js` and `scripts/extract-firstseen.js`

- **retroverse-design** = **READ-ONLY CONSUMER**
  - Consumes frozen snapshots via symlink
  - Generates thumbnails and website assets
  - Never generates or freezes data

## Prerequisites

1. **VirtualDJ must be closed** before running the pipeline
2. **Frozen snapshot** must exist (created in data repo):
   - `retroverse-data/snapshots/latest/database.xml` (VirtualDJ database)
   - `retroverse-data/snapshots/latest/VideoFiles.json` (Video metadata)
3. **Symlink** must exist (created automatically):
   - `retroverse-design/snapshots` → `retroverse-data/snapshots`
4. **ffmpeg** must be installed and available in PATH
5. **Source video files** must be accessible at paths specified in `VideoFiles.json` (`SourcePath` field)

## Usage

### Step 1: Freeze Snapshot (in data repo)

```bash
cd ~/Sites/retroverse-data
node scripts/snapshot-freeze.js
```

### Step 2: Enrich (in data repo)

```bash
cd ~/Sites/retroverse-data
node scripts/extract-firstseen.js
```

### Step 3: Publish to Website

```bash
cp ~/Sites/retroverse-data/output/reports/VideoFiles.enriched.json \
   ~/Sites/retroverse-design/public/data/VideoFiles.json
```

### Step 4: Generate Thumbnails (in design repo)

```bash
cd ~/Sites/retroverse-design
npm run pipeline:thumbnails
```

The pipeline automatically:
- Checks for symlink `retroverse-design/snapshots` → `retroverse-data/snapshots`
- Creates symlink if missing
- Reads from `snapshots/latest/` (via symlink)

## Inputs

- `snapshots/latest/database.xml` - VirtualDJ database containing Cue 8 information
- `snapshots/latest/VideoFiles.json` - Video metadata with FilePath and SourcePath

## Outputs

### Thumbnails
- **Location**: `output/thumbnails/`
- **Structure**: Mirrors website folder structure (decade/grouping)
- **Format**: JPEG (high quality, `-q:v 2`)
- **Naming**: `{Artist} - {Title}.jpg` (derived from FilePath)

### Report
- **Location**: `output/reports/thumbnails.report.json`
- **Contents**:
  - Summary counts (total, generated, overwritten, skipped, missing, failed)
  - Per-file actions with reasons

### Website Handoff
- **Location**: `public/thumbnails/`
- **Behavior**: Thumbnails generated/overwritten from Cue 8 are automatically copied here
- **No renaming or transformation** at this stage

## Behavior

### Cue 8 Exists
1. Generate thumbnail from Cue 8 time position
2. **Overwrite** any existing thumbnail
3. Copy to `public/thumbnails/`
4. Log as `generated_from_cue` or `overwritten_from_cue`

### Cue 8 Missing
1. **Do not overwrite** existing thumbnails
2. If thumbnail exists: log as `skipped_existing`
3. If thumbnail missing: log as `missing_cue` (no generation)

### Failures
- Video file not found
- ffmpeg errors
- Permission issues
- Logged as `failed` with error message

## Report Structure

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "summary": {
    "total": 1000,
    "generated_from_cue": 150,
    "overwritten_from_cue": 50,
    "skipped_existing": 700,
    "missing_cue": 80,
    "failed": 20
  },
  "actions": [
    {
      "filePath": "1960's/Artist - Title.mp4",
      "action": "overwritten_from_cue",
      "cueTime": 45.2,
      "thumbnailPath": "output/thumbnails/1960's/Artist - Title.jpg"
    }
  ]
}
```

## Deterministic Behavior

Running the pipeline twice produces identical results:
- Same thumbnails generated
- Same overwrite decisions
- Same skip decisions
- Same report structure

## Next Phase

After thumbnail generation:
- NAS → R2 sync & verification
- Thumbnail index generation
- Website deployment
