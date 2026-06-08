#!/usr/bin/env bash
# Seed 3 throwaway test logins (admin / editor / viewer) into the live Neon DB so you can
# click around the app from each role. Strong random passwords (printed below) — these are
# .test accounts; remove them before launch (command printed at the end).
#
#   bash ~/Projects/mhp-brain/web/scripts/seed-test-logins.sh
set -euo pipefail
cd "$HOME/Projects/mhp-brain/web"

URL=$(grep '^DATABASE_URL_UNPOOLED=' .env.local | cut -d= -f2- | tr -d '"' || true)
[ -z "${URL:-}" ] && { echo "ERROR: DATABASE_URL_UNPOOLED missing from web/.env.local"; exit 1; }

gen() { node -e "console.log('Mhp-'+require('crypto').randomBytes(6).toString('hex'))"; }
PA=$(gen); PE=$(gen); PV=$(gen)

seed() { DATABASE_URL="$URL" SEED_EMAIL="$1" SEED_NAME="$2" SEED_PASSWORD="$3" SEED_ROLE="$4" node scripts/seed-users.mjs >/dev/null; }
echo "seeding 3 test logins into Neon..."
seed admin@mhp.test  "Test Admin"  "$PA" admin
seed editor@mhp.test "Test Editor" "$PE" editor
seed viewer@mhp.test "Test Viewer" "$PV" viewer

echo ""
echo "=========================================================================="
echo "  3 TEST LOGINS  ->  https://mhp-brain.vercel.app/login"
echo ""
echo "    admin@mhp.test    $PA     full access (incl. Connections)"
echo "    editor@mhp.test   $PE     can edit / correct / dismiss"
echo "    viewer@mhp.test   $PV     read-only (write routes 403)"
echo ""
echo "  Remove them before launch:"
echo "    DATABASE_URL='<neon>' node -e \"...\"  — or just ask me for the cleanup."
echo "=========================================================================="
