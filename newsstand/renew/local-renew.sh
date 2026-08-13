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

# Real Chrome, not Playwright's bundled Chromium: DataDome serves Playwright
# Chromium a blank login page (reproduced 2026-08-07), and the seeded session
# in state/profile is created by real Chrome — the scheduled runs must use
# the same browser or the profile won't even open.
export CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Sync first so the status.json commit below lands on an up-to-date main
# (CI commits status.json too).
git -C ../.. pull --rebase --quiet || echo "git pull failed — continuing with local tree"

# WSJ runs alongside NYT: same seeded profile also holds the WSJ/Dow Jones
# session. WSJ redemption completion via automation is unproven — verify by
# the "Welcome to The Wall Street Journal" email; if it stops arriving, WSJ
# has fallen back to manual and should be dropped from this list.
node renew.mjs --pubs nyt,wsj --headless --status ../status.json --shots shots
own_ok=$?

# Tenant renewals: each tenants/<name>.env holds that person's SCCLD_CARD /
# SCCLD_PIN, and their seeded NYT session lives in state/profile-<name>
# (seed it the same bare-Chrome way, logging into THEIR NYT account).
# Tenant runs never write status.json — that file is the owner's.
for envfile in tenants/*.env(N); do
  name="${${envfile:t}%.env}"
  echo "--- tenant: $name"
  ( unset SCCLD_CARD SCCLD_PIN
    set -a; source "$envfile"; set +a
    node renew.mjs --pubs nyt --headless --profile "state/profile-$name" --shots "shots/$name" ) \
    || echo "tenant $name renew FAILED (re-seed state/profile-$name if it's the NYT login)"
done

if (( own_ok == 0 )); then
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
