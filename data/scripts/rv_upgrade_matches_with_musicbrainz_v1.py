#!/usr/bin/env python3
"""
rv_upgrade_matches_with_musicbrainz_v1.py

Goal:
- Take your existing match CSV (hot100_vs_vdj_top3_*.csv)
- Join in MusicBrainz enrichment (mbid + canonical mb_title/mb_first_artist)
- Compute improved title/artist comparisons using MB canonical fields
- Output a new CSV with "mb_*" columns + "mb_based_confidence"

No DB writes. No VDJ writes. CSV in /exports/matches/.
"""

from __future__ import annotations
import csv, re, time
from pathlib import Path
from difflib import SequenceMatcher

STOP = {"the","a","an","and","or","of","to","with","feat","featuring","ft","vs","x"}

def norm(s: str) -> str:
    s = (s or "").lower().strip()
    s = s.replace("&"," and ")
    s = re.sub(r"[’']", "", s)
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\[.*?\]", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def core_artist(s: str) -> str:
    s = norm(s)
    for sep in [" feat ", " featuring ", " ft ", " vs ", " x ", " with ", " and ", ",", ";"]:
        if sep in s:
            s = s.split(sep)[0].strip()
    return s

def sim(a: str, b: str) -> float:
    return SequenceMatcher(None, norm(a), norm(b)).ratio()

def band(score: float) -> str:
    # conservative bands (tune later)
    if score >= 0.97: return "A"
    if score >= 0.92: return "B"
    if score >= 0.86: return "C"
    return "D"

def main() -> int:
    import sys
    if len(sys.argv) != 3:
        print("Usage: rv_upgrade_matches_with_musicbrainz_v1.py /path/to/matches.csv /path/to/mb_enrichment.csv")
        return 2

    matches = Path(sys.argv[1]).expanduser()
    mbcsv   = Path(sys.argv[2]).expanduser()
    if not matches.exists(): raise SystemExit(f"Missing: {matches}")
    if not mbcsv.exists(): raise SystemExit(f"Missing: {mbcsv}")

    # Load MB enrichment indexed by (issue_id, rank) — stable for this workflow
    mb = {}
    with mbcsv.open("r", encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        for row in r:
            key = (row.get("issue_id",""), str(row.get("rank","")))
            mb[key] = row

    outdir = matches.parent
    stamp = time.strftime("%Y%m%d-%H%M%S")
    out = outdir / (matches.stem + f"_mbup_{stamp}.csv")

    with matches.open("r", encoding="utf-8", newline="") as f_in, out.open("w", encoding="utf-8", newline="") as f_out:
        r = csv.DictReader(f_in)
        fieldnames = list(r.fieldnames or [])

        add_cols = [
            "mbid","mb_score","mb_title","mb_first_artist",
            "mb_title_clean","mb_artist_core",
            "mb_confidence_score","mb_confidence_band",
            "mb_notes"
        ]
        for c in add_cols:
            if c not in fieldnames:
                fieldnames.append(c)

        w = csv.DictWriter(f_out, fieldnames=fieldnames)
        w.writeheader()

        for row in r:
            key = (row.get("issue_id",""), str(row.get("rank","")))
            m = mb.get(key, {})

            mbid = (m.get("mbid") or "").strip()
            mb_title = (m.get("mb_title") or m.get("title") or "").strip()
            mb_artist = (m.get("mb_first_artist") or m.get("artist") or "").strip()

            row["mbid"] = mbid
            row["mb_score"] = m.get("mb_score","")
            row["mb_title"] = mb_title
            row["mb_first_artist"] = mb_artist
            row["mb_title_clean"] = norm(mb_title)
            row["mb_artist_core"] = core_artist(mb_artist)

            # Choose which title/artist to compare against VDJ candidates:
            # Prefer MB canonical when available; otherwise fall back to hot100_title/hot100_artist
            base_title = mb_title if mb_title else row.get("hot100_title","")
            base_artist = mb_artist if mb_artist else row.get("hot100_artist","")

            # Evaluate best candidate among c1/c2/c3 using MB base
            best = 0.0
            best_idx = ""
            notes = []

            for i in [1,2,3]:
                ct = row.get(f"c{i}_title","")
                ca = row.get(f"c{i}_artist","")
                if not ct and not ca:
                    continue
                title_s = sim(base_title, ct)
                artist_s = sim(core_artist(base_artist), core_artist(ca))
                score = 0.75*title_s + 0.25*artist_s  # title dominates for your filename-driven world
                if score > best:
                    best = score
                    best_idx = f"c{i}"
                # flag possible “right artist but wrong title” etc.
            if not mbid:
                notes.append("MBID_NOT_FOUND")

            row["mb_confidence_score"] = f"{best:.3f}"
            row["mb_confidence_band"] = band(best)
            row["mb_notes"] = ",".join(notes)

            w.writerow(row)

    print("Wrote:", out)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

