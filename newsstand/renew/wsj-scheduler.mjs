#!/usr/bin/env node
// Runs the WSJ renewal when the pass is due instead of on a daily clock. A WSJ
// library pass lasts 3 days and can't be renewed while it's live (partner.wsj.com
// answers "Welcome Back — Looks like you already have a subscription"), so the old
// daily 8:00 run found it live on the expiry morning and left it off until the
// next day. launchd (~/Library/LaunchAgents/com.newsstand.wsj-renew.plist) runs
// this every 15 minutes; until the due time it exits without logging or touching
// the network, except to retry a failed status.json publish every 30 minutes
// (state/publish-pending, left by publish-status.mjs for NYT and WSJ alike).
//
// Due = last ACTUAL renewal + 72h + 5 min. Only a confirmed renewal moves the
// anchor: renew.mjs's "renewed" outcome (the "Redemption Successful" page), or a
// "submitted" one (form sent, no confirmation recognized) followed 15 minutes
// later by a check that finds the pass live — then the end of the submitting run
// is the anchor (at most ~2 min after the actual submission; the 5-min buffer covers it).
//   pass still live at the due time  -> check again after 15m, 30m, 1h, 2h, then every 4h
//   failed (login wall, unknown page) -> notify; retry after 1h, 6h, 12h, then daily
// A missing or unreadable schedule means "due now", never "wait".
//
//   node wsj-scheduler.mjs           what launchd runs
//   node wsj-scheduler.mjs --check   print the schedule and exit (no renewal)
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquireLock } from "./file-lock.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEDULE = join(HERE, "state", "wsj-schedule.json");
const OUTCOME = join(HERE, "state", "wsj-outcome.json");
const PROFILE = join(HERE, "state", "profile");
const PENDING = join(HERE, "state", "publish-pending"); // written by publish-status.mjs on failure
const STATUS = join(HERE, "..", "status.json");
const LOG = join(HERE, "logs", "local-renew.log");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const MIN = 60e3;
export const PASS_MS = 72 * 60 * MIN;
export const BUFFER_MS = 5 * MIN;
const VERIFY_MS = 15 * MIN;
const ACTIVE_RETRY = [15, 30, 60, 120, 240].map((m) => m * MIN);
const FAILED_RETRY = [60, 360, 720, 1440].map((m) => m * MIN);
const nth = (list, n) => list[Math.min(n, list.length) - 1];

// The schedule after a run that ended at `at` with `outcome`.
export function nextSchedule(prev, outcome, at) {
  if (outcome === "renewed") {
    return { lastRenewal: at, nextDue: at + PASS_MS + BUFFER_MS, activeChecks: 0, failures: 0, lastResult: "renewed" };
  }
  if (outcome === "submitted") {
    return { ...prev, pendingAnchor: at, failures: 0, nextDue: at + VERIFY_MS, lastResult: "submitted" };
  }
  if (outcome === "active" && prev.pendingAnchor) {
    // The form only shows for an expired pass, so live now = that submission renewed it.
    return { ...nextSchedule({}, "renewed", prev.pendingAnchor), confirmedLater: true };
  }
  if (outcome === "active") {
    const activeChecks = (prev.activeChecks ?? 0) + 1;
    return { ...prev, activeChecks, failures: 0, lastActiveSeen: at, nextDue: at + nth(ACTIVE_RETRY, activeChecks), lastResult: "active" };
  }
  const failures = (prev.failures ?? 0) + 1;
  return { ...prev, failures, nextDue: at + nth(FAILED_RETRY, failures), lastResult: "failed" };
}

// Runs a child with a hard deadline. Playwright traps SIGTERM to close Chrome
// gracefully and never exits if Chrome hangs, so SIGTERM is only the first
// attempt: SIGKILL follows after `graceMs`. Resolves {code, signal, timedOut}.
export function runChild(cmd, args, { cwd, env, stdio = "ignore", deadlineMs, graceMs = 30e3 }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, stdio });
    let timedOut = false, killer;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killer = setTimeout(() => child.kill("SIGKILL"), graceMs);
    }, deadlineMs);
    child.on("error", () => {}); // spawn failure shows up as a nonzero exit below
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      clearTimeout(killer);
      resolve({ code, signal, timedOut });
    });
  });
}

const stamp = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleString("en-US", {
  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
}) : "never");

