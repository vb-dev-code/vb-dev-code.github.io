/**
 * Split Decision screenshot capture.
 * Captures the live deployment at phone dimensions.
 *
 * Run from the portfolio repo root, with SD_BASE_URL set to the deployment's
 * base URL:
 *   SD_BASE_URL=https://your-deployment-host node tools/capture-split-decision.mjs
 *
 * Outputs raw PNGs to /tmp/sd-shots/, which Step 5 converts to WebP.
 *
 * Navigation notes (found by exploring the live deployment):
 *
 * - The app never requires sign-in to reach playable content. On first load it
 *   POSTs an anonymous session (a `sd_session` cookie), then routes `/` -> `/home`.
 * - `/daily` is the actual puzzle-solving screen (data-testid="screen-open-daily",
 *   data-testid="board-region"). On a session's first visit it shows a one-time
 *   "How to play" onboarding dialog with a "Skip" button (dismissal is persisted
 *   in localStorage via `sd_onboarding_seen`, so it never reappears afterward).
 *   Revisiting /daily once the instance is COMPLETED auto-redirects to
 *   /daily/result (the terminal-phase effect fires on mount), so the mid-game
 *   and solved shots below are two screenshots of ONE continuous playthrough,
 *   never two independent visits to /daily.
 * - Today's live daily puzzle (theme "Idioms", pattern "____ IS _____", 4 + 5
 *   letters) is the idiom "TIME IS MONEY" — solved for real by typing both
 *   words on the on-screen keyboard, the same interaction a human player uses.
 *   A throwaway wrong-but-real-word guess is thrown in on each target first
 *   (see DEMO_WORDS) purely so the mid-game screenshot shows genuine multi-row
 *   colour feedback instead of a pristine empty board.
 * - `/team/new` creates a real, live "open invite" (POST /api/v1/open-invites).
 *   Claiming it (POST /api/v1/g/:token) spawns a real 1-on-1 co-op team and the
 *   server redirects the claimer straight to /team/:teamId/daily — the actual
 *   co-op play screen, showing YOUR board plus a "teammate" status strip
 *   (name/status/length only — never the teammate's letters, by the server's
 *   own privacy contract). To capture it for real (not fake it), this script
 *   opens a SECOND, fully independent anonymous browser context — a synthetic
 *   teammate entirely under this script's control, never a real person — and
 *   has it claim the first context's invite. Both display names are the
 *   server's own anonymous default ("Player NNNN"); no real person's name,
 *   email, or invite token is ever rendered as visible page text.
 *
 * Theme: the browser context sets colorScheme: 'dark' for parity with the
 * other two capture scripts on this site, but Split Decision has no dark
 * theme of its own — grepping its CSS/app shell/Settings screen turns up no
 * `prefers-color-scheme` or `data-theme` handling anywhere, so this setting
 * has no visible effect. All three screenshots are captured in the app's one
 * real (light/cream) theme.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.SD_BASE_URL;
if (!BASE) {
  console.error('SD_BASE_URL is not set. Export it to the deployment\'s base URL before running this script.');
  process.exit(1);
}
const OUT = '/tmp/sd-shots';
fs.mkdirSync(OUT, { recursive: true });

const CONTEXT_OPTS = {
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  locale: 'en-US',
  colorScheme: 'dark',
};

// ---------------------------------------------------------------------------
// Keyboard helpers — scoped to data-testid="game-footer" (present on both the
// solo /daily and co-op /team/:id/daily screens) so single-letter button names
// never collide with other page chrome.
// ---------------------------------------------------------------------------

function footerKey(page, name) {
  return page.getByTestId('game-footer').getByRole('button', { name, exact: true });
}

async function typeWord(page, word) {
  for (const letter of word) {
    await footerKey(page, letter).click();
  }
}

async function pressBackspace(page, times) {
  const btn = footerKey(page, 'Backspace');
  for (let i = 0; i < times; i++) {
    await btn.click();
  }
}

async function submitWord(page, word) {
  await typeWord(page, word);
  await footerKey(page, 'Enter').click();
}

/** Read the currently-selected target's length off its phrase-strip chip
 *  (aria-pressed="true", accessible name "Target N, L letters[, solved]"). */
