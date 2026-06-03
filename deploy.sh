#!/usr/bin/env bash
# Runs ON THE MAC (the always-on host). Pulls the latest code, reinstalls deps
# if they changed, type-checks as a safety gate, and restarts the bot under pm2.
# Called by auto-deploy.sh (the timer), or run by hand.
set -euo pipefail
cd "$(dirname "$0")"

# Make node/npm available even when launched headless by pm2's cron.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "==> git pull"
git pull --ff-only

echo "==> npm install (no-op if unchanged)"
npm install

echo "==> typecheck (safety gate — won't restart on a broken build)"
./node_modules/.bin/tsc --noEmit

# Don't kill the bot mid-fetch: a restart while a Yad2 browser is open (a poll cycle
# or a user's new-search enrichment in flight) interrupts the search and is the cause
# of mid-session lag. Wait for a quiet window first. Bounded so the deploy still
# finishes well within the auto-deploy cron interval; if it never goes quiet, restart
# anyway (no worse than before).
QUIET_WAIT_MAX=90
waited=0
while pgrep -f "yad2-profile" >/dev/null 2>&1; do
  if [ "$waited" -ge "$QUIET_WAIT_MAX" ]; then
    echo "==> Yad2 browser still busy after ${QUIET_WAIT_MAX}s — restarting anyway"
    break
  fi
  echo "==> Yad2 browser active — deferring restart (${waited}s/${QUIET_WAIT_MAX}s)"
  sleep 5
  waited=$((waited + 5))
done

echo "==> pm2 restart"
pm2 restart dorin-bot --update-env
pm2 save

echo "deployed: $(git rev-parse --short HEAD)"
