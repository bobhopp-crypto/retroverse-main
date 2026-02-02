#!/usr/bin/env python3
# rv_compare_thumbnails.py
# Read-only comparison of generated thumbnails vs sidecar thumbnails

import hashlib
import csv
from pathlib import Path
from collections import defaultdict
import time

# Configuration (matches rv_generate_thumbnails.py)
VIDEO_ROOT = Path("/Users/bobhopp/Library/CloudStorage/Dropbox/VIDEO")
EXPORT_ROOT = Path("/Users/bobhopp/Sites/retroverse-data/exports/thumbnails")
REPORTS_DIR = Path("/Users/bobhopp/Sites/retroverse-data/exports/reports")

# Categories
MATCH = "MATCH"
DIFFERENT = "DIFFERENT"
MISSING_SIDECAR = "MISSING_SIDECAR"
MISSING_GENERATED = "MISSING_GENERATED"


def file_hash(file_path: Path) -> str:
    """Compute SHA256 hash of file."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def find_sidecar_thumbnail(video_path: Path):
    """Find sidecar thumbnail (.jpg or .png) next to video file."""
    base_name = video_path.stem
    for ext in [".jpg", ".png"]:
        sidecar = video_path.parent / (base_name + ext)
        if sidecar.exists():
            return sidecar
    return None


def compare_thumbnails(generated_path: Path, sidecar_path):
    """Compare thumbnails and return category."""
    generated_exists = generated_path.exists()
    sidecar_exists = sidecar_path is not None and sidecar_path.exists()
    
    if not generated_exists and not sidecar_exists:
        return None  # Skip if neither exists
    
    if generated_exists and not sidecar_exists:
        return MISSING_SIDECAR
    
    if not generated_exists and sidecar_exists:
        return MISSING_GENERATED
    
    # Both exist - compare hashes
    gen_hash = file_hash(generated_path)
    side_hash = file_hash(sidecar_path)
    
    if gen_hash == side_hash:
        return MATCH
    else:
        return DIFFERENT


def main():
    print("\n--- Compare Thumbnails ---")
    
    # Gather all video files (same logic as thumbnail generation)
    video_files = sorted([p for p in VIDEO_ROOT.rglob("*.mp4")])
    total = len(video_files)
    
    print(f"Found {total} video files.\n")
    
    # Process each video
    results = defaultdict(list)
    
    for i, video_path in enumerate(video_files, start=1):
        if i % 100 == 0:
            print(f"Processing {i}/{total}...", flush=True)
        
        # Determine paths
        rel = video_path.relative_to(VIDEO_ROOT)
        decade_folder = rel.parts[0]  # ex: "1980's"
        thumb_filename = video_path.stem + ".jpg"
        
        generated_path = EXPORT_ROOT / decade_folder / thumb_filename
        sidecar_path = find_sidecar_thumbnail(video_path)
        
        # Compare
        category = compare_thumbnails(generated_path, sidecar_path)
        
        if category is None:
            continue  # Skip if neither exists
        
        # Store result
        result = {
            "video_path": str(video_path),
            "video_name": video_path.name,
            "decade": decade_folder,
            "generated_path": str(generated_path) if generated_path.exists() else "",
            "sidecar_path": str(sidecar_path) if sidecar_path else "",
            "category": category
        }
        results[category].append(result)
    
    # Print summary
    print(f"\n📊 Comparison Summary:")
    print(f"   ✅ MATCH: {len(results[MATCH])}")
    print(f"   🔄 DIFFERENT: {len(results[DIFFERENT])}")
    print(f"   📤 MISSING_SIDECAR: {len(results[MISSING_SIDECAR])}")
    print(f"   📥 MISSING_GENERATED: {len(results[MISSING_GENERATED])}")
    
    # Write CSV report
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    csv_path = REPORTS_DIR / f"thumbnail_comparison_{timestamp}.csv"
    
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "category", "video_name", "decade", "video_path", 
            "generated_path", "sidecar_path"
        ])
        writer.writeheader()
        
        # Write all categories
        for category in [MATCH, DIFFERENT, MISSING_SIDECAR, MISSING_GENERATED]:
            for result in sorted(results[category], key=lambda x: x["video_name"]):
                writer.writerow(result)
    
    print(f"\n✅ Report written: {csv_path}")
    return 0


if __name__ == "__main__":
    exit(main())