async function selectedTargetLength(page) {
  const label = await page.locator('[aria-pressed="true"]').first().getAttribute('aria-label');
  const m = label?.match(/(\d+) letters/);
  return m ? Number(m[1]) : null;
}

// A couple of very common, safe real words per length — used only to put a
// genuine (possibly wrong) guess on the board for a lively mid-game
// screenshot. Never the day's actual answer for the target being demoed.
const DEMO_WORDS = {
  3: ['MID', 'CAT'],
  4: ['MITE', 'GOLD'],
  5: ['HONEY', 'HOUSE'],
  6: ['GARDEN', 'YELLOW'],
  7: ['MORNING', 'RAINBOW'],
  8: ['ELEPHANT', 'SANDWICH'],
  9: ['SUNSHINE', 'CHOCOLATE'],
};

/** Submit a plausible common-word guess for whichever target is currently
 *  selected, purely so the board shows real colour feedback. Tries a second
 *  candidate if the first is rejected by the word list; a coincidental solve
 *  is a fine outcome too. No-op (leaves the board empty) if no candidate is
 *  known for this length or every candidate is rejected. */
async function demoGuess(page, length) {
  for (const word of DEMO_WORDS[length] ?? []) {
    await submitWord(page, word);
    const rejected = await page
      .getByTestId('invalid-word-toast')
      .isVisible({ timeout: 1200 })
      .catch(() => false);
    if (!rejected) return;
    await pressBackspace(page, word.length);
  }
}

async function dismissOnboarding(page) {
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skip.isVisible({ timeout: 5000 }).catch(() => false)) {
    await skip.click();
  }
}

/** Close a dismissible Toast (by its data-testid) if one happens to be showing
 *  — the transient "Halfway split!" / "Your half's in!" per-word success cue,
 *  or the one-time ghost-letter coach mark. Both auto-dismiss on their own
 *  eventually, but closing them immediately keeps them from lingering into a
 *  screenshot taken a moment later. No-op if nothing is showing. */
