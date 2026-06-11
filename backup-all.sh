#!/bin/bash
# backup-all.sh — nightly snapshot of both halves of the brain.
# Half 1: mhp.db + exports (backup.py — base data, regenerable into Neon).
# Half 2: Neon app-owned tables (backup-pg.mjs — users, audit, documents, ops).
# Run by com.mhp.backup launchd job; absolute paths because launchd has no PATH.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"

/usr/bin/python3 "$HERE/backup.py"
rc1=$?

/usr/local/bin/node --env-file="$HERE/web/.env.local" "$HERE/web/scripts/backup-pg.mjs"
rc2=$?

exit $(( rc1 != 0 || rc2 != 0 ? 1 : 0 ))
