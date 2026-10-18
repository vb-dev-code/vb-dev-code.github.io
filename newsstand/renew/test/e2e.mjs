// End-to-end test of wsj-scheduler.mjs + renew.mjs against a mock library
// gateway (127.0.0.1) and mock partner.wsj.com (localhost), in an isolated copy
// of the renew directory. Usage: node test/e2e.mjs (from newsstand/renew)
import http from "node:http";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, chmodSync, mkdtempSync, utimesSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const RENEW_DIR = fileURLToPath(new URL("..", import.meta.url)); // newsstand/renew

const ROOT = mkdtempSync(join(tmpdir(), "wsj-e2e-"));
const RENEW = join(ROOT, "newsstand", "renew");
mkdirSync(join(RENEW, "state"), { recursive: true });
mkdirSync(join(RENEW, "logs"), { recursive: true });
for (const f of ["renew.mjs", "file-lock.mjs", "wsj-scheduler.mjs"]) cpSync(join(RENEW_DIR, f), join(RENEW, f));
symlinkSync(join(RENEW_DIR, "node_modules"), join(RENEW, "node_modules"));
writeFileSync(join(RENEW, "publish-status.mjs"), 'console.log("STUB publish: " + process.argv[2]);\n');
// fake osascript: notifications are recorded instead of shown
const BIN = join(ROOT, "bin"), NOTES = join(ROOT, "notifications.log");
mkdirSync(BIN, { recursive: true });
writeFileSync(join(BIN, "osascript"), `#!/bin/sh\necho "$2" >> "${NOTES}"\n`);
chmodSync(join(BIN, "osascript"), 0o755);

// ---- mock sites ------------------------------------------------------------
const registrations = [];
let port;
const page = (body, extraHead = "") => `<!doctype html><html><head>${extraHead}</head><body>${body}</body></html>`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const s = url.searchParams.get("s");
  const send = (html, code = 200, headers = {}) => { res.writeHead(code, { "content-type": "text/html", ...headers }); res.end(html); };
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (url.pathname === "/gateway") return send(page(`<form method="post" action="/login?s=${s}"><input name="user" type="text"><input name="pass" type="password"><button type="submit">Log in</button></form>`));
    if (url.pathname === "/login") return send("", 302, { location: `http://localhost:${port}/p/landing?s=${s}` });
    const processing = (next) => page("<h2>We are processing your request</h2>", `<meta http-equiv="refresh" content="2;url=${next}">`);
    if (url.pathname === "/p/landing") {
      if (s === "A") return send(processing(`/p/register?s=A`));
      if (s === "B") return send(processing(`/p/welcome?s=B`));
      if (s === "C") return send(page("<h2>You're all set!</h2><p>Start reading now.</p>"));
      if (s === "E") return send(page("<h2>Redemption Successful</h2><p>Confirmation NO. 110135871986480</p>"));
      if (s === "F") return send(processing(`/p/register-js?s=F`));
      if (s === "J") return send(processing(`/p/register?s=J`));
      if (s === "K") return send(processing(`/p/register-js?s=K`));
      return send(page("<h2>Something went wrong.</h2>"));
    }
    if (url.pathname === "/p/register-js") return send(page(`<style>input[type=checkbox]{position:absolute;opacity:0;width:0;height:0}</style>
        <h2>Create Account</h2>
        <input type="checkbox" id="m"><label for="m">I would like to receive updates and special offers from Dow Jones</label>
        <input type="checkbox" id="t"><label for="t">By checking this box, I agree to the <a href="/terms">Terms of Use</a></label>
        ${s === "K" ? '<input type="email" name="email" placeholder="Email">' : ""}
        <button id="reg">REGISTER</button>
        <script>document.getElementById("reg").addEventListener("click", async () => {
          await fetch("/p/api-register", { method: "POST", body: JSON.stringify({ terms: document.getElementById("t").checked, marketing: document.getElementById("m").checked }) });
          location.href = "/p/done";
        });</script>`));
    if (url.pathname === "/p/api-register") {
      const b = JSON.parse(body || "{}");
      registrations.push({ terms: !!b.terms, marketing: !!b.marketing, slow: true });
      return setTimeout(() => send("ok"), 10000);
    }
    if (url.pathname === "/p/done") return send(page("<h2>Redemption Successful</h2><p>Confirmation NO. 2</p>"));
    if (url.pathname === "/p/welcome") return send(page("<h2>Welcome Back, Varun</h2><p>Looks like you already have a subscription...</p><button>OK, LET'S GO</button><p>Not Varun? <a href='#'>Click Here</a> to logout.</p>"));
    if (url.pathname === "/p/register") {
      const form = new URLSearchParams(body);
      if (req.method === "POST") {
        registrations.push({ terms: form.get("terms") === "on", marketing: form.has("marketing") });
        if (form.get("terms") === "on" && s === "J") return send(page("<h2>Thanks — you're registered.</h2>"));
        if (form.get("terms") === "on") return send(page("<h2>Redemption Successful</h2><p>Confirmation NO. 123</p><p>Thank you for subscribing. You now have full access to WSJ.com</p>"));
      }
      return send(page(`<style>input[type=checkbox]{position:absolute;opacity:0;width:0;height:0}.box{display:inline-block;width:10px;height:10px;border:1px solid #08c}</style>
        <h2>Create Account</h2><form method="post" action="/p/register?s=${s}">
        <input type="checkbox" id="m" name="marketing"><label for="m"><span class="box"></span>I would like to receive updates and special offers from Dow Jones</label>
        <input type="checkbox" id="t" name="terms"><label for="t"><span class="box"></span>By checking this box, I agree to the <a href="/terms">Terms of Use</a> for The Wall Street Journal</label>
        <button type="submit">REGISTER</button></form>`));
    }
    send("not found", 404);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
