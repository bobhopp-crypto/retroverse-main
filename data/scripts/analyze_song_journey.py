#!/usr/bin/env python3
"""
analyze_song_journey.py (v1)
Reads RetroVerse song_journey.json and prints chart-run statistics.

Usage (from Terminal):
  python3 /Users/bobhopp/Sites/retroverse-data/scripts/analyze_song_journey.py \
    /Users/bobhopp/Sites/retroverse/data/song_journey.json
"""

from __future__ import annotations
import json
import sys
from dataclasses import dataclass
from datetime import datetime
from statistics import mean, median
from typing import List, Tuple


DATE_FMT = "%Y-%m-%d"


def parse_date(s: str) -> datetime:
    return datetime.strptime(s, DATE_FMT)


@dataclass
class Point:
    dt: datetime
    rank: int


def weeks_between(a: datetime, b: datetime) -> int:
    """Approx weeks difference between two chart issue dates."""
    return round((b - a).days / 7)


def is_next_week(a: datetime, b: datetime) -> bool:
    return (b - a).days in (7, 6, 8)  # tolerate slight spacing oddities


def fmt_date(d: datetime) -> str:
    return d.strftime(DATE_FMT)


def main(path: str) -> None:
    data = json.load(open(path, "r", encoding="utf-8"))

    title = data.get("title", "")
    artist = data.get("artist", "")
    points_raw = data.get("points", [])

    pts: List[Point] = []
    for p in points_raw:
        if not p or "date" not in p or "rank" not in p:
            continue
        dt = parse_date(p["date"])
        rk = int(p["rank"])
        pts.append(Point(dt=dt, rank=rk))

    pts.sort(key=lambda x: x.dt)

    if len(pts) < 2:
        print("Not enough points.")
        return

    ranks = [p.rank for p in pts]
    best = min(ranks)
    worst = max(ranks)
    best_weeks = sum(1 for r in ranks if r == best)
    weeks_top10 = sum(1 for r in ranks if r <= 10)
    weeks_top20 = sum(1 for r in ranks if r <= 20)
    weeks_top40 = sum(1 for r in ranks if r <= 40)

    # Streaks and gaps (runs)
    runs: List[Tuple[datetime, datetime, int]] = []
    cur_start = pts[0].dt
    cur_len = 1

    gaps: List[Tuple[datetime, datetime, int]] = []
    max_gap_w = 0

    longest_streak = 1
    longest_streak_start = pts[0].dt
    longest_streak_end = pts[0].dt

    for i in range(1, len(pts)):
        prev = pts[i - 1]
        cur = pts[i]
        gapw = weeks_between(prev.dt, cur.dt)

        if is_next_week(prev.dt, cur.dt):
            cur_len += 1
        else:
            # close run
            runs.append((cur_start, prev.dt, cur_len))
            # record gap
            gaps.append((prev.dt, cur.dt, gapw))
            max_gap_w = max(max_gap_w, gapw)
            # start new run
            cur_start = cur.dt
            cur_len = 1

        # update longest streak
        if cur_len > longest_streak:
            longest_streak = cur_len
            longest_streak_start = cur_start
            longest_streak_end = cur.dt

    runs.append((cur_start, pts[-1].dt, cur_len))

    # Per-year summary
    per_year = {}
    for p in pts:
        y = p.dt.year
        per_year.setdefault(y, {"weeks": 0, "best": 999, "top10": 0, "top20": 0})
        per_year[y]["weeks"] += 1
        per_year[y]["best"] = min(per_year[y]["best"], p.rank)
        per_year[y]["top10"] += 1 if p.rank <= 10 else 0
        per_year[y]["top20"] += 1 if p.rank <= 20 else 0

    # Recurrence heuristics
    num_returns = max(0, len(runs) - 1)
    recurring = (num_returns >= 2) or (max_gap_w >= 10)  # 10+ weeks off = strong recurrence signal

    # Print report
    print("SONG JOURNEY — RUN STATS (v1)")
    print("-" * 36)
    print(f"Title : {title}")
    print(f"Artist: {artist}")
    print("")
    print(f"Debut : {fmt_date(pts[0].dt)}")
    print(f"Last  : {fmt_date(pts[-1].dt)}")
    print(f"Weeks : {len(pts)} (cumulative)")
    print(f"Best  : #{best} ({best_weeks} week(s) at peak)")
    print(f"Worst : #{worst}")
    print(f"Avg   : {mean(ranks):.2f}")
    print(f"Median: {median(ranks):.0f}")
    print("")
    print(f"Top 10 weeks: {weeks_top10}")
    print(f"Top 20 weeks: {weeks_top20}")
    print(f"Top 40 weeks: {weeks_top40}")
    print("")
    print(f"Runs (continuous chart presence): {len(runs)}")
    print(f"Returns (drops off + comes back): {num_returns}")
    print(f"Max gap off-chart: {max_gap_w} week(s)")
    print(f"Recurring pattern: {'YES' if recurring else 'NO'}")
    print("")
    print(f"Longest continuous streak: {longest_streak} week(s)")
    print(f"  {fmt_date(longest_streak_start)} → {fmt_date(longest_streak_end)}")
    print("")
    print("RUN LIST:")
    for idx, (a, b, ln) in enumerate(runs, start=1):
        print(f"  Run {idx:02d}: {fmt_date(a)} → {fmt_date(b)}   ({ln} week(s))")
    if gaps:
        print("")
        print("GAPS BETWEEN RUNS:")
        for (a, b, gw) in gaps:
            print(f"  {fmt_date(a)} → {fmt_date(b)}   gap ≈ {gw} week(s)")

    print("")
    print("PER-YEAR SUMMARY (weeks / best / top10):")
    for y in sorted(per_year.keys()):
        row = per_year[y]
        print(f"  {y}: {row['weeks']:>2} weeks • best #{row['best']:<3} • top10 {row['top10']:>2}")

    print("")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 analyze_song_journey.py /path/to/song_journey.json")
        sys.exit(2)
    main(sys.argv[1])
