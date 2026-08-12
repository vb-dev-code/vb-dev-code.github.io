# Newsstand auto-renew

Renews SCCLD's 72-hour publication passes (NYT, WSJ) by driving the same
"Access Now" → card + PIN flow you'd do by hand, then completing the
publication's own account login and redeem step. Two ways to run it:
locally (below), or fully automatic in the cloud (next section).
Credentials live in a gitignored `.env` locally or GitHub Actions secrets
in CI — never in the repo.

## Zero-click mode (GitHub Actions)

`.github/workflows/newsstand-renew.yml` runs this script every 3 days on
GitHub's servers. Because the pass attaches to your NYT/WSJ *account*, a
cloud renewal unlocks the NYT and WSJ apps on your phone with no action on
your part.

Setup (once, on github.com → repo → Settings → Secrets and variables →
Actions):

| Secret | Value |
| --- | --- |
| `SCCLD_CARD` | library card number |
| `SCCLD_PIN` | library PIN |
| `NYT_EMAIL` / `NYT_PASSWORD` | your free NYT account |
| `WSJ_EMAIL` / `WSJ_PASSWORD` | your free WSJ account |

Then trigger it once by hand (Actions → "Renew newsstand passes" → Run
workflow) and check the run log and its screenshot artifact. Each run
commits `newsstand/status.json`, which the web app reads to show live pass
state on every device. The workflow can also be triggered from the web
app's "Cloud renew now" button (needs a fine-grained PAT scoped to this
repo with Actions read/write, saved in the app's Settings).

Caveats — read before relying on this: as of Jul 2026, both publications
hard-block the automated browser at their own login step, even headed on a
residential IP with a human solving the challenge (NYT: DataDome refuses to
render; WSJ: Dow Jones SSO returns "Access is temporarily restricted" after
a correctly solved slider). The library card/PIN leg works fine — it's the
publication logins that wall off automation, and repeated attempts escalate
the block. Until that changes, treat this script and the workflow as
experimental; the dependable path is the web app's one-tap deep links in
your normal browser. If you retest, wait several days between attempts and
never automate around a challenge.

## Setup

```sh
cd newsstand/renew
npm install
npx playwright install chromium
```

Create `.env` (gitignored):

```
SCCLD_CARD=your library card number
SCCLD_PIN=your PIN
```

## First run — watch it

```sh
npm run renew
```

Runs headed so you can watch. The first time through, NYT/WSJ may ask you to
sign into (or create) a free account on their side — do that once in the
window; the profile under `state/` remembers it. If the script stalls on a
page it doesn't recognize, just finish that step by hand — it picks up as
soon as the page advances.

## After that — headless, on a schedule

```sh
npm run renew:headless          # both passes
node renew.mjs --headless --pubs nyt
```

### Seeded-session local schedule — WORKING for NYT (2026-08-12)

Session reuse works: a live `NYT-S` cookie in `state/profile` carries runs
past the login wall with zero account fills. The redeem click *looks*
walled — DataDome white-screens every NYT page around it — but a
controlled test proved the transaction goes through anyway (redeem click
8:32:45 with the user away from the machine; NYT confirmation email
8:33). So: never judge a run by rendered content. Success for nyt is a
redeem click on the redemption page itself (`redeemUrlPattern`);
`requireSuccessText` still blocks the bare-landing gate that once
declared success for a click that redeemed nothing (2026-08-08). Ground
truth when in doubt: the "Confirming your New York Times access" email.
The launchd agent runs DAILY at 8:00 AM because the pass lasts an
observed 48 hours, not the advertised 72.

### Household tenants (zero-touch for family members)

Each family member's renewal runs on this same machine — no hardware or
setup on their side. Per member, once:

1. Create `tenants/<name>.env` (gitignored) with THEIR library card:
   `SCCLD_CARD=...` and `SCCLD_PIN=...`
2. Seed THEIR NYT session:
   ```sh
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --user-data-dir="$PWD/state/profile-<name>" --no-first-run \
     https://www.nytimes.com/account
   ```
   They log into their own NYT account in that window, then quit that
   Chrome instance.

`local-renew.sh` picks up every `tenants/*.env` automatically after the
owner's run. Tenant runs never write `status.json`; their signal is their
own NYT confirmation email and the NYT app just working. If a tenant run
fails at an auth page, re-seed that profile the same way.

The DataDome/SSO blocks hit the publication *login* step. The persistent
profile under `state/profile` keeps you logged in between runs — so if a
session is already live, scheduled runs skip login entirely and only do the
library leg (never blocked) plus the redeem click.

1. **Seed once — with real Chrome, not via the script** (DataDome serves
   Playwright's Chromium a blank login page even headed, reproduced
   2026-08-07, so log in with no automation attached at all):

   ```sh
   cd newsstand/renew
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --user-data-dir="$PWD/state/profile" --no-first-run \
     https://www.nytimes.com/account
   ```

   Log into NYT in that window, then quit that Chrome instance. The
   session now lives in `state/profile`, and the scheduled runs use real
   Chrome too (`CHROMIUM_PATH` in `local-renew.sh`) so they can open it.
2. **Schedule**: `local-renew.sh` wraps the headless run and, on success,
   commits `newsstand/status.json` and pushes, so the phone app learns
   about the renewal. It's driven by a launchd agent at
   `~/Library/LaunchAgents/com.newsstand.local-renew.plist` (every 3 days;
   load with `launchctl bootstrap gui/$UID <plist>`). Logs land in
   `logs/local-renew.log`.
3. **If it starts failing at NYT login**, the session expired — re-seed
   with step 1. If it fails *after* login (redeem page blocked in
   headless), edit `local-renew.sh` to drop `--headless`; a headed window
   every 3 days is the tradeoff. Never automate around a challenge.

## Tuning

Library gateways vary, so the script finds the card/PIN form heuristically
(EZproxy `user`/`pass`, Innovative `code`/`pin`, etc.). If SCCLD's flow
changes or you want to skip the landing page, create `config.json`
(gitignored) with the exact activation URLs you see in your address bar:

```json
{
  "publications": {
    "nyt": { "activationUrl": "https://..." },
    "wsj": { "activationUrl": "https://..." }
  }
}
```

Exit code is 0 only if every requested pass reached the publication's own
site, so a failed renewal shows up as a failed cron job.