port = server.address().port;

// ---- helpers ---------------------------------------------------------------
const SCHED = join(RENEW, "state", "wsj-schedule.json");
const STATUS = join(ROOT, "newsstand", "status.json");
const LOG = join(RENEW, "logs", "local-renew.log");
const scenario = (s) => writeFileSync(join(RENEW, "config.json"), JSON.stringify({ publications: { wsj: {
  activationUrl: `http://127.0.0.1:${port}/gateway?s=${s}`, successHosts: ["localhost"], authHosts: [] } } }));
const run = (args = [], extraEnv = {}) => new Promise((resolve) => {
  const p = spawn(process.execPath, [join(RENEW, "wsj-scheduler.mjs"), ...args], {
    cwd: RENEW, env: { ...process.env, PATH: `${BIN}:${process.env.PATH}`, SCCLD_CARD: "1111", SCCLD_PIN: "2222", WSJ_EMAIL: "", WSJ_PASSWORD: "", ...extraEnv } });
  let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  const t = setTimeout(() => p.kill(), 5 * 60e3);
  p.on("exit", (code) => { clearTimeout(t); resolve({ code, out }); });
});
const sched = () => JSON.parse(readFileSync(SCHED, "utf8"));
const forceDue = () => writeFileSync(SCHED, JSON.stringify({ ...sched(), nextDue: Date.now() - 1000 }, null, 2));
const logSize = () => (existsSync(LOG) ? statSync(LOG).size : 0);
const logTail = (from) => readFileSync(LOG).subarray(from).toString("utf8"); // byte offset: the log has multi-byte dashes
const near = (a, b, tolMs = 90e3) => Math.abs(a - b) <= tolMs;
const notes = () => (existsSync(NOTES) ? readFileSync(NOTES, "utf8") : "");
let failed = 0;
const check = (name, cond, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : "  " + detail}`); if (!cond) failed++; };
const MIN = 60e3, H = 60 * MIN;

// 1. No schedule + expired pass -> renews, anchors +72h5m, publishes
scenario("A");
let from = logSize();
await run();
let s = sched(), tail = logTail(from);
check("1 due with no schedule", /due — no schedule yet/.test(tail), tail);
check("1 ticked Terms and clicked Register", /Terms of Use ticked/.test(tail), tail);
check("1 outcome renewed", s.lastResult === "renewed", JSON.stringify(s));
check("1 next due = renewal + 72h05m", s.nextDue - s.lastRenewal === 72 * H + 5 * MIN, JSON.stringify(s));
check("1 marketing box untouched, terms ticked", registrations.length === 1 && registrations[0].terms && !registrations[0].marketing, JSON.stringify(registrations));
const st1 = JSON.parse(readFileSync(STATUS, "utf8")).renewed.wsj;
check("1 status.json wsj ok:true", st1.ok === true && near(st1.ts, s.lastRenewal), JSON.stringify(st1));
check("1 published", /STUB publish: Record local WSJ renewal/.test(tail), tail);
const anchor = s.lastRenewal;

// 2. Not due -> silent, nothing changes
from = logSize();
const before = readFileSync(SCHED, "utf8");
await run();
check("2 not due: no log output", logSize() === from, logTail(from));
check("2 not due: schedule unchanged", readFileSync(SCHED, "utf8") === before);

// 3. --check reports the due time without running
const c = await run(["--check"]);
check("3 --check reports due time", /WSJ renewal due .* — 72h after the renewal on/.test(c.out) && logSize() === from, c.out);

// 4-5. Due but pass still live -> backoff 15m then 30m, anchor and status untouched
scenario("B");
forceDue(); from = logSize(); await run(); s = sched(); tail = logTail(from);
check("4 live pass detected", /ALREADY ACTIVE/.test(tail) && s.lastResult === "active" && s.activeChecks === 1, tail);
check("4 rechecks in 15 min", near(s.nextDue, Date.now() + 15 * MIN), new Date(s.nextDue).toString());
check("4 anchor kept", s.lastRenewal === anchor);
check("4 status.json wsj untouched", JSON.stringify(JSON.parse(readFileSync(STATUS, "utf8")).renewed.wsj) === JSON.stringify(st1));
check("4 not published", !/STUB publish/.test(tail), tail);
forceDue(); await run(); s = sched();
check("5 second live check backs off to 30 min", s.activeChecks === 2 && near(s.nextDue, Date.now() + 30 * MIN), JSON.stringify(s));

// 6. Expired again -> renews, logs the observed pass window, resets counters
scenario("A");
forceDue(); from = logSize(); await run(); s = sched(); tail = logTail(from);
check("6 renewed after live checks", s.lastResult === "renewed" && s.activeChecks === 0 && s.lastRenewal > anchor, JSON.stringify(s));
check("6 logs previous pass window", /previous WSJ pass: renewed .*; last seen live (?!—)/.test(tail), tail);

// 7. Success-looking page without "Redemption Successful" -> failure, 1h retry, no re-anchor
scenario("C");
const anchor2 = s.lastRenewal;
forceDue(); from = logSize(); await run(); s = sched(); tail = logTail(from);
check("7 unconfirmed page is not a renewal", /not counting it as a renewal/.test(tail) && s.lastResult === "failed" && s.failures === 1, tail);
check("7 retries in 1h, anchor kept", near(s.nextDue, Date.now() + 1 * H) && s.lastRenewal === anchor2, JSON.stringify(s));
check("7 failure notified", /WSJ renewal failed/.test(notes()), notes());

// 8. Unknown page twice -> failures 2, 6h retry
scenario("D");
forceDue(); await run(); s = sched();
check("8 second failure backs off to 6h", s.failures === 2 && near(s.nextDue, Date.now() + 6 * H), JSON.stringify(s));

// 10. Confirmation that says only "Redemption Successful" + number -> renewed
scenario("E");
forceDue(); from = logSize(); await run(); s = sched(); tail = logTail(from);
check("10 bare 'Redemption Successful' counts as a renewal", s.lastResult === "renewed" && s.failures === 0, tail);

// 11. Two schedulers started at once while due -> one renews, the other exits silently
scenario("A");
forceDue(); from = logSize();
const regsBefore = registrations.length;
await Promise.all([run(), run()]);
s = sched(); tail = logTail(from);
const headers = (tail.match(/wsj scheduler: due/g) || []).length;
check("11 only one of two concurrent schedulers runs", headers === 1 && registrations.length === regsBefore + 1, `headers=${headers} registrations=${registrations.length - regsBefore}\n${tail}`);
check("11 the renewal anchor survives", s.lastResult === "renewed" && s.nextDue - s.lastRenewal === 72 * H + 5 * MIN, JSON.stringify(s));

// 12. Slow script-driven Register (10 s before the page moves): exactly one submission through the walker
scenario("F");
const regsBeforeF = registrations.length;
forceDue(); from = logSize(); await run(); s = sched(); tail = logTail(from);
const slowRegs = registrations.slice(regsBeforeF);
check("12 slow submit: one registration, Terms only, renewal recorded", slowRegs.length === 1 && slowRegs[0].terms && !slowRegs[0].marketing && s.lastResult === "renewed", `${JSON.stringify(slowRegs)}\n${tail}`);

// 13. Renewal succeeds but status.json is unwritable -> anchor kept, owner notified, nothing published
scenario("A");
chmodSync(STATUS, 0o444);
forceDue(); from = logSize(); let notesBefore = notes().length; await run(); s = sched(); tail = logTail(from);
chmodSync(STATUS, 0o644);
check("13 unwritable status.json: renewal still anchored", s.lastResult === "renewed", JSON.stringify(s));
check("13 unwritable status.json: notified, not published", /couldn't be updated/.test(notes().slice(notesBefore)) && !/STUB publish/.test(tail), notes().slice(notesBefore) + tail);

// 14. A failed publish left a marker: retried after 30 min even though WSJ isn't due; not before
const PENDING = join(RENEW, "state", "publish-pending");
writeFileSync(PENDING, "earlier failure\n");
const old = new Date(Date.now() - 31 * MIN);
utimesSync(PENDING, old, old);
from = logSize(); await run(); tail = logTail(from);
check("14 stale publish marker is retried while WSJ isn't due", /retrying an earlier failed status.json publish/.test(tail) && /STUB publish: Record local renewal/.test(tail), tail);
writeFileSync(PENDING, "fresh failure\n");
from = logSize(); await run();
check("14 fresh publish marker waits", logSize() === from, logTail(from));
rmSync(PENDING);

// 15. state/ unwritable and the scheduler lock missing -> notification + nonzero exit, not a silent no-op
rmSync(join(RENEW, "state", "wsj-scheduler.lock"), { force: true });
forceDue();
chmodSync(join(RENEW, "state"), 0o555);
notesBefore = notes().length;
const r15 = await run();
chmodSync(join(RENEW, "state"), 0o755);
check("15 unwritable state/: loud failure", r15.code !== 0 && /can't run/.test(notes().slice(notesBefore)), `code=${r15.code} ${notes().slice(notesBefore)} ${r15.out}`);

// 16. Unrecognized confirmation -> "submitted", rechecked in 15 min; a live pass then anchors that run
scenario("J");
forceDue(); from = logSize(); notesBefore = notes().length; await run(); s = sched(); tail = logTail(from);
const pending = s.pendingAnchor;
check("16 unrecognized confirmation ends as submitted, recheck in 15 min", s.lastResult === "submitted" && near(s.nextDue, Date.now() + 15 * MIN) && /SUBMITTED/.test(tail), `${JSON.stringify(s)}\n${tail}`);
check("16 owner told the confirmation wasn't recognized", /confirmation page wasn't recognized/.test(notes().slice(notesBefore)), notes().slice(notesBefore));
scenario("B");
forceDue(); from = logSize(); await run(); s = sched(); tail = logTail(from);
const st16 = JSON.parse(readFileSync(STATUS, "utf8")).renewed.wsj;
check("16 live pass at the recheck anchors the submitting run", s.lastResult === "renewed" && s.lastRenewal === pending && s.confirmedLater && /renewed it/.test(tail), `${JSON.stringify(s)}\n${tail}`);
check("16 ...and records + publishes it", st16.ok && st16.ts === pending && /STUB publish: Record local WSJ renewal/.test(tail), JSON.stringify(st16));

// 17. WSJ_EMAIL set and the form has an email field: the slow submit still goes in exactly once
scenario("K");
const regsBeforeK = registrations.length;
forceDue(); from = logSize(); await run([], { WSJ_EMAIL: "someone@example.com", WSJ_PASSWORD: "x" }); s = sched(); tail = logTail(from);
const kRegs = registrations.slice(regsBeforeK);
check("17 email field + WSJ_EMAIL: one submission, no account fill, renewed", kRegs.length === 1 && !/filling publication account/.test(tail) && s.lastResult === "renewed", `${JSON.stringify(kRegs)}\n${tail}`);

// 18. Publisher dies without leaving its retry marker -> the scheduler writes it and says so
writeFileSync(join(RENEW, "publish-status.mjs"), 'console.log("STUB publish dying"); process.exit(3);\n');
scenario("A");
forceDue(); from = logSize(); notesBefore = notes().length; await run(); tail = logTail(from);
check("18 dead publisher: marker written, owner told", existsSync(join(RENEW, "state", "publish-pending")) && /didn't finish/.test(tail) && /not published/.test(notes().slice(notesBefore)), tail + notes().slice(notesBefore));
writeFileSync(join(RENEW, "publish-status.mjs"), 'console.log("STUB publish: " + process.argv[2]);\n');
rmSync(join(RENEW, "state", "publish-pending"), { force: true });

// 9. Unreadable schedule -> due now (never "wait")
writeFileSync(SCHED, "{not json");
const c9 = await run(["--check"]);
check("9 unreadable schedule means due now", /due now — schedule unreadable/.test(c9.out), c9.out);

server.close();
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