function readSchedule() {
  if (!existsSync(SCHEDULE)) return { s: {}, why: "no schedule yet" };
  try { return { s: JSON.parse(readFileSync(SCHEDULE, "utf8")), why: "" }; }
  catch { return { s: {}, why: "schedule unreadable" }; }
}

function describe(s) {
  const renewed = `last renewal ${stamp(s.lastRenewal)}`;
  if (s.lastResult === "active") return `pass was still live at check ${s.activeChecks} (${renewed})`;
  if (s.lastResult === "failed") return `retry after ${s.failures} failed attempt(s) (${renewed})`;
  if (s.lastResult === "submitted") return `checking whether the pass form sent ${stamp(s.pendingAnchor)} renewed it (${renewed})`;
  return `72h after the renewal on ${stamp(s.lastRenewal)}`;
}

function notify(message) {
  spawnSync("osascript", ["-e", `display notification ${JSON.stringify(message)} with title "Newsstand"`]);
}

const log = (line) => { mkdirSync(dirname(LOG), { recursive: true }); appendFileSync(LOG, line + "\n"); };

async function publish(message) {
  const out = openSync(LOG, "a");
  const run = await runChild(process.execPath, ["publish-status.mjs", message],
    { cwd: HERE, env: process.env, stdio: ["ignore", out, out], deadlineMs: 10 * MIN });
  closeSync(out);
  // A publisher that was killed (deadline) or crashed never wrote its retry marker.
  if ((run.timedOut || run.code !== 0) && !existsSync(PENDING)) {
    const why = run.timedOut ? "timed out" : `exited ${run.code ?? run.signal}`;
    writeFileSync(PENDING, `${new Date().toISOString()} publish-status.mjs ${why}\n`);
    log(`status.json publish didn't finish (${why}) — retrying in 30 min`);
    notify(`status.json not published (publish-status.mjs ${why}); retrying in 30 minutes.`);
  }
}

// A Chrome left behind by a killed run keeps the profile open, and every later
// run would fail to start on it. Only safe while holding the profile lock: once
// the killed run is gone, the next job may already have the profile in use.
async function stopOrphanedChrome() {
  const release = await acquireLock(PROFILE, { waitMs: 2 * MIN }).catch(() => null);
  if (!release) { log("profile is in use by another run — left any orphaned Chrome alone"); return; }
  const pattern = `--user-data-dir=${PROFILE}( |$)`;
  const running = () => spawnSync("pgrep", ["-f", "--", pattern]).status === 0;
  for (const signal of ["TERM", "KILL"]) {
    if (!running()) break;
    spawnSync("pkill", [`-${signal}`, "-f", "--", pattern]);
    for (let i = 0; i < 20 && running(); i++) await new Promise((r) => setTimeout(r, 500));
  }
  log(running() ? "an orphaned Chrome survived SIGKILL" : "no Chrome left on the profile");
  release();
}

// renew.mjs records the outcome before it writes status.json, so a run that died
// in between has renewed without telling the app; write the entry here too.
async function recordRenewal(ts) {
  const release = await acquireLock(join(HERE, "state", "status-json"), { waitMs: 5 * MIN });
  try {
    let status = { renewed: {} };
    try { status = JSON.parse(readFileSync(STATUS, "utf8")); } catch {}
    const wsj = status.renewed?.wsj;
    if (!(wsj?.ok && wsj.ts >= ts)) {
      status.renewed = { ...(status.renewed ?? {}), wsj: { ok: true, ts } };
      status.updated = Date.now();
      writeFileSync(STATUS, JSON.stringify(status, null, 2) + "\n");
    }
  } finally {
    release();
  }
}

