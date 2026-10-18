#!/usr/bin/env node
// Renews SCCLD publication passes (NYT, WSJ) by driving the same
// "Access Now" → card + PIN flow you'd do by hand, then completing the
// publication's own account login/redeem step if credentials are provided.
// Runs locally or in CI (see ../../.github/workflows/newsstand-renew.yml).
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireLock } from "./file-lock.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Publications. activationUrl defaults to the library landing page; once you
// know the exact "Access Now" URL (copy it from your address bar), put it in
// config.json to skip the landing-page hop. accountEnv names the env vars
// holding the publication's own account email/password (optional — without
// them the run relies on the cached browser profile staying signed in).
// Real gateway URLs captured from sccld.org/resources/newsstand/ (Jul 2026).
// Both go straight to the card/PIN gateway (rpa.sccl.org = SCCLD's remote
// patron auth), skipping the landing page — and skipping the ambiguity of
// picking the right "Access Now" link out of a page that has a dozen.
const DEFAULT_PUBS = {
  nyt: {
    name: "The New York Times",
    activationUrl: "https://login.rpa.sccl.org/login/NYT",
    successHosts: ["nytimes.com"],
    accountEnv: ["NYT_EMAIL", "NYT_PASSWORD"],
    // 2026-08-08: a run declared SUCCESS off the bare-landing gate while its
    // final page was blank and the pass never actually renewed — so bare
    // landing never counts for NYT (requireSuccessText). 2026-08-12: a
    // controlled test proved the redeem transaction DOES go through even
    // though DataDome white-screens the confirmation page (redeem click
    // 8:32:45, NYT confirmation email 8:33, user away from the machine) —
    // so a redeem click on the redemption page itself counts as success.
    requireSuccessText: true,
    redeemUrlPattern: "nytimes\\.com/subscription/redeem",
  },
  wsj: {
    name: "The Wall Street Journal",
    activationUrl: "https://rpa.sccl.org/login?url=https://partner.wsj.com/p/1148200010/enter-redemption-code/P31117NM5FAD",
    successHosts: ["wsj.com"],
    // WSJ's sign-in lives on Dow Jones SSO, off the wsj.com host. Account
    // login is attempted on authHosts too, but they never count as success.
    authHosts: ["dowjones.com"],
    accountEnv: ["WSJ_EMAIL", "WSJ_PASSWORD"],
    // 2026-08-13: with a seeded session WSJ recognizes the login (0 account
    // fills) and auto-redeems on landing at partner.wsj.com (0 clicks), but
    // shows a "processing your request" interstitial first. The old
    // bare-landing gate declared success and closed the browser mid-redeem,
    // so the pass never activated. requireSuccessText forces the run to wait
    // for the real confirmation. Ground truth: the "Welcome to The Wall
    // Street Journal" email from WallStreetJournal@notice.dowjones.com.
    // Still UNPROVEN whether the redemption completes for an automated
    // browser (WSJ bot protection is heavier than NYT's — PerimeterX walls
    // customercenter); verify each cycle by the email.
    requireSuccessText: true,
    // 2026-10-15: with a live session the pass page is a "Create Account" form
    // (Terms of Use checkbox + REGISTER) instead of an auto-redeem. The owner
    // authorized ticking the Terms box and clicking Register each cycle; the
    // marketing-offers box is never touched.
    acceptTermsAndRegister: true,
    // 2026-10-17: a live pass answers "Welcome Back — Looks like you already
    // have a subscription", which SUCCESS_TEXT matches though nothing was
    // renewed (Oct 16–17 runs logged those as renewals). Only the
    // "Redemption Successful" page counts as a renewal; the WSJ scheduler
    // anchors its next 72h attempt on it, so a false "renewed" would leave
    // the pass expired for days.
    renewedText: "redemption successful",
    alreadyActiveText: "already have a subscription",
  },
};

