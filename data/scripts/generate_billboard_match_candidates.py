#!/usr/bin/env python3
# scripts/generate_billboard_match_candidates.py
# Generates ranked Billboard match candidates for unmatched videos only (Excel review).
# No auto-accept; output is CSV for human review and later ingestion.

import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from difflib import SequenceMatcher

try:
    from rapidfuzz import fuzz
    _HAS_RAPIDFUZZ = True
except ImportError:
    _HAS_RAPIDFUZZ = False

# Paths relative to project root (parent of scripts/)
_ROOT = Path(__file__).resolve().parent.parent
VIDEO_FILES_JSON = _ROOT / "exports" / "vdj" / "VideoFiles.json"
CURATED_JSON = _ROOT / "output" / "reports" / "video_billboard_matches.curated.json"
HOT100_INDEX_JSON = _ROOT / "output" / "reports" / "hot100_song_index.json"
OUTPUT_CSV = _ROOT / "output" / "reports" / "video_billboard_match_candidates.csv"

# Scoring weights: title highest, artist second, year light bonus only
_TITLE_WEIGHT = 0.65
_ARTIST_WEIGHT = 0.30
_YEAR_BONUS_MAX = 0.05
_TOP_N = 5


def _normalize(text: str) -> str:
    """Normalize for matching: lowercase, strip parens/brackets, collapse spaces, ASCII."""
    if text is None:
        return ""
    s = str(text).lower()
    while True:
        n = re.sub(r"\([^()]*\)", "", s)
        if n == s:
            break
        s = n
    while True:
        n = re.sub(r"\[[^\]]*\]", "", s)
        if n == s:
            break
        s = n
    s = re.sub(r"[-_\[\]{}.]", " ", s)
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    try:
        import unicodedata
        s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    except Exception:
        pass
    return s


def _similarity(a: str, b: str) -> float:
    """String similarity in [0, 1]."""
    if _HAS_RAPIDFUZZ:
        return fuzz.ratio(a, b) / 100.0
    return SequenceMatcher(None, a or "", b or "").ratio()


def _parse_year(val) -> int | None:
    if val is None:
        return None
    m = re.match(r"(\d{4})", str(val))
    return int(m.group(1)) if m else None


def _year_bonus(video_year: int | None, first: int | None, last: int | None) -> float:
    """Light bonus in [0, 1]; do not penalize. Uses first_chart_year when only one year."""
    if video_year is None:
        return 0.0
    chart = first if first is not None else last
    if chart is None:
        return 0.0
    delta = abs(video_year - chart)
    if delta == 0:
        return 1.0
    if delta == 1:
        return 0.5
    if delta == 2:
        return 0.25
    return 0.0


def _score(v_artist_norm: str, v_title_norm: str, v_year: int | None,
           b_artist_norm: str, b_title_norm: str, b_first: int | None, b_last: int | None) -> float:
    ts = _similarity(v_title_norm, b_title_norm)
    asim = _similarity(v_artist_norm, b_artist_norm)
    yb = _year_bonus(v_year, b_first, b_last)
    raw = _TITLE_WEIGHT * ts + _ARTIST_WEIGHT * asim + _YEAR_BONUS_MAX * yb
    return round(min(1.0, max(0.0, raw)), 3)


