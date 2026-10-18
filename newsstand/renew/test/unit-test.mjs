// Unit tests for nextSchedule (imported from the real wsj-scheduler.mjs — the
// main() guard keeps importing side-effect free). Usage: node test/unit-test.mjs (from newsstand/renew)
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const RENEW_DIR = fileURLToPath(new URL("..", import.meta.url)); // newsstand/renew

const { nextSchedule, runChild, PASS_MS, BUFFER_MS } = await import(pathToFileURL(join(RENEW_DIR, "wsj-scheduler.mjs")).href);
const MIN = 60e3;
let failed = 0;
const check = (name, cond, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : "  " + JSON.stringify(detail)}`); if (!cond) failed++; };

const t0 = Date.UTC(2026, 9, 18, 16, 41);
let s = nextSchedule({}, "renewed", t0);
check("renewed anchors +72h05m", s.nextDue === t0 + PASS_MS + BUFFER_MS && s.lastRenewal === t0 && PASS_MS === 72 * 60 * MIN, s);

const activeGaps = [];
let a = s, t = s.nextDue;
for (let i = 0; i < 7; i++) { a = nextSchedule(a, "active", t); activeGaps.push((a.nextDue - t) / MIN); t = a.nextDue; }
check("active backoff 15,30,60,120,240 then 240", JSON.stringify(activeGaps) === JSON.stringify([15, 30, 60, 120, 240, 240, 240]), activeGaps);
check("active keeps the anchor", a.lastRenewal === t0, a);

const failGaps = [];
let f = s; t = s.nextDue;
for (let i = 0; i < 6; i++) { f = nextSchedule(f, "failed", t); failGaps.push((f.nextDue - t) / MIN); t = f.nextDue; }
check("failure backoff 60,360,720,1440 then 1440", JSON.stringify(failGaps) === JSON.stringify([60, 360, 720, 1440, 1440, 1440]), failGaps);
check("failure keeps the anchor", f.lastRenewal === t0, f);

const mixed = nextSchedule(nextSchedule(f, "active", t), "failed", t + MIN);
check("an active check resets the failure count", nextSchedule(f, "active", t).failures === 0 && mixed.failures === 1, mixed);

const r2 = nextSchedule(a, "renewed", t0 + 4 * 24 * 60 * MIN);
check("renewal resets counters and drops lastActiveSeen", r2.activeChecks === 0 && r2.failures === 0 && !("lastActiveSeen" in r2), r2);

const unknown = nextSchedule(s, "garbage", t0);
check("unknown outcome is treated as failure", unknown.lastResult === "failed" && unknown.failures === 1, unknown);

// "submitted": verify in 15 min; a live pass then anchors at the submission time
const sub = nextSchedule(s, "submitted", t0 + 3 * 24 * 60 * MIN);
check("submitted rechecks in 15 min and remembers when", sub.nextDue === sub.pendingAnchor + 15 * MIN && sub.lastRenewal === t0, sub);
const afterFail = nextSchedule(sub, "failed", sub.nextDue);
check("a failed check keeps the pending submission", afterFail.pendingAnchor === sub.pendingAnchor, afterFail);
const confirmed = nextSchedule(afterFail, "active", afterFail.nextDue);
check("live pass after a submission anchors at the submission", confirmed.lastRenewal === sub.pendingAnchor && confirmed.nextDue === sub.pendingAnchor + PASS_MS + BUFFER_MS
  && confirmed.confirmedLater && !("pendingAnchor" in confirmed), confirmed);
const resent = nextSchedule(sub, "renewed", sub.nextDue);
check("a confirmed renewal drops the pending submission", !("pendingAnchor" in resent) && resent.lastRenewal === sub.nextDue, resent);
const plainActive = nextSchedule(s, "active", t0 + MIN);
check("active without a pending submission is just a live pass", plainActive.lastResult === "active" && plainActive.lastRenewal === t0, plainActive);

// runChild: a child that traps SIGTERM and never exits (what Playwright does
// when Chrome hangs) must still be gone shortly after deadline + grace.
const t1 = Date.now();
const stuck = await runChild(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"],
  { deadlineMs: 800, graceMs: 700 });
const took = Date.now() - t1;
check("runChild escalates to SIGKILL when SIGTERM is ignored", stuck.timedOut && stuck.signal === "SIGKILL" && took >= 1400 && took < 4000, { ...stuck, took });
const quick = await runChild(process.execPath, ["-e", "process.exit(3)"], { deadlineMs: 5000 });
check("runChild reports a normal exit without timing out", !quick.timedOut && quick.code === 3, quick);
const polite = await runChild(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { deadlineMs: 500, graceMs: 5000 });
check("runChild stops a SIGTERM-respecting child at the deadline", polite.timedOut && polite.signal === "SIGTERM", polite);

console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
