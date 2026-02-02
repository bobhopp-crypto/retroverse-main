#!/usr/bin/env python3
import os
import json
import datetime
import xml.etree.ElementTree as ET

VDJ_DB = "/Users/bobhopp/Library/Application Support/VirtualDJ/database.xml"
OUTPUT_JSON = "/Users/bobhopp/Sites/retroverse-design/public/data/VideoFiles.json"

def safe_int(v, default=0):
    try:
        return int(v)
    except:
        return default

def derive_decade(year):
    """Round a year down to decade (e.g. 1987 → 1980)."""
    if not year:
        return None
    try:
        y = int(year)
        return (y // 10) * 10
    except:
        return None

def extract_pois(song_elem):
    """Extract all <Poi> elements into a JSON-friendly list."""
    pois = []
    for poi in song_elem.findall("Poi"):
        pois.append({
            "Name": poi.get("Name"),
            "Type": poi.get("Type"),
            "Pos": poi.get("Pos"),
            "Color": poi.get("Color"),
            "Cue": poi.get("Cue")
        })
    return pois

def find_cue_8_timestamp(pois):
    """Return cue #8 timestamp if found."""
    for p in pois:
        cue_num = p.get("Cue")
        if cue_num and cue_num.isdigit() and int(cue_num) == 8:
            pos = p.get("Pos")
            try:
                return float(pos)
            except:
                return None
    return None

def get_thumbnail_timestamp(duration, pois):
    """
    Returns:
      - cue8 timestamp if exists
      - else 30 seconds
      - else 5 seconds if video < 30 seconds
    """
    # Cue 8 wins
    cue8 = find_cue_8_timestamp(pois)
    if cue8 is not None:
        return cue8

    # Duration-safe fallback
    if duration and duration < 30:
        return 5.0
    return 30.0

def extract_all_fields(song_elem):
    """
    Capture ALL fields from a <Song> node — attributes and sub-tags.
    Everything is preserved in a giant dict.
    """
    data = {}

    # Copy all song attributes
    for k, v in song_elem.attrib.items():
        data[k] = v

    # Extract optional sub-tags
    for child in song_elem:
        tagname = child.tag
        # If this child has attributes, store them as a dict
        if child.attrib:
            data[tagname] = dict(child.attrib)
        else:
            # Otherwise store text if present
            text_val = child.text.strip() if child.text else None
            if text_val:
                data[tagname] = text_val

    # Extract POIs
    pois = extract_pois(song_elem)
    data["POIs"] = pois

    # Duration normalization
    duration = None
    scan = data.get("Scan")
    if scan and "Length" in scan:
        duration = safe_int(scan.get("Length"), default=None)

    # Derive decade from Year
    year = data.get("Year")
    data["Decade"] = derive_decade(year)

    # Thumbnail timestamp
    data["Thumbnail"] = get_thumbnail_timestamp(duration, pois)

    return data

def main():
    print("Loading VirtualDJ database...")
    if not os.path.exists(VDJ_DB):
        print(f"ERROR: VDJ database not found at {VDJ_DB}")
        return

    tree = ET.parse(VDJ_DB)
    root = tree.getroot()

    videos = []
    count = 0

    print("Extracting video entries...")
    for song in root.findall("Song"):
        filepath = song.get("FilePath", "")
        if "VIDEO" not in filepath.upper():
            continue

        count += 1
        song_data = extract_all_fields(song)
        videos.append(song_data)

    print(f"Total video records extracted: {count}")

    # Ensure output directory exists
    out_dir = os.path.dirname(OUTPUT_JSON)
    os.makedirs(out_dir, exist_ok=True)

    print(f"Writing JSON → {OUTPUT_JSON}")
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(videos, f, indent=2, ensure_ascii=False)

    print("Complete.")

if __name__ == "__main__":
    main()
