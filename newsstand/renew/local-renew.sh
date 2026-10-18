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

run_start_ms=$(( $(date +%s) * 1000 ))

# NYT only. WSJ has its own due-time schedule (wsj-scheduler.mjs, launchd
# com.newsstand.wsj-renew): its 3-day pass can't be renewed while live, so a
# fixed daily run found it live on the expiry morning and left a day's gap.
node renew.mjs --pubs nyt --headless --status ../status.json --shots shots
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

# Publish whenever NYT renewed in THIS run (a fresh nyt ok:true in status.json),
# rather than on renew.mjs's exit code alone: gating on the exit code while WSJ
# rode along kept the app's status unpublished for two months.
nyt_ok=0
node -e '
  const s = JSON.parse(require("fs").readFileSync("../status.json", "utf8"));
  const n = (s.renewed || {}).nyt;
  process.exit(n && n.ok === true && n.ts >= Number(process.argv[1]) ? 0 : 1);
' "$run_start_ms" && nyt_ok=1

(( nyt_ok )) && node publish-status.mjs "Record local NYT renewal in status.json"

if (( own_ok == 0 )); then
  echo "=== renew OK ==="
else
  echo "=== renew FAILED (see above; if this is the NYT login, re-seed the profile with a headed run) ==="
  exit 1
fi
