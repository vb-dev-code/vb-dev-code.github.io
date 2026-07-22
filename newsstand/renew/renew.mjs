#!/usr/bin/env node
// Auto-renews SCCLD publication passes (NYT, WSJ) by driving the same
// "Access Now" → card + PIN flow you'd do by hand. Runs locally only —
// see README.md for setup and scheduling.
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Publications. activationUrl defaults to the library landing page; once you
// know the exact "Access Now" URL (copy it from your address bar), put it in
// config.json to skip the landing-page hop.
const DEFAULT_PUBS = {
  nyt: {
    name: "The New York Times",
    activationUrl: "https://sccld.org/nyt-online/",
    successHosts: ["nytimes.com"],
  },
  wsj: {
    name: "The Wall Street Journal",
    activationUrl: "https://sccld.org/resources/newsstand/",
    successHosts: ["wsj.com"],
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
const SUBMIT_SELECTORS = [
  'form button[type="submit"]', 'form input[type="submit"]',
  'button:has-text("Log in")', 'button:has-text("Login")',
  'button:has-text("Sign in")', 'button:has-text("Submit")',
];
const ACCESS_NOW = /access now|redeem|get access|claim|activate/i;

async function firstVisible(page, selectors) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible().catch(() => false)) return loc;
  }
  return null;
}

function onSuccessHost(page, pub) {
  try {
    const host = new URL(page.url()).hostname;
    return pub.successHosts.some((h) => host === h || host.endsWith(`.${h}`));
  } catch { return false; }
}

async function renew(context, id, pub) {
  const page = await context.newPage();
  const log = (msg) => console.log(`[${id}] ${msg}`);
  try {
    log(`opening ${pub.activationUrl}`);
    await page.goto(pub.activationUrl, { waitUntil: "domcontentloaded", timeout: stepTimeout * 2 });

    // Walk the flow: click Access Now links, fill the card/PIN form when it
    // appears, and stop once we land on the publication's own site.
    // Login attempts are capped so a wrong PIN can't hammer the library's
    // auth and risk locking the card.
    let logins = 0;
    for (let step = 0; step < 8; step++) {
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(1500);

      if (onSuccessHost(page, pub)) {
        // Some flows still show a final confirm button on the target site.
        const confirm = page.getByRole("button", { name: ACCESS_NOW }).first();
        if (await confirm.isVisible().catch(() => false)) {
          log("clicking final redeem/confirm button");
          await confirm.click().catch(() => {});
          await page.waitForTimeout(2500);
        }
        log(`SUCCESS — landed on ${new URL(page.url()).hostname}`);
        return true;
      }

      const pinField = await firstVisible(page, PIN_SELECTORS);
      if (pinField) {
        if (++logins > 2) { log("login form reappeared — card/PIN likely rejected, stopping"); break; }
        const cardField = await firstVisible(page, CARD_SELECTORS);
        if (!cardField) { log("found PIN field but no card field; page layout unexpected"); break; }
        log("filling library card + PIN");
        await cardField.fill(CARD);
        await pinField.fill(PIN);
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
        log("clicking Access Now");
        const [popup] = await Promise.all([
          page.waitForEvent("popup", { timeout: 4000 }).catch(() => null),
          next.click(),
        ]);
        if (popup) {
          await page.close().catch(() => {});
          return await renewOnPage(popup, id, pub, log);
        }
        continue;
      }

      log(`no known next step on ${page.url()} — stopping`);
      break;
    }
    log("FAILED — did not reach the publication site. Re-run without --headless to watch/finish manually.");
    return false;
  } finally {
    await page.close().catch(() => {});
  }
}

// Same loop, continued on a popup window the site opened.
async function renewOnPage(page, id, pub, log) {
  let logins = 0;
  for (let step = 0; step < 8; step++) {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(1500);
    if (onSuccessHost(page, pub)) { log(`SUCCESS — landed on ${new URL(page.url()).hostname}`); return true; }
    const pinField = await firstVisible(page, PIN_SELECTORS);
    if (pinField) {
      if (++logins > 2) { log("login form reappeared — card/PIN likely rejected, stopping"); break; }
      const cardField = await firstVisible(page, CARD_SELECTORS);
      if (!cardField) break;
      log("filling library card + PIN");
      await cardField.fill(CARD);
      await pinField.fill(PIN);
      const submit = await firstVisible(page, SUBMIT_SELECTORS);
      if (submit) await submit.click(); else await pinField.press("Enter");
      continue;
    }
    const next = page.getByRole("link", { name: ACCESS_NOW }).first();
    if (await next.isVisible().catch(() => false)) { await next.click(); continue; }
    break;
  }
  log("FAILED on popup flow — re-run without --headless to watch/finish manually.");
  return false;
}

// ---------------------------------------------------------------------------
const context = await chromium.launchPersistentContext(join(HERE, "state", "profile"), {
  headless,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  viewport: { width: 1280, height: 900 },
});

let ok = true;
for (const id of wanted) {
  const pub = pubs[id];
  if (!pub) { console.error(`unknown publication "${id}" — known: ${Object.keys(pubs).join(", ")}`); ok = false; continue; }
  ok = (await renew(context, id, pub)) && ok;
}
await context.close();
process.exit(ok ? 0 : 1);
