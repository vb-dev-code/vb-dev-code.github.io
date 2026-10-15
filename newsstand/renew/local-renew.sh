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

# Sync first so the status.json commit below lands on an up-to-date main.
# --autostash: a run where NYT failed leaves status.json uncommitted, and a plain
# rebase pull then refuses every later day (that silently froze the app's status
# from 2026-08-15 to 2026-10-15). Nothing else writes status.json, so it can't conflict.
git -C ../.. pull --rebase --autostash --quiet || echo "git pull failed — continuing with local tree"
run_start_ms=$(( $(date +%s) * 1000 ))

# WSJ runs alongside NYT: same seeded profile also holds the WSJ/Dow Jones
# session. Automated WSJ redemption of an expired pass was proven 2026-10-15
# (Terms + Register step in renew.mjs) — keep verifying by the "Welcome to The
# Wall Street Journal" email; if it stops arriving, re-seed the WSJ session.
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

# Publish whenever NYT renewed in THIS run, even if WSJ failed: renew.mjs exits
# nonzero unless every pub succeeded, and gating on that kept the app's status
# unpublished for two months while NYT renewed fine. The app shows per-pub facts,
# so a wsj ok:false entry riding along is accurate.
nyt_ok=0
node -e '
  const s = JSON.parse(require("fs").readFileSync("../status.json", "utf8"));
  const n = (s.renewed || {}).nyt;
  process.exit(n && n.ok === true && n.ts >= Number(process.argv[1]) ? 0 : 1);
' "$run_start_ms" && nyt_ok=1

if (( nyt_ok )); then
  ( cd ../..
    git add newsstand/status.json
    if ! git diff --cached --quiet; then
      git commit --quiet -m "Record local NYT renewal in status.json" \
        && git push --quiet \
        && echo "status.json pushed" \
        || echo "commit/push failed — status.json updated locally only"
    fi )
fi

if (( own_ok == 0 )); then
  echo "=== renew OK ==="
elif (( nyt_ok )); then
  echo "=== NYT OK; another pub FAILED (see above) ==="
  exit 1
else
  echo "=== renew FAILED (see above; if this is the NYT login, re-seed the profile with a headed run) ==="
  exit 1
fi
