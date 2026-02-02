#!/usr/bin/env python3
# scripts/rv_merge_youtube.py
# Merge youtube_review.csv into VideoFiles.json (one-time import)

import csv
import json
import shutil
from pathlib import Path

# Paths
CSV_PATH = Path("/Users/bobhopp/Sites/btv/data/youtube_review.csv")
JSON_PATH = Path("/Users/bobhopp/Sites/retroverse-data/exports/vdj/VideoFiles.json")
BACKUP_PATH = JSON_PATH.with_suffix(".json.bak")


def normalize_key(artist, title):
    """Create lookup key: lowercase, strip whitespace"""
    a = (artist or "").lower().strip()
    t = (title or "").lower().strip()
    return (a, t)


def load_youtube_csv(path):
    """Load CSV and return dict: (artist, title) -> youtube_id"""
    youtube_map = {}
    
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            artist = row.get("Artist", "")
            title = row.get("Title", "")
            youtube_id = row.get("YouTubeId", "").strip()
            
            if youtube_id:  # Only store if ID exists
                key = normalize_key(artist, title)
                youtube_map[key] = youtube_id
    
    return youtube_map


def main():
    # Validate inputs
    if not CSV_PATH.exists():
        print(f"❌ ERROR: {CSV_PATH} not found")
        return 1
    
    if not JSON_PATH.exists():
        print(f"❌ ERROR: {JSON_PATH} not found")
        return 1
    
    # Load YouTube CSV
    print(f"📂 Loading YouTube data from {CSV_PATH.name}...")
    youtube_map = load_youtube_csv(CSV_PATH)
    print(f"   Found {len(youtube_map)} YouTube IDs")
    
    # Load VideoFiles.json
    print(f"📂 Loading {JSON_PATH.name}...")
    with JSON_PATH.open("r", encoding="utf-8") as f:
        videos = json.load(f)
    
    print(f"   Found {len(videos)} video records")
    
    # Create backup
    print(f"💾 Creating backup: {BACKUP_PATH.name}")
    shutil.copy2(JSON_PATH, BACKUP_PATH)
    
    # Merge YouTube data
    print("🔗 Merging YouTube data...")
    matched = 0
    unmatched = 0
    
    for video in videos:
        artist = video.get("Artist", "")
        title = video.get("Title", "")
        key = normalize_key(artist, title)
        
        youtube_id = youtube_map.get(key)
        
        if youtube_id:
            video["YouTubeID"] = youtube_id
            video["YouTubeURL"] = f"https://www.youtube.com/watch?v={youtube_id}"
            matched += 1
        else:
            unmatched += 1
    
    # Write updated JSON
    print(f"💾 Writing updated {JSON_PATH.name}...")
    with JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(videos, f, ensure_ascii=False, indent=2)
    
    # Report
    print("\n✅ Import complete!")
    print(f"   Matched:   {matched}")
    print(f"   Unmatched: {unmatched}")
    print(f"   Total:     {len(videos)}")
    print(f"\n📁 Backup saved: {BACKUP_PATH}")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())