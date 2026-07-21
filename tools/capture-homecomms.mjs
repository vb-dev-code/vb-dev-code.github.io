/**
 * HomeComms (Home Intercom) portfolio screenshot capture.
 * Resolution: 1320×2868 (viewport 440×956 @ deviceScaleFactor 3)
 *
 * Adapted from the proven App Store capture script for this app, which lives
 * in the home-intercom repo's screenshots/ directory. Differences from that
 * original, and why:
 *
 *   1. LIGHT theme, not dark. The three screenshots already committed to this
 *      portfolio site were captured in dark theme, but the site's other two
 *      apps have no dark theme — the grid read as tonally inconsistent.
 *      HomeComms defaults to light on first launch, so a light capture is at
 *      least as authentic. The original sets
 *        localStorage.setItem('ic_theme', '"dark"')
 *      via context.addInitScript(). The app reads this through a helper
 *      (lsGet) that JSON.parse()s the stored value and falls back to
 *      'light' if the key is absent. Here we set the key explicitly to the
 *      JSON-encoded string '"light"' rather than omitting it, so the result
 *      is pinned and doesn't silently depend on the helper's default.
 *      ic_onboarded is left exactly as in the original (read directly via
 *      localStorage.getItem, not JSON-parsed) — without it the onboarding
 *      wizard covers every shot.
 *
 *   2. Playwright import. The original requires playwright from a scratch
 *      install at /tmp/pw-screenshots/node_modules/playwright, which no
 *      longer exists. This repo has playwright installed locally
 *      (node_modules/, git-ignored), so it's imported the same way
 *      tools/capture-split-decision.mjs in this repo does: `import { chromium }
 *      from 'playwright';`.
 *
 *   3. Output location. Raw PNGs are written to /tmp/hc-shots/, never into
 *      the home-intercom repo (that repo is read-only for this task — its
 *      cloud/static/ is only served locally to drive the capture).
 *
 * Everything else — the static server over home-intercom's cloud/static/,
 * the /api/* mocks, the wait/settle logic, and the three screens' selectors
 * and interactions (home, speaker picker, type-to-speak compose sheet) — is
 * reused verbatim from the original since it is known-good.
 *
 * Run from the portfolio repo root:
 *   node tools/capture-homecomms.mjs
 */
import { chromium } from 'playwright';

import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// This is archival tooling that isn't expected to run unattended, so the
// path to a sibling local checkout of the home-intercom repo is read from
// the environment rather than hardcoded.
const HOME_INTERCOM_REPO = process.env.HOME_INTERCOM_REPO;
if (!HOME_INTERCOM_REPO) {
  console.error('HOME_INTERCOM_REPO is not set. Export it to a local checkout of the home-intercom repo before running this script.');
  process.exit(1);
}
const STATIC_DIR = path.join(HOME_INTERCOM_REPO, 'cloud', 'static');
const OUT_DIR = '/tmp/hc-shots';
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── serve cloud/static/ (read-only source; nothing is ever written here) ──
const MIME = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript',
               '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon',
               '.json':'application/json', '.woff2':'font/woff2', '.ttf':'font/ttf' };

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      let filePath = path.join(STATIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
      if (!fs.existsSync(filePath)) {
        res.writeHead(404); res.end('Not found'); return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      console.log(`Serving ${STATIC_DIR} on http://127.0.0.1:${port}`);
      resolve({ server, port });
    });
  });
}

// ── mock API responses ────────────────────────────────────────────────────
const MOCKS = {
  '/api/me': { signed_in: true },
  '/api/speakers': {
    players: [
      { id: 'sp_kitchen',  name: 'Kitchen' },
      { id: 'sp_living',   name: 'Living Room' },
      { id: 'sp_kids',     name: "Kids Room" },
      { id: 'sp_primary',  name: 'Primary Bedroom' },
      { id: 'sp_office',   name: 'Office' },
    ]
  },
  '/api/prefs': {
    exists: true,
    groups: [
      { id: 'grp_upstairs', name: 'Upstairs', rooms: ['sp_kids','sp_primary'] }
    ],
    favorites: ['sp_kitchen','grp_upstairs'],
    volume: 65,
    canned: [
      { id: 'c-dinner', icon: 'bell',  text: "Dinner's ready" },
      { id: 'c-leave',  icon: 'car',   text: 'Time to leave' },
      { id: 'c-bath',   icon: 'moon',  text: 'Bath time' },
      { id: 'c-home',   icon: 'house', text: "I'm home" },
    ],
    defaultTarget: 'all',
    holdMode: true
  },
  '/api/integrations/alexa': {
    configured: true,
    devices: [
      { id: 'alexa:echo_kitchen', name: 'Kitchen Echo' },
      { id: 'alexa:echo_play',    name: 'Playroom Echo' },
    ]
  },
  '/api/integrations/ring': { available: false, devices: [] },
  '/api/push/register': { ok: true },
  '/api/widget/token': { token: 'mock-widget-token', base_url: 'http://example.com' },
};

