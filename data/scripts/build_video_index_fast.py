#!/usr/bin/env python3
"""
Fast Video Index Builder

Optimized pipeline for matching Billboard Hot 100 songs with VDJ video library
using blocking groups and multiprocessing to avoid O(N²) comparisons.

Usage:
    python3 build_video_index_fast.py

Output:
    /Users/bobhopp/Sites/retroverse-site/public/data/video-index.json
    /Users/bobhopp/Sites/retroverse-data/unmatched_billboard.json
    /Users/bobhopp/Sites/retroverse-data/unmatched_videos.json

Requirements:
    pip install rapidfuzz  # Recommended for better performance
"""

import json
import re
import sqlite3
import unicodedata
from pathlib import Path
from collections import defaultdict
from urllib.parse import quote
from multiprocessing import Pool, cpu_count
import time

# Configuration
BASE_DIR = Path("/Users/bobhopp/Sites/retroverse-data")
SITE_DIR = Path("/Users/bobhopp/Sites/retroverse-site")
HOT100_DB = BASE_DIR / "databases" / "billboard-hot-100.db"
VIDEO_FILES_JSON = BASE_DIR / "exports" / "vdj" / "VideoFiles.json"
OUTPUT_VIDEO_INDEX = SITE_DIR / "public" / "data" / "video-index.json"
OUTPUT_UNMATCHED_BILLBOARD = BASE_DIR / "unmatched_billboard.json"
OUTPUT_UNMATCHED_VIDEOS = BASE_DIR / "unmatched_videos.json"
# Also write to public data directory
OUTPUT_UNMATCHED_BILLBOARD_PUBLIC = SITE_DIR / "public" / "data" / "unmatched_billboard.json"
OUTPUT_UNMATCHED_VIDEOS_PUBLIC = SITE_DIR / "public" / "data" / "unmatched_videos.json"
R2_BASE_URL = "https://media.retroverse.live"
SIMILARITY_THRESHOLD = 0.85

# Try to import rapidfuzz, fallback to difflib
try:
    from rapidfuzz import fuzz
    HAS_RAPIDFUZZ = True
except ImportError:
    from difflib import SequenceMatcher
    HAS_RAPIDFUZZ = False
    print("Warning: rapidfuzz not installed. Using SequenceMatcher (slower).")
    print("Install with: pip install rapidfuzz")


def normalize_for_match(text: str) -> str:
    """
    Normalize text for fuzzy matching:
    1. Convert to lowercase
    2. Remove ALL text inside parentheses, brackets, and braces
    3. Remove special characters: - _ [ ] { } .
    4. Collapse multiple spaces
    5. Normalize to ASCII (remove accents)
    """
    if text is None:
        return ""
    
    text = str(text)
    text = text.lower()
    
    # Remove ALL text inside parentheses (including nested)
    while True:
        new_text = re.sub(r'\([^()]*\)', '', text)
        if new_text == text:
            break
        text = new_text
    
    # Remove ALL text inside square brackets
    while True:
        new_text = re.sub(r'\[[^\]]*\]', '', text)
        if new_text == text:
            break
        text = new_text
    
    # Remove ALL text inside curly braces
    while True:
        new_text = re.sub(r'\{[^}]*\}', '', text)
        if new_text == text:
            break
        text = new_text
    
    # Remove special characters: - _ [ ] { } .
    text = re.sub(r'[-_\[\]{}.]', ' ', text)
    
    # Remove other non-alphanumeric characters (keep spaces)
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    
    # Collapse multiple spaces
    text = re.sub(r'\s+', ' ', text).strip()
    
    # Normalize to ASCII (remove accents)
    try:
        text = unicodedata.normalize('NFKD', text)
        text = text.encode('ascii', 'ignore').decode('ascii')
    except Exception:
        pass
    
    return text


def get_length_bucket(length: int) -> str:
    """Categorize length into bucket for blocking"""
    if length < 5:
        return "short"
    elif length < 15:
        return "medium"
    else:
        return "long"


def get_token_count_bucket(text: str) -> str:
    """Categorize token count into bucket for blocking"""
    tokens = len(text.split())
    if tokens <= 2:
        return "few"
    elif tokens <= 5:
        return "medium"
    else:
        return "many"


