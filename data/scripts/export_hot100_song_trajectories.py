#!/usr/bin/env python3
"""
export_hot100_song_trajectories.py

Purpose:
  Export Hot 100 song trajectory data with classifications and video matching.

Inputs:
  - Database: /Users/bobhopp/Sites/retroverse-data/databases/billboard-hot-100.db
  - VDJ export: /Users/bobhopp/Sites/retroverse-data/exports/vdj/VideoFiles.json

Output:
  - JSON file: /Users/bobhopp/Sites/retroverse-site/public/data/hot100_song_trajectories.json

Computes per work_id:
  - Basic info (artist, title, key_display, key_norm)
  - Chart metrics (entered_chart, final_chart_week, peak_position, weeks counts)
  - Top 40 trajectory (entry/exit dates, weeks, before/after counts, reentries)
  - Classifications (entry_type, decay_type, resurgence flag)
  - Video matching (has_video from VDJ VideoFiles.json)
"""

import sqlite3
import json
import re
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# ---- CONFIG ----
DB_PATH = "/Users/bobhopp/Sites/retroverse-data/databases/billboard-hot-100.db"
VDJ_PATH = "/Users/bobhopp/Sites/retroverse-data/exports/vdj/VideoFiles.json"
TIMELINES_PATH = "/Users/bobhopp/Sites/retroverse-data/output/real_hot100_timelines.json"
OUTPUT_PATH = "/Users/bobhopp/Sites/retroverse-site/public/data/hot100_song_trajectories.json"
# ----------------


def normalize_key(text):
    """Normalize text for matching: lowercase, strip punctuation, collapse spaces."""
    if not text:
        return ""
    # Lowercase
    text = text.lower()
    # Remove punctuation except spaces
    text = re.sub(r'[^\w\s]', '', text)
    # Collapse multiple spaces to single space
    text = re.sub(r'\s+', ' ', text)
    # Strip
    return text.strip()


def load_real_timelines():
    """Load real weekly positions from real_hot100_timelines.json."""
    timelines = {
        'by_work_id': {},
        'by_key': {}
    }
    timelines_path = Path(TIMELINES_PATH)
    
    if not timelines_path.exists():
        print(f"Warning: Timeline file not found at {TIMELINES_PATH}")
        print("  Run build_real_hot100_timelines.py first to generate it")
        return timelines
    
    with open(timelines_path, 'r', encoding='utf-8') as f:
        timeline_data = json.load(f)
    
    if isinstance(timeline_data, dict):
        timelines['by_work_id'] = timeline_data.get('_by_work_id', {})
        timelines['by_key'] = timeline_data.get('_by_key', {})
    
    print(f"  Loaded {len(timelines['by_work_id'])} timelines by work_id")
    print(f"  Loaded {len(timelines['by_key'])} timelines by key")
    
    return timelines


def get_real_weekly_positions(work_id, artist, title, timelines):
    """Get real weekly positions for a song, if available."""
    # Try work_id first (most reliable)
    if work_id and work_id in timelines['by_work_id']:
        return timelines['by_work_id'][work_id]
    
    # Fallback to key matching
    if artist and title:
        key_display = f"{artist} - {title}"
        if key_display in timelines['by_key']:
            return timelines['by_key'][key_display]
    
    # Try just title
    if title:
        for key, positions in timelines['by_key'].items():
            if key.endswith(f" - {title}") or key == title:
                return positions
    
    return None


def load_vdj_keys():
    """Load normalized keys from VDJ VideoFiles.json where PlayCount >= 1."""
    vdj_keys = set()
    vdj_path = Path(VDJ_PATH)
    
    if not vdj_path.exists():
        print(f"Warning: VDJ file not found at {VDJ_PATH}")
        return vdj_keys
    
    with open(vdj_path, 'r', encoding='utf-8') as f:
        vdj_data = json.load(f)
    
    if not isinstance(vdj_data, list):
        print(f"Warning: VDJ data is not a list")
        return vdj_keys
    
    for entry in vdj_data:
        if not isinstance(entry, dict):
            continue
        
        # VDJ exports PlayCount as a string, so coerce to int safely
        play_count = entry.get("PlayCount", 0)
        try:
            play_count = int(play_count)
        except (ValueError, TypeError):
            play_count = 0
        
        if play_count < 1:
            continue
        
        artist = entry.get("Artist", "").strip()
        title = entry.get("Title", "").strip()
        
        if not title:
            continue
        
        if artist:
            key_display = f"{artist} - {title}"
        else:
            key_display = title
        
        key_norm = normalize_key(key_display)
        if key_norm:
            vdj_keys.add(key_norm)
    
    return vdj_keys


def compute_reentries_top40(rows):
    """Count distinct segments where rank <= 40 across time."""
    if not rows:
        return 0
    
    segments = 0
    in_top40 = False
    
    for row in rows:
        rank = row['rank']
        if rank is None:
            continue
        
        rank_num = int(rank) if isinstance(rank, (int, str)) and str(rank).isdigit() else 999
        currently_top40 = rank_num <= 40
        
        if currently_top40 and not in_top40:
            # Entering top 40
            segments += 1
            in_top40 = True
        elif not currently_top40 and in_top40:
            # Exiting top 40
            in_top40 = False
    
    return segments


