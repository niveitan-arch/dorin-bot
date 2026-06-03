#!/usr/bin/env bash
# Runs ON THE DEV MACHINE (WSL). Commit everything and push to GitHub.
# The always-on Mac auto-pulls and deploys within a few minutes (see auto-deploy.sh).
# Usage:  ./ship.sh "what I changed"
set -euo pipefail
cd "$(dirname "$0")"

msg="${1:-update}"
git add -A
git commit -m "$msg" || echo "(nothing to commit)"
# The Mac may have pushed fixes directly; integrate them before pushing so the
# push never bounces with "fetch first".
git pull --rebase
git push
echo "pushed ✓ — the home Mac will auto-deploy within a few minutes."
