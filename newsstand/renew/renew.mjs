#!/usr/bin/env node
// Renews SCCLD publication passes (NYT, WSJ) by driving the same
// "Access Now" → card + PIN flow you'd do by hand, then completing the
// publication's own account login/redeem step if credentials are provided.
// Runs locally or in CI (see ../../.github/workflows/newsstand-renew.yml).
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  },
  wsj: {
    name: "The Wall Street Journal",
    activationUrl: "https://rpa.sccl.org/login?url=https://partner.wsj.com/p/1148200010/enter-redemption-code/P31117NM5FAD",
    successHosts: ["wsj.com"],
    // WSJ's sign-in lives on Dow Jones SSO, off the wsj.com host. Account
    // login is attempted on authHosts too, but they never count as success.
    authHosts: ["dowjones.com"],
    accountEnv: ["WSJ_EMAIL", "WSJ_PASSWORD"],
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
const shotsDir = opt("shots", "");
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
const SUCCESS_TEXT = /all set|access (?:is )?(?:activated|granted)|you now have|enjoy your|start reading|welcome back/i;

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
async function walk(page, id, pub, log) {
  const account = pub.accountEnv
    ? { user: process.env[pub.accountEnv[0]], pass: process.env[pub.accountEnv[1]] }
    : {};
  let libraryLogins = 0, accountFills = 0, redeemClicks = 0;
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
      if (onPub && SUCCESS_TEXT.test(body)) { log(`SUCCESS — ${new URL(page.url()).hostname} confirms access`); return true; }

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
        log("clicking redeem/continue on publication site");
        await target.click().catch(() => {});
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
      // report SUCCESS and exit 0 while the pass was never activated.
      if (libraryLogins + accountFills + redeemClicks > 0) {
        log(`SUCCESS — landed on ${new URL(page.url()).hostname} after ${libraryLogins} library login(s), ${accountFills} account fill(s), ${redeemClicks} redeem click(s)`);
        return true;
      }
      log(`on ${new URL(page.url()).hostname} but nothing was activated this run — waiting for a recognizable step`);
      continue;
    }

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
  log("FAILED — did not reach confirmed access. Re-run without --headless to watch/finish manually.");
  return false;
}

async function renew(context, id, pub) {
  const page = await context.newPage();
  const log = (msg) => console.log(`[${id}] ${msg}`);
  try {
    log(`opening ${pub.activationUrl}`);
    await page.goto(pub.activationUrl, { waitUntil: "domcontentloaded", timeout: stepTimeout * 2 });
    return await walk(page, id, pub, log);
  } catch (e) {
    log(`FAILED — ${e.message}`);
    return false;
  } finally {
    if (shotsDir) {
      for (const p of context.pages()) {
        await p.screenshot({ path: join(shotsDir, `${id}-${context.pages().indexOf(p)}.png`), fullPage: false }).catch(() => {});
      }
    }
    for (const p of context.pages()) await p.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
const context = await chromium.launchPersistentContext(join(HERE, "state", "profile"), {
  headless,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  viewport: { width: 1280, height: 900 },
});

const results = {};
let ok = true;
for (const id of wanted) {
  const pub = pubs[id];
  if (!pub) { console.error(`unknown publication "${id}" — known: ${Object.keys(pubs).join(", ")}`); ok = false; continue; }
  const success = await renew(context, id, pub);
  results[id] = { ok: success, ts: Date.now() };
  ok = success && ok;
}
await context.close();

if (statusPath) {
  let status = { renewed: {} };
  if (existsSync(statusPath)) {
    try { status = JSON.parse(readFileSync(statusPath, "utf8")); } catch {}
  }
  status.renewed = { ...(status.renewed ?? {}), ...results };
  status.updated = Date.now();
  writeFileSync(statusPath, JSON.stringify(status, null, 2) + "\n");
  console.log(`status written to ${statusPath}`);
}

process.exit(ok ? 0 : 1);
