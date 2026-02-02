# RetroVerse Runbook (v1)

## Sacred Paths (do not change casually)
- Site:      /Users/bobhopp/Sites/retroverse-site
- API:       /Users/bobhopp/Sites/retroverse-api
- Data:      /Users/bobhopp/Sites/retroverse-data
- Databases: /Users/bobhopp/Sites/retroverse-data/databases

## Hot 100 Database
- DB file: /Users/bobhopp/Sites/retroverse-data/databases/billboard-hot-100.db

## Hot 100 Auto-Update
- Script: /Users/bobhopp/Sites/retroverse-data/scripts/update_hot100_db.py
- Schedule: launchd runs weekly (Sat 10:15) AND once at login (catch-up if Mac was off)
- LaunchAgent: ~/Library/LaunchAgents/com.retroverse.hot100.update.plist

## “Is it up to date?”
Run:
sqlite3 /Users/bobhopp/Sites/retroverse-data/databases/billboard-hot-100.db "SELECT MAX(chart_date) FROM hot100;"

## Manual update (rarely needed)
Run:
/Users/bobhopp/Sites/retroverse-data/scripts/update_hot100_db.py

## Where to look if something fails
Main log:
tail -n 60 /Users/bobhopp/Sites/retroverse-data/logs/update_hot100_db.log

launchd logs:
tail -n 60 /Users/bobhopp/Sites/retroverse-data/logs/launchd_hot100_stdout.log
tail -n 60 /Users/bobhopp/Sites/retroverse-data/logs/launchd_hot100_stderr.log

## What “last_week = 0” means
Song was not on the chart the prior week (new entry or re-entry).
