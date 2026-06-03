#!/usr/bin/env bash
# Runs ON THE MAC on a timer (via pm2 cron). Checks GitHub for new commits and
# only deploys when there's something new — so it's cheap to run every few minutes.
set -euo pipefail
cd "$(dirname "$0")"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

git fetch --quiet origin main
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "$(date '+%F %T') up to date ($LOCAL)"
  exit 0
fi

echo "$(date '+%F %T') new commit $REMOTE — deploying"
./deploy.sh
