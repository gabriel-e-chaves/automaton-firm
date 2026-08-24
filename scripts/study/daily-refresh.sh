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
# The dedicated refresh clone is disposable: it MIRRORS origin/main before
# generating, discarding any leftover local commit (e.g. yesterday's data
# commit that lost a push race). A plain ff-only pull would wedge a diverged
# clone forever. Guarded by path so a dev checkout is never hard-reset.
if [ "$PWD" = "$HOME/.afirma-refresh" ]; then
  git fetch origin
  git reset --hard origin/main
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
