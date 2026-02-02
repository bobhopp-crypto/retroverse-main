# RetroVerse Pipeline — v1 (LOCKED)

## Repository Roles

- **retroverse-data** (`~/Sites/retroverse-data`) = **DATA AUTHORITY**
  - All data generation and freezing happens here
  - Source of truth for VirtualDJ exports
  - Contains: `scripts/snapshot-freeze.js`, `scripts/extract-firstseen.js`

- **retroverse-design** (`~/Sites/retroverse-design`) = **READ-ONLY CONSUMER**
  - Consumes frozen snapshots via symlink
  - Generates thumbnails and website assets
  - Never generates or freezes data

## How I Run This

### Phase 1 — Freeze Snapshot
```bash
cd ~/Sites/retroverse-data
node scripts/snapshot-freeze.js
```

**What it does:**
- Copies `database.xml` and `VideoFiles.json` to `snapshots/latest/`
- Creates frozen snapshot for deterministic processing

**Output:**
- `snapshots/latest/database.xml`
- `snapshots/latest/VideoFiles.json`

---

### Phase 2 — Enrich with DaysSinceAdded
```bash
cd ~/Sites/retroverse-data
node scripts/extract-firstseen.js
```

**What it does:**
- Enriches `VideoFiles.json` with `DaysSinceAdded` field
- Calculates days since first seen in VirtualDJ

**Output:**
- `output/reports/VideoFiles.enriched.json`

---

### Phase 3 — Publish to Website
```bash
cp ~/Sites/retroverse-data/output/reports/VideoFiles.enriched.json \
   ~/Sites/retroverse-design/public/data/VideoFiles.json
```

**What it does:**
- Copies enriched data to website public directory
- Website reads from `public/data/VideoFiles.json`

**Output:**
- `retroverse-design/public/data/VideoFiles.json`

---

### Phase 4 — Generate Thumbnails (Cue 8 Rules)
```bash
cd ~/Sites/retroverse-design
npm run pipeline:thumbnails
```

**What it does:**
- Reads from `snapshots/latest/` (via symlink to data repo)
- Generates thumbnails using Cue 8 when available
- Preserves existing thumbnails when Cue 8 is missing

**Rules (LOCKED v1):**
- ✅ If Cue 8 exists → generate/overwrite thumbnail
- ✅ If Cue 8 missing → preserve existing thumbnail
- ✅ Never touch source videos
- ✅ Always emit report

**Output:**
- `output/thumbnails/` (organized by decade/grouping)
- `output/reports/thumbnails.report.json`
- `public/thumbnails/` (copied for website)

---

## Symlink Setup (One-Time)

The thumbnail pipeline automatically creates this symlink if missing:

```
retroverse-design/snapshots → retroverse-data/snapshots
```

This allows the design repo to read frozen snapshots without copying files.

---

## Safety

**This pipeline is safe to interrupt and resume.**

- Each phase is independent
- No phase modifies source data
- Thumbnails are idempotent (same inputs = same outputs)
- Reports document every action

---

## Troubleshooting

**"snapshots/latest/ not found"**
- Run Phase 1 (Freeze) first
- Check symlink exists: `ls -la ~/Sites/retroverse-design/snapshots`

**"VideoFiles.json not found"**
- Run Phase 1 (Freeze) first
- Then run Phase 2 (Enrich)

**"database.xml not found"**
- Run Phase 1 (Freeze) first
- Ensure VirtualDJ data pipeline has been run in data repo

---

## Status: v1 LOCKED

No auto-detection, no configuration UIs, no format changes.
This is the canonical pipeline for v1.
