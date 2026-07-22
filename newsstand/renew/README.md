# Newsstand auto-renew

Local script that renews SCCLD's 72-hour publication passes (NYT, WSJ) by
driving the same "Access Now" → card + PIN flow you'd do by hand. It runs
**only on your machine** — credentials live in a gitignored `.env`, and the
browser profile it keeps (so NYT/WSJ stay logged in) is gitignored too.

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
