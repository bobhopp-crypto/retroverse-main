#!/usr/bin/env python3
# rv_match_top3_artistcore_hot100_vs_vdj.py (v2.2)
# Hot100 -> VDJ: core-artist extraction + Top 3 candidate matches with match %.

from __future__ import annotations

import csv, json, re, sqlite3
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, List, Tuple

BASE = Path("/Users/bobhopp/Sites/retroverse-data")
MASTER_DB = BASE / "databases" / "retroverse-master.db"
VDJ_JSON  = BASE / "exports" / "vdj" / "VideoFiles.json"

OUT_DIR = BASE / "exports" / "matches"
OUT_CSV = OUT_DIR / "hot100_vs_vdj_top3_artistcore.csv"

LIMIT = 250
TOP_N = 3

def norm(s: str) -> str:
    s = (s or "").lower().strip()
    s = s.replace("&", " and ")
    s = re.sub(r"\([^)]*\)", " ", s)                    # remove parentheses
    s = s.replace("’", "'").replace("`", "'")
    s = re.sub(r"\b(feat|featuring|ft)\b.*$", "", s)    # drop feat tail
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

# Words that indicate collaborators / ensembles, not the core artist identity
ARTIST_SPLIT_RE = re.compile(
    r"\b(with|and|feat|featuring|ft|vs|x|duet|presents)\b.*$"
)

# Words we want to ignore when building artist tokens (common in credit strings)
ARTIST_STOPWORDS = {
    "with","and","the","a","an","of","orchestra","chorus","singers","singer",
    "his","her","their","band","group","feat","featuring","ft","vs","x","presents"
}

def core_artist(artist: str) -> str:
    a = norm(artist)
    a = ARTIST_SPLIT_RE.sub("", a).strip()
    # remove stopwords inside the remaining core
    toks = [t for t in a.split() if t not in ARTIST_STOPWORDS]
    return " ".join(toks).strip()

def ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()

def score_artistfirst(ht: str, ha_core: str, vt: str, va_core: str) -> float:
    # Artist core is the anchor
    a = ratio(ha_core, va_core)
    t = ratio(ht, vt)
    return (0.65 * a) + (0.35 * t)

def first_last_tokens(a_core: str) -> Tuple[str, str]:
    toks = a_core.split()
    return (toks[0] if toks else "", toks[-1] if toks else "")

def fetch_recent_hot100(limit: int) -> List[dict]:
    con = sqlite3.connect(str(MASTER_DB))
    cur = con.cursor()
    cur.execute("""
        SELECT e.issue_date, e.issue_id, ee.rank, w.title_display, p.name_display
        FROM event e
        JOIN event_entry ee ON ee.event_id = e.event_id
        JOIN work w ON w.work_id = ee.work_id
        JOIN person p ON p.person_id = w.primary_person_id
        WHERE e.source_system='RVA-HOT100'
        ORDER BY e.issue_date DESC, ee.rank ASC
        LIMIT ?;
    """, (limit,))
    rows = cur.fetchall()
    con.close()
    return [{"issue_date": r[0], "issue_id": r[1], "rank": int(r[2]), "title": r[3], "artist": r[4]} for r in rows]

def load_vdj() -> Tuple[List[dict], Dict[str, List[int]], Dict[str, List[int]]]:
    raw = json.loads(VDJ_JSON.read_text(encoding="utf-8"))
    vids: List[dict] = []
    by_first: Dict[str, List[int]] = {}
    by_last: Dict[str, List[int]] = {}

    for v in raw:
        title = v.get("Title","") or ""
        artist = v.get("Artist","") or ""

        tn = norm(title)
        an_core = core_artist(artist)

        if not tn or not an_core:
            continue

        rec = {
            "Title": title,
            "Artist": artist,
            "Year": v.get("Year","") or "",
            "Genre": v.get("Genre","") or "",
            "PlayCount": v.get("PlayCount","") or "",
            "FilePath": v.get("FilePath","") or "",
            "tn": tn,
            "an_core": an_core,
        }
        vids.append(rec)

        f, l = first_last_tokens(an_core)
        if f: by_first.setdefault(f, []).append(len(vids)-1)
        if l: by_last.setdefault(l, []).append(len(vids)-1)

    return vids, by_first, by_last

def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    hot = fetch_recent_hot100(LIMIT)
    vids, by_first, by_last = load_vdj()

    fields = [
        "issue_date","issue_id","rank",
        "hot100_title","hot100_artist","hot_core_artist",
        "bucket_size",
    ]
    for i in range(1, TOP_N+1):
        fields += [
            f"c{i}_match_pct",
            f"c{i}_title",
            f"c{i}_artist",
            f"c{i}_year",
            f"c{i}_genre",
            f"c{i}_playcount",
            f"c{i}_filepath",
        ]

    out_rows = []

    for h in hot:
        ht = norm(h["title"])
        ha_core = core_artist(h["artist"])

        f, l = first_last_tokens(ha_core)
        set_first = set(by_first.get(f, [])) if f else set()
        set_last  = set(by_last.get(l, [])) if l else set()

        # Prefer intersection; fall back to first-token bucket; then last-token bucket; then full scan.
        if set_first and set_last:
            cand = list(set_first.intersection(set_last))
        elif set_first:
            cand = list(set_first)
        elif set_last:
            cand = list(set_last)
        else:
            cand = list(range(len(vids)))

        # If bucket is tiny, widen to all (rare)
        if len(cand) < 25:
            cand = list(range(len(vids)))

        scored: List[Tuple[float, dict]] = []
        for idx in cand:
            v = vids[idx]
            s = score_artistfirst(ht, ha_core, v["tn"], v["an_core"])
            scored.append((s, v))

        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:TOP_N]

        row = {
            "issue_date": h["issue_date"],
            "issue_id": h["issue_id"],
            "rank": h["rank"],
            "hot100_title": h["title"],
            "hot100_artist": h["artist"],
            "hot_core_artist": ha_core,
            "bucket_size": len(cand),
        }

        for i, (s, v) in enumerate(top, start=1):
            row[f"c{i}_match_pct"] = int(round(s * 100))
            row[f"c{i}_title"] = v["Title"]
            row[f"c{i}_artist"] = v["Artist"]
            row[f"c{i}_year"] = v["Year"]
            row[f"c{i}_genre"] = v["Genre"]
            row[f"c{i}_playcount"] = v["PlayCount"]
            row[f"c{i}_filepath"] = v["FilePath"]

        out_rows.append(row)

    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(out_rows)

    print(f"Rows: {len(out_rows)}")
    print(f"Wrote: {OUT_CSV}")
    print("Tip: filter where c1_match_pct >= 90, and review cases where c1 is wrong but c2/c3 is right.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