def main() -> int:
    # Load videos
    if not VIDEO_FILES_JSON.exists():
        print(f"ERROR: Video list not found at {VIDEO_FILES_JSON}", file=sys.stderr)
        return 1
    with open(VIDEO_FILES_JSON, "r", encoding="utf-8") as f:
        videos = json.load(f)
    if not isinstance(videos, list):
        videos = []
    print(f"Loaded {len(videos)} total videos")

    # Load curated matches -> matched video_ids
    matched_ids = set()
    if CURATED_JSON.exists():
        with open(CURATED_JSON, "r", encoding="utf-8") as f:
            curated = json.load(f)
        if isinstance(curated, list):
            for r in curated:
                vid = r.get("video_id")
                if vid:
                    matched_ids.add(str(vid))
        print(f"Loaded {len(matched_ids)} curated matches")
    else:
        print("Loaded 0 curated matches (file missing)")

    # Load Hot 100 index
    if not HOT100_INDEX_JSON.exists():
        print(f"ERROR: Hot 100 index not found at {HOT100_INDEX_JSON}", file=sys.stderr)
        return 1
    with open(HOT100_INDEX_JSON, "r", encoding="utf-8") as f:
        billboard_raw = json.load(f)
    if not isinstance(billboard_raw, list):
        billboard_raw = []
    billboard = []
    for r in billboard_raw:
        sid = r.get("song_id") or ""
        title_raw = r.get("title_norm") or r.get("title_display") or ""
        if not sid or not title_raw:
            continue
        billboard.append({
            "song_id": sid,
            "artist_norm": _normalize(r.get("artist_norm") or r.get("artist_display") or ""),
            "title_norm": _normalize(title_raw),
            "artist_display": (r.get("artist_display") or r.get("artist_norm") or "").strip(),
            "title_display": (r.get("title_display") or r.get("title_norm") or "").strip(),
            "first_chart_year": r.get("first_chart_year"),
            "last_chart_year": r.get("last_chart_year"),
        })

    # Bucket Billboard by artist_norm prefix (first 4 chars) for faster candidate lookup
    by_artist_prefix: dict[str, list] = defaultdict(list)
    for b in billboard:
        key = (b["artist_norm"][:4]) if len(b["artist_norm"]) >= 4 else b["artist_norm"] or "_"
        by_artist_prefix[key].append(b)

    # Build list of unmatched videos with video_id, artist_norm, title_norm, year
    unmatched = []
    for v in videos:
        fp = v.get("FilePath") or ""
        artist = v.get("Artist") or ""
        title = v.get("Title") or ""
        if not title and fp:
            stem = Path(fp).stem
            if " - " in stem:
                parts = stem.split(" - ", 1)
                artist = artist or parts[0].strip()
                title = parts[1].strip()
        if not title:
            continue
        video_id = fp or f"{artist}__{title}"
        if video_id in matched_ids:
            continue
        year = _parse_year(v.get("Year"))
        unmatched.append({
            "video_id": video_id,
            "video_artist": artist,
            "video_title": title,
            "artist_norm": _normalize(artist),
            "title_norm": _normalize(title),
            "video_year": year,
        })

    print(f"Unmatched videos: {len(unmatched)}")

    # For each unmatched video: score Billboard songs in same artist-prefix bucket, keep top 5
    rows = []
    for u in unmatched:
        an = u["artist_norm"]
        cands = []
        for plen in [4, 3, 2, 1]:
            if len(an) < plen:
                continue
            key = an[:plen] if plen <= len(an) else an
            cands = by_artist_prefix.get(key, [])
            if cands:
                break
        if not cands:
            cands = billboard
        scored = []
        for b in cands:
            sc = _score(
                u["artist_norm"], u["title_norm"], u["video_year"],
                b["artist_norm"], b["title_norm"],
                b.get("first_chart_year"), b.get("last_chart_year"),
            )
            scored.append((sc, b))
        # Stable sort: score desc, then billboard song_id asc
        scored.sort(key=lambda x: (-x[0], x[1]["song_id"]))
        for rank, (score, b) in enumerate(scored[:_TOP_N], start=1):
            rows.append({
                "video_id": u["video_id"],
                "video_artist": u["video_artist"],
                "video_title": u["video_title"],
                "video_year": u["video_year"] if u["video_year"] is not None else "",
                "candidate_rank": rank,
                "billboard_song_id": b["song_id"],
                "billboard_artist": b.get("artist_display", ""),
                "billboard_title": b.get("title_display", ""),
                "first_chart_year": b.get("first_chart_year") if b.get("first_chart_year") is not None else "",
                "last_chart_year": b.get("last_chart_year") if b.get("last_chart_year") is not None else "",
                "match_score": f"{score:.3f}",
            })

    # Deterministic output: sort by video_id, candidate_rank
    rows.sort(key=lambda r: (r["video_id"], r["candidate_rank"]))

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    col_order = [
        "video_id", "video_artist", "video_title", "video_year",
        "candidate_rank", "billboard_song_id", "billboard_artist", "billboard_title",
        "first_chart_year", "last_chart_year", "match_score",
    ]
    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=col_order)
        w.writeheader()
        w.writerows(rows)

    print(f"Generated {len(rows)} candidate rows ({len(unmatched)} × up to {_TOP_N})")
    print("Wrote output/reports/video_billboard_match_candidates.csv")
    return 0


if __name__ == "__main__":
    sys.exit(main())