async function main() {
  const isDue = (s) => !Number.isFinite(s.nextDue) || Date.now() >= s.nextDue;
  // A publish that failed (here or in the daily NYT run) leaves a marker; retry it every 30 min.
  const publishRetryDue = () => existsSync(PENDING) && Date.now() - statSync(PENDING).mtimeMs >= 30 * MIN;
  let { s: prev, why } = readSchedule();

  if (process.argv.includes("--check")) {
    console.log(Number.isFinite(prev.nextDue)
      ? `WSJ renewal ${isDue(prev) ? "is due now" : "due " + stamp(prev.nextDue)} — ${describe(prev)}`
      : `WSJ renewal is due now — ${why}`);
    if (existsSync(PENDING)) console.log(`status.json publish pending since: ${readFileSync(PENDING, "utf8").trim()}`);
    return;
  }
  if (!isDue(prev) && !publishRetryDue()) return;

  // One scheduler at a time: a second one would act on a stale copy of the
  // schedule and overwrite the first one's renewal anchor. Contention is
  // silent; any other lock error (say, an unwritable state/) must not be.
  let release;
  try {
    release = await acquireLock(join(HERE, "state", "wsj-scheduler"), { waitMs: 0 });
  } catch (e) {
    if (e.code === "ELOCKED") return;
    notify(`WSJ scheduler can't run: ${e.message}`);
    throw e;
  }
  ({ s: prev, why } = readSchedule());

  if (!isDue(prev)) {
    if (publishRetryDue()) {
      log(`=== ${new Date().toLocaleString("sv-SE")} wsj scheduler: retrying an earlier failed status.json publish ===`);
      await publish("Record local renewal in status.json");
    }
    release();
    return;
  }

  // sv-SE renders local time as "2026-10-18 09:41:03", matching local-renew.sh's headers.
  log(`=== ${new Date().toLocaleString("sv-SE")} wsj scheduler: due — ${why || describe(prev)} ===`);
  rmSync(OUTCOME, { force: true });
  const out = openSync(LOG, "a");
  const run = await runChild(process.execPath,
    ["renew.mjs", "--pubs", "wsj", "--headless", "--status", "../status.json", "--shots", "shots", "--outcome", OUTCOME],
    { cwd: HERE, env: { ...process.env, CHROMIUM_PATH: CHROME }, stdio: ["ignore", out, out], deadlineMs: 20 * MIN });
  closeSync(out);
  if (run.timedOut) {
    log(`renew.mjs passed its 20-minute deadline and was stopped (${run.signal ?? run.code})`);
    await stopOrphanedChrome();
  }

  let result = { outcome: "failed", ts: Date.now() };
  try { result = { ...result, ...JSON.parse(readFileSync(OUTCOME, "utf8")).wsj }; } catch {}
  const next = nextSchedule(prev, result.outcome, result.ts);
  writeFileSync(SCHEDULE, JSON.stringify(next, null, 2) + "\n");

  if (result.outcome === "renewed") {
    if (prev.lastRenewal) {
      log(`previous WSJ pass: renewed ${stamp(prev.lastRenewal)}; last seen live ` +
          `${prev.lastActiveSeen ? stamp(prev.lastActiveSeen) : "— (already expired at the first check)"}; renewed again ${stamp(result.ts)}`);
    }
    log(`WSJ renewed — next renewal due ${stamp(next.nextDue)}`);
    try {
      await recordRenewal(result.ts);
      await publish("Record local WSJ renewal in status.json");
    } catch (e) {
      log(`WSJ renewed, but status.json could not be updated: ${e.message}`);
      notify(`WSJ renewed, but the Newsstand app's status couldn't be updated: ${e.message}`);
    }
  } else if (result.outcome === "active" && next.confirmedLater) {
    log(`WSJ pass is live — the pass form sent ${stamp(prev.pendingAnchor)} renewed it; next renewal due ${stamp(next.nextDue)}`);
    try {
      await recordRenewal(prev.pendingAnchor);
      await publish("Record local WSJ renewal in status.json");
    } catch (e) {
      log(`WSJ renewed, but status.json could not be updated: ${e.message}`);
      notify(`WSJ renewed, but the Newsstand app's status couldn't be updated: ${e.message}`);
    }
  } else if (result.outcome === "active") {
    log(`WSJ pass still live — checking again ${stamp(next.nextDue)}`);
  } else if (result.outcome === "submitted") {
    log(`WSJ pass form sent but no confirmation recognized — checking ${stamp(next.nextDue)} whether the pass went live`);
    notify("WSJ registration sent, but its confirmation page wasn't recognized (has WSJ changed it?). Checking again in 15 minutes.");
  } else {
    log(`WSJ renewal FAILED — retrying ${stamp(next.nextDue)}`);
    notify(`WSJ renewal failed; retrying ${stamp(next.nextDue)}. If it keeps failing, the WSJ login in the renewal profile needs re-seeding.`);
  }
  release();
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await main();
