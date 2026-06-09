#!/usr/bin/env bash
# Run any MHP-brain QuickBooks tool with the right environment already loaded: Intuit creds + the
# QuotaGuard static-IP proxy, both from .env. Every Intuit call then exits the allowlisted IP
# (50.17.160.202 / 52.86.18.14) — no exporting HTTPS_PROXY / QB_CLIENT_* by hand, ever.
#
#   ./qb.sh qb_connect.py --status
#   ./qb.sh qb_connect.py --auth-url
#   ./qb.sh qb_pnl.py
#   ./qb.sh -c "import urllib.request as u; print(u.urlopen('https://api.ipify.org').read())"  # prove egress IP
#
# Anything after the script name is passed straight through to python3.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "qb.sh: no .env found next to this script — copy your QB creds + HTTPS_PROXY there first." >&2
  exit 1
fi

# Export everything defined in .env for the child python process.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

exec python3 "$@"