def main():
    # Ensure output directory exists
    output_path = Path(OUTPUT_PATH)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Load real timeline data FIRST
    print("Loading real timeline data...")
    timelines = load_real_timelines()
    
    # Load VDJ keys for matching
    print("Loading VDJ keys...")
    vdj_keys = load_vdj_keys()
    print(f"  Loaded {len(vdj_keys)} VDJ keys")
    
    # Connect to database (will be used in loop for full Hot 100 positions)
    db_conn = sqlite3.connect(DB_PATH)
    db_conn.row_factory = sqlite3.Row
    
    # Query all work_ids with their chart data
    query = """
    SELECT
      w.work_id,
      w.title_display,
      p.name_display,
      e.issue_date,
      ee.rank
    FROM event_entry ee
    JOIN event e ON e.event_id = ee.event_id
    JOIN work w ON w.work_id = ee.work_id
    LEFT JOIN person p ON p.person_id = w.primary_person_id
    ORDER BY w.work_id, e.issue_date
    """
    
    print("Querying database...")
    rows = db_conn.execute(query).fetchall()
    
    # Group by work_id
    by_work = defaultdict(list)
    for row in rows:
        by_work[row['work_id']].append(row)
    
    print(f"  Found {len(by_work)} unique work_ids")
    
    # Process each work_id
    results = []
    
    for work_id, work_rows in by_work.items():
        # Sort by issue_date
        work_rows.sort(key=lambda r: r['issue_date'] or '')
        
        # Get basic info from first row
        first_row = work_rows[0]
        artist = first_row['name_display'] if first_row['name_display'] else None
        title = first_row['title_display'] or None
        
        if not title:
            continue
        
        # Build key_display and key_norm
        if artist:
            key_display = f"{artist} - {title}"
        else:
            key_display = title
        
        key_norm = normalize_key(key_display)
        
        # Compute basic metrics
        issue_dates = [r['issue_date'] for r in work_rows if r['issue_date']]
        ranks = []
        for r in work_rows:
            rank_val = r['rank']
            if rank_val is not None:
                try:
                    rank_num = int(rank_val) if isinstance(rank_val, (int, str)) else None
                    if rank_num and rank_num > 0:
                        ranks.append(rank_num)
                except (ValueError, TypeError):
                    pass
        
        if not issue_dates or not ranks:
            continue
        
        entered_chart = min(issue_dates)
        final_chart_week = max(issue_dates)
        peak_position = min(ranks)
        weeks_on_chart_total = len(work_rows)
        
        # Top 40 metrics
        top40_rows = [r for r in work_rows 
                     if r['rank'] is not None 
                     and str(r['rank']).isdigit() 
                     and int(r['rank']) <= 40]
        
        ever_top40 = len(top40_rows) > 0
        
        top40_entered = None
        top40_exited = None
        weeks_in_top40 = 0
        before_top40_weeks = 0
        after_top40_weeks = 0
        
        if ever_top40:
            top40_dates = [r['issue_date'] for r in top40_rows if r['issue_date']]
            top40_entered = min(top40_dates)
            top40_exited = max(top40_dates)
            weeks_in_top40 = len(top40_rows)
            
            # Before top40_entered
            before_rows = [r for r in work_rows 
                          if r['issue_date'] and r['issue_date'] < top40_entered
                          and r['rank'] is not None
                          and str(r['rank']).isdigit()
                          and int(r['rank']) > 40]
            before_top40_weeks = len(before_rows)
            
            # After top40_exited
            after_rows = [r for r in work_rows 
                         if r['issue_date'] and r['issue_date'] > top40_exited
                         and r['rank'] is not None
                         and str(r['rank']).isdigit()
                         and int(r['rank']) > 40]
            after_top40_weeks = len(after_rows)
        
        # Week counts
        weeks_top10 = sum(1 for r in work_rows 
                         if r['rank'] is not None 
                         and str(r['rank']).isdigit() 
                         and int(r['rank']) <= 10)
        weeks_top20 = sum(1 for r in work_rows 
                         if r['rank'] is not None 
                         and str(r['rank']).isdigit() 
                         and int(r['rank']) <= 20)
        weeks_top40_count = sum(1 for r in work_rows 
                                if r['rank'] is not None 
                                and str(r['rank']).isdigit() 
                                and int(r['rank']) <= 40)
        
        # Reentries
        reentries_top40 = compute_reentries_top40(work_rows) if ever_top40 else 0
        
        # Classifications
        entry_type = None
        if not ever_top40:
            entry_type = "no_top40"
        else:
            first_rank = None
            for r in work_rows:
                if r['rank'] is not None and str(r['rank']).isdigit():
                    first_rank = int(r['rank'])
                    break
            
            if first_rank and first_rank <= 40:
                entry_type = "breakout"
            else:
                entry_type = "slow_climb"
        
        decay_type = None
        resurgence = False
        
        if ever_top40:
            if reentries_top40 >= 2:
                resurgence = True
            
            if after_top40_weeks <= 1:
                decay_type = "immediate_fade"
            elif after_top40_weeks <= 4:
                decay_type = "short_tail"
            elif after_top40_weeks <= 10:
                decay_type = "slow_decline"
            else:
                decay_type = "long_tail"
        
        # Video matching
        has_video = key_norm in vdj_keys
        
        # Get full Hot 100 history (ALL positions, ranks 1-100)
        # Format: { week: "YYYY-MM-DD", position: 1-100 OR null }
        # Include for ALL songs, not just those with Top 40
        full_hot100_history = None
        weekly_positions = None  # Keep for backward compatibility
        
        # Query ALL Hot 100 positions for this work_id (ranks 1-100)
        all_positions_query = """
        SELECT
          e.issue_date,
          ee.rank
        FROM event_entry ee
        JOIN event e ON e.event_id = ee.event_id
        WHERE ee.work_id = ?
          AND e.source_system = 'RVA-HOT100'
        ORDER BY e.issue_date
        """
        all_pos_rows = db_conn.execute(all_positions_query, (work_id,)).fetchall()
        
        if all_pos_rows:
            # Build full_hot100_history with new format
            full_hot100_history = []
            weekly_positions = []  # Keep old format for backward compatibility
            
            for row in all_pos_rows:
                rank_val = row['rank']
                issue_date = row['issue_date']
                
                if issue_date:
                    # New format: { week: "YYYY-MM-DD", position: 1-100 OR null }
                    position = None
                    if rank_val is not None:
                        try:
                            rank_num = int(rank_val) if isinstance(rank_val, (int, str)) else None
                            if rank_num and rank_num > 0 and rank_num <= 100:
                                position = rank_num
                        except (ValueError, TypeError):
                            pass
                    
                    full_hot100_history.append({
                        'week': issue_date,
                        'position': position
                    })
                    
                    # Also build old format for backward compatibility (only Top 40 for old format)
                    if position is not None and position <= 40:
                        weekly_positions.append({
                            'week': len(weekly_positions) + 1,
                            'date': issue_date,
                            'rank': position
                        })
        
        # Build result
        result = {
            "work_id": work_id,
            "artist": artist,
            "title": title,
            "key_display": key_display,
            "key_norm": key_norm,
            "entered_chart": entered_chart,
            "final_chart_week": final_chart_week,
            "peak_position": peak_position,
            "weeks_on_chart_total": weeks_on_chart_total,
            "weeks_top10": weeks_top10,
            "weeks_top20": weeks_top20,
            "weeks_top40": weeks_top40_count,
            "top40_entered": top40_entered,
            "top40_exited": top40_exited,
            "weeks_in_top40": weeks_in_top40,
            "before_top40_weeks": before_top40_weeks,
            "after_top40_weeks": after_top40_weeks,
            "reentries_top40": reentries_top40,
            "entry_type": entry_type,
            "decay_type": decay_type,
            "resurgence": resurgence,
            "has_video": has_video
        }
        
        # Add full_hot100_history (new format)
        if full_hot100_history:
            result["full_hot100_history"] = full_hot100_history
        
        # Add weekly_positions for backward compatibility (if available)
        if weekly_positions:
            result["weekly_positions"] = weekly_positions
        
        results.append(result)
    
    # Sort: has_video desc, peak_position asc, weeks_top40 desc
    results.sort(key=lambda x: (
        not x['has_video'],  # False sorts before True, so not x reverses it
        x['peak_position'] or 999,
        -x['weeks_top40']  # Negative for descending
    ))
    
    # Close database connection
    db_conn.close()
    
    # Write output
    print(f"\nWriting {len(results)} records to {OUTPUT_PATH}...")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    # Print summary
    print("\n" + "="*60)
    print("EXPORT SUMMARY")
    print("="*60)
    print(f"Total songs exported: {len(results)}")
    
    top40_count = sum(1 for r in results if r['top40_entered'])
    print(f"Songs with top40: {top40_count}")
    
    video_count = sum(1 for r in results if r['has_video'])
    print(f"Songs with has_video: {video_count}")
    
    weekly_data_count = sum(1 for r in results if r.get('weekly_positions'))
    print(f"Songs with real weekly_positions: {weekly_data_count}")
    
    # Decay type breakdown (for top40 songs)
    print("\nDecay type breakdown (top40 songs only):")
    decay_counts = defaultdict(int)
    for r in results:
        if r['decay_type']:
            decay_counts[r['decay_type']] += 1
    
    for decay_type, count in sorted(decay_counts.items()):
        print(f"  {decay_type}: {count}")
    
    resurgence_count = sum(1 for r in results if r['resurgence'])
    print(f"\nSongs with resurgence flag: {resurgence_count}")
    
    print("="*60)
    print(f"\nOutput written to: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
