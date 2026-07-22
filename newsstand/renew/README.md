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

Cron (every 3 days at 7am):

```
0 7 */3 * * cd /path/to/vb-dev-code.github.io/newsstand/renew && /usr/local/bin/node renew.mjs --headless >> renew.log 2>&1
```

macOS sleeps through cron; `launchd` with `StartCalendarInterval`, or an
every-3-days reminder from the [web app](https://vb-dev-code.github.io/newsstand/)'s
.ics export, are the reliable alternatives.

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
