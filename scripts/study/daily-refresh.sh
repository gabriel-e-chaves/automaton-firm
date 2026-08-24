#!/bin/bash
# Daily data refresh for the Pages replay.
#
# Runs where Binance is reachable (NOT GitHub CI — their US runners get 451).
# Rebuilds the rolling 90-day replay, re-exports the snapshot, and pushes; the
# Pages workflow then builds and publishes it. Exits quietly when the snapshot
# did not change (weekend gaps, API hiccups already logged by the build).
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$PATH"
# Self-update when running from the dedicated refresh clone (always on main).
# Dev worktrees sit on feature branches, so this never fires there.
if [ "$(git branch --show-current)" = "main" ]; then
  git pull --ff-only origin main >/dev/null 2>&1 || true
fi
node_modules/.bin/tsx scripts/study/build-carry-replay.ts
node_modules/.bin/tsx scripts/study/export-snapshot.ts
if git diff --quiet packages/palco/public/snapshot.json; then
  echo "snapshot inalterado; nada a publicar"
  exit 0
fi
git add packages/palco/public/snapshot.json
git commit -m "chore(data): replay diario $(date -u +%Y-%m-%d)"
PREV_USER=$(gh api user --jq .login 2>/dev/null || echo "")
gh auth switch --hostname github.com --user gabchaves >/dev/null 2>&1 || true
git push origin HEAD:main
[ "$PREV_USER" = "GabrielChaves-Reasset" ] && gh auth switch --hostname github.com --user GabrielChaves-Reasset >/dev/null 2>&1 || true
echo "publicado"
