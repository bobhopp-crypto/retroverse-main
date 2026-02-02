#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import os
import re
from datetime import datetime

TOKENS_TO_MOVE = [
    "official video", "official", "video",
    "live", "remastered", "remaster",
    "radio edit", "edit", "extended", "mix", "version",
    "tv", "bandstand", "midnight special", "top of the pops",
]

def norm(s: str) -> str:
    if s is None:
        return ""
    s = s.strip().lower()
    s = s.replace("&", " and ")
    s = re.sub(r"[’']", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def band(score: float) -> str:
    if score >= 100: return "A"
    if score >= 95:  return "B"
    if score >= 90:  return "C"
    return "D"

def downgrade(b: str) -> str:
    return {"A":"B", "B":"C", "C":"D", "D":"D"}[b]

def token_hits(title: str) -> list[str]:
    t = norm(title)
    hits = []
    for tok in TOKENS_TO_MOVE:
        if tok in t:
            hits.append(tok)
    return hits

def recommend(row: dict) -> tuple[str, str]:
    """
    Returns: (retag_action, notes)
    """
    score = float(row.get("c1_match_pct") or 0)
    bucket_type = (row.get("bucket_type") or "").strip().upper()

    hot_title = row.get("hot100_title") or ""
    hot_artist = row.get("hot100_artist") or ""

    c1_title = row.get("c1_title") or ""
    c1_artist = row.get("c1_artist") or ""

    # Primary guidance: title/artist normalization + move tokens into Remix
    hot_title_n = norm(hot_title)
    hot_artist_n = norm(hot_artist)
    c1_title_n = norm(c1_title)
    c1_artist_n = norm(c1_artist)

    hits = token_hits(c1_title)

    # If it's already A/B, usually no action
    if score >= 95 and bucket_type == "CORE":
        if hits:
            return ("OPTIONAL", f"VDJ title contains tokens {hits}; consider moving to Remix for cleaner canonical Title.")
        return ("OK", "High confidence. No retag needed.")

    # If artist looks close but title doesn't, likely mis-titled VDJ entry
    artist_close = (hot_artist_n and c1_artist_n and (hot_artist_n in c1_artist_n or c1_artist_n in hot_artist_n))
    title_close = (hot_title_n and c1_title_n and (hot_title_n in c1_title_n or c1_title_n in hot_title_n))

    if score < 90:
        if artist_close and not title_close:
            return ("RETITLE", "Artist looks right but title mismatch. Retag VDJ Title to canonical (Hot100). Put source/version into Remix.")
        if not artist_close and title_close:
            return ("REARTIST", "Title looks right but artist mismatch. Standardize VDJ Artist; move 'with/feat/orchestra' details into Remix or Comment.")
        if hits:
            return ("MOVE_TO_REMIX", f"Low confidence + title contains tokens {hits}. Move these to Remix; keep Title clean.")
        if bucket_type == "ALL":
            return ("REVIEW", "Low confidence and bucket=ALL (noisy). Likely missing song or needs manual match/retag in VDJ.")
        return ("REVIEW", "Low confidence. Manual review.")

    # 90-94: often punctuation / minor formatting
    if 90 <= score < 95:
        if hits:
            return ("MOVE_TO_REMIX", f"OK match but title contains tokens {hits}. Move to Remix for exact filename matching.")
        if bucket_type == "ALL":
            return ("CLEANUP", "OK match but bucket=ALL. Improve VDJ Artist/Title normalization to push into CORE bucket.")
        return ("CLEANUP", "Minor normalization: punctuation/feat/spacing. Standardize Artist/Title for exact match.")

    # 95-99 but noisy bucket
    if score >= 95 and bucket_type == "ALL":
        if hits:
            return ("MOVE_TO_REMIX", f"High score but bucket=ALL. Move tokens {hits} to Remix and normalize Artist.")
        return ("CLEANUP", "High score but bucket=ALL. Normalize Artist/Title to land in CORE bucket.")

    return ("REVIEW", "No specific rule hit; review manually.")

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input_csv")
    args = ap.parse_args()

    in_path = args.input_csv
    base, ext = os.path.splitext(in_path)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")

    out_with = f"{base}_with_confidence_{ts}.csv"
    out_todo = f"{base}_retag_todo_{ts}.csv"

    with open(in_path, "r", encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        rows = list(r)
        fieldnames = r.fieldnames or []

    # Write with confidence
    add_fields = ["confidence_band", "confidence_band_adjusted", "risk_flag", "retag_action", "retag_notes"]
    out_fields = fieldnames + [c for c in add_fields if c not in fieldnames]

    todo_rows = []
    with open(out_with, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=out_fields)
        w.writeheader()

        for row in rows:
            score = float(row.get("c1_match_pct") or 0)
            b0 = band(score)

            bucket_type = (row.get("bucket_type") or "").strip().upper()
            bad_bucket = (bucket_type == "ALL")
            b_adj = downgrade(b0) if bad_bucket and b0 != "D" else b0

            risk = []
            if bad_bucket: risk.append("BUCKET_ALL")
            if score < 90: risk.append("LOW_SCORE")
            if (row.get("c1_title") or "").strip() == "": risk.append("NO_C1")
            risk_flag = ",".join(risk)

            action, notes = recommend(row)

            row["confidence_band"] = b0
            row["confidence_band_adjusted"] = b_adj
            row["risk_flag"] = risk_flag
            row["retag_action"] = action
            row["retag_notes"] = notes

            w.writerow(row)

            # todo list: anything not OK/OPTIONAL at high confidence
            if action not in ("OK",):
                todo_rows.append({
                    "issue_date": row.get("issue_date",""),
                    "rank": row.get("rank",""),
                    "hot100_artist": row.get("hot100_artist",""),
                    "hot100_title": row.get("hot100_title",""),
                    "bucket_type": bucket_type,
                    "c1_match_pct": row.get("c1_match_pct",""),
                    "c1_artist": row.get("c1_artist",""),
                    "c1_title": row.get("c1_title",""),
                    "c1_filepath": row.get("c1_filepath",""),
                    "confidence_band_adjusted": b_adj,
                    "risk_flag": risk_flag,
                    "retag_action": action,
                    "retag_notes": notes,
                })

    todo_fields = [
        "issue_date","rank",
        "hot100_artist","hot100_title",
        "bucket_type","c1_match_pct",
        "c1_artist","c1_title","c1_filepath",
        "confidence_band_adjusted","risk_flag",
        "retag_action","retag_notes",
    ]
    with open(out_todo, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=todo_fields)
        w.writeheader()
        for tr in todo_rows:
            w.writerow(tr)

    print("Wrote:", out_with)
    print("Wrote:", out_todo)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
