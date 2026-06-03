#!/usr/bin/env bash
# Runs ON THE DEV MACHINE (WSL). One command to ship a change to the always-on
# Mac: commit everything, push, then trigger the Mac to pull + restart.
# Usage:  ./ship.sh "what I changed"
set -euo pipefail
cd "$(dirname "$0")"

msg="${1:-update}"
git add -A
git commit -m "$msg" || echo "(nothing to commit)"
git push

echo "==> deploying on mac"
ssh mac '~/dorin-bot/deploy.sh'
