#!/usr/bin/env bash
# Turn the "Skip login" button ON (or OFF) on the PRODUCTION login page.
# It commits the button code, sets ALLOW_DEV_BUTTON in the Vercel prod env, and deploys.
#
#   bash ~/Projects/mhp-brain/web/scripts/ship-bypass.sh        # turn the button ON
#   bash ~/Projects/mhp-brain/web/scripts/ship-bypass.sh off    # remove it
set -euo pipefail
ROOT="$HOME/Projects/mhp-brain"
cd "$ROOT"
MODE="${1:-on}"

echo "1/3  commit button code..."
git add web/app/api/dev-login/route.ts web/app/login/page.tsx web/app/login/LoginForm.tsx
git commit -q -m "web: one-click admin 'Skip login' button (ALLOW_DEV_BUTTON-gated)" 2>/dev/null || echo "     (already committed)"

cd web
NO_UPDATE_NOTIFIER=1 npx vercel env rm ALLOW_DEV_BUTTON production -y >/dev/null 2>&1 || true
if [ "$MODE" != "off" ]; then
  echo "2/3  enable ALLOW_DEV_BUTTON=1 (Vercel production)..."
  printf '1' | NO_UPDATE_NOTIFIER=1 npx vercel env add ALLOW_DEV_BUTTON production
else
  echo "2/3  ALLOW_DEV_BUTTON removed."
fi
cd "$ROOT"

echo "3/3  deploy..."
cp -r web/.vercel .vercel
NO_UPDATE_NOTIFIER=1 npx vercel --prod --yes
rm -rf .vercel

echo ""
echo "=================================================================="
if [ "$MODE" = "off" ]; then
  echo "  Skip-login button REMOVED from production."
else
  echo "  DONE.  https://mhp-brain.vercel.app/login"
  echo "  -> click  'Skip login — sign in as admin'  -> you're on the dashboard."
  echo "  (30-day session, so one click holds for weeks. Remove later:"
  echo "   bash scripts/ship-bypass.sh off )"
fi
echo "=================================================================="
