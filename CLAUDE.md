# vb-dev-code.github.io

Personal GitHub Pages site (portfolio at `/`, plus standalone utility apps in
subdirectories). Static hosting only — no server-side code runs here.

## Newsstand (`/newsstand/`)

Pass manager for Santa Clara County Library District (SCCLD) publication
access (https://sccld.org/resources/newsstand/). Three layers:

1. **`newsstand/index.html`** — self-contained PWA (no build step, no deps).
   Layout (Aug 2026 redesign, picked from prototyped candidates): a hero
   card for the pass that needs attention next (never-renewed first, then
   stalest renewal) plus a departures-style board for everything else; no
   body copy; settings, cloud renew, `.ics` export, and forget-renewal live
   behind the gear. Renewal-facts model (Aug 2026): no expiry countdowns —
   the tap timestamp can't prove redemption, so tiles show "renewed <when>"
   facts only; `pub.hours` is internal renewal cadence (hero ordering +
   opt-in auto-open), never displayed as time remaining. Reading Room
   (Aug 2026): always-on sources render as a 2-col chip shelf below the
   pass rows (Mercury, PressReader, Flipster, Libby, Nature, HBR,
   Businessweek, Consumer Reports); sublabels set landing expectations
   (proxied full site vs EBSCO issue browser vs Flipster reader). The NYT
   pass is all-access — Cooking/Wirecutter/Athletic ride the same
   `login.rpa.sccl.org/login/NYT` gateway, no separate tiles needed. With card + PIN saved, tapping any gateway-backed
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
4. **`newsstand/nyt-autoredeem.user.js`** (Aug 2026) — userscript that, on
   NYT's redemption page, fills the code from `?gift_code=`/`?code=` (React
   prototype-setter + input event) and clicks `btn-redeem` once per tab
   session (sessionStorage guard; MutationObserver + 1s poll for 30s,
   because hydration is late and the page may fill the field without DOM
   mutations). Installed via the "Install userscript" button in the PWA's
   settings (Tampermonkey desktop / Userscripts app on iOS). iOS limit
   (verified Aug 2026): extensions do NOT run in the in-app browser that an
   installed home-screen PWA opens, and nothing can force real Safari — the
   userscript only fires when Newsstand is used in a Safari tab. The PWA
   itself can never click the button: nytimes.com is cross-origin, and the
   redeem submit is a GraphQL call (graphql.nytimes.com/graphql/v2) needing
   NYT session cookies, so calling it from the PWA origin is equally dead.
5. **`newsstand/renew/local-renew.sh` + `~/Library/LaunchAgents/`**
   **`com.newsstand.local-renew.plist`** (Aug 2026) — every-3-days local
   (Varun's Mac) headless NYT renewal that relies on a *seeded* session in
   `renew/state/profile` to skip the DataDome-blocked NYT login (the block
   is at login; the library leg and redeem click were never the blocked
   step). Seed by running `node renew.mjs --pubs nyt` headed and logging in
   manually. On success the script commits + pushes `newsstand/status.json`
   so the phone app picks the renewal up. Logs: `renew/logs/`. Unseeded or
   expired session → run fails at NYT login and logs it; that's expected,
   re-seed. This is session reuse, not challenge evasion — the
   no-fingerprint-masking rule below still holds. Seeding must use REAL
   Chrome launched bare against `state/profile` (see renew/README.md):
   DataDome serves Playwright's Chromium a blank page at
   `myaccount.nytimes.com/auth/login` even headed with a human watching
   (reproduced 2026-08-07), and a profile created by one browser build may
   not open in the other — so `local-renew.sh` exports `CHROMIUM_PATH` to
   real Chrome for the scheduled runs as well.

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
- LAPL second library (Aug 2026): NYT/WSJ/PressReader carry a `lapl` backup
  block and Washington Post is an LAPL-only 7-day pass; everything LAPL is
  invisible in the app until an LAPL card is saved in settings (none exists
  yet — e-cards are LA City residents only; CA residents get full cards in
  person at a branch). Activations are keyed `<id>:lapl`; effective expiry =
  latest live pass across libraries. With an LAPL card saved but no SCCLD
  card, LAPL is the default side for pubs that have one (`defaultViaLapl`):
  hero/row/chip primary taps act via LAPL directly and the now-redundant
  "via LAPL" buttons are hidden; settings labels name both libraries
  (SCCLD card/PIN, LAPL card/PIN). LAPL's gateway is OCLC-hosted EZproxy
  (`login.lapl.idm.oclc.org/login`) whose form is identical in shape to
  SCCLD's rpa gateway — `url`/`user`/`pass` POST, `r0$`-prefixed hidden url,
  no CSRF (verified live 2026-08-07). LAPL URLs (defaults in the app):
  - WSJ: `https://login.lapl.idm.oclc.org/login?url=https://partner.wsj.com/p/1148200010/enter-redemption-code/P243PJRHHM6A` (3-day)
  - WaPo: `https://login.lapl.idm.oclc.org/login?url=https://www.washingtonpost.com/subscribe/signin/special-offers?s_oe=SPECIALOFFER_LOSANGELESPL` (7-day)
  - NYT: bare public redemption link, NOT gateway-wrapped (gift codes may
    rotate; captured from lapl.org): `https://nytimes.com/subscription/redeem/all-access?campaignId=8XUKX&gift_code=5570e1739089cc00` (72-hour)
  - PressReader: `https://login.lapl.idm.oclc.org/login?url=https://www.pressreader.com`
    (form serves; end-to-end untested pending a real card)
  - LAPL offers no current-access LA Times (historical ProQuest archive only);
    Libby slug would be `lapl` (not added — WaPo was the only new tile taken).
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
