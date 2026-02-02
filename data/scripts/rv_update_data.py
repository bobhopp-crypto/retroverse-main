#!/usr/bin/env python3
# scripts/rv_update_data.py
# Orchestrates the RetroVerse data pipeline.

import argparse
import subprocess
import sys
import shutil
from pathlib import Path
import json
import re
import sqlite3
from difflib import SequenceMatcher
from collections import defaultdict
import xml.etree.ElementTree as ET
from urllib.parse import quote
import time
import datetime
import os

# Ensure Homebrew binaries (ffprobe/ffmpeg) are available in PATH
# This is needed when launched from GUI or CLI without shell PATH
homebrew_bin = "/opt/homebrew/bin"
if homebrew_bin not in os.environ.get("PATH", ""):
    os.environ["PATH"] = f"{homebrew_bin}:{os.environ.get('PATH', '')}"

# Try to import rapidfuzz, fallback to SequenceMatcher
try:
    from rapidfuzz import fuzz
    HAS_RAPIDFUZZ = True
except ImportError:
    HAS_RAPIDFUZZ = False
    print("Warning: rapidfuzz not installed. Using SequenceMatcher (slower). Install with: pip install rapidfuzz")

# --- Configuration ---
# Base directory for your project
BASE_DIR = Path("/Users/bobhopp/Sites/retroverse-data")

# Shared video source (NAS preferred, Dropbox fallback)
_SCRIPTS = BASE_DIR / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from utils.video_source import detect_video_source
SITE_DIR = Path("/Users/bobhopp/Sites/retroverse-site")

# Existing pipeline inputs/outputs
VIDEO_FILES_JSON = BASE_DIR / "exports" / "vdj" / "VideoFiles.json"
HOT100_SONG_INDEX_JSON = BASE_DIR / "output" / "reports" / "hot100_song_index.json"
MATCH_BILLBOARD_OUTPUT = BASE_DIR / "output" / "reports" / "video_billboard_matches.generated.json"

# New pipeline inputs/outputs
VDJ_DEFAULT_XML = Path("/Users/bobhopp/Library/Application Support/VirtualDJ/database.xml")
VIDEO_INDEX_JSON = BASE_DIR / "video-index.json"
SONG_REGISTRY_JSON = BASE_DIR / "song-registry.json"
SONG_REGISTRY_WITH_VIDEO_JSON = BASE_DIR / "song-registry.with-local-video.json"
HOT100_DB = BASE_DIR / "databases" / "billboard-hot-100.db"
SITE_REGISTRY_DEST = SITE_DIR / "data" / "song-registry.json"
REPORTS_DIR = BASE_DIR / "reports"

# Paths to the existing pipeline scripts
EXPORT_VDJ_SCRIPT = BASE_DIR / "scripts" / "rv_vdj_export_videos.py"
MERGE_YOUTUBE_SCRIPT = BASE_DIR / "scripts" / "rv_merge_youtube.py"
GENERATE_THUMBNAILS_SCRIPT = BASE_DIR / "scripts" / "rv_generate_thumbnails.py"
COMPARE_THUMBNAILS_SCRIPT = BASE_DIR / "scripts" / "rv_compare_thumbnails.py"
PUBLISH_THUMBNAILS_SCRIPT = BASE_DIR / "scripts" / "rv_publish_thumbnails.py"
DELETE_DETACHED_R2_SCRIPT = BASE_DIR / "scripts" / "rv_delete_detached_r2.py"
PUBLISH_R2_SCRIPT = BASE_DIR / "scripts" / "rv_publish_r2.sh"
ANALYZE_R2_SCRIPT = BASE_DIR / "scripts" / "rv_analyze_r2_diff.py"