async function closeToastIfVisible(page, testId, timeout = 800) {
  const toast = page.getByTestId(testId);
  if (await toast.isVisible({ timeout }).catch(() => false)) {
    const dismiss = toast.getByRole('button', { name: 'Dismiss' });
    if (await dismiss.isVisible({ timeout: 300 }).catch(() => false)) {
      await dismiss.click();
    }
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext(CONTEXT_OPTS);

// ---------------------------------------------------------------------------
// 1) Solo daily — one continuous playthrough, screenshotted twice:
//      02-puzzle: mid-game (target 1 solved, target 2 has a real wrong guess
//                 with colour feedback showing) — never an empty board.
//      01-solved: the SAME playthrough carried to completion — the card image.
// ---------------------------------------------------------------------------
const soloPage = await context.newPage();
const soloErrors = [];
soloPage.on('console', (m) => { if (m.type() === 'error') soloErrors.push(m.text()); });

await soloPage.goto(BASE + '/daily', { waitUntil: 'networkidle' });
await dismissOnboarding(soloPage);
await soloPage.waitForSelector('[data-testid="board-region"]');

// Target 1 is selected by default. Throw in one real wrong guess for colour,
// then solve it for real.
await demoGuess(soloPage, await selectedTargetLength(soloPage));
await submitWord(soloPage, 'TIME');
await soloPage
  .getByRole('button', { name: /Target 1, 4 letters, solved/ })
  .waitFor({ state: 'visible' });
// Close the transient "Halfway split!" per-word success cue immediately
// rather than letting it linger (or auto-dismiss mid-screenshot).
await closeToastIfVisible(soloPage, 'word-solved-toast');

// Select target 2 explicitly (not the ~1.1s auto-advance timer, so this isn't
// racy) and leave one real wrong guess showing before the mid-game shot.
await soloPage.getByRole('button', { name: /Target 2, 5 letters/ }).click();
await demoGuess(soloPage, await selectedTargetLength(soloPage));
// A wrong guess that happens to land a correct-position letter triggers the
// one-time ghost-letter coach mark (localStorage-gated, first time ever) —
// close it so it doesn't cover the board in the screenshot.
await soloPage.waitForTimeout(500);
await closeToastIfVisible(soloPage, 'ghost-coach-toast');
await closeToastIfVisible(soloPage, 'word-solved-toast');
await soloPage.waitForTimeout(600);

await soloPage.screenshot({ path: `${OUT}/02-puzzle.png` });
console.log(`02-puzzle: captured${soloErrors.length ? ` (${soloErrors.length} console errors)` : ''}`);

// Finish the game for real — the genuine solved result.
await submitWord(soloPage, 'MONEY');
await soloPage.waitForURL(/\/daily\/result/);
await soloPage.waitForSelector('[data-testid="screen-result"]');
await soloPage.waitForTimeout(800);
await soloPage.screenshot({ path: `${OUT}/01-solved.png` });
console.log(`01-solved: captured${soloErrors.length ? ` (${soloErrors.length} console errors)` : ''}`);
if (soloErrors.length) soloErrors.forEach((e) => console.log('    ' + e));
await soloPage.close();

// ---------------------------------------------------------------------------
// 2) Co-op — a second, independent anonymous session (its own browser
//    context/cookie jar — a synthetic teammate, never a real person) claims
//    the first session's open invite and lands on the real co-op play screen.
// ---------------------------------------------------------------------------
const hostPage = await context.newPage();
const [inviteResp] = await Promise.all([
  hostPage.waitForResponse((r) => r.url().includes('/open-invites') && r.request().method() === 'POST'),
  hostPage.goto(BASE + '/team/new', { waitUntil: 'networkidle' }),
]);
const { token } = await inviteResp.json();
const hostNamePromptSkip = hostPage.getByTestId('name-prompt-skip');
if (await hostNamePromptSkip.isVisible({ timeout: 5000 }).catch(() => false)) {
  await hostNamePromptSkip.click();
}

const guestContext = await browser.newContext(CONTEXT_OPTS);
const guestPage = await guestContext.newPage();
const guestErrors = [];
guestPage.on('console', (m) => { if (m.type() === 'error') guestErrors.push(m.text()); });

await guestPage.goto(`${BASE}/g/${token}`, { waitUntil: 'networkidle' });
// Either "Start game" (no creatorResult yet) or "Play co-op with {name}"
// (creator already has a solo result to flex) — both call the same claim.
await guestPage.getByRole('button', { name: /Start game|Play co-op with/ }).click();
await guestPage.waitForURL(/\/team\/.+\/daily/);
await guestPage.waitForSelector('[data-testid="board-region"]');

// A real (possibly wrong) guess on the guest's OWN word, for the same
// mid-game liveliness as the solo board. The teammate strip (host's status)
// is already genuinely visible regardless.
await demoGuess(guestPage, await selectedTargetLength(guestPage));
// Same one-time ghost coach mark (and, on a lucky solve, the "Your half's
// in!" cue) can appear here too — this is a separate browser context/session,
// so it hasn't been dismissed before. Close whichever shows.
await guestPage.waitForTimeout(500);
await closeToastIfVisible(guestPage, 'ghost-coach-toast');
await closeToastIfVisible(guestPage, 'word-solved-toast');
await guestPage.waitForTimeout(600);

await guestPage.screenshot({ path: `${OUT}/03-coop.png` });
console.log(`03-coop: captured${guestErrors.length ? ` (${guestErrors.length} console errors)` : ''}`);
if (guestErrors.length) guestErrors.forEach((e) => console.log('    ' + e));

await guestPage.close();
await guestContext.close();
await hostPage.close();

await browser.close();
console.log(`\nDone. PNGs in ${OUT}`);
