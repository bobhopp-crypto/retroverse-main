# Billboard Hot 100 Song Trajectories Schema

## Data Model

Each song in `hot100_song_trajectories.json` contains the following fields:

### Core Fields

- `work_id` (string|number): Unique identifier for the work
- `artist` (string|null): Artist name (display format)
- `title` (string): Song title (display format)
- `key_display` (string): "Artist - Title" or "Title" if no artist
- `key_norm` (string): Normalized key for matching (lowercase, no punctuation)
- `entered_chart` (string|null): First chart appearance date (YYYY-MM-DD)
- `final_chart_week` (string|null): Last chart appearance date (YYYY-MM-DD)
- `peak_position` (number|null): Best rank achieved (1-100)
- `weeks_on_chart_total` (number): Total weeks on Hot 100
- `weeks_top10` (number): Weeks in Top 10
- `weeks_top20` (number): Weeks in Top 20
- `weeks_top40` (number): Weeks in Top 40
- `top40_entered` (string|null): First Top 40 entry date (YYYY-MM-DD)
- `top40_exited` (string|null): Last Top 40 exit date (YYYY-MM-DD)
- `weeks_in_top40` (number): Total weeks in Top 40
- `before_top40_weeks` (number): Weeks on chart before entering Top 40
- `after_top40_weeks` (number): Weeks on chart after exiting Top 40
- `reentries_top40` (number): Number of distinct Top 40 entry segments
- `entry_type` (string): "no_top40" | "breakout" | "slow_climb"
- `decay_type` (string|null): "immediate_fade" | "short_tail" | "slow_decline" | "long_tail"
- `resurgence` (boolean): True if song re-entered Top 40 after exiting
- `has_video` (boolean): True if video exists in VDJ library

### History Fields

#### `full_hot100_history` (array, NEW)

Complete weekly Hot 100 history for the song. Each entry:

```typescript
{
  week: "YYYY-MM-DD",    // Chart date
  position: number|null   // Rank 1-100, or null if not charted that week
}
```

**Example:**
```json
{
  "full_hot100_history": [
    { "week": "1984-02-11", "position": 83 },
    { "week": "1984-02-18", "position": 65 },
    { "week": "1984-02-25", "position": 20 },
    { "week": "1984-03-03", "position": 7 },
    { "week": "1984-03-10", "position": 4 }
  ]
}
```

#### `weekly_positions` (array, DEPRECATED - for backward compatibility)

Top 40 positions only. Format:

```typescript
{
  week: number,          // Sequential week index (1, 2, 3...)
  date: "YYYY-MM-DD",    // Chart date
  rank: number           // Rank 1-40
}
```

**Note:** This field is maintained for backward compatibility. New code should use `full_hot100_history` and derive slices dynamically.

## Derived Arrays

The following arrays are derived from `full_hot100_history` at runtime:

### `top40_history`

All weeks where `position <= 40`, extracted from `full_hot100_history`.

### `pre_top40_history`

All weeks where `position > 40` before the first Top 40 entry, extracted from `full_hot100_history`.

### `post_top40_history`

All weeks where `position > 40` after the last Top 40 entry, extracted from `full_hot100_history`.

## Derivation Logic

```javascript
const positions = full_hot100_history.map(p => p.position);

// Find first and last Top40 week
const firstTop40 = positions.findIndex(p => p && p <= 40);
const lastTop40 = positions.map(p => p && p <= 40).lastIndexOf(true);

// Derive slices
const pre_top40_history = full_hot100_history.slice(0, firstTop40);
const top40_history = full_hot100_history.slice(firstTop40, lastTop40 + 1);
const post_top40_history = full_hot100_history.slice(lastTop40 + 1);
```

## Data Sources

- **Primary:** SQLite database (`billboard-hot-100.db`)
- **Import:** CSV files via `import_billboard_history.js`
- **Export:** `export_hot100_song_trajectories.py`

## Matching Strategy

When importing from CSV:

1. **Exact match by `work_id`** (preferred)
2. **Fuzzy match by normalized `title + artist`** (fallback)

Normalization: lowercase, remove punctuation, collapse whitespace.
