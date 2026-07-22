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
- Real gateway URLs (captured from sccld.org/resources/newsstand/, Jul 2026,
  now the defaults in both the app and `renew.mjs`):
  - NYT: `https://login.rpa.sccl.org/login/NYT`
  - WSJ: `https://rpa.sccl.org/login?url=https://partner.wsj.com/p/1148200010/enter-redemption-code/P31117NM5FAD`
  - `rpa.sccl.org/login?url=…` is SCCLD's generic remote-patron-auth wrapper.
- Tested against the real sites (Jul 2026): the library card/PIN leg works
  end to end. Both publications hard-block the automated browser at their
  own login, even headed on a residential IP with a human solving
  challenges — NYT via DataDome (challenge won't render), WSJ via Dow Jones
  SSO ("Access is temporarily restricted" *after* a correctly solved
  slider). Repeated runs escalate the blocks. Do not attempt fingerprint
  masking or challenge automation; the supported path when blocked is the
  PWA's one-tap deep links in a normal browser.
- Consequence: the every-3-days GitHub Actions schedule and any local
  headless schedule will fail at the publication login until the vendors'
  scoring changes. Retesting after a multi-day cooldown is reasonable;
  hammering is not (risks account lockout, not just session blocks).
- `renew.mjs` behaviors added after real-site testing: fields must be
  editable (NYT ships a readonly decoy password input), account login also
  runs on `authHosts` (Dow Jones SSO is off-host from wsj.com), success is
  never declared on auth pages or without an action having happened this
  run, same-control click loops abort the walk, credential values are
  masked out of Playwright error logs, and headed runs wait up to 5 minutes
  at anything unrecognized so a human can push the page forward.

### Testing

No test framework. Verify changes by driving the page/script with
Playwright headlessly: serve `newsstand/` over localhost HTTP (status.json
fetch doesn't work from `file://`) and assert on tile status text; for
`renew.mjs`, run against a mock HTTP server that reproduces the flow, and
check both exit codes (0 on success, 1 on wrong PIN).
