#!/bin/zsh
# Scheduled local NYT pass renewal, driven by launchd (see
# ~/Library/LaunchAgents/com.newsstand.local-renew.plist). Relies on a seeded
# browser profile in state/profile — run `node renew.mjs --pubs nyt` headed
# once and log into NYT manually to create it. Without a live session this
# fails at NYT's DataDome-guarded login and exits nonzero; that's expected
# and the log will say so.
set -uo pipefail
cd "${0:A:h}"
mkdir -p logs
exec >> "logs/local-renew.log" 2>&1
echo "=== $(date '+%Y-%m-%d %H:%M:%S') local renew start ==="

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Sync first so the status.json commit below lands on an up-to-date main
# (CI commits status.json too).
git -C ../.. pull --rebase --quiet || echo "git pull failed — continuing with local tree"

if node renew.mjs --pubs nyt --headless --status ../status.json --shots shots; then
  cd ../..
  git add newsstand/status.json
  if ! git diff --cached --quiet; then
    git commit --quiet -m "Record local NYT renewal in status.json" \
      && git push --quiet \
      && echo "status.json pushed" \
      || echo "commit/push failed — status.json updated locally only"
  fi
  echo "=== renew OK ==="
else
  echo "=== renew FAILED (see above; if this is the NYT login, re-seed the profile with a headed run) ==="
  exit 1
fi