async function setupMocks(page, port) {
  // Intercept /api/* requests
  await page.route(/\/api\//, async route => {
    const url = new URL(route.request().url());
    const key = Object.keys(MOCKS).find(k => url.pathname === k || url.pathname.startsWith(k));
    if (key) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCKS[key])
      });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
  });
}

// ── helpers ─────────────────────────────────────────────────────────────
async function waitForApp(page) {
  // wait for the talk button to appear and the sign-in overlay to be gone
  await page.waitForSelector('#talkBtn', { state: 'visible', timeout: 15000 });
  // wait for speakers to load (header count changes from CONNECTING…)
  await page.waitForFunction(() => {
    const el = document.getElementById('onlineCount');
    return el && !el.textContent.includes('CONNECTING');
  }, { timeout: 10000 });
  // let fonts/animations settle
  await page.waitForTimeout(1200);
}

async function shot(page, filename) {
  const out = path.join(OUT_DIR, filename);
  await page.screenshot({ path: out, fullPage: false });
  // verify dimensions
  const result = execSync(`sips -g pixelWidth -g pixelHeight "${out}"`).toString();
  const w = result.match(/pixelWidth: (\d+)/)?.[1];
  const h = result.match(/pixelHeight: (\d+)/)?.[1];
  const ok = w === '1320' && h === '2868';
  console.log(`  ${filename}: ${w}×${h} ${ok ? '✓' : '✗ WRONG SIZE'}`);
  return ok;
}

// ── main ─────────────────────────────────────────────────────────────────
const { server, port } = await startServer();

const browser = await chromium.launch({ headless: true });

const context = await browser.newContext({
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  locale: 'en-US',
});

// This runs before any page script — sets light theme + marks onboarding done
// BEFORE the app JS reads localStorage at parse time.
// NOTE: the app uses lsGet() which does JSON.parse(), so values must be JSON-encoded strings.
// ic_theme is read via lsGet('ic_theme', 'light') → set explicitly to '"light"' (JSON string
// literal) rather than omitting the key, so the result doesn't depend on the helper's default.
await context.addInitScript(() => {
  localStorage.setItem('ic_theme', '"light"');  // lsGet → JSON.parse('"light"') === 'light'
  localStorage.setItem('ic_onboarded', '1');    // read directly with getItem, not lsGet
});

// ══ PAGE FACTORY ══════════════════════════════════════════════════════════
async function freshPage() {
  const page = await context.newPage();
  await setupMocks(page, port);
  await page.goto(`http://127.0.0.1:${port}/`);
  await waitForApp(page);
  return page;
}

// ══ 01 — HOME (hero shot, All House selected) ═════════════════════════════
console.log('\n── 01-home ──');
{
  const page = await freshPage();
  // The app loads with defaultTarget=all, show it with quick-switch chips visible
  await shot(page, '01-home.png');
  await page.close();
}

// ══ 02 — PICKER open ══════════════════════════════════════════════════════
console.log('\n── 02-picker ──');
{
  const page = await freshPage();
  // Wait for Alexa devices to load too
  await page.waitForFunction(() => {
    return window.ALEXA && window.ALEXA.length > 0 && window.alexaConfigured;
  }, { timeout: 8000 }).catch(() => {});
  // tap the target card to open the picker
  await page.click('#targetCard');
  // wait for the picker sheet to open
  await page.waitForSelector('#pickerWrap.open', { timeout: 5000 });
  await page.waitForTimeout(700); // sheet animation
  // Scroll the picker rows down to show Amazon Echo section
  await page.evaluate(() => {
    const rows = document.getElementById('pickerRows');
    if (rows) rows.scrollTop = 420; // scroll past Sonos rooms to show Echo section
  });
  await page.waitForTimeout(300);
  await shot(page, '02-picker.png');
  await page.close();
}

// ══ 03 — QUICK MESSAGES (chips prominent) ═════════════════════════════════
console.log('\n── 03-quick-messages ──');
{
  const page = await freshPage();
  // Open the type-to-speak compose sheet
  await page.click('#ttsEntry');
  await page.waitForSelector('#composeWrap.open', { timeout: 5000 });
  await page.waitForTimeout(600);
  await shot(page, '03-quick-messages.png');
  await page.close();
}

await browser.close();
server.close();
console.log('\nDone. Screenshots saved to', OUT_DIR);
