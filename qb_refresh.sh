#!/usr/bin/env bash
# One command: QuickBooks -> dashboards. Pulls the live book, matches transactions to jobs, computes
# per-job P&L, then syncs the result into the web app's Postgres so the dashboards populate with real
# company numbers. Run AFTER connecting once: ./qb.sh qb_connect.py --auth-url (then --callback).
#
#   ./qb_refresh.sh          # incremental — entity pulls cached < 1h are skipped
#   ./qb_refresh.sh --full   # force a fresh pull of every entity
#
# Every QB call exits the allowlisted static IP (qb.sh loads .env -> HTTPS_PROXY + creds).
set -euo pipefail
cd "$(dirname "$0")"

FULL="${1:-}"

echo "==> 1/4  Pull QuickBooks data (live book, via the static-IP proxy)"
./qb.sh qb_export.py pull ${FULL}

echo "==> 2/4  Match transactions to jobs -> mhp.db"
./qb.sh qb_match.py

echo "==> 3/4  Compute per-job P&L"
./qb.sh qb_pnl.py

echo "==> 4/4  Sync mhp.db -> web Postgres (the dashboards read this)"
( cd web && node --env-file=.env.local scripts/sync_to_pg.mjs )

echo "==> Done. Dashboards now reflect the latest QuickBooks pull."
