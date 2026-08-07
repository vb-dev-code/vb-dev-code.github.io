# vb-dev-code.github.io

Personal GitHub Pages site (portfolio at `/`, plus standalone utility apps in
subdirectories). Static hosting only — no server-side code runs here.

## Newsstand (`/newsstand/`)

Pass manager for Santa Clara County Library District (SCCLD) publication
access (https://sccld.org/resources/newsstand/). Three layers:

1. **`newsstand/index.html`** — self-contained PWA (no build step, no deps).
   Layout (Aug 2026 redesign, picked from prototyped candidates): a hero
   card for the pass that needs attention next (expired first, then soonest
   to expire) plus a departures-style status board for everything else; no
   body copy; settings, cloud renew, `.ics` export, and mark-expired live
   behind the gear. With card + PIN saved, tapping any gateway-backed
   source POSTs the rpa login form directly (one-tap sign-in — the gateways
   are plain EZproxy-style `url`/`user`/`pass` POSTs, no CSRF); card-only
   setups fall back to opening the gateway with the card number
   pre-copied. 10-minute undo after activation. Reads
   `newsstand/status.json` (committed by CI) to merge cloud renewals into
   local countdowns. `sw.js` (network-first) keeps installed copies on the
   latest deploy — without it iOS freezes PWAs at install-time versions.
   Installable on iOS via `manifest.webmanifest` + `icon-*.png`;
   deliberately unlinked from the portfolio homepage and marked noindex.
   Smoke-test convention: serve `newsstand/` over localhost and drive with
   Playwright (see the test in the session scratchpad pattern — hero, board
   rows, gateway POST interception via `context.route`).
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
- Real gateway URLs (captured from sccld.org, Jul–Aug 2026, defaults in the
  app and `renew.mjs`; `rpa.sccl.org/login?url=…` is SCCLD's generic
  remote-patron-auth wrapper and its POST body wants the `r0$`-prefixed
  hidden `url` value exactly as the live form serves it):
  - NYT: `https://login.rpa.sccl.org/login/NYT`
  - WSJ: `https://rpa.sccl.org/login?url=https://partner.wsj.com/p/1148200010/enter-redemption-code/P31117NM5FAD`
  - Mercury News: gateway → `access.medianewsgroup.com/proxy-entrance/?org=sccld`
    (user picks "continue anonymously" there → full mercurynews.com)
  - Flipster: gateway → `search.ebscohost.com/login.aspx?authtype=ip,cpid&custid=scc&profile=eon`
  - PressReader: gateway → `https://www.pressreader.com`
  - Libby: no gateway; OverDrive slug is `santaclara` (`sccl` is
    LibraryNotFound per thunder.api.overdrive.com).
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
