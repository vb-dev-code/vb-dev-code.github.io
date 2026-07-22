# vb-dev-code.github.io

Personal GitHub Pages site (portfolio at `/`, plus standalone utility apps in
subdirectories). Static hosting only — no server-side code runs here.

## Newsstand (`/newsstand/`)

Pass manager for Santa Clara County Library District (SCCLD) publication
access (https://sccld.org/resources/newsstand/). Three layers:

1. **`newsstand/index.html`** — self-contained PWA (no build step, no deps).
   Tiles per publication with activation links, 72-hour pass countdowns in
   localStorage, `.ics` reminder export, and a "Cloud renew now" button that
   dispatches the Actions workflow via a fine-grained PAT stored in
   localStorage. Reads `newsstand/status.json` (committed by CI) to merge
   cloud renewals into local countdowns. Installable on iOS via
   `manifest.webmanifest` + `icon-*.png`. Deliberately unlinked from the
   portfolio homepage and marked noindex.
2. **`newsstand/renew/renew.mjs`** — Playwright script that drives the real
   renewal flow: library "Access Now" link → card + PIN gateway →
   publication account login (two-step email/password) → redeem click →
   success-text check. Form fields are found heuristically (EZproxy
   `user`/`pass`, Innovative `code`/`pin`, etc.). Login attempts are capped
   (2 library, 4 account) to avoid card/account lockout. Exit code is
   non-zero unless every requested pass reached confirmed access.
3. **`.github/workflows/newsstand-renew.yml`** — runs the script every 3
   days, caches `state/` (browser profile) between runs, commits
   `newsstand/status.json`, uploads final-page screenshots as an artifact.

### Conventions and constraints

- Credentials never enter the repo: local runs use `newsstand/renew/.env`
  (gitignored, `SCCLD_CARD`/`SCCLD_PIN` + optional `NYT_EMAIL`/`NYT_PASSWORD`
  `WSJ_EMAIL`/`WSJ_PASSWORD`); CI uses Actions secrets of the same names.
  `config.json`, `state/`, `shots/` are gitignored too.
- The exact SCCLD "Access Now" deep links were never captured (sccld.org
  blocks automated fetching); defaults point at library landing pages and
  can be overridden per-publication in the app's Settings or in
  `newsstand/renew/config.json`.
- The renewal flow has been tested only against a local mock of the chain
  (landing → EZproxy login → email/password → redeem → confirmation), not
  against the real sccld.org/NYT/WSJ sites. Expect selector tuning after
  the first real run; `--headless` off is the debugging mode.
- Known risk: NYT/WSJ bot challenges on datacenter IPs in CI. Fallback is
  running the same script locally on a schedule.

### Testing

No test framework. Verify changes by driving the page/script with
Playwright headlessly: serve `newsstand/` over localhost HTTP (status.json
fetch doesn't work from `file://`) and assert on tile status text; for
`renew.mjs`, run against a mock HTTP server that reproduces the flow, and
check both exit codes (0 on success, 1 on wrong PIN).
