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

echo "==> pm2 restart"
pm2 restart dorin-bot --update-env
pm2 save

echo "deployed: $(git rev-parse --short HEAD)"
