#!/usr/bin/env python3
"""
Generate Hot 100 Detailed Histories

Converts Billboard Hot 100 data into a rich structure with:
- Per-week chart history
- Global timeline index
- Top 40 analytics
- Peak & decay metrics
- Climb/fall rates and volatility

Output: hot100_detailed_histories.json
"""

import sqlite3
import json
from pathlib import Path
from collections import defaultdict
from datetime import datetime

# Configuration
DB_PATH = Path(__file__).parent.parent / "databases" / "billboard-hot-100.db"
OUTPUT_PATH = Path(__file__).parent.parent.parent / "retroverse-site" / "public" / "data" / "hot100_detailed_histories.json"

def normalize_key(text):
    """Normalize text for matching"""
    if not text:
        return ""
    return " ".join(text.lower().split())


def build_global_week_index(conn):
    """
    Build a global week index mapping week_date -> global_week_index
    Returns: dict {week_date: index} and sorted list of dates
    """
    cursor = conn.cursor()
    cursor.execute("""
        SELECT DISTINCT e.issue_date as week_date
        FROM event e
        WHERE e.source_system = 'RVA-HOT100'
          AND e.issue_date IS NOT NULL
        ORDER BY e.issue_date
    """)
    
    dates = [row[0] for row in cursor.fetchall()]
    week_index_map = {date: idx for idx, date in enumerate(dates)}
    
    print(f"  Built global week index: {len(dates)} weeks")
    if dates:
        print(f"  Date range: {dates[0]} to {dates[-1]}")
    
    return week_index_map, dates