def create_block_key(artist_norm: str, title_norm: str) -> str:
    """
    Create a blocking key to group similar songs together.
    Format: first_letter_artist + first_letter_title + artist_length_bucket + title_token_bucket
    """
    artist_first = artist_norm[0] if artist_norm else "x"
    title_first = title_norm[0] if title_norm else "x"
    artist_bucket = get_length_bucket(len(artist_norm))
    title_bucket = get_token_count_bucket(title_norm)
    
    return f"{artist_first}{title_first}_{artist_bucket}_{title_bucket}"


def calculate_similarity(str1: str, str2: str) -> float:
    """Calculate similarity using rapidfuzz token_set_ratio or SequenceMatcher fallback"""
    if HAS_RAPIDFUZZ:
        # token_set_ratio is better for matching with word order differences
        return fuzz.token_set_ratio(str1, str2) / 100.0
    else:
        return SequenceMatcher(None, str1, str2).ratio()


def load_billboard_songs() -> dict:
    """Load Billboard songs from database"""
    print("Loading Billboard songs from database...")
    start_time = time.time()
    
    if not HOT100_DB.exists():
        raise FileNotFoundError(f"Database not found: {HOT100_DB}")
    
    conn = sqlite3.connect(f"file:{HOT100_DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT w.work_id, w.title_display, p.name_display
        FROM work w
        LEFT JOIN person p ON p.person_id = w.primary_person_id
        WHERE w.title_display IS NOT NULL
    """)
    
    songs = {}
    for row in cursor.fetchall():
        work_id = row['work_id']
        title = row['title_display']
        artist = row['name_display'] or ""
        
        if not title:
            continue
        
        artist_norm = normalize_for_match(artist)
        title_norm = normalize_for_match(title)
        combined_norm = normalize_for_match(f"{artist} {title}")
        block_key = create_block_key(artist_norm, title_norm)
        
        songs[work_id] = {
            "work_id": work_id,
            "artist": artist,
            "title": title,
            "artist_norm": artist_norm,
            "title_norm": title_norm,
            "combined_norm": combined_norm,
            "block_key": block_key
        }
    
    conn.close()
    
    elapsed = time.time() - start_time
    print(f"  Loaded {len(songs)} Billboard songs in {elapsed:.2f}s")
    return songs


def load_vdj_videos() -> list:
    """Load VDJ videos from VideoFiles.json"""
    print("Loading VDJ videos...")
    start_time = time.time()
    
    if not VIDEO_FILES_JSON.exists():
        raise FileNotFoundError(f"VideoFiles.json not found: {VIDEO_FILES_JSON}")
    
    with open(VIDEO_FILES_JSON, "r", encoding="utf-8") as f:
        vdj_xml = json.load(f)
    
    VIDEO_ROOT = "/Users/bobhopp/Library/CloudStorage/Dropbox/VIDEO/".lower()
    valid_videos = []
    for song in vdj_xml:
        fp = song.get("FilePath", "")
        fp_lower = fp.lower()
        if not fp_lower.startswith(VIDEO_ROOT):
            continue
        if not fp_lower.endswith(".mp4"):
            continue
        valid_videos.append({
            "file_path": fp,
            "artist": song.get("Artist", ""),
            "title": song.get("Title", ""),
            "year": song.get("Year", ""),
        })
    
    # Add norm/block_key for downstream blocking and matching
    for v in valid_videos:
        artist = v["artist"] or ""
        title = v["title"] or ""
        v["artist_norm"] = normalize_for_match(artist)
        v["title_norm"] = normalize_for_match(title)
        v["combined_norm"] = normalize_for_match(f"{artist} {title}")
        v["block_key"] = create_block_key(v["artist_norm"], v["title_norm"])
    
    elapsed = time.time() - start_time
    print(f"  Loaded {len(valid_videos)} VDJ videos in {elapsed:.2f}s")
    return valid_videos


def build_blocking_groups(songs: dict, videos: list) -> dict:
    """
    Build blocking groups to reduce comparison space.
    Groups videos by block_key for efficient lookup.
    """
    print("Building blocking groups...")
    start_time = time.time()
    
    video_blocks = defaultdict(list)
    for idx, video in enumerate(videos):
        video_blocks[video["block_key"]].append((idx, video))
    
    elapsed = time.time() - start_time
    print(f"  Created {len(video_blocks)} blocking groups in {elapsed:.2f}s")
    
    # Log block distribution
    block_sizes = [len(vids) for vids in video_blocks.values()]
    if block_sizes:
        print(f"  Block sizes: min={min(block_sizes)}, max={max(block_sizes)}, avg={sum(block_sizes)/len(block_sizes):.1f}")
    
    return video_blocks


def match_song_worker(args):
    """
    Worker function for multiprocessing.
    Matches a single Billboard song against relevant VDJ videos.
    """
    work_id, song, video_blocks = args
    
    # Get videos in the same block
    block_key = song["block_key"]
    candidate_videos = video_blocks.get(block_key, [])
    
    # Also check similar blocks (same first letters, different buckets)
    # This helps catch edge cases while still reducing comparisons
    similar_blocks = []
    if block_key:
        base_key = block_key.split('_')[0]  # First two letters
        for key, vids in video_blocks.items():
            if key.startswith(base_key):
                similar_blocks.extend(vids)
    
    # Deduplicate candidate videos
    unique = {}

    for item in candidate_videos + similar_blocks:
        # Handle tuple format: (idx, video_dict)
        if isinstance(item, tuple) and len(item) == 2:
            vid_idx, vid_data = item
            unique[vid_idx] = item

        # Handle raw dict format (if ever present)
        elif isinstance(item, dict):
            key = item.get("file_path") or item.get("normalized_title") or id(item)
            unique[key] = item

    # Final deduplicated list
    all_candidates = list(unique.values())
    
    best_match = None
    best_score = 0.0
    
    # Compare against candidates
    for _, video in all_candidates:
        score = calculate_similarity(song["combined_norm"], video["combined_norm"])
        
        if score > best_score:
            best_score = score
            best_match = video
    
    return work_id, song, best_match, best_score


def match_all_songs(songs: dict, videos: list, video_blocks: dict) -> tuple:
    """
    Match all Billboard songs against VDJ videos using multiprocessing.
    Returns: (video_index, unmatched_billboard)
    """
    print(f"\nMatching songs using {cpu_count()} CPU cores...")
    start_time = time.time()
    
    video_index = {}
    unmatched_billboard = []
    
    # Prepare arguments for workers
    work_items = [(work_id, song, video_blocks) for work_id, song in songs.items()]
    
    # Process in batches with progress logging
    batch_size = 1000
    total_batches = (len(work_items) + batch_size - 1) // batch_size
    
    with Pool(processes=cpu_count()) as pool:
        batch_num = 0
        for i in range(0, len(work_items), batch_size):
            batch = work_items[i:i + batch_size]
            batch_num += 1
            
            batch_start = time.time()
            results = pool.map(match_song_worker, batch)
            batch_elapsed = time.time() - batch_start
            
            # Process results
            for work_id, song, best_match, best_score in results:
                if best_match and best_score >= SIMILARITY_THRESHOLD:
                    # Build public URL
                    file_path = best_match["file_path"]
                    url = None
                    
                    if file_path:
                        marker = "/VIDEO/"
                        idx = file_path.find(marker)
                        if idx != -1:
                            rel = file_path[idx + len(marker):]
                            encoded_parts = [quote(part, safe='') for part in rel.split("/") if part]
                            url = f"{R2_BASE_URL}/{'/'.join(encoded_parts)}"
                    
                    if url:
                        video_index[work_id] = {
                            "url": url,
                            "file_path": file_path,
                            "confidence": round(best_score, 4)
                        }
                else:
                    unmatched_billboard.append({
                        "work_id": work_id,
                        "artist": song["artist"],
                        "title": song["title"],
                        "best_match_score": round(best_score, 4) if best_match else 0.0,
                        "best_match_artist": best_match["artist"] if best_match else None,
                        "best_match_title": best_match["title"] if best_match else None
                    })
            
            # Progress logging
            elapsed_total = time.time() - start_time
            rate = batch_num * batch_size / elapsed_total if elapsed_total > 0 else 0
            remaining = len(work_items) - (batch_num * batch_size)
            eta = remaining / rate if rate > 0 else 0
            
            print(f"  Batch {batch_num}/{total_batches}: {batch_num * batch_size}/{len(work_items)} songs "
                  f"({batch_elapsed:.2f}s, {rate:.0f} songs/s, ETA: {eta:.0f}s)")
    
    elapsed_total = time.time() - start_time
    print(f"\n  Matched {len(video_index)} songs (≥{SIMILARITY_THRESHOLD*100}% similarity)")
    print(f"  Unmatched {len(unmatched_billboard)} songs")
    print(f"  Total time: {elapsed_total:.2f}s ({len(songs)/elapsed_total:.0f} songs/s)")
    
    return video_index, unmatched_billboard


def find_unmatched_videos(video_index: dict, videos: list) -> list:
    """Find VDJ videos that didn't match any Billboard song"""
    print("\nFinding unmatched VDJ videos...")
    matched_paths = {entry["file_path"] for entry in video_index.values()}
    
    unmatched = []
    for video in videos:
        if video["file_path"] not in matched_paths:
            unmatched.append({
                "artist": video["artist"],
                "title": video["title"],
                "file_path": video["file_path"]
            })
    
    print(f"  Found {len(unmatched)} unmatched VDJ videos")
    return unmatched


def write_outputs(video_index: dict, unmatched_billboard: list, unmatched_videos: list):
    """Write all output files"""
    print("\nWriting output files...")
    
    # Ensure output directories exist
    OUTPUT_VIDEO_INDEX.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_UNMATCHED_BILLBOARD.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_UNMATCHED_VIDEOS.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_UNMATCHED_BILLBOARD_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_UNMATCHED_VIDEOS_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    
    # Write video-index.json
    with open(OUTPUT_VIDEO_INDEX, "w", encoding="utf-8") as f:
        json.dump(video_index, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  ✅ {OUTPUT_VIDEO_INDEX} ({len(video_index)} entries)")
    
    # Generate safe timestamp
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    
    # Prepare unmatched_billboard data
    unmatched_billboard_data = {
        "generated_at": timestamp,
        "total_unmatched": len(unmatched_billboard),
        "unmatched_songs": sorted(unmatched_billboard, key=lambda x: x["best_match_score"], reverse=True)
    }
    
    # Write unmatched_billboard.json to both locations
    with open(OUTPUT_UNMATCHED_BILLBOARD, "w", encoding="utf-8") as f:
        json.dump(unmatched_billboard_data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  ✅ {OUTPUT_UNMATCHED_BILLBOARD} ({len(unmatched_billboard)} entries)")
    
    with open(OUTPUT_UNMATCHED_BILLBOARD_PUBLIC, "w", encoding="utf-8") as f:
        json.dump(unmatched_billboard_data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  ✅ {OUTPUT_UNMATCHED_BILLBOARD_PUBLIC} ({len(unmatched_billboard)} entries)")
    
    # Prepare unmatched_videos data
    unmatched_videos_data = {
        "generated_at": timestamp,
        "total_unmatched": len(unmatched_videos),
        "unmatched_videos": sorted(unmatched_videos, key=lambda x: (x["artist"] or "", x["title"] or ""))
    }
    
    # Write unmatched_videos.json to both locations
    with open(OUTPUT_UNMATCHED_VIDEOS, "w", encoding="utf-8") as f:
        json.dump(unmatched_videos_data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  ✅ {OUTPUT_UNMATCHED_VIDEOS} ({len(unmatched_videos)} entries)")
    
    with open(OUTPUT_UNMATCHED_VIDEOS_PUBLIC, "w", encoding="utf-8") as f:
        json.dump(unmatched_videos_data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  ✅ {OUTPUT_UNMATCHED_VIDEOS_PUBLIC} ({len(unmatched_videos)} entries)")


def main():
    """Main execution function"""
    print("=" * 70)
    print("Fast Video Index Builder")
    print("=" * 70)
    print(f"CPU cores available: {cpu_count()}")
    print(f"Using {'rapidfuzz' if HAS_RAPIDFUZZ else 'difflib.SequenceMatcher'}")
    print(f"Similarity threshold: {SIMILARITY_THRESHOLD*100}%")
    print()
    
    total_start = time.time()
    
    try:
        # Load data
        songs = load_billboard_songs()
        videos = load_vdj_videos()
        
        # Build blocking groups
        video_blocks = build_blocking_groups(songs, videos)
        
        # Match songs
        video_index, unmatched_billboard = match_all_songs(songs, videos, video_blocks)
        
        # Find unmatched videos
        unmatched_videos = find_unmatched_videos(video_index, videos)
        
        # Write outputs
        write_outputs(video_index, unmatched_billboard, unmatched_videos)
        
        total_elapsed = time.time() - total_start
        print(f"\n{'=' * 70}")
        print(f"✅ Complete! Total time: {total_elapsed:.2f}s")
        print(f"   Matched: {len(video_index)} songs")
        print(f"   Unmatched Billboard: {len(unmatched_billboard)} songs")
        print(f"   Unmatched VDJ: {len(unmatched_videos)} videos")
        print(f"{'=' * 70}")
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
