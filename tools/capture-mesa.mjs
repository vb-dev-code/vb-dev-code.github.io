/**
 * Mesa screenshot capture against a local Expo web build.
 *
 * Mesa's Supabase project has real RLS and no seeded demo account, so a fresh
 * anonymous session shows nothing but empty tabs (confirmed live against the
 * running dev server). Per the brief's own decision list,
 * the fallback used here is Playwright route-mocking of every Supabase REST
 * endpoint the three target screens touch, in the same style as
 * tools/capture-homecomms.mjs's /api/* mocks — plus a hand-seeded auth
 * session in localStorage (Mesa's own storage key format, see below) so the
 * app believes it is signed in without ever touching a real account.
 *
 * WEB TARGET: Mesa's package.json lists Expo web as a platform but
 * react-native-web was never actually installed in this prototype (it had
 * only ever been run via `npx expo start` + iOS simulator/Expo Go). Running
 * `expo start --web` directly in the mesa repo fails with a missing-dependency
 * error. Since the task instructions forbid writing to the mesa repo, this
 * script does NOT run against it directly. Instead:
 *   1. The mesa source (minus node_modules, .git, ios/Pods, .expo) is rsynced
 *      to a scratch directory once, out-of-band.
 *   2. `npx expo install react-native-web react-dom @expo/metro-runtime` is
 *      run ONLY inside that scratch copy.
 *   3. `npx expo start --web` is run from the scratch copy, serving the exact
 *      same app/component/hook code as the real repo (only node_modules
 *      differs) at http://localhost:8081.
 * The mesa repo itself is never modified — only read. This script assumes
 * that dev server is already running (see the run instructions below).
 *
 * THEME: captured in Mesa's normal light appearance (default 'warm' theme —
 * cream background, terracotta primary). Per the task instructions, Mesa has
 * no dark theme (constants/themes.ts defines three light/pastel themes:
 * warm/clean/bold, no dark mode toggle in stores/theme.ts), so
 * colorScheme:'dark' below is inert and is omitted entirely rather than set
 * and ignored.
 *
 * PRIVACY: every name below (jrivera, mkeller, tobrien, pnaidu, rsong, dchen)
 * is an invented handle, not a real person. No photo ever appears — Mesa's
 * own StripedPlaceholder component (a colored diagonal-stripe block with a
 * text label, components/ui/StripedPlaceholder.tsx) is what the real app
 * renders whenever a check-in is shared at a photo-visibility level but has
 * no photo attached, so every "photo" slot below is left photo_url: null and
 * rendered through that real, non-photographic in-app component. No weight
 * data appears in any of the three captured screens.
 *
 * Run instructions (this exact sequence was used to produce the shipped
 * screenshots):
 *   1. rsync mesa (minus node_modules/.git/ios/Pods/.expo) to a scratch dir
 *   2. cd <scratch dir> && npx expo install react-native-web react-dom @expo/metro-runtime
 *   3. npx expo start --web --port 8081   (leave running)
 *   4. cd ~/vb-dev-code/vb-dev-code.github.io && node tools/capture-mesa.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.MESA_URL || 'http://localhost:8081';
const OUT = '/tmp/mesa-shots';
fs.mkdirSync(OUT, { recursive: true });

// Mesa's Supabase project ref — supabase-js derives its localStorage auth key
// from this at runtime: `sb-${hostname.split('.')[0]}-auth-token` (confirmed
// by reading node_modules/@supabase/supabase-js's SupabaseClient construction
// logic). This is archival tooling that isn't expected to run unattended, so
// the ref is read from the environment rather than hardcoded — set
// MESA_PROJECT_REF to the value from Mesa's own Supabase config before
// running this script.
const PROJECT_REF = process.env.MESA_PROJECT_REF;
if (!PROJECT_REF) {
  console.error('MESA_PROJECT_REF is not set. Export it to Mesa\'s Supabase project ref before running this script.');
  process.exit(1);
}
const AUTH_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

const VIEWER_ID = 'usr_you';

// ── invented people (no real names/photos/weights) ─────────────────────────
const PROFILES = {
  usr_you:     { id: 'usr_you',     handle: 'jrivera' },
  usr_mkeller: { id: 'usr_mkeller', handle: 'mkeller' },
  usr_tobrien: { id: 'usr_tobrien', handle: 'tobrien' },
  usr_pnaidu:  { id: 'usr_pnaidu',  handle: 'pnaidu' },
  usr_rsong:   { id: 'usr_rsong',   handle: 'rsong' },
  usr_dchen:   { id: 'usr_dchen',   handle: 'dchen' },
};

const VIEWER_PROFILE = {
  id: VIEWER_ID,
  handle: 'jrivera',
  created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
  experiment_cohort: 'group_user',
  default_sharing_level: 'photo_status_numbers',
  analytics_consent: true,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  theme: 'warm',
  push_token: null,
  logging_variant: 'photo_plus_macros',
  pilot_context: null,
};

const GROUPS = [
  {
    id: 'grp_sunday', name: 'Sunday Reset Crew', purpose: 'Protein & macros',
    norms: ['Rest days welcome', 'Progress over perfection'],
    created_by: VIEWER_ID, created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
    is_active: true,
  },
  {
    id: 'grp_macro', name: 'Macro Squad Accountability', purpose: 'Macro tracking',
    norms: ['Macro tracking', 'Supportive vibes only'],
    created_by: 'usr_tobrien', created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    is_active: true,
  },
];

const MEMBERS_BY_GROUP = {
  grp_sunday: ['usr_you', 'usr_mkeller', 'usr_tobrien', 'usr_pnaidu', 'usr_dchen'], // 5 total
  grp_macro: ['usr_you', 'usr_tobrien', 'usr_rsong'], // 3 total
};

// Today's check-ins per group (user_id + support_flag only — matches the
// `select=user_id,support_flag` shape useMyGroups/useGroupDetail use for
// the "N of M checked in" glance count).
const TODAY_SIMPLE_BY_GROUP = {
  // 4 of 5 checked in; tobrien flagged for support.
  grp_sunday: [
    { user_id: 'usr_mkeller', support_flag: false },
    { user_id: 'usr_tobrien', support_flag: true },
    { user_id: 'usr_pnaidu', support_flag: false },
    { user_id: 'usr_dchen', support_flag: false },
  ],
  // 1 of 3 checked in.
  grp_macro: [
    { user_id: 'usr_rsong', support_flag: false },
  ],
};

const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

// Rich feed rows for useFeed's check_ins query (embeds profile + goal +
// social_responses — the shape CheckInPost.tsx reads directly).
const FEED_CHECKINS = [
  {
    id: 'ci_mkeller_1', user_id: 'usr_mkeller', group_id: 'grp_sunday',
    goal_id: 'goal_mkeller_protein', goal_status: 'on_track',
    photo_url: null, reflection_text: "Hit 150g protein before dinner — added a shake after the gym.",
    calorie_value: 1920, protein_value: 152, carbs_value: 180, fat_value: 60,
    support_flag: false, visibility_level: 'photo_status_numbers', emotional_pulse: null,
    experiment_cohort: 'group_user', created_at: hoursAgo(3),
    profile: { id: 'usr_mkeller', handle: 'mkeller', default_sharing_level: 'photo_status_numbers' },
    goal: { type: 'protein_target', visibility_level: 'photo_status' },
    social_responses: [
      { id: 'sr_1', check_in_id: 'ci_mkeller_1', user_id: 'usr_pnaidu', group_id: 'grp_sunday', response_type: 'heart', reply_text: null, minutes_since_checkin: 40, created_at: hoursAgo(2), profile: { id: 'usr_pnaidu', handle: 'pnaidu' } },
      { id: 'sr_2', check_in_id: 'ci_mkeller_1', user_id: 'usr_dchen', group_id: 'grp_sunday', response_type: 'heart', reply_text: null, minutes_since_checkin: 55, created_at: hoursAgo(2), profile: { id: 'usr_dchen', handle: 'dchen' } },
      { id: 'sr_3', check_in_id: 'ci_mkeller_1', user_id: 'usr_tobrien', group_id: 'grp_sunday', response_type: 'cheer', reply_text: null, minutes_since_checkin: 60, created_at: hoursAgo(2), profile: { id: 'usr_tobrien', handle: 'tobrien' } },
      { id: 'sr_4', check_in_id: 'ci_mkeller_1', user_id: 'usr_tobrien', group_id: 'grp_sunday', response_type: 'reply', reply_text: 'Nice, that shake trick works every time.', minutes_since_checkin: 62, created_at: hoursAgo(2), profile: { id: 'usr_tobrien', handle: 'tobrien' } },
    ],
  },
  {
    id: 'ci_tobrien_1', user_id: 'usr_tobrien', group_id: 'grp_sunday',
    goal_id: 'goal_tobrien_calorie', goal_status: 'close',
    photo_url: null, reflection_text: 'Landed right around my target, a little over but within range.',
    calorie_value: 2100, protein_value: 110, carbs_value: null, fat_value: null,
    support_flag: true, visibility_level: 'photo_status', emotional_pulse: null,
    experiment_cohort: 'group_user', created_at: hoursAgo(5),
    profile: { id: 'usr_tobrien', handle: 'tobrien', default_sharing_level: 'photo_status' },
    goal: { type: 'calorie_budget', visibility_level: 'photo_status' },
    social_responses: [
      { id: 'sr_5', check_in_id: 'ci_tobrien_1', user_id: 'usr_pnaidu', group_id: 'grp_sunday', response_type: 'heart', reply_text: null, minutes_since_checkin: 30, created_at: hoursAgo(4), profile: { id: 'usr_pnaidu', handle: 'pnaidu' } },
    ],
  },
  {
    id: 'ci_rsong_1', user_id: 'usr_rsong', group_id: 'grp_macro',
    goal_id: 'goal_rsong_macro', goal_status: 'on_track',
    photo_url: null, reflection_text: 'Macros balanced today — hit protein and stayed under on carbs.',
    calorie_value: 1780, protein_value: 140, carbs_value: 150, fat_value: 55,
    support_flag: false, visibility_level: 'photo_status_numbers', emotional_pulse: null,
    experiment_cohort: 'group_user', created_at: hoursAgo(6),
    profile: { id: 'usr_rsong', handle: 'rsong', default_sharing_level: 'photo_status_numbers' },
    goal: { type: 'macro_target', visibility_level: 'photo_status_numbers' },
    social_responses: [
      { id: 'sr_6', check_in_id: 'ci_rsong_1', user_id: 'usr_mkeller', group_id: 'grp_macro', response_type: 'heart', reply_text: null, minutes_since_checkin: 90, created_at: hoursAgo(4), profile: { id: 'usr_mkeller', handle: 'mkeller' } },
    ],
  },
];

// Oldest item on purpose (sorts to the bottom, under the check-ins above).
const FEED_DECLARATIONS = [
  {
    id: 'decl_1', user_id: 'usr_pnaidu', group_id: 'grp_sunday', goal_id: 'goal_pnaidu_meal',
    created_at: hoursAgo(7),
    profile: { id: 'usr_pnaidu', handle: 'pnaidu' },
    goal: { id: 'goal_pnaidu_meal', type: 'meal_consistency', visibility_level: 'photo_status' },
  },
];

// Viewer's own goals (goals tab + check-in goal selector).
const VIEWER_GOALS = [
  { id: 'goal_you_protein', user_id: VIEWER_ID, type: 'protein_target', target_value: { protein_g: 145 }, visibility_level: 'photo_status_numbers', is_active: true, created_at: new Date(Date.now() - 20 * 86400000).toISOString() },
  { id: 'goal_you_calorie', user_id: VIEWER_ID, type: 'calorie_budget', target_value: { calories: 1900 }, visibility_level: 'photo_status', is_active: true, created_at: new Date(Date.now() - 45 * 86400000).toISOString() },
  { id: 'goal_you_meal', user_id: VIEWER_ID, type: 'meal_consistency', target_value: { days_per_week: 5 }, visibility_level: 'photo_status', is_active: true, created_at: new Date(Date.now() - 10 * 86400000).toISOString() },
];

// Viewer's own declarations (goals screen "shared with" tags).
const VIEWER_DECLARATIONS = [
  { goal_id: 'goal_you_protein', group: { id: 'grp_sunday', name: 'Sunday Reset Crew' } },
  { goal_id: 'goal_you_calorie', group: { id: 'grp_macro', name: 'Macro Squad Accountability' } },
];

// Weekly adherence for the viewer, dated to the ACTUAL current week (Mon
// start) so date-fns' startOfWeek bucketing lines up regardless of which day
// this script runs on. Only days up to "today" are populated — future days
// are correctly left blank/greyed by the app's own WeekGrid logic.
function mondayOfThisWeek() {
  const now = new Date();
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(now.getDate() - diffToMonday);
  return monday;
}
function dateAtOffset(offsetDays) {
  const d = new Date(mondayOfThisWeek());
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}
const todayOffset = (() => {
  const day = new Date().getDay();
  return (day + 6) % 7; // 0 = Monday
})();
const ADHERENCE_PLAN = [
  { goal_id: 'goal_you_protein', goal_status: 'on_track' },
  { goal_id: 'goal_you_calorie', goal_status: 'close' },
  { goal_id: 'goal_you_protein', goal_status: 'on_track' },
  { goal_id: 'goal_you_meal', goal_status: 'rest_day' },
  { goal_id: 'goal_you_protein', goal_status: 'on_track' },
  { goal_id: 'goal_you_calorie', goal_status: 'close' },
  { goal_id: 'goal_you_protein', goal_status: 'on_track' },
];
const WEEK_ADHERENCE = ADHERENCE_PLAN
  .slice(0, todayOffset + 1)
  .map((entry, i) => ({
    goal_status: entry.goal_status,
    created_at: dateAtOffset(i),
    goal_id: entry.goal_id,
    support_flag: false,
  }));

// ── mock dispatcher — one handler per Supabase REST table, dispatching on
//    the `select=` query param since the same table is queried in several
//    different shapes across these hooks (confirmed against real request
//    URLs captured from a live run against the mocked app). ───────────────
function mockResponseFor(url) {
  const path = url.pathname;
  const select = url.searchParams.get('select') || '';

  if (path.includes('/profiles')) {
    return VIEWER_PROFILE; // both call sites query the viewer's own row
  }

  if (path.includes('/group_memberships')) {
    if (select === 'group_id') {
      return Object.keys(MEMBERS_BY_GROUP).map((gid) => ({ group_id: gid }));
    }
    if (select === 'user_id') {
      const gidFilter = url.searchParams.get('group_id') || '';
      const gid = (gidFilter.match(/eq\.(.+)/) || [])[1];
      return (MEMBERS_BY_GROUP[gid] || []).map((uid) => ({ user_id: uid }));
    }
    return [];
  }

  if (path.includes('/groups')) {
    return GROUPS;
  }

  if (path.includes('/check_ins')) {
    if (select.includes('social_responses')) return FEED_CHECKINS;
    if (select === 'user_id,support_flag') {
      const gidFilter = url.searchParams.get('group_id') || '';
      const gid = (gidFilter.match(/eq\.(.+)/) || [])[1];
      return TODAY_SIMPLE_BY_GROUP[gid] || [];
    }
    if (select.startsWith('goal_status')) return WEEK_ADHERENCE;
    if (select === 'goal_id') return null; // no prior check-in goal preference
    if (select === '*') return null; // viewer hasn't checked into this group today
    return [];
  }

  if (path.includes('/goal_declarations')) {
    if (select.includes('profile:profiles')) return FEED_DECLARATIONS;
    if (select.includes('group:groups')) return VIEWER_DECLARATIONS;
    return [];
  }

  if (path.includes('/goals')) {
    return VIEWER_GOALS;
  }

  if (path.includes('/nudges')) {
    return []; // no nudges today — keeps the feed banner off
  }

  return [];
}

async function setupMocks(page) {
  await page.route(/\/rest\/v1\//, async (route) => {
    const url = new URL(route.request().url());
    const body = mockResponseFor(url);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function seedSession(context) {
  await context.addInitScript(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session));
    },
    {
      key: AUTH_STORAGE_KEY,
      session: {
        access_token: 'mock-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
        refresh_token: 'mock-refresh-token',
        user: {
          id: VIEWER_ID,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'demo-viewer@example.com',
          app_metadata: {},
          user_metadata: {},
          created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
        },
      },
    }
  );
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  locale: 'en-US',
  // No colorScheme override — Mesa has no dark theme (see header note), and
  // its default 'warm' theme (light/cream) is what ships here, matching the
  // other two apps already on this site.
});
await seedSession(context);

async function freshPage() {
  const page = await context.newPage();
  await setupMocks(page);
  return page;
}

async function shot(page, filename, errors) {
  const out = `${OUT}/${filename}`;
  await page.screenshot({ path: out });
  console.log(`${filename}: captured${errors.length ? ` (${errors.length} console errors)` : ''}`);
  if (errors.length) errors.forEach((e) => console.log('    ' + e));
}

// ══ 01 — FEED (hero shot) ══════════════════════════════════════════════════
console.log('\n── 01-feed ──');
{
  const page = await freshPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('text=Today', { timeout: 15000 });
  // Let the group glance card + first check-in settle in.
  await page.waitForTimeout(1500);
  // The site's grid card only ever shows roughly the TOP THIRD of this
  // screenshot (aspect-ratio 4/3 card, overflow hidden, image at 62% width
  // with a 7% top margin). Unscrolled,
  // that crop line lands mid-way through the first check-in's photo
  // placeholder, before its status label — so nudge the feed's scrollable
  // list up by an exact CSS-pixel amount (found by measurement, not a wheel
  // gesture whose px-per-tick varies) to bring the full
  // "mkeller / On track / PROTEIN TARGET" placeholder into that crop
  // instead of mostly showing the plain stats card above it.
  await page.evaluate(() => {
    const scrollables = Array.from(document.querySelectorAll('div')).filter(
      (el) => el.scrollHeight > el.clientHeight + 40
    );
    const target = scrollables.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (target) target.scrollTop = 130;
  });
  await page.waitForTimeout(400);
  await shot(page, '01-feed.png', errors);
  await page.close();
}

// ══ 02 — CHECK-IN (status step, populated + a real selection made) ═════════
console.log('\n── 02-checkin ──');
{
  const page = await freshPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + '/check-in?groupId=grp_sunday', { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector("text=How's today going?", { timeout: 15000 });
  await page.waitForTimeout(800); // let goal/group chip defaults settle
  // Make a real selection so the screen shows an active, colored state
  // rather than the untouched default.
  await page.getByRole('radio', { name: 'On track' }).click();
  await page.waitForTimeout(500);
  await shot(page, '02-checkin.png', errors);
  await page.close();
}

// ══ 03 — GOALS (this week, populated adherence + goal cards) ══════════════
console.log('\n── 03-goal ──');
{
  const page = await freshPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + '/goals', { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('text=This week', { timeout: 15000 });
  await page.waitForTimeout(1000);
  await shot(page, '03-goal.png', errors);
  await page.close();
}

await browser.close();
console.log(`\nDone. PNGs in ${OUT}`);