# --- Helper Function to Run Subprocess ---
def run_step(name: str, script_path: Path) -> bool:
    """
    Runs a single pipeline step script using subprocess.
    Prints output and returns True on success, False on failure.
    """
    print(f"\n--- Running {name} ---")
    if not script_path.exists():
        print(f"❌ ERROR: Script not found at {script_path}")
        return False

    try:
        # Use sys.executable to ensure the same Python interpreter is used
        # Stream output in real-time for progress visibility
        # -u flag forces unbuffered output from Python script
        process = subprocess.Popen(
            [sys.executable, "-u", str(script_path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=0  # Unbuffered for immediate output
        )
        
        # Stream output line by line with immediate flush
        for line in iter(process.stdout.readline, ''):
            if line:
                print(line.rstrip(), flush=True)
        
        process.wait()
        
        if process.returncode != 0:
            print(f"❌ ERROR: {name} failed with exit code {process.returncode}")
            return False
        else:
            print(f"✅ {name} completed successfully.")
            return True
    except Exception as e:
        print(f"❌ ERROR: An exception occurred while running {name}: {e}")
        return False


# --- Normalization Helpers ---
def normalize_for_id(text: str) -> str:
    if text is None:
        return ""
    text = str(text).upper()
    text = re.sub(r"[^A-Z0-9_\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text.replace(" ", "_")


def normalize_for_match(text: str) -> str:
    """
    Normalize text for fuzzy matching:
    1. Convert to lowercase
    2. Remove ALL text inside parentheses (including nested)
    3. Remove special characters: - _ [ ] { } .
    4. Collapse multiple spaces
    5. Normalize to ASCII (remove accents, etc.)
    """
    if text is None:
        return ""
    
    text = str(text)
    
    # Convert to lowercase
    text = text.lower()
    
    # Remove ALL text inside parentheses (including nested parentheses)
    # This regex handles nested parentheses by repeatedly removing innermost pairs
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
    
    # Normalize to ASCII (remove accents, etc.)
    try:
        import unicodedata
        text = unicodedata.normalize('NFKD', text)
        text = text.encode('ascii', 'ignore').decode('ascii')
    except ImportError:
        pass  # unicodedata is in stdlib, but handle gracefully
    
    return text


def normalize_for_prefix(text: str) -> str:
    """
    Normalize for prefix fingerprint: lowercase, remove (), remove punctuation,
    collapse spaces, & -> and. Year is not used.
    """
    if text is None:
        return ""
    text = str(text).lower()
    text = text.replace("&", " and ")
    while True:
        n = re.sub(r"\([^()]*\)", "", text)
        if n == text:
            break
        text = n
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    try:
        import unicodedata
        text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    except Exception:
        pass
    return text


def prefix_fingerprint(norm: str, min_len: int = 5, max_len: int = 6) -> tuple:
    """Return (prefix_str, length_used). Uses 6 chars if len(norm)>=6 else 5 if len>=5 else all."""
    s = norm[:max_len].strip()
    if len(s) >= max_len:
        return (s, max_len)
    s = norm[:min_len].strip() if len(norm) >= min_len else norm.strip()
    return (s, len(s))


def prefix_similarity(a: str, b: str) -> float:
    """Similarity of two short strings using stdlib only."""
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def make_song_id(artist: str, title: str) -> str:
    a = normalize_for_id(artist)
    t = normalize_for_id(title)
    return f"{a}__{t}" if a and t else ""


def parse_year(date_str: str):
    if not date_str:
        return None
    m = re.match(r"(\d{4})", str(date_str))
    return int(m.group(1)) if m else None


def resolve_path(path: Path) -> Path:
    return Path(path).expanduser().resolve()


# --- Pipeline Phases ---
def normalize_for_song_id(text: str) -> str:
    """
    Normalize text using the same rules as retroverse-shared/song-id.js (normalizePart)
    """
    if text is None:
        return ""
    text = str(text).upper()
    text = re.sub(r"[^A-Z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text.replace(" ", "_")


def build_video_index(vdj_xml_path: Path = None) -> int:
    """
    Build video index by matching Billboard songs with VDJ videos using fuzzy matching.
    Creates video_index.json keyed by work_id and missing_videos_report.json for unmatched songs.
    """
    print(f"\n--- Build Video Index (Billboard ↔ VDJ Matching) ---")
    
    # Load Billboard work table
    db_path = resolve_path(HOT100_DB)
    if not db_path.exists():
        print(f"❌ ERROR: Billboard DB not found at {db_path}")
        return 0
    
    print("Loading Billboard songs...")
    try:
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cur = con.cursor()
        cur.execute("""
            SELECT w.work_id, w.title_display, p.name_display
            FROM work w
            LEFT JOIN person p ON p.person_id = w.primary_person_id
            WHERE w.title_display IS NOT NULL
        """)
        billboard_songs = {}
        for work_id, title, artist in cur.fetchall():
            if title:
                na = normalize_for_prefix(artist or "")
                nt = normalize_for_prefix(title)
                ap, alen = prefix_fingerprint(na)
                tp, tlen = prefix_fingerprint(nt)
                billboard_songs[work_id] = {
                    "work_id": work_id,
                    "title": title,
                    "artist": artist or "",
                    "artist_prefix": ap,
                    "title_prefix": tp,
                    "artist_len": alen,
                    "title_len": tlen,
                }
        con.close()
        print(f"  Loaded {len(billboard_songs)} Billboard songs")
    except Exception as e:
        print(f"❌ ERROR: Failed to load Billboard DB: {e}")
        return 0
    
    # Load VDJ videos from VideoFiles.json
    print("Loading VDJ videos...")
    vdj_path = resolve_path(VIDEO_FILES_JSON)
    if not vdj_path.exists():
        print(f"❌ ERROR: VideoFiles.json not found at {vdj_path}")
        return 0
    
    try:
        with open(vdj_path, "r", encoding="utf-8") as f:
            vdj_videos = json.load(f)
        print(f"  Loaded {len(vdj_videos)} VDJ videos")
    except Exception as e:
        print(f"❌ ERROR: Failed to load VideoFiles.json: {e}")
        return 0
    
    # Normalize VDJ videos for matching
    print("Normalizing VDJ videos...")
    vdj_normalized = []
    for video in vdj_videos:
        artist = video.get("Artist") or ""
        title = video.get("Title") or ""
        file_path = video.get("FilePath") or ""
        
        if not title:
            # Try to extract from filename
            if file_path:
                name = Path(file_path).stem
                if " - " in name:
                    parts = name.split(" - ", 1)
                    artist = artist or parts[0].strip()
                    title = parts[1].strip()
        
        if not title:
            continue
        
        na = normalize_for_prefix(artist)
        nt = normalize_for_prefix(title)
        ap, alen = prefix_fingerprint(na)
        tp, tlen = prefix_fingerprint(nt)
        vdj_normalized.append({
            "artist": artist,
            "title": title,
            "file_path": file_path,
            "artist_prefix": ap,
            "title_prefix": tp,
            "artist_len": alen,
            "title_len": tlen,
        })
    print(f"  Normalized {len(vdj_normalized)} VDJ videos")
    
    # Prefix-fingerprint matching: artist_prefix and title_prefix similarity ≥ 90%
    print("Matching Billboard songs with VDJ videos (prefix fingerprint)...")
    R2_BASE_URL = "https://media.retroverse.live"
    PREFIX_THRESHOLD = 0.9
    video_index = {}
    matched_work_ids = set()
    matched_video_paths = set()
    unmatched_billboard = []
    unmatched_videos = []
    n_confident = 0
    n_likely = 0

    for work_id, billboard_song in billboard_songs.items():
        candidates = []
        best_non_match = None
        best_non_score = 0.0

        for vdj_video in vdj_normalized:
            artist_sim = prefix_similarity(billboard_song["artist_prefix"], vdj_video["artist_prefix"])
            title_sim = prefix_similarity(billboard_song["title_prefix"], vdj_video["title_prefix"])
            if artist_sim >= PREFIX_THRESHOLD and title_sim >= PREFIX_THRESHOLD:
                min_sim = min(artist_sim, title_sim)
                candidates.append((min_sim, vdj_video))
            else:
                mn = min(artist_sim, title_sim)
                if mn > best_non_score:
                    best_non_score = mn
                    best_non_match = vdj_video

        # Pick one deterministically: best min_sim, then by file_path
        best_match = None
        if candidates:
            candidates.sort(key=lambda x: (-x[0], x[1]["file_path"] or ""))
            best_match = candidates[0][1]

        if best_match:
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
                alen = billboard_song["artist_len"]
                tlen = billboard_song["title_len"]
                if alen == 6 and tlen == 6:
                    tier = "CONFIDENT"
                    n_confident += 1
                else:
                    tier = "LIKELY"
                    n_likely += 1
                video_index[work_id] = {
                    "url": url,
                    "file_path": file_path,
                    "tier": tier,
                    "confidence": 1.0 if tier == "CONFIDENT" else 0.9,
                }
                matched_work_ids.add(work_id)
                matched_video_paths.add(file_path)
        else:
            unmatched_billboard.append({
                "work_id": work_id,
                "artist": billboard_song["artist"],
                "title": billboard_song["title"],
                "best_match_score": round(best_non_score, 4) if best_non_match else 0.0,
                "best_match_artist": best_non_match["artist"] if best_non_match else None,
                "best_match_title": best_non_match["title"] if best_non_match else None,
            })

    n_unmatched = len(unmatched_billboard)
    print(f"  CONFIDENT: {n_confident}  LIKELY: {n_likely}  UNMATCHED: {n_unmatched}")
    
    # Find unmatched videos (videos that didn't match any Billboard song)
    for vdj_video in vdj_normalized:
        if vdj_video["file_path"] not in matched_video_paths:
            unmatched_videos.append({
                "artist": vdj_video["artist"],
                "title": vdj_video["title"],
                "file_path": vdj_video["file_path"]
            })
    
    print(f"  Matched {len(video_index)} songs (prefix fingerprint ≥90%)")
    print(f"  Unmatched Billboard songs: {len(unmatched_billboard)}")
    print(f"  Unmatched VDJ videos: {len(unmatched_videos)}")
    
    # Write video_index.json to both locations
    try:
        # Write to retroverse-data for reports
        OUTPUT_PATH = BASE_DIR / "video-index.json"
        with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
            json.dump(video_index, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"✅ Video index written: {OUTPUT_PATH}")
        
        # Also write to public data directory for frontend
        SITE_VIDEO_INDEX = SITE_DIR / "public" / "data" / "video-index.json"
        SITE_VIDEO_INDEX.parent.mkdir(parents=True, exist_ok=True)
        with open(SITE_VIDEO_INDEX, "w", encoding="utf-8") as f:
            json.dump(video_index, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"✅ Video index written to public: {SITE_VIDEO_INDEX}")
    except Exception as e:
        print(f"❌ ERROR: Failed to write video_index.json: {e}")
        return 0
    
    # Generate safe timestamp
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    
    # Write unmatched_billboard.json
    try:
        UNMATCHED_BILLBOARD_PATH = BASE_DIR / "unmatched_billboard.json"
        with open(UNMATCHED_BILLBOARD_PATH, "w", encoding="utf-8") as f:
            json.dump({
                "generated_at": timestamp,
                "total_unmatched": len(unmatched_billboard),
                "unmatched_songs": sorted(unmatched_billboard, key=lambda x: x["best_match_score"], reverse=True)
            }, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"✅ Unmatched Billboard songs report written: {UNMATCHED_BILLBOARD_PATH}")
    except Exception as e:
        print(f"❌ ERROR: Failed to write unmatched_billboard.json: {e}")
    
    # Write unmatched_videos.json
    try:
        UNMATCHED_VIDEOS_PATH = BASE_DIR / "unmatched_videos.json"
        with open(UNMATCHED_VIDEOS_PATH, "w", encoding="utf-8") as f:
            json.dump({
                "generated_at": timestamp,
                "total_unmatched": len(unmatched_videos),
                "unmatched_videos": sorted(unmatched_videos, key=lambda x: (x["artist"] or "", x["title"] or ""))
            }, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"✅ Unmatched VDJ videos report written: {UNMATCHED_VIDEOS_PATH}")
    except Exception as e:
        print(f"❌ ERROR: Failed to write unmatched_videos.json: {e}")
    
    return len(video_index)


def _title_similarity(a: str, b: str) -> float:
    """Return similarity in [0, 1]. Uses rapidfuzz or SequenceMatcher."""
    if HAS_RAPIDFUZZ:
        return fuzz.ratio(a, b) / 100.0
    return SequenceMatcher(None, a, b).ratio()


# Pass 2: known video-title suffixes to strip (case-insensitive). Video side only.
_TITLE_VARIANT_SUFFIXES = [
    r"\s*\(Remastered\s+\d{4}\)",
    r"\s*\(Remastered\)",
    r"\s*\(Official\s+Music\s+Video\)",
    r"\s*\(Official\s+Video\)",
    r"\s*-\s*Video\s+Version",
    r"\s*-\s*Radio\s+Edit",
    r"\s*\(Extended\s+Mix\)",
    r"\s*\(Extended\)",
    r"\s*\(Live\)",
    r"\s*\(Mono\)",
    r"\s*\(Stereo\)",
    r"\s*\(Album\s+Version\)",
    r"\s*\(Single\s+Version\)",
    r"\s*\[HD\]",
    r"\s*\[Explicit\]",
]


def _clean_video_title_for_variant(raw_title: str) -> str:
    """Remove known suffixes and enclosing (), [] from video title. Does not normalize."""
    if not raw_title:
        return ""
    s = str(raw_title).strip()
    for p in _TITLE_VARIANT_SUFFIXES:
        s = re.sub(p, " ", s, flags=re.IGNORECASE)
    while True:
        prev = s
        s = re.sub(r"\s*\([^)]*\)\s*", " ", s)
        s = re.sub(r"\s*\[[^\]]*\]\s*", " ", s)
        s = re.sub(r"\s+", " ", s).strip()
        if s == prev:
            break
    return s.strip()


def run_match_billboard() -> bool:
    """
    Generate repeatable Billboard ↔ VDJ match baseline.
    Reads: VIDEO_FILES_JSON (canonical video index), HOT100_SONG_INDEX_JSON (canonical Hot 100 index).
    Writes: MATCH_BILLBOARD_OUTPUT. Deterministic, idempotent, no side effects.
    """
    print("\n--- Match Billboard (Billboard ↔ VDJ baseline) ---")

    vdj_path = resolve_path(VIDEO_FILES_JSON)
    if not vdj_path.exists():
        print(f"❌ ERROR: Video index not found at {vdj_path}")
        return False

    index_path = resolve_path(HOT100_SONG_INDEX_JSON)
    if not index_path.exists():
        print(f"❌ ERROR: Hot 100 song index not found at {index_path}")
        return False

    # Load canonical video index
    try:
        with open(vdj_path, "r", encoding="utf-8") as f:
            vdj_videos = json.load(f)
        print(f"  Loaded {len(vdj_videos)} videos from {vdj_path.name}")
    except Exception as e:
        print(f"❌ ERROR: Failed to load video index: {e}")
        return False

    # Load canonical Hot 100 song index (output/reports/hot100_song_index.json)
    try:
        with open(index_path, "r", encoding="utf-8") as f:
            hot100_index = json.load(f)
        if not isinstance(hot100_index, list):
            hot100_index = []
        print(f"  Loaded {len(hot100_index)} Billboard songs from hot100_song_index.json")
    except Exception as e:
        print(f"❌ ERROR: Failed to load Hot 100 song index: {e}")
        return False

    # Build Billboard candidate list from index (song_id, artist_norm, title_norm, year)
    billboard_candidates = []
    for r in hot100_index:
        song_id = r.get("song_id") or ""
        artist_norm = (r.get("artist_norm") or "").strip()
        title_norm = (r.get("title_norm") or "").strip()
        first_chart_year = r.get("first_chart_year")
        last_chart_year = r.get("last_chart_year")
        year = first_chart_year if first_chart_year else (last_chart_year if last_chart_year else None)
        if not song_id or not title_norm:
            continue
        billboard_candidates.append({
            "artist_norm": artist_norm,
            "title_norm": title_norm,
            "year": year,
            "song_id": song_id,
        })

    # Single timestamp for whole run (deterministic re-runs)
    generated_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Match each video to at most one Billboard song
    results = []
    for video in vdj_videos:
        artist = video.get("Artist") or ""
        title = video.get("Title") or ""
        file_path = video.get("FilePath") or ""
        if not title and file_path:
            stem = Path(file_path).stem
            if " - " in stem:
                parts = stem.split(" - ", 1)
                artist = artist or parts[0].strip()
                title = parts[1].strip()
        if not title:
            continue

        artist_norm = normalize_for_match(artist)
        title_norm = normalize_for_match(title)
        video_year = video.get("Year")
        if video_year is not None and isinstance(video_year, str):
            video_year = parse_year(video_year)
        elif video_year is not None and isinstance(video_year, (int, float)):
            video_year = int(video_year) if video_year == int(video_year) else None
        else:
            video_year = None

        video_id = file_path or f"{artist}__{title}"
        best = None
        best_method = None
        best_conf = 0.0

        for bb in billboard_candidates:
            if bb["artist_norm"] != artist_norm:
                continue
            year_ok = True
            if video_year is not None and bb["year"] is not None:
                if abs(video_year - bb["year"]) > 2:
                    year_ok = False
            if not year_ok:
                continue

            title_sim = _title_similarity(title_norm, bb["title_norm"])
            if title_norm == bb["title_norm"]:
                method, conf = "exact", 1.0
            elif title_sim >= 0.90:
                method, conf = "fuzzy_strong", round(title_sim, 2)
            else:
                continue

            if best is None or (method == "exact" and best_method != "exact") or (method == best_method and conf > best_conf):
                best = bb
                best_method = method
                best_conf = conf

        if best is None:
            continue

        results.append({
            "video_id": video_id,
            "video_artist": artist_norm,
            "video_title": title_norm,
            "video_year": video_year,
            "billboard_song_id": best["song_id"],
            "billboard_artist": best["artist_norm"],
            "billboard_title": best["title_norm"],
            "billboard_year": best["year"],
            "match_method": best_method,
            "confidence": best_conf,
            "auto_accept": True,
            "generated_at": generated_at,
        })

    matched_video_ids = {r["video_id"] for r in results}

    # Pass 2: title-variant matching (unmatched videos only; clean video title suffixes)
    pass2_candidates_tested = 0
    pass2_added = 0
    _method_order = {"exact": 0, "fuzzy_strong": 1, "title_variant": 2}

    for video in vdj_videos:
        artist = video.get("Artist") or ""
        title = video.get("Title") or ""
        file_path = video.get("FilePath") or ""
        if not title and file_path:
            stem = Path(file_path).stem
            if " - " in stem:
                parts = stem.split(" - ", 1)
                artist = artist or parts[0].strip()
                title = parts[1].strip()
        if not title:
            continue

        video_id = file_path or f"{artist}__{title}"
        if video_id in matched_video_ids:
            continue

        artist_norm = normalize_for_match(artist)
        raw_title = title
        clean_title_norm = normalize_for_match(_clean_video_title_for_variant(raw_title))
        if not clean_title_norm:
            continue

        video_year = video.get("Year")
        if video_year is not None and isinstance(video_year, str):
            video_year = parse_year(video_year)
        elif video_year is not None and isinstance(video_year, (int, float)):
            video_year = int(video_year) if video_year == int(video_year) else None
        else:
            video_year = None

        best = None
        best_conf = 0.0
        best_count = 0
        pass2_candidates_tested += 1

        for bb in billboard_candidates:
            if bb["artist_norm"] != artist_norm:
                continue
            year_ok = True
            if video_year is not None and bb["year"] is not None:
                if abs(video_year - bb["year"]) > 2:
                    year_ok = False
            if not year_ok:
                continue

            title_sim = _title_similarity(clean_title_norm, bb["title_norm"])
            if title_sim < 0.92:
                continue

            conf = round(title_sim, 2)
            if best is None or conf > best_conf:
                best = bb
                best_conf = conf
                best_count = 1
            elif conf == best_conf:
                best_count += 1

        if best is None or best_count != 1:
            continue

        results.append({
            "video_id": video_id,
            "video_artist": artist_norm,
            "video_title": clean_title_norm,
            "video_year": video_year,
            "billboard_song_id": best["song_id"],
            "billboard_artist": best["artist_norm"],
            "billboard_title": best["title_norm"],
            "billboard_year": best["year"],
            "match_method": "title_variant",
            "confidence": best_conf,
            "auto_accept": True,
            "generated_at": generated_at,
        })
        matched_video_ids.add(video_id)
        pass2_added += 1

    print(f"Pass 2 (title variants):")
    print(f"  Candidates tested: {pass2_candidates_tested}")
    print(f"  New matches added: {pass2_added}")

    # Sort for deterministic output: video_id, billboard_song_id, then method order
    results.sort(key=lambda r: (r["video_id"], r["billboard_song_id"], _method_order.get(r["match_method"], 99)))

    MATCH_BILLBOARD_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(MATCH_BILLBOARD_OUTPUT, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"✅ Wrote {len(results)} matches to {MATCH_BILLBOARD_OUTPUT}")
    except Exception as e:
        print(f"❌ ERROR: Failed to write match output: {e}")
        return False

    return True


def build_song_registry() -> int:
    print(f"\n--- Build Song Registry ---")
    db_path = resolve_path(HOT100_DB)
    if not db_path.exists():
        print(f"❌ ERROR: Billboard DB not found at {db_path}")
        return 0

    try:
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cur = con.cursor()

        cur.execute("""
            SELECT w.work_id, w.title_display, p.name_display
            FROM work w
            LEFT JOIN person p ON p.person_id = w.primary_person_id
        """)
        work_rows = cur.fetchall()

        work_meta = {}
        for work_id, title, artist in work_rows:
            if not title or not artist:
                continue
            song_id = make_song_id(artist, title)
            if not song_id:
                continue
            work_meta[work_id] = {
                "song_id": song_id,
                "title": title,
                "artist": artist
            }

        cur.execute("""
            SELECT e.work_id, ev.issue_date, e.rank
            FROM event_entry e
            JOIN event ev ON ev.event_id = e.event_id
        """)

        chart_facts = defaultdict(lambda: {"years": set(), "peak": None, "weeks": 0})

        for work_id, issue_date, rank in cur.fetchall():
            if work_id not in work_meta:
                continue
            year = parse_year(issue_date)
            if year:
                chart_facts[work_id]["years"].add(year)
            chart_facts[work_id]["weeks"] += 1
            try:
                r = int(rank)
                if chart_facts[work_id]["peak"] is None or r < chart_facts[work_id]["peak"]:
                    chart_facts[work_id]["peak"] = r
            except Exception:
                pass

        con.close()
    except Exception as e:
        print(f"❌ ERROR: Failed to read Billboard DB: {e}")
        return 0

    registry = {}
    for work_id, meta in work_meta.items():
        facts = chart_facts.get(work_id)
        if not facts:
            continue
        years = sorted(y for y in facts["years"] if y)
        if not years:
            continue
        registry[meta["song_id"]] = {
            "song_id": meta["song_id"],
            "artist": meta["artist"],
            "title": meta["title"],
            "chart": {
                "authority": "billboard_hot_100",
                "primary_year": years[0],
                "year_span": years,
                "peak": facts["peak"],
                "weeks": facts["weeks"]
            },
            "media": {
                "local_video": {
                    "exists": False
                },
                "youtube": {}
            }
        }

    registry = dict(sorted(registry.items(), key=lambda x: x[0]))

    try:
        with open(SONG_REGISTRY_JSON, "w", encoding="utf-8") as f:
            json.dump(registry, f, indent=2, ensure_ascii=False)
            f.write("\n")
    except Exception as e:
        print(f"❌ ERROR: Failed to write {SONG_REGISTRY_JSON}: {e}")
        return 0

    print(f"✅ Song registry built: {SONG_REGISTRY_JSON} ({len(registry)} songs)")
    return len(registry)


def link_high_confidence() -> int:
    print(f"\n--- Link High-Confidence Videos ---")
    if not SONG_REGISTRY_JSON.exists():
        print(f"❌ ERROR: Missing {SONG_REGISTRY_JSON}")
        return 0
    if not VIDEO_INDEX_JSON.exists():
        print(f"❌ ERROR: Missing {VIDEO_INDEX_JSON}")
        return 0

    try:
        with open(SONG_REGISTRY_JSON, "r", encoding="utf-8") as f:
            registry = json.load(f)
        with open(VIDEO_INDEX_JSON, "r", encoding="utf-8") as f:
            videos = json.load(f)
    except Exception as e:
        print(f"❌ ERROR: Failed to load inputs: {e}")
        return 0

    video_map = {}
    video_buckets = defaultdict(list)
    for v in videos:
        artist = v.get("artist")
        title = v.get("title")
        file_path = v.get("file_path")
        if not (artist and title and file_path):
            continue
        key = f"{normalize_for_match(artist)}::{normalize_for_match(title)}"
        if key not in video_map:
            video_map[key] = file_path
            bucket_key = key[:1]
            video_buckets[bucket_key].append((key, file_path))

    linked = 0
    for song_id, entry in registry.items():
        media = entry.get("media", {})
        local = media.get("local_video", {})
        if local.get("exists"):
            continue
        artist = entry.get("artist", "")
        title = entry.get("title", "")
        key = f"{normalize_for_match(artist)}::{normalize_for_match(title)}"
        match_path = None
        if key in video_map:
            match_path = video_map[key]
        else:
            best_score = 0.0
            best_path = None
            bucket_key = key[:1]
            for candidate_key, candidate_path in video_buckets.get(bucket_key, []):
                score = SequenceMatcher(None, key, candidate_key).ratio()
                if score > best_score:
                    best_score = score
                    best_path = candidate_path
            if best_score >= 0.95:
                match_path = best_path

        if match_path:
            entry.setdefault("media", {}).setdefault("local_video", {})
            entry["media"]["local_video"]["exists"] = True
            entry["media"]["local_video"]["vdj"] = {"file_path": match_path}
            linked += 1

    try:
        with open(SONG_REGISTRY_WITH_VIDEO_JSON, "w", encoding="utf-8") as f:
            json.dump(registry, f, indent=2, ensure_ascii=False)
            f.write("\n")
    except Exception as e:
        print(f"❌ ERROR: Failed to write {SONG_REGISTRY_WITH_VIDEO_JSON}: {e}")
        return 0

    print(f"✅ Linked {linked} high-confidence videos")
    return linked


def deploy_registry() -> bool:
    print(f"\n--- Deploy Registry to Site ---")
    if not SONG_REGISTRY_WITH_VIDEO_JSON.exists():
        print(f"❌ ERROR: Missing {SONG_REGISTRY_WITH_VIDEO_JSON}")
        return False
    SITE_REGISTRY_DEST.parent.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copy2(SONG_REGISTRY_WITH_VIDEO_JSON, SITE_REGISTRY_DEST)
    except Exception as e:
        print(f"❌ ERROR: Failed to deploy registry: {e}")
        return False
    print(f"✅ Deployed registry to {SITE_REGISTRY_DEST}")
    return True


def write_run_report(report_data: dict) -> bool:
    print(f"\n--- Write Summary Report ---")
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = REPORTS_DIR / f"run_{timestamp}.json"
    try:
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)
            f.write("\n")
    except Exception as e:
        print(f"❌ ERROR: Failed to write report: {e}")
        return False
    print(f"✅ Report written: {report_path}")
    return True


def run_fix_r2_paths() -> bool:
    print(f"\n--- Fix R2 Paths ---")
    try:
        from scripts.pipeline.fix_r2_paths import main as fix_r2_main
    except Exception as e:
        print(f"❌ ERROR: Failed to import fix_r2_paths: {e}")
        return False
    return fix_r2_main() == 0


def run_analyze_r2(video_source_info: dict = None) -> bool:
    """Run R2 analysis script (read-only, generates CSV reports). Uses resolved VIDEO source when provided."""
    print(f"\n--- Analyze R2 Differences (Read-Only) ---")
    if not ANALYZE_R2_SCRIPT.exists():
        print(f"❌ ERROR: R2 analyze script not found at {ANALYZE_R2_SCRIPT}")
        return False

    cmd = [sys.executable, "-u", str(ANALYZE_R2_SCRIPT)]
    if video_source_info and video_source_info.get("path"):
        cmd.extend(["--source", str(video_source_info["path"])])

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=0,
            cwd=str(BASE_DIR)
        )
        for line in iter(process.stdout.readline, ""):
            if line:
                print(line.rstrip(), flush=True)
        process.wait()
        if process.returncode != 0:
            print(f"❌ ERROR: R2 analyze failed with exit code {process.returncode}")
            return False
        return True
    except Exception as e:
        print(f"❌ ERROR: An exception occurred while running R2 analyze: {e}")
        return False


def run_publish_r2(video_source_info: dict = None) -> bool:
    """
    Runs the R2 publishing script using subprocess.
    Streams output so --progress and --stats are visible in real time.
    When video_source_info is provided, passes VIDEO_SOURCE and VIDEO_SOURCE_TYPE in env.
    Returns True on success, False on failure.
    """
    print(f"\n--- Publish to R2 ---")
    if not PUBLISH_R2_SCRIPT.exists():
        print(f"❌ ERROR: R2 publish script not found at {PUBLISH_R2_SCRIPT}")
        return False

    env = os.environ.copy()
    if video_source_info and video_source_info.get("path"):
        env["VIDEO_SOURCE"] = str(video_source_info["path"])
        env["VIDEO_SOURCE_TYPE"] = video_source_info.get("source", "EXPLICIT")

    try:
        process = subprocess.Popen(
            [str(PUBLISH_R2_SCRIPT)],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=0,
            env=env,
            cwd=str(BASE_DIR)
        )
        for line in iter(process.stdout.readline, ""):
            if line:
                print(line.rstrip(), flush=True)
        process.wait()
        if process.returncode != 0:
            print(f"❌ ERROR: R2 publish failed with exit code {process.returncode}")
            return False
        return True
    except Exception as e:
        print(f"❌ ERROR: An exception occurred while running R2 publish: {e}")
        return False


def run_publish_thumbnails(execute: bool) -> bool:
    """Run thumbnail publish script; execute=True passes --execute."""
    print(f"\n--- Publish Thumbnails ---")
    if not PUBLISH_THUMBNAILS_SCRIPT.exists():
        print(f"❌ ERROR: Publish thumbnails script not found at {PUBLISH_THUMBNAILS_SCRIPT}")
        return False
    cmd = [sys.executable, "-u", str(PUBLISH_THUMBNAILS_SCRIPT)]
    if execute:
        cmd.append("--execute")
    try:
        process = subprocess.run(cmd, capture_output=False, text=True, check=False)
        if process.returncode != 0:
            print(f"❌ ERROR: Publish thumbnails failed with exit code {process.returncode}")
            return False
        return True
    except Exception as e:
        print(f"❌ ERROR: An exception occurred while running publish thumbnails: {e}")
        return False


def run_delete_detached_r2(execute: bool) -> bool:
    """Run delete detached R2 script; execute=True passes --execute."""
    print(f"\n--- Delete Detached R2 Videos ---")
    if not DELETE_DETACHED_R2_SCRIPT.exists():
        print(f"❌ ERROR: Delete detached R2 script not found at {DELETE_DETACHED_R2_SCRIPT}")
        return False
    cmd = [sys.executable, "-u", str(DELETE_DETACHED_R2_SCRIPT)]
    if execute:
        cmd.append("--execute")
    try:
        process = subprocess.run(cmd, capture_output=False, text=True, check=False)
        if process.returncode != 0:
            print(f"❌ ERROR: Delete detached R2 failed with exit code {process.returncode}")
            return False
        return True
    except Exception as e:
        print(f"❌ ERROR: An exception occurred while running delete detached R2: {e}")
        return False


# --- Main Orchestration Logic ---
def main():
    parser = argparse.ArgumentParser(
        description="Orchestrates the RetroVerse data pipeline.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument(
        "--export-vdj",
        action="store_true",
        help="Run the VirtualDJ export step."
    )
    parser.add_argument(
        "--merge-youtube",
        action="store_true",
        help="Run the YouTube merge step."
    )
    parser.add_argument(
        "--generate-thumbnails",
        action="store_true",
        help="Run the thumbnail generation step."
    )
    parser.add_argument(
        "--compare-thumbnails",
        action="store_true",
        help="Compare generated thumbnails against sidecar thumbnails (read-only report)."
    )
    parser.add_argument(
        "--publish-thumbnails",
        action="store_true",
        help="Publish thumbnails (MISSING_SIDECAR/DIFFERENT) next to video files; dry-run unless --execute-thumbnails."
    )
    parser.add_argument(
        "--execute-thumbnails",
        action="store_true",
        help="With --publish-thumbnails, perform copies; otherwise dry-run only."
    )
    parser.add_argument(
        "--build-video-index",
        action="store_true",
        help="Build video-index.json from VirtualDJ database.xml."
    )
    parser.add_argument(
        "--build-registry",
        action="store_true",
        help="Build song-registry.json from the Hot 100 DB."
    )
    parser.add_argument(
        "--link-videos",
        action="store_true",
        help="Link high-confidence videos to song registry."
    )
    parser.add_argument(
        "--deploy-site",
        action="store_true",
        help="Deploy song-registry.with-local-video.json to the site."
    )
    parser.add_argument(
        "--write-report",
        action="store_true",
        help="Write a summary report JSON."
    )
    parser.add_argument(
        "--full-update",
        action="store_true",
        help="Run the full RetroVerse data pipeline."
    )
    parser.add_argument(
        "--skip-registry",
        action="store_true",
        help="Skip building song registry during full update."
    )
    parser.add_argument(
        "--vdj-xml",
        type=str,
        default=str(VDJ_DEFAULT_XML),
        help="Path to VirtualDJ database.xml"
    )
    parser.add_argument(
        "--fix-r2-paths",
        action="store_true",
        help="Fix and rewrite R2 public URLs in VideoFiles.json"
    )
    parser.add_argument(
        "--analyze-r2",
        action="store_true",
        help="Analyze R2 differences (read-only, generates CSV reports)"
    )
    parser.add_argument(
        "--publish-r2",
        action="store_true",
        help="Upload VIDEO folder to R2 using rclone copy (append-only, safe)"
    )
    parser.add_argument(
        "--delete-detached-r2",
        action="store_true",
        help="Delete R2 video files that no longer exist locally; dry-run unless --execute-thumbnails."
    )
    parser.add_argument(
        "--video-source",
        type=str,
        default=None,
        help="Explicit VIDEO path for R2 steps (default: NAS if mounted, else Dropbox)."
    )
    parser.add_argument(
        "--match-billboard",
        action="store_true",
        help="Generate repeatable Billboard ↔ VDJ match baseline (output/reports/video_billboard_matches.generated.json)."
    )
    args = parser.parse_args()

    # Resolve VIDEO source once at startup (NAS > Dropbox; used by analyze-r2 and publish-r2)
    video_source_info = detect_video_source(os.environ.get("VIDEO_SOURCE") or args.video_source)
    if video_source_info["source"] != "NONE":
        print(f"Video source: {video_source_info['source']} ({video_source_info['path']})")
    if args.publish_r2 and video_source_info["source"] == "NONE":
        print(f"❌ ERROR: --publish-r2 requires a valid VIDEO source. {video_source_info['message']}")
        return 1

    # When only --match-billboard, run only that step and exit (no backup, no other steps)
    only_match = args.match_billboard and not (
        args.export_vdj or args.merge_youtube or args.generate_thumbnails or
        args.build_video_index or args.build_registry or args.link_videos or
        args.deploy_site or args.write_report or args.full_update or
        args.compare_thumbnails or args.publish_thumbnails or args.publish_r2 or
        args.fix_r2_paths or args.delete_detached_r2 or args.analyze_r2
    )
    if only_match:
        ok = run_match_billboard()
        return 0 if ok else 1

    # Log parsed arguments
    print("ARGS:", end=" ")
    arg_flags = [k for k, v in vars(args).items() if v is True]
    print(" ".join([f"--{k.replace('_', '-')}" for k in arg_flags]) if arg_flags else "(none)")

    # Determine which steps to run
    # Include ALL flags in run_all_legacy check to prevent accidental legacy runs
    run_all_legacy = not (args.export_vdj or args.merge_youtube or args.generate_thumbnails or
                          args.build_video_index or args.build_registry or args.link_videos or
                          args.deploy_site or args.write_report or args.full_update or
                          args.compare_thumbnails or args.publish_thumbnails or args.publish_r2 or
                          args.fix_r2_paths or args.delete_detached_r2 or args.analyze_r2 or args.match_billboard)

    # Safety guard: explicit check for generate_thumbnails flag
    if args.publish_thumbnails and args.generate_thumbnails:
        print("NOTE: publish-thumbnails does not require generation; generation will run because you selected it.")
    
    steps_to_run = []
    if run_all_legacy or args.export_vdj:
        steps_to_run.append(("VirtualDJ Export", EXPORT_VDJ_SCRIPT))
    if run_all_legacy or args.merge_youtube:
        steps_to_run.append(("YouTube Merge", MERGE_YOUTUBE_SCRIPT))
    # Explicit guard: only run if flag is True (not via run_all_legacy when publish-only)
    if args.generate_thumbnails:
        steps_to_run.append(("Thumbnail Generation", GENERATE_THUMBNAILS_SCRIPT))

    should_build_video_index = args.build_video_index
    should_build_registry = args.build_registry
    should_link_videos = args.link_videos
    should_deploy_site = args.deploy_site
    should_write_report = args.write_report
    should_fix_r2_paths = args.fix_r2_paths
    should_analyze_r2 = args.analyze_r2
    should_publish_r2 = args.publish_r2
    should_match_billboard = args.match_billboard
    should_compare_thumbnails = args.compare_thumbnails
    should_publish_thumbnails = args.publish_thumbnails
    should_execute_thumbnails = args.execute_thumbnails and (args.publish_thumbnails or args.delete_detached_r2)
    should_delete_detached_r2 = args.delete_detached_r2

    # Log computed steps
    print("STEPS:", end=" ")
    step_names = [name for name, _ in steps_to_run]
    step_names.extend([k.replace("should_", "").replace("_", "-") for k, v in {
        "should_build_video_index": should_build_video_index,
        "should_build_registry": should_build_registry,
        "should_link_videos": should_link_videos,
        "should_deploy_site": should_deploy_site,
        "should_write_report": should_write_report,
        "should_analyze_r2": should_analyze_r2,
        "should_publish_r2": should_publish_r2,
        "should_match_billboard": should_match_billboard,
        "should_compare_thumbnails": should_compare_thumbnails,
        "should_publish_thumbnails": should_publish_thumbnails,
        "should_delete_detached_r2": should_delete_detached_r2,
    }.items() if v])
    print(" ".join(step_names) if step_names else "(none)")

    if args.full_update:
        should_build_video_index = True
        should_build_registry = not args.skip_registry
        should_fix_r2_paths = True
        should_link_videos = True
        should_deploy_site = True
        should_write_report = True

    if not steps_to_run and not any([
        should_build_video_index,
        should_build_registry,
        should_link_videos,
        should_deploy_site,
        should_write_report,
        should_analyze_r2,
        should_publish_r2,
        should_match_billboard,
        should_compare_thumbnails,
        should_publish_thumbnails,
        should_delete_detached_r2
    ]):
        print("No steps selected. Use --help for options.")
        return 1 # Indicate failure

    print("--- RetroVerse Data Update Started ---")
    start_time = time.time()
    
    # --- Backup VideoFiles.json ---
    backup_path = None
    if VIDEO_FILES_JSON.exists():
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        backup_path = VIDEO_FILES_JSON.with_name(f"VideoFiles_{timestamp}.json.bak")
        try:
            shutil.copy2(VIDEO_FILES_JSON, backup_path)
            print(f"💾 Timestamped backup created: {backup_path}")
        except Exception as e:
            print(f"❌ ERROR: Failed to create backup of {VIDEO_FILES_JSON}: {e}")
            return 1 # Exit on backup failure
    else:
        print(f"⚠️ Warning: {VIDEO_FILES_JSON} not found. Skipping backup.")

    # --- Execute Steps ---
    overall_success = True
    for name, script_path in steps_to_run:
        if not run_step(name, script_path):
            overall_success = False
            break # Stop on first failure

    run_context = {
        "timestamp": time.strftime("%Y%m%d_%H%M%S"),
        "videos_indexed": None,
        "registry_size": None,
        "linked_high_confidence": None,
        "video_source": video_source_info.get("source"),
        "video_source_path": str(video_source_info["path"]) if video_source_info.get("path") else None,
        "flags": {
            "build_video_index": should_build_video_index,
            "build_registry": should_build_registry,
            "link_videos": should_link_videos,
            "deploy_site": should_deploy_site,
            "write_report": should_write_report,
            "full_update": args.full_update,
            "skip_registry": args.skip_registry,
            "vdj_xml": str(args.vdj_xml)
        }
    }

    if overall_success and should_build_video_index:
        run_context["videos_indexed"] = build_video_index(Path(args.vdj_xml))

    if overall_success and should_fix_r2_paths:
        if not run_fix_r2_paths():
            overall_success = False

    if overall_success and should_build_registry:
        run_context["registry_size"] = build_song_registry()

    if overall_success and should_link_videos:
        run_context["linked_high_confidence"] = link_high_confidence()

    if overall_success and should_deploy_site:
        if not deploy_registry():
            overall_success = False

    if overall_success and should_write_report:
        if not write_run_report(run_context):
            overall_success = False

    if overall_success and should_analyze_r2:
        if not run_analyze_r2(video_source_info):
            overall_success = False

    if overall_success and should_match_billboard:
        if not run_match_billboard():
            overall_success = False

    if overall_success and should_publish_r2:
        if not run_publish_r2(video_source_info):
            overall_success = False

    if overall_success and should_compare_thumbnails:
        if not run_step("Compare Thumbnails", COMPARE_THUMBNAILS_SCRIPT):
            overall_success = False

    if overall_success and should_publish_thumbnails:
        if not run_publish_thumbnails(should_execute_thumbnails):
            overall_success = False

    if overall_success and should_delete_detached_r2:
        # Safety guard: require execute_thumbnails flag to actually delete
        execute_delete = args.execute_thumbnails and args.delete_detached_r2
        if not execute_delete:
            print("\n⚠️  NOTE: Delete detached R2 is in preview mode. Use --execute-thumbnails to apply deletions.")
        if not run_delete_detached_r2(execute_delete):
            overall_success = False

    # --- Final Summary ---
    end_time = time.time()
    duration = end_time - start_time
    duration_str = f"{int(duration // 60)}m {int(duration % 60)}s"
    print(f"\n--- RetroVerse Data Update Finished ({duration_str}) ---")

    if overall_success:
        print("✅ All selected steps completed successfully!")
        return 0
    else:
        print("❌ RetroVerse Data Update FAILED!")
        print("Please review the output above for details on the failure.")
        if backup_path:
            print(f"Your original data is preserved in the backup: {backup_path}")
        return 1 # Indicate failure

if __name__ == "__main__":
    sys.exit(main())