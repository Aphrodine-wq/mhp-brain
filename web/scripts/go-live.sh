#!/usr/bin/env bash
# One shot: load schema + your 162 jobs into Neon, seed your admin login.
# (Then redeploy in the Vercel dashboard — root directory is already fixed.)
#
#   bash scripts/go-live.sh                         # auto-generates a password
#   ADMIN_PASS='your-pick' bash scripts/go-live.sh  # choose your own
#   ADMIN_EMAIL=you@x.com ADMIN_PASS='...' bash scripts/go-live.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # -> web/

UNPOOLED=$(grep '^DATABASE_URL_UNPOOLED=' .env.local | cut -d= -f2- | tr -d '"' || true)
[ -z "${UNPOOLED:-}" ] && { echo "ERROR: DATABASE_URL_UNPOOLED missing from web/.env.local (is Neon connected?)"; exit 1; }

EMAIL=${ADMIN_EMAIL:-james@mshomepros.com}
PASS=${ADMIN_PASS:-$(node -e "console.log('mhp-'+require('crypto').randomBytes(5).toString('hex'))")}

echo "1/3  schema -> Neon ..."
DATABASE_URL="$UNPOOLED" node scripts/migrate.mjs

echo "2/3  data (162 jobs) -> Neon ..."
DATABASE_URL="$UNPOOLED" node scripts/sync_to_pg.mjs

echo "3/3  admin ($EMAIL) -> Neon ..."
DATABASE_URL="$UNPOOLED" SEED_EMAIL="$EMAIL" SEED_NAME="James Burge" SEED_PASSWORD="$PASS" SEED_ROLE=admin node scripts/seed-users.mjs

echo ""
echo "=================================================================="
echo "  Database loaded.  LOGIN:"
echo "     $EMAIL"
echo "     $PASS"
echo ""
echo "  Last step — deploy the current code:"
echo "     Vercel dashboard -> mhp-brain -> Deployments -> Redeploy"
echo "     (root directory is fixed, so it'll build now)"
echo "=================================================================="
