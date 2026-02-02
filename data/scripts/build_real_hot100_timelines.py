#!/usr/bin/env python3
"""
build_real_hot100_timelines.py

Purpose:
  Extract REAL weekly Hot 100 positions from chart_positions table
  and store them in a JSON file for use by the trajectory exporter.

Input:
  - Database: /Users/bobhopp/Sites/retroverse-data/databases/billboard-hot-100.db
  - Table: chart_positions (chart_id = 1 for Hot 100)

Output:
  - JSON file: /Users/bobhopp/Sites/retroverse-data/output/real_hot100_timelines.json

Structure:
  {
    "artist - title": [
      {"week": 1, "date": "1984-02-10", "rank": 20},
      {"week": 2, "date": "1984-02-17", "rank": 18},
      ...
    ]
  }

Only includes weeks where rank <= 40 (Top 40 only).
"""

import sqlite3
import json
import re
from pathlib import Path
from collections import defaultdict

# ---- CONFIG ----
DB_PATH = "/Users/bobhopp/Sites/retroverse-data/databases/billboard-hot-100.db"
OUTPUT_PATH = "/Users/bobhopp/Sites/retroverse-data/output/real_hot100_timelines.json"
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


def main():
    # Ensure output directory exists
    output_path = Path(OUTPUT_PATH)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Connect to database
    print(f"Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    # Query all Top 40 positions from event_entry (more complete data)
    # This matches the structure used by export_hot100_song_trajectories.py
    query = """
    SELECT
      e.issue_date,
      ee.rank,
      w.title_display as title,
      p.name_display as artist,
      w.work_id
    FROM event_entry ee
    JOIN event e ON e.event_id = ee.event_id
    JOIN work w ON w.work_id = ee.work_id
    LEFT JOIN person p ON p.person_id = w.primary_person_id
    WHERE ee.rank <= 40
      AND e.source_system = 'RVA-HOT100'
    ORDER BY w.work_id, e.issue_date
    """
    
    print("Querying event_entry table for Top 40 positions...")
    rows = conn.execute(query).fetchall()
    conn.close()
    
    print(f"  Found {len(rows)} Top 40 chart positions")
    
    # Group by work_id (most reliable) and also by artist + title for matching
    by_work_id = defaultdict(list)
    by_song_key = defaultdict(list)
    
    for row in rows:
        work_id = row['work_id']
        artist = (row['artist'] or '').strip()
        title = (row['title'] or '').strip()
        
        if not title:
            continue
        
        # Create display key (for human readability)
        if artist:
            key_display = f"{artist} - {title}"
        else:
            key_display = title
        
        # Store by work_id (primary)
        by_work_id[work_id].append({
            'date': row['issue_date'],
            'rank': int(row['rank'])
        })
        
        # Also store by song key for fallback matching
        by_song_key[key_display].append({
            'date': row['issue_date'],
            'rank': int(row['rank']),
            'work_id': work_id
        })
    
    print(f"  Found {len(by_work_id)} unique work_ids")
    print(f"  Found {len(by_song_key)} unique song keys")
    
    # Build weekly positions arrays
    # Primary: by work_id, Secondary: by song key
    timelines_by_work_id = {}
    timelines_by_key = {}
    
    # Process by work_id (most reliable)
    for work_id, positions in by_work_id.items():
        # Sort by date
        positions.sort(key=lambda x: x['date'])
        
        # Build weekly array with week numbers (Top 40 only, already filtered)
        weekly_positions = []
        for week_index, pos in enumerate(positions, start=1):
            weekly_positions.append({
                'week': week_index,
                'date': pos['date'],
                'rank': pos['rank']
            })
        
        timelines_by_work_id[work_id] = weekly_positions
    
    # Process by song key (for fallback matching)
    for key_display, positions in by_song_key.items():
        # Sort by date
        positions.sort(key=lambda x: x['date'])
        
        # Build weekly array with week numbers
        weekly_positions = []
        for week_index, pos in enumerate(positions, start=1):
            weekly_positions.append({
                'week': week_index,
                'date': pos['date'],
                'rank': pos['rank']
            })
        
        timelines_by_key[key_display] = weekly_positions
    
    # Combine into single structure (prefer work_id, fallback to key)
    timelines = {
        '_by_work_id': timelines_by_work_id,
        '_by_key': timelines_by_key
    }
    
    # Write output
    print(f"\nWriting {len(timelines)} song timelines to {OUTPUT_PATH}...")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(timelines, f, indent=2, ensure_ascii=False)
    
    # Test: Print Thriller data
    print("\n" + "="*60)
    print("TEST: Thriller (Michael Jackson)")
    print("="*60)
    
    # Try to find by key first
    thriller_keys = [k for k in timelines_by_key.keys() if 'thriller' in k.lower() and 'jackson' in k.lower()]
    
    positions = None
    found_key = None
    
    if thriller_keys:
        found_key = thriller_keys[0]
        positions = timelines_by_key[found_key]
        print(f"Found by key: {found_key}")
    else:
        # Try to find by work_id (need to query for it)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        work_query = """
        SELECT w.work_id, w.title_display, p.name_display
        FROM work w
        LEFT JOIN person p ON p.person_id = w.primary_person_id
        WHERE LOWER(w.title_display) LIKE '%thriller%'
          AND LOWER(p.name_display) LIKE '%jackson%'
        LIMIT 1
        """
        work_row = conn.execute(work_query).fetchone()
        conn.close()
        
        if work_row and work_row['work_id'] in timelines_by_work_id:
            found_key = f"{work_row['name_display']} - {work_row['title_display']}"
            positions = timelines_by_work_id[work_row['work_id']]
            print(f"Found by work_id: {work_row['work_id']}")
            print(f"  Artist: {work_row['name_display']}")
            print(f"  Title: {work_row['title_display']}")
    
    if positions:
        print(f"Total Top 40 weeks: {len(positions)}")
        
        if positions:
            print(f"\nWeek 1: {positions[0]}")
            print(f"  Date: {positions[0]['date']}")
            print(f"  Rank: #{positions[0]['rank']}")
            
            # Find peak
            peak_entry = min(positions, key=lambda x: x['rank'])
            peak_week = next(i for i, p in enumerate(positions, 1) if p['rank'] == peak_entry['rank'])
            print(f"\nPeak: Week {peak_week}, Rank #{peak_entry['rank']}")
            print(f"  Date: {peak_entry['date']}")
            
            print(f"\nLast week: {positions[-1]}")
            print(f"  Date: {positions[-1]['date']}")
            print(f"  Rank: #{positions[-1]['rank']}")
            
            # Verify Week 1 != peak
            if positions[0]['rank'] != peak_entry['rank']:
                print("\n✓ Week 1 is NOT the peak (correct)")
            else:
                print("\n✗ Week 1 IS the peak (unexpected)")
            
            # Verify we get expected weeks (Thriller had 17 Top 40 weeks)
            if len(positions) == 17:
                print(f"\n✓ Got expected 17 Top 40 weeks")
            else:
                print(f"\nNote: Got {len(positions)} weeks (expected 17 for Thriller)")
    else:
        print("Thriller not found")
        print("Sample work_ids (first 5):")
        for wid in list(timelines_by_work_id.keys())[:5]:
            print(f"  - {wid}")
        print("\nSample keys (first 5):")
        for k in list(timelines_by_key.keys())[:5]:
            print(f"  - {k}")
    
    print("="*60)
    print(f"\nOutput written to: {OUTPUT_PATH}")
    print(f"Total songs with real timeline data:")
    print(f"  By work_id: {len(timelines_by_work_id)}")
    print(f"  By key: {len(timelines_by_key)}")


if __name__ == "__main__":
    main()
