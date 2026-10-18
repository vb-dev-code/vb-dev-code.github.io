// Tests file-lock.mjs (kernel flock via O_EXLOCK): free lock, missing parent
// dir, a SIGKILLed holder releasing at once, waiting on a live holder, timeout
// with code ELOCKED, a holder whose event loop is blocked, a lock that must not
// pass to child processes, other errors passed through, and a stress run where
// several processes race for one lock and must never hold it at the same time.
// Usage: node test/lock-test.mjs (from newsstand/renew)
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const RENEW_DIR = fileURLToPath(new URL("..", import.meta.url)); // newsstand/renew

const LIB = pathToFileURL(join(RENEW_DIR, "file-lock.mjs")).href;
const DIR = mkdtempSync(join(tmpdir(), "wsj-lock-"));
const BASE = join(DIR, "profile");
const TRACE = join(DIR, "trace.log");

// Child: acquire (waitMs), trace acquire/release times, then run `then` (default: hold holdMs), exit.
const child = ({ waitMs = 1000, holdMs = 0, base = BASE, then = "" } = {}) => new Promise((resolve) => {
  const code = `
    import { acquireLock } from ${JSON.stringify(LIB)};
    import { appendFileSync } from "node:fs";
    const t0 = Date.now();
    try {
      const release = await acquireLock(${JSON.stringify(base)}, { waitMs: ${waitMs}, pollMs: 50, log: (m) => console.log("LOG " + m) });
      appendFileSync(${JSON.stringify(TRACE)}, "A " + (performance.timeOrigin + performance.now()) + "\\n");
      console.log("ACQUIRED after " + (Date.now() - t0));
      ${then || `await new Promise((r) => setTimeout(r, ${holdMs}));`}
      appendFileSync(${JSON.stringify(TRACE)}, "R " + (performance.timeOrigin + performance.now()) + "\\n");
    } catch (e) { console.log("ERROR " + e.code + " " + e.message); }`;
  const p = spawn(process.execPath, ["--input-type=module", "-e", code]);
  let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  p.on("exit", (code, signal) => resolve({ out, signal }));
});
let failed = 0;
const check = (name, cond, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : "  " + detail}`); if (!cond) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitedOf = (out) => Number((out.match(/ACQUIRED after (\d+)/) || [])[1]);

// a. free lock
let r = await child();
check("a acquires a free lock", /ACQUIRED/.test(r.out), r.out);

// b. parent directory doesn't exist yet (fresh checkout: no state/)
r = await child({ base: join(DIR, "fresh", "state", "profile") });
check("b creates a missing parent directory", /ACQUIRED/.test(r.out), r.out);

// c. holder SIGKILLed while holding -> next process acquires immediately
r = await child({ then: `process.kill(process.pid, "SIGKILL");` });
const after = await child({ waitMs: 0 });
check("c a SIGKILLed holder releases at once", r.signal === "SIGKILL" && /ACQUIRED/.test(after.out), r.out + after.out);

// d. live holder: second process waits, then acquires after the holder exits
let holder = child({ holdMs: 2500 });
await sleep(600);
r = await child({ waitMs: 10000 });
await holder;
check("d waiter announced who holds it", /is held by pid \d+ — waiting/.test(r.out), r.out);
check("d waiter acquired only after the holder exited (~2s)", waitedOf(r.out) >= 1500 && waitedOf(r.out) < 6000, r.out);

// e. timeout while held -> ELOCKED
holder = child({ holdMs: 2500 });
await sleep(600);
r = await child({ waitMs: 500 });
await holder;
check("e times out with code ELOCKED", /ERROR ELOCKED .* is held by pid/.test(r.out), r.out);

// f. holder blocks its event loop for 4 s (no timers run) -> lock still held throughout
holder = child({ then: "const end = Date.now() + 4000; while (Date.now() < end) {}" });
await sleep(800);
r = await child({ waitMs: 1500 });
await holder;
check("f a holder with a blocked event loop keeps the lock", /ERROR ELOCKED/.test(r.out), r.out);

// g. lock not inherited by a child process the holder spawned and left running
const PIDFILE = join(DIR, "orphan.pid");
holder = await child({ then: `
  const { spawn } = await import("node:child_process");
  const { writeFileSync } = await import("node:fs");
  const o = spawn("sleep", ["30"], { detached: true, stdio: "ignore" }); o.unref();
  writeFileSync(${JSON.stringify(PIDFILE)}, String(o.pid));` });
r = await child({ waitMs: 0 });
const orphan = Number(readFileSync(PIDFILE, "utf8"));
const orphanAlive = spawnSync("kill", ["-0", String(orphan)]).status === 0;
check("g a surviving child of the holder doesn't keep the lock", orphanAlive && /ACQUIRED/.test(r.out), `orphanAlive=${orphanAlive} ${r.out}`);
spawnSync("kill", [String(orphan)]);

// h. errors other than contention pass through (unwritable directory)
const RO = join(DIR, "readonly");
mkdirSync(RO);
chmodSync(RO, 0o555);
r = await child({ base: join(RO, "profile") });
chmodSync(RO, 0o755);
check("h an unwritable directory surfaces as an error, not as contention", /ERROR EACCES/.test(r.out), r.out);

// i. stress: 6 processes race for the lock, 5 rounds — holds must never overlap
let overlaps = 0, acquired = 0;
for (let round = 0; round < 5; round++) {
  rmSync(TRACE, { force: true });
  const outs = await Promise.all(Array.from({ length: 6 }, () => child({ waitMs: 15000, holdMs: 120 })));
  acquired += outs.filter((o) => /ACQUIRED/.test(o.out)).length;
  const events = readFileSync(TRACE, "utf8").trim().split("\n").map((l) => { const [k, t] = l.split(" "); return { k, t: Number(t) }; })
    .sort((a, b) => a.t - b.t);
  let holding = 0;
  for (const e of events) { holding += e.k === "A" ? 1 : -1; if (holding > 1) overlaps++; }
}
check("i six-way race: never two holders at once (30 acquisitions)", overlaps === 0 && acquired === 30, `overlaps=${overlaps} acquired=${acquired}`);

check("j the lock file stays in place (never deleted)", existsSync(`${BASE}.lock`));

console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