def load_song_histories(conn, week_index_map):
    """
    Load all Hot 100 positions for each song
    Returns: dict {work_id: [rows]}
    """
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            e.issue_date as hot100_week_date,
            ee.work_id,
            ee.rank as position,
            w.title_display as title,
            p.name_display as artist
        FROM event_entry ee
        JOIN event e ON e.event_id = ee.event_id
        JOIN work w ON w.work_id = ee.work_id
        LEFT JOIN person p ON p.person_id = w.primary_person_id
        WHERE e.source_system = 'RVA-HOT100'
          AND e.issue_date IS NOT NULL
          AND ee.rank IS NOT NULL
        ORDER BY ee.work_id, e.issue_date
    """)
    
    by_work = defaultdict(list)
    for row in cursor.fetchall():
        work_id = row['work_id']
        by_work[work_id].append({
            'hot100_week_date': row['hot100_week_date'],
            'position': int(row['position']) if row['position'] else None,
            'title': row['title'],
            'artist': row['artist']
        })
    
    print(f"  Loaded histories for {len(by_work)} songs")
    return by_work


def compute_top40_fields(history):
    """
    Compute Top 40 specific fields
    Returns: dict with first_top40_week, last_top40_week, weeks_top10, weeks_top20, weeks_top40
    """
    top40_weeks = [h for h in history if h['position'] and h['position'] <= 40]
    
    if not top40_weeks:
        return {
            'first_top40_week': None,
            'last_top40_week': None,
            'weeks_top10': 0,
            'weeks_top20': 0,
            'weeks_top40': 0
        }
    
    first_top40 = top40_weeks[0]
    last_top40 = top40_weeks[-1]
    
    weeks_top10 = sum(1 for h in history if h['position'] and h['position'] <= 10)
    weeks_top20 = sum(1 for h in history if h['position'] and h['position'] <= 20)
    weeks_top40 = len(top40_weeks)
    
    return {
        'first_top40_week': first_top40['hot100_week_date'],
        'last_top40_week': last_top40['hot100_week_date'],
        'weeks_top10': weeks_top10,
        'weeks_top20': weeks_top20,
        'weeks_top40': weeks_top40
    }


def compute_peak_metrics(history):
    """
    Compute peak position and date
    Returns: dict with peak_position, peak_date
    """
    valid_positions = [h for h in history if h['position'] is not None]
    
    if not valid_positions:
        return {
            'peak_position': None,
            'peak_date': None
        }
    
    # Find best (lowest) position
    peak_entry = min(valid_positions, key=lambda h: h['position'])
    
    return {
        'peak_position': peak_entry['position'],
        'peak_date': peak_entry['hot100_week_date']
    }


def compute_decay_type(history, top40_fields):
    """
    Compute decay type based on post-Top40 behavior
    Returns: decay_type string
    """
    if not top40_fields['last_top40_week']:
        return None
    
    # Find weeks after last Top 40
    last_top40_date = top40_fields['last_top40_week']
    post_top40 = [h for h in history if h['hot100_week_date'] > last_top40_date and h['position'] and h['position'] > 40]
    
    after_top40_weeks = len(post_top40)
    
    if after_top40_weeks <= 1:
        return "immediate_fade"
    elif after_top40_weeks <= 4:
        return "short_tail"
    elif after_top40_weeks <= 10:
        return "slow_decline"
    else:
        return "long_tail"


def detect_resurgence(history, top40_fields):
    """
    Detect if song re-entered Top 40 after exiting
    Returns: boolean
    """
    if not top40_fields['last_top40_week']:
        return False
    
    # Find all Top 40 weeks
    top40_weeks = [h for h in history if h['position'] and h['position'] <= 40]
    if len(top40_weeks) < 2:
        return False
    
    # Check for gaps in Top 40 run (re-entry after falling out)
    in_top40 = False
    exited_top40 = False
    
    for week in history:
        is_top40 = week['position'] and week['position'] <= 40
        
        if is_top40 and not in_top40:
            # Entering Top 40
            if exited_top40:
                # Re-entered after exiting
                return True
            in_top40 = True
        elif not is_top40 and in_top40:
            # Exiting Top 40
            exited_top40 = True
            in_top40 = False
    
    return False


def compute_climb_fall_rates(history):
    """
    Compute climb and fall rates
    Returns: dict with fastest_climb, steepest_drop, volatility
    """
    if len(history) < 2:
        return {
            'fastest_climb': None,
            'steepest_drop': None,
            'volatility': 0.0
        }
    
    changes = []
    positions = [h['position'] for h in history if h['position'] is not None]
    
    for i in range(1, len(positions)):
        if positions[i-1] and positions[i]:
            change = positions[i-1] - positions[i]  # Positive = climbed, Negative = dropped
            changes.append(change)
    
    if not changes:
        return {
            'fastest_climb': None,
            'steepest_drop': None,
            'volatility': 0.0
        }
    
    fastest_climb = max(changes) if changes else None
    steepest_drop = min(changes) if changes else None
    
    # Volatility = standard deviation of position changes
    if len(changes) > 1:
        mean_change = sum(changes) / len(changes)
        variance = sum((c - mean_change) ** 2 for c in changes) / len(changes)
        volatility = variance ** 0.5
    else:
        volatility = 0.0
    
    return {
        'fastest_climb': fastest_climb,
        'steepest_drop': steepest_drop,
        'volatility': round(volatility, 2)
    }


def compute_trajectory_shape(history):
    """
    Classify trajectory shape
    Returns: trajectory_shape string
    """
    if len(history) < 3:
        return "insufficient_data"
    
    positions = [h['position'] for h in history if h['position'] is not None]
    if len(positions) < 3:
        return "insufficient_data"
    
    # Simple shape detection
    first_third = positions[:len(positions)//3]
    middle_third = positions[len(positions)//3:2*len(positions)//3]
    last_third = positions[2*len(positions)//3:]
    
    first_avg = sum(first_third) / len(first_third)
    middle_avg = sum(middle_third) / len(middle_third)
    last_avg = sum(last_third) / len(last_third)
    
    if first_avg > middle_avg > last_avg:
        return "steady_decline"
    elif first_avg < middle_avg < last_avg:
        return "steady_climb"
    elif first_avg > middle_avg and last_avg > middle_avg:
        return "v_shaped"
    elif first_avg < middle_avg and last_avg < middle_avg:
        return "inverted_v"
    else:
        return "irregular"


def compute_zone_time(history):
    """
    Compute time spent in each zone
    Returns: dict with top10_time, top20_time, top40_time
    """
    top10_time = sum(1 for h in history if h['position'] and h['position'] <= 10)
    top20_time = sum(1 for h in history if h['position'] and h['position'] <= 20)
    top40_time = sum(1 for h in history if h['position'] and h['position'] <= 40)
    
    return {
        'top10_time': top10_time,
        'top20_time': top20_time,
        'top40_time': top40_time
    }


def process_song(work_id, raw_history, week_index_map, metadata):
    """
    Process a single song's history
    Returns: dict with all computed fields
    """
    if not raw_history or len(raw_history) < 1:
        return None
    
    # Get metadata
    first_row = raw_history[0]
    title = first_row.get('title') or ''
    artist = first_row.get('artist') or ''
    
    # Build history with global_week_index and week_on_chart
    history = []
    for idx, row in enumerate(raw_history):
        week_date = row['hot100_week_date']
        global_week_index = week_index_map.get(week_date)
        
        history.append({
            'global_week_index': global_week_index,
            'hot100_week_date': week_date,
            'position': row['position'],
            'week_on_chart': idx + 1
        })
    
    # Compute all analytics
    top40_fields = compute_top40_fields(history)
    peak_metrics = compute_peak_metrics(history)
    decay_type = compute_decay_type(history, top40_fields)
    resurgence_flag = detect_resurgence(history, top40_fields)
    climb_fall = compute_climb_fall_rates(history)
    trajectory_shape = compute_trajectory_shape(history)
    zone_time = compute_zone_time(history)
    
    return {
        'work_id': work_id,
        'title': title,
        'artist': artist,
        'key_display': f"{artist} - {title}" if artist else title,
        'key_norm': normalize_key(f"{artist} - {title}" if artist else title),
        'history': history,
        'analytics': {
            **top40_fields,
            **peak_metrics,
            'decay_type': decay_type,
            'resurgence_flag': resurgence_flag,
            **climb_fall,
            'trajectory_shape': trajectory_shape,
            **zone_time,
            'total_weeks': len(history)
        }
    }


def main():
    print("Generating Hot 100 Detailed Histories")
    print("=" * 60)
    
    # Ensure output directory exists
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    # Connect to database
    print(f"\nConnecting to database: {DB_PATH}")
    if not DB_PATH.exists():
        print(f"ERROR: Database not found at {DB_PATH}")
        return
    
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    
    # Build global week index
    print("\n1. Building global week index...")
    week_index_map, sorted_dates = build_global_week_index(conn)
    
    # Load song histories
    print("\n2. Loading song histories...")
    song_histories = load_song_histories(conn, week_index_map)
    
    # Process each song
    print("\n3. Processing songs...")
    results = {}
    processed = 0
    
    for work_id, raw_history in song_histories.items():
        if len(raw_history) < 1:
            continue
        
        song_data = process_song(work_id, raw_history, week_index_map, {})
        if song_data:
            results[work_id] = song_data
            processed += 1
            
            if processed % 1000 == 0:
                print(f"  Processed {processed} songs...")
    
    conn.close()
    
    print(f"\n4. Processed {processed} songs total")
    
    # Write output
    print(f"\n5. Writing output to {OUTPUT_PATH}...")
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print(f"\n✓ Complete! Output: {OUTPUT_PATH}")
    print(f"  Total songs: {len(results)}")
    
    # Print summary stats
    top40_count = sum(1 for s in results.values() if s['analytics']['weeks_top40'] > 0)
    peak1_count = sum(1 for s in results.values() if s['analytics']['peak_position'] == 1)
    
    print(f"\nSummary:")
    print(f"  Songs with Top 40: {top40_count}")
    print(f"  Songs that hit #1: {peak1_count}")


if __name__ == "__main__":
    main()
