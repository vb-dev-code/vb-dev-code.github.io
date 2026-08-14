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
   real Chrome for the scheduled runs as well. WORKING as of 2026-08-12,
   after a false retirement: a controlled test (redeem click 8:32:45 with
   the user away; NYT confirmation email 8:33) proved the redeem
   transaction goes through even though DataDome white-screens every NYT
   page around it — never judge these runs by rendered content. Success
   for nyt = a redeem click on a URL matching `redeemUrlPattern`
   (`nytimes.com/subscription/redeem`); `requireSuccessText` still blocks
   the bare-landing gate that produced 2026-08-08's false success (a click
   on some other page that redeemed nothing). Ground truth for any doubt:
   the "Confirming your New York Times access" email (berkeley.edu inbox;
   from:nytimes.com auto-forwards to gmail). Cadence: the SCCLD NYT pass
   is observed to last 48h, not the advertised 72 (renewed Mon 7:48 AM →
   expired Wed morning, Aug 2026), so the launchd agent runs DAILY at
   8:00 AM (StartCalendarInterval; missed fires run on wake) and the app's
   nyt `hours` is 48. Household tenants (Aug 2026): family members get
   zero-touch via `renew/tenants/<name>.env` (their card, gitignored) +
   `state/profile-<name>` (their seeded NYT session) — local-renew.sh loops
   over tenants after the owner's run; tenant runs never write status.json.

WSJ zero-touch (2026-08-13, IN TEST): same seeded-session approach as NYT.
A seeded WSJ/Dow Jones session in `state/profile` is recognized (0 account
fills — login wall bypassed), and WSJ auto-redeems on landing at
`partner.wsj.com` (0 clicks) via an "We are processing your request"
interstitial. The first automated run FAILED because the bare-landing gate
closed the browser mid-processing; fixed by giving WSJ `requireSuccessText`
+ a PROCESSING_TEXT patience wait, and adding wsj to local-renew.sh's
`--pubs`. Manual renewal works and WSJ DOES send a heartbeat email
("Welcome to The Wall Street Journal" from
`WallStreetJournal@notice.dowjones.com`, to varunb007@gmail.com) — that
email, checkable via Gmail, is the ground truth. UNPROVEN whether the
redemption completes for an automated browser: WSJ's bot stack is heavier
than NYT's (PerimeterX walls customercenter.wsj.com against automation), so
the "processing" screen may bot-hold. Verify each cycle by the email; if it
stops arriving, WSJ has fallen back to manual — drop it from `--pubs`.
Observed WSJ pass label: "PUBLIC LIBRARIES AMENITY", Digital Light Package.
Do NOT hammer WSJ redemption (multiple runs in a short window risks the
account) — one attempt per natural cycle.
CRITICAL NUANCE (2026-08-13): the automated "SUCCESS" is NOT proof of a
renewal. When the pass is already ACTIVE, partner.wsj.com shows "Welcome
Back, Varun — Looks like you already have a subscription" (screenshot
confirmed), and SUCCESS_TEXT matches "welcome back" → logs success while
redeeming NOTHING (no email). Every automated run so far hit an
already-active pass (kept alive by manual renewals); the ONLY genuinely-
expired automated run (23:24 first attempt) FAILED. So WSJ auto-renewal of
an EXPIRED pass remains UNPROVEN. Trust the "Welcome to The Wall Street
Journal" email (WallStreetJournal@notice.dowjones.com), NOT the log's
SUCCESS, as the renewal signal. Clean test = the next true expiry with no
manual renewal intervening, verified by an 8 AM email.

ADR (Aug 2026): the app is single-owner, multi-visitor by design. All
visitor state (cards, PINs, activations) is per-browser localStorage;
`status.json` and "Cloud renew now" are owner-only, gated on a saved
GitHub token (`state.ghToken`) as the ownership signal — deliberately not
an identity system at friends-and-family scale. First-run visitors see a
self-destructing welcome card (renders while no library card is saved);
gateway-backed tile taps route to Settings until a card exists. Do not
"fix" this into accounts/auth without a real second automation user.

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

## typeface-design-agent/ — do not remove (active interview submission)

`typeface-design-agent/` is the live prototype for the Typeface Staff PM
interview, emailed to their recruiter on Aug 6, 2026 as
`https://varunb.me/typeface-design-agent/`. It must stay deployed until that
interview process concludes. It was removed once by a portfolio cleanup
(Aug 12, 2026) and had to be restored while under active review — do not
repeat that. The pages include a cookie-free Abacus visit counter
(namespace `vb-tfda-2026`); owner visits are excluded by loading any page
once with `?self=1`.