// ---------------------------------------------------------------------------
// Config: env vars win, then .env (gitignored), then config.json overrides.
function loadDotEnv() {
  const p = join(HERE, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv();

const pubs = structuredClone(DEFAULT_PUBS);
const cfgPath = join(HERE, "config.json");
if (existsSync(cfgPath)) {
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  for (const [id, over] of Object.entries(cfg.publications ?? {})) {
    pubs[id] = { ...(pubs[id] ?? {}), ...over };
  }
}

const CARD = process.env.SCCLD_CARD;
const PIN = process.env.SCCLD_PIN;
if (!CARD || !PIN) {
  console.error("Missing SCCLD_CARD / SCCLD_PIN. Set them in the environment or in newsstand/renew/.env");
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const wanted = opt("pubs", Object.keys(pubs).join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const headless = flag("headless");
const stepTimeout = Number(opt("timeout", "20000"));
const statusPath = opt("status", "");
// --outcome writes {id: {outcome: "renewed"|"active"|"failed", ts}} for callers
// that need more than the exit code (the WSJ scheduler).
const outcomePath = opt("outcome", "");
const shotsDir = opt("shots", "");
// --profile selects the browser profile, enabling tenant renewals: each
// household member gets their own seeded profile (their NYT session) and
// their own card via env, all running on the same machine.
const profileArg = opt("profile", "");
const profileDir = profileArg
  ? (profileArg.startsWith("/") ? profileArg : join(HERE, profileArg))
  : join(HERE, "state", "profile");
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

// ---------------------------------------------------------------------------
// Form heuristics. Library auth gateways vary (EZproxy uses user/pass,
// Innovative uses code/pin, etc.), so try the common shapes in order.
const CARD_SELECTORS = [
  'input[name="user"]', 'input[name="code"]', 'input[name="barcode"]',
  'input[name="username"]', 'input[name*="card" i]', 'input[id*="card" i]',
  'input[name*="user" i]', 'form input[type="text"]',
];
const PIN_SELECTORS = [
  'input[name="pass"]', 'input[name="pin"]', 'input[name*="pin" i]',
  'input[type="password"]',
];
// Dow Jones SSO labels its field "Email or username" (a plain text input,
// name="username"), so username shapes belong here alongside email ones.
const EMAIL_SELECTORS = [
  'input[type="email"]', 'input[name="email"]', 'input[id*="email" i]',
  'input[name="username"]', 'input[id*="username" i]', 'input[autocomplete="username"]',
];
const SUBMIT_SELECTORS = [
  'form button[type="submit"]', 'form input[type="submit"]',
  'button:has-text("Log in")', 'button:has-text("Login")',
  'button:has-text("Sign in")', 'button:has-text("Continue")',
  'button:has-text("Submit")',
];
const ACCESS_NOW = /access now|redeem|get access|claim|activate|continue/i;
const SUCCESS_TEXT = /all set|access (?:is )?(?:activated|granted)|you now have|enjoy your|start reading|welcome back|code (?:was|has been) redeemed|successfully redeemed|welcome to the wall street journal|thanks for choosing wsj|subscription is (?:now )?active|you're all set/i;
// WSJ auto-redeems on landing and shows an interstitial ("We are processing
// your request") before the confirmation resolves — must wait for it, not
// exit on bare landing (that aborted the 2026-08-12 run mid-redemption).
const PROCESSING_TEXT = /processing your request|we are processing|one moment|please wait/i;

// "Visible" alone is not enough: NYT's email screen carries a decoy
// password input (readonly, aria-hidden) that Playwright deems visible.
// Inputs must also be editable before we try to fill them.
async function firstVisible(page, selectors, { editable = false } = {}) {
  for (const sel of selectors) {
    for (const loc of await page.locator(sel).all()) {
      if (!(await loc.isVisible().catch(() => false))) continue;
      if (editable && !(await loc.isEditable().catch(() => false))) continue;
      return loc;
    }
  }
  return null;
}

// Playwright echoes the attempted value into fill-timeout errors; route all
// credential fills through this so a stall can never print a secret.
async function fillSecret(loc, value, log, what) {
  try { await loc.fill(value, { timeout: 15000 }); return true; }
  catch (e) { log(`could not fill ${what} — ${String(e.message).split("\n")[0].replace(value, "***")}`); return false; }
}

// Tick ONLY the checkbox whose label names the Terms of Use. Returns how it
// was confirmed, or null if no such checkbox could be ticked. The WSJ form's
// other box (updates and special offers) never matches /terms of use/.
async function tickTermsOfUse(page) {
  const candidates = [
    page.getByRole("checkbox", { name: /terms of use/i }),
    page.getByLabel(/terms of use/i),
    page.locator('label:has-text("Terms of Use") input[type="checkbox"]'),
  ];
  for (const c of candidates) {
    const box = c.first();
    if (!(await box.count().catch(() => 0))) continue;
    if (await box.isChecked().catch(() => false)) return "already ticked";
    await box.check({ force: true, timeout: 5000 }).catch(() => {});
    if (await box.isChecked().catch(() => false)) return "ticked";
    // Styled forms hide the real input at zero size behind a drawn box, which
    // Playwright can't click; the input's own click() toggles it and fires the
    // same events a click on its label would.
    await box.evaluate((el) => el.click()).catch(() => {});
    if (await box.isChecked().catch(() => false)) return "ticked (hidden input)";
  }
  return null;
}

// Click Register, then confirm a request actually left the page: a main-frame
// navigation or any non-GET request (a script-driven submit, to any host). Only
// when the click sent nothing at all — seen in the mock-site test on 2026-10-17,
// where the mouse click reached no handler while the button's own click()
// submitted; the real WSJ form took the mouse click on Oct 15 — submit through
// click(). Requests count from before the click until 6 s after it returns (the
// click itself may wait up to 10 s for the button), and "sent" rather than
// "navigated" is the test: a slow but working submit must never get a second
// one. Returns "click", "dom" or null.
async function submitRegister(page, register, log) {
  let sent = false;
  const watch = (r) => {
    try { if (r.method() !== "GET" || (r.isNavigationRequest() && r.frame() === page.mainFrame())) sent = true; } catch {}
  };
  const settle = async () => {
    const until = Date.now() + 6000;
    while (!sent && Date.now() < until) await new Promise((r) => setTimeout(r, 250));
  };
  page.on("request", watch);
  try {
    await register.click({ timeout: 10000 }).catch(() => {});
    await settle();
    if (sent || !(await register.isVisible().catch(() => false))) return "click"; // sent, or the form moved on
    log("Register click sent no request — submitting with the button's own click()");
    await register.evaluate((b) => b.click()).catch(() => {});
    await settle();
    return sent ? "dom" : null;
  } finally {
    page.off("request", watch);
  }
}

function onHost(page, hosts) {
  try {
    const host = new URL(page.url()).hostname;
    return (hosts ?? []).some((h) => host === h || host.endsWith(`.${h}`));
  } catch { return false; }
}

// Walk one page through the whole flow: click Access Now links, fill the
// library card/PIN form, then on the publication's site complete its own
// email/password login and any final redeem click. Login attempts are capped
// so a wrong credential can't hammer either login and risk a lockout.
// Returns "renewed", "active" (pass already live, nothing renewed), "submitted"
// (pass form sent, no confirmation recognized) or null.
async function walk(page, id, pub, log) {
  const account = pub.accountEnv
    ? { user: process.env[pub.accountEnv[0]], pass: process.env[pub.accountEnv[1]] }
    : {};
  let libraryLogins = 0, accountFills = 0, redeemClicks = 0;
  let registerSent = null, registerSentAt = 0; // "click" | "dom" once the pass form has been submitted
  const waitAfterSubmit = async () => {
    if (Date.now() - registerSentAt < 90000) { await page.waitForTimeout(3000).catch(() => {}); return true; }
    log("no confirmation recognized within 90 s of submitting the pass form");
    return false;
  };
  let lastAction = "", lastUrl = "", stuck = 0;
  // Patience: when the flow needs a human (bot challenge, unrecognized page,
  // slow-rendering login), a headed run waits — the README promises manual
  // assists work. Headless (CI) keeps a short fuse instead of hanging.
  const patienceMs = headless ? 30000 : 300000;
  let waitedMs = 0, prevUrl = "";
  const patient = async (why) => {
    if (waitedMs >= patienceMs) return false;
    if (waitedMs === 0) log(`${why} — waiting for the page to move (finish this step in the browser window if needed)`);
    await page.waitForTimeout(5000).catch(() => {});
    waitedMs += 5000;
    return true;
  };
  // Clicking the same control on the same URL without the page moving is a
  // loop, not progress (e.g. a cookie banner whose button matches
  // "continue"). One repeat is tolerated — some flows re-render in place —
  // then the walk stops instead of burning the step budget.
  const repeats = (action) => {
    if (action === lastAction && page.url() === lastUrl) return ++stuck;
    lastAction = action; lastUrl = page.url(); stuck = 0;
    return 0;
  };

  for (let step = 0; step < 12; step++) {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(1500);
    // Any navigation means progress (possibly a human's) — refill patience.
    if (page.url() !== prevUrl) { prevUrl = page.url(); waitedMs = 0; }

    // Publication side = the pub's own hosts plus its auth provider's
    // (e.g. Dow Jones SSO for WSJ). Account login runs on both; success can
    // only ever be declared on a successHost.
    const onPub = onHost(page, pub.successHosts);
    if (onPub || onHost(page, pub.authHosts)) {
      const body = (await page.locator("body").innerText().catch(() => "")) || "";
      const renewedRe = pub.renewedText && new RegExp(pub.renewedText, "i");
      const activeRe = pub.alreadyActiveText && new RegExp(pub.alreadyActiveText, "i");
      // The pub's own markers count on their own: WSJ's confirmation needn't
      // also carry SUCCESS_TEXT's wording.
      if (onPub && (SUCCESS_TEXT.test(body) || renewedRe?.test(body) || activeRe?.test(body))) {
        const host = new URL(page.url()).hostname;
        if (activeRe?.test(body)) {
          // The pass form only appears for an expired pass, so "already have a
          // subscription" right after submitting it means the submission took.
          if (registerSent) { log(`SUCCESS — ${host} reports the pass live right after the registration`); return "renewed"; }
          log(`ALREADY ACTIVE — ${host} says the pass is still live; nothing was renewed`);
          return "active";
        }
        if (!renewedRe || renewedRe.test(body)) {
          log(`SUCCESS — ${host} confirms access`);
          return "renewed";
        }
        // Success-like wording without the renewal marker: give a slow render a
        // moment, then refuse to call it a renewal.
        if (await patient(`${host} looks done but doesn't say "${pub.renewedText}"`)) { step--; continue; }
        log(`page never said "${pub.renewedText}" — not counting it as a renewal`);
        break;
      }

      // Auto-redeem interstitial (WSJ): the transaction is processing —
      // wait for it to resolve into a confirmation rather than moving on.
      if (onPub && PROCESSING_TEXT.test(body)) {
        if (await patient(`${new URL(page.url()).hostname} is processing the redemption`)) { step--; continue; }
        log("redemption stayed on the processing screen — likely bot-held; check for the confirmation email");
        break;
      }

      // Once the pass form is in, only wait for WSJ's answer: any further click
      // or fill (a second Register, the generic login step on a form with an
      // email field) could submit it again. A slow confirmation gets 90 s; no
      // recognizable one ends the walk as "submitted", which the scheduler
      // verifies with a check shortly after.
      if (registerSent) { if (await waitAfterSubmit()) { step--; continue; } break; }

      // WSJ pass activation form (see acceptTermsAndRegister): Terms of Use
      // box + REGISTER. Register is only clicked once the Terms box is
      // confirmed ticked, and the form is submitted at most once per run: a
      // slow submit leaves Register showing for a while, and a second click
      // would land on "already have a subscription" and hide the renewal.
      if (onPub && pub.acceptTermsAndRegister) {
        const register = page.getByRole("button", { name: /^\s*register\s*$/i }).first();
        if (await register.isVisible().catch(() => false)) {
          const ticked = await tickTermsOfUse(page);
          if (!ticked) { log("pass form found but the Terms of Use checkbox could not be ticked — stopping"); break; }
          log(`Terms of Use ${ticked}; clicking Register on ${page.url()}`);
          registerSent = await submitRegister(page, register, log);
          registerSentAt = Date.now();
          if (!registerSent) { log("Register sent no request either way — stopping"); break; }
          await page.waitForTimeout(5000);
          continue;
        }
      }

      // Publication account login (email first, password possibly on the
      // next screen — NYT and WSJ both use that two-step shape). editable:
      // true matters here: NYT's email screen carries a readonly decoy
      // password input that must not be treated as the password step.
      const emailField = await firstVisible(page, EMAIL_SELECTORS, { editable: true });
      const passField = await firstVisible(page, PIN_SELECTORS, { editable: true });
      if (account.user && (emailField || passField)) {
        if (++accountFills > 4) { log("account login keeps reappearing — credentials likely rejected, stopping"); break; }
        if (emailField && !(await emailField.inputValue().catch(() => ""))) {
          log("filling publication account email");
          await fillSecret(emailField, account.user, log, "account email");
        }
        if (passField && account.pass) {
          log("filling publication account password");
          if (!(await fillSecret(passField, account.pass, log, "account password"))) continue;
        }
        const submit = await firstVisible(page, SUBMIT_SELECTORS);
        if (submit) await submit.click(); else if (passField) await passField.press("Enter");
        continue;
      }

      // No form fields yet but we have account credentials: a "Log in" /
      // "Sign in" link usually precedes the form on NYT and WSJ.
      if (account.user && accountFills === 0) {
        const loginLink = page.getByRole("link", { name: /log ?in|sign ?in/i }).first();
        const loginBtn = page.getByRole("button", { name: /log ?in|sign ?in/i }).first();
        const l = (await loginLink.isVisible().catch(() => false)) ? loginLink
                : (await loginBtn.isVisible().catch(() => false)) ? loginBtn : null;
        if (l) { log("opening publication login"); await l.click().catch(() => {}); continue; }
      }

      const confirm = page.getByRole("button", { name: ACCESS_NOW }).first();
      const confirmLink = page.getByRole("link", { name: ACCESS_NOW }).first();
      const target = (await confirm.isVisible().catch(() => false)) ? confirm
                   : (await confirmLink.isVisible().catch(() => false)) ? confirmLink : null;
      if (target && redeemClicks < 3) {
        if (repeats("redeem") > 1) { log("redeem click isn't advancing the page — stopping"); break; }
        redeemClicks++;
        const onRedeemPage = pub.redeemUrlPattern && new RegExp(pub.redeemUrlPattern, "i").test(page.url());
        log(`clicking redeem/continue on ${page.url()}`);
        await target.click().catch(() => {});
        if (onRedeemPage) {
          // The transaction fires on click; the confirmation page may never
          // render under bot protection (verified by confirmation-email
          // timing, 2026-08-12). Give the request a beat, then call it.
          await page.waitForTimeout(5000);
          log("SUCCESS — redeem clicked on the redemption page (confirmation may not render; transaction verified out-of-band 2026-08-12)");
          return "renewed";
        }
        continue;
      }

      // Never declare success while parked on an auth host or an auth-shaped
      // URL — NYT's login (myaccount.nytimes.com/auth/…) renders its email
      // field via JS a beat after navigation, so keep looping until it
      // appears or the step budget runs out.
      if (!onPub || /login|auth|signin|sign-in/i.test(page.url())) {
        if (await patient(`on auth page ${new URL(page.url()).hostname} with no fillable login form`)) { step--; continue; }
        log("auth page never produced a usable login form");
        break;
      }

      // Bare landing on the publication's host is only success if this run
      // actually did something (library login, account login, or a redeem
      // click). Without that gate, any stray redirect to nytimes.com would
      // report SUCCESS and exit 0 while the pass was never activated. Pubs
      // with requireSuccessText opt out of this gate entirely — landing
      // proves nothing for them (see the nyt note above).
      if (!pub.requireSuccessText && libraryLogins + accountFills + redeemClicks > 0) {
        log(`SUCCESS — landed on ${new URL(page.url()).hostname} after ${libraryLogins} library login(s), ${accountFills} account fill(s), ${redeemClicks} redeem click(s)`);
        return "renewed";
      }
      log(`on ${new URL(page.url()).hostname} but nothing was activated this run — waiting for a recognizable step`);
      continue;
    }

    // Off the publication's hosts after the pass form went in: still only wait.
    if (registerSent) { if (await waitAfterSubmit()) { step--; continue; } break; }

    const pinField = await firstVisible(page, PIN_SELECTORS, { editable: true });
    if (pinField) {
      if (++libraryLogins > 2) { log("library login form reappeared — card/PIN likely rejected, stopping"); break; }
      const cardField = await firstVisible(page, CARD_SELECTORS, { editable: true });
      if (!cardField) { log("found PIN field but no card field; page layout unexpected"); break; }
      log("filling library card + PIN");
      if (!(await fillSecret(cardField, CARD, log, "library card"))) continue;
      if (!(await fillSecret(pinField, PIN, log, "library PIN"))) continue;
      const submit = await firstVisible(page, SUBMIT_SELECTORS);
      if (submit) await submit.click(); else await pinField.press("Enter");
      await page.waitForLoadState("domcontentloaded", { timeout: stepTimeout }).catch(() => {});
      continue;
    }

    const link = page.getByRole("link", { name: ACCESS_NOW }).first();
    const btn = page.getByRole("button", { name: ACCESS_NOW }).first();
    const next = (await link.isVisible().catch(() => false)) ? link
               : (await btn.isVisible().catch(() => false)) ? btn : null;
    if (next) {
      if (repeats("access-now") > 1) { log("Access Now click isn't advancing the page — stopping"); break; }
      log("clicking Access Now");
      const [popup] = await Promise.all([
        page.waitForEvent("popup", { timeout: 4000 }).catch(() => null),
        next.click(),
      ]);
      if (popup) return await walk(popup, id, pub, log);
      continue;
    }

    // Nothing recognizable. Could be a bot challenge ("Verification
    // Required" slider, press-and-hold, captcha) or just a page we don't
    // know — either way a human at a headed run can push it forward, so be
    // patient before giving up. Never try to defeat a challenge in code.
    const bodyNow = (await page.locator("body").innerText().catch(() => "")) || "";
    const challenged = /verification required|unusual activity|slide right|press & hold|captcha|are you a robot/i.test(bodyNow);
    if (challenged && waitedMs === 0) log("bot challenge detected — it needs a human; solve it in the browser window");
    if (await patient(`no known next step on ${page.url()}`)) { step--; continue; }
    log(`no known next step on ${page.url()} — stopping`);
    break;
  }
  if (registerSent) {
    log("SUBMITTED — the pass form went in but no confirmation was recognized; the scheduler will check whether the pass went live");
    return "submitted";
  }
  log("FAILED — did not reach confirmed access. Re-run without --headless to watch/finish manually.");
  return null;
}

const bounded = (promise, ms) => Promise.race([promise.catch(() => {}), new Promise((r) => setTimeout(r, ms))]);

// `record` gets the outcome before any cleanup: a screenshot or page close that
// stalls (one hung for minutes in testing, 2026-10-17) must not lose a renewal
// that already happened.
async function renew(context, id, pub, record) {
  const page = await context.newPage();
  const log = (msg) => console.log(`[${id}] ${msg}`);
  let outcome = null;
  try {
    log(`opening ${pub.activationUrl}`);
    await page.goto(pub.activationUrl, { waitUntil: "domcontentloaded", timeout: stepTimeout * 2 });
    outcome = await walk(page, id, pub, log);
  } catch (e) {
    log(`FAILED — ${e.message}`);
  }
  record(outcome);
  if (shotsDir) {
    for (const p of context.pages()) {
      await p.screenshot({ path: join(shotsDir, `${id}-${context.pages().indexOf(p)}.png`), fullPage: false, timeout: 15000 }).catch(() => {});
    }
  }
  for (const p of context.pages()) await bounded(p.close(), 10000);
  return outcome;
}

// ---------------------------------------------------------------------------
// One browser per profile: the daily NYT run and the WSJ scheduler share
// state/profile, and a second Chrome on an open profile fails to launch.
await acquireLock(profileDir, { log: (msg) => console.log(msg) });
const context = await chromium.launchPersistentContext(profileDir, {
  headless,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  // Playwright defaults to --use-mock-keychain, which can't decrypt cookies
  // written by the bare real-Chrome seeding session (encrypted with the real
  // "Chrome Safe Storage" key) — the seeded NYT login would silently vanish
  // and every run would dead-end at the publication login.
  ignoreDefaultArgs: ["--use-mock-keychain"],
  viewport: { width: 1280, height: 900 },
});

const results = {};
const outcomes = {};
let ok = true;
for (const id of wanted) {
  const pub = pubs[id];
  if (!pub) { console.error(`unknown publication "${id}" — known: ${Object.keys(pubs).join(", ")}`); ok = false; continue; }
  const outcome = await renew(context, id, pub, (o) => {
    const ts = Date.now();
    outcomes[id] = { outcome: o ?? "failed", ts };
    if (outcomePath) writeFileSync(outcomePath, JSON.stringify(outcomes, null, 2) + "\n");
    // status.json records renewals: an already-live pass keeps its entry, the
    // time it was last actually renewed, and an unconfirmed submission waits
    // for the scheduler's check.
    if (o !== "active" && o !== "submitted") results[id] = { ok: o === "renewed", ts };
  });
  ok = (outcome === "renewed" || outcome === "active") && ok;
}
await bounded(context.close(), 30000);

if (statusPath && Object.keys(results).length) {
  // Same lock publish-status.mjs holds while committing, so this write can't
  // land in the middle of a publish (an autostash would drop it).
  const release = await acquireLock(join(HERE, "state", "status-json"), { waitMs: 5 * 60e3, log: (msg) => console.log(msg) });
  let status = { renewed: {} };
  if (existsSync(statusPath)) {
    try { status = JSON.parse(readFileSync(statusPath, "utf8")); } catch {}
  }
  status.renewed = { ...(status.renewed ?? {}), ...results };
  status.updated = Date.now();
  writeFileSync(statusPath, JSON.stringify(status, null, 2) + "\n");
  release();
  console.log(`status written to ${statusPath}`);
}

process.exit(ok ? 0 : 1);
