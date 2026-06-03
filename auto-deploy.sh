#!/usr/bin/env bash
# Runs ON THE MAC as a long-lived pm2 process (NOT via `pm2 --cron-restart`).
# Polls GitHub every few minutes and deploys only when origin/main has moved.
#
# Why a self-contained sleep loop instead of pm2's --cron-restart: that cron
# schedule leaked onto the `dorin-bot` process (a pm2 quirk), hard-restarting the
# bot every 3 min and making it unresponsive. Keeping zero cron_restart anywhere
# in pm2 removes that failure mode entirely.
#
# NOTE: no `set -e` — one failed fetch/deploy must NOT kill the loop.
set -uo pipefail
cd "$(dirname "$0")"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

INTERVAL="${DEPLOY_POLL_SECONDS:-180}"

while true; do
  if git fetch --quiet origin main 2>/dev/null; then
    LOCAL=$(git rev-parse @)
    REMOTE=$(git rev-parse origin/main)
    if [ "$LOCAL" = "$REMOTE" ]; then
      echo "$(date '+%F %T') up to date ($LOCAL)"
    else
      echo "$(date '+%F %T') new commit $REMOTE — deploying"
      ./deploy.sh || echo "$(date '+%F %T') deploy.sh failed (will retry next cycle)"
    fi
  else
    echo "$(date '+%F %T') git fetch failed (will retry next cycle)"
  fi
  sleep "$INTERVAL"
done
