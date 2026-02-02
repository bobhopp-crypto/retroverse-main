import os
import shutil
from pathlib import Path

# --- CONFIG ---
THUMB_ROOT = Path("/Users/bobhopp/Sites/retroverse-data/exports/thumbnails")
VIDEO_ROOT = Path("/Users/bobhopp/Library/CloudStorage/Dropbox/VIDEO")

print("\n🔄 VirtualDJ Thumbnail Patch\n")

created = 0
skipped = 0

# loop each decade folder in thumbnails
for decade_dir in THUMB_ROOT.iterdir():
    if not decade_dir.is_dir():
        continue

    video_decade_dir = VIDEO_ROOT / decade_dir.name
    if not video_decade_dir.exists():
        print(f"⚠️  Missing video folder: {video_decade_dir}")
        continue

    print(f"\n📁 Processing: {decade_dir.name}")

    for thumb_file in decade_dir.glob("*.jpg"):
        base = thumb_file.stem   # "ABBA - Dancing Queen"
        mp4_file = video_decade_dir / (base + ".mp4")
        out_file = video_decade_dir / (base + ".jpg")

        if not mp4_file.exists():
            print(f"  ❌ No matching MP4 for: {base}")
            skipped += 1
            continue

        if out_file.exists():
            print(f"  ⏭️ Already exists: {out_file.name}")
            skipped += 1
            continue

        shutil.copy2(thumb_file, out_file)
        print(f"  ✅ Thumbnail copied: {out_file.name}")
        created += 1

print("\n🎉 Done! VDJ thumbnails prepared.")
print(f"🟢 Created: {created}")
print(f"🟡 Skipped: {skipped}")
print("\n➡️ Open VirtualDJ → right-click folder → Batch → Reload Tags\n")
