// Tests submitRegister (extracted verbatim from renew.mjs) on pages where mouse
// clicks work: a plain form, a slow script-driven submit that must NOT get a
// second submission, a click-blocking overlay that needs the fallback, a button
// that only becomes clickable after 8 s, and a script submit to another host.
// Usage: node test/submit-test.mjs (from newsstand/renew)
import http from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const RENEW_DIR = fileURLToPath(new URL("..", import.meta.url)); // newsstand/renew
const require = createRequire(RENEW_DIR + "/");
const { chromium } = require("playwright");
const fn = readFileSync(RENEW_DIR + "/renew.mjs", "utf8").match(/async function submitRegister[\s\S]*?\n}\n/)[0];
const submitRegister = eval(`(${fn})`);

let posts = 0;
const page = (body) => `<!doctype html><html><body>${body}</body></html>`;
const FORM = `<form method="post" action="/done"><button type="submit">REGISTER</button></form>`;
const server = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    if (req.method === "POST") posts++;
    if (url.pathname === "/plain") return res.end(page(FORM));
    if (url.pathname === "/slow") return res.end(page(`<button id="r">REGISTER</button><script>
      document.getElementById("r").addEventListener("click", async () => {
        await fetch("/api/register", { method: "POST", body: "terms=on" });
        location.href = "/done";
      });</script>`));
    if (url.pathname === "/api/register") return setTimeout(() => res.end("ok"), 10000); // 10 s before the page moves
    if (url.pathname === "/late") return res.end(page(`<form method="post" action="/done"><button type="submit" disabled>REGISTER</button></form>
      <script>setTimeout(() => document.querySelector("button").disabled = false, 8000);</script>`)); // clickable only after 8 s
    if (url.pathname === "/crosshost") return res.end(page(`<button id="r">REGISTER</button><script>
      document.getElementById("r").addEventListener("click", async () => {
        await fetch("http://127.0.0.1:${server.address().port}/api/register", { method: "POST", mode: "no-cors", body: "terms=on" });
        location.href = "/done";
      });</script>`)); // submit goes to another host
    if (url.pathname === "/blocked") return res.end(page(`${FORM}<div style="position:fixed;inset:0;z-index:9"></div>`));
    res.end(page("<h2>Redemption Successful</h2>"));
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
let failed = 0;
const check = (name, cond, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : "  " + detail}`); if (!cond) failed++; };

async function attempt(path) {
  posts = 0;
  const p = await browser.newPage();
  await p.goto(base + path);
  const logs = [];
  const how = await submitRegister(p, p.getByRole("button", { name: /^\s*register\s*$/i }).first(), (m) => logs.push(m));
  await p.waitForTimeout(["/slow", "/crosshost"].includes(path) ? 6000 : 1500); // let a slow submit finish
  await p.close();
  return { how, posts, logs: logs.join(" | ") };
}

let r = await attempt("/plain");
check("plain form: mouse click submits once", r.how === "click" && r.posts === 1, JSON.stringify(r));
r = await attempt("/slow");
check("slow script submit (10s): exactly one submission, no fallback", r.how === "click" && r.posts === 1 && !/own click/.test(r.logs), JSON.stringify(r));
r = await attempt("/blocked");
check("click blocked by an overlay: fallback submits once", r.how === "dom" && r.posts === 1, JSON.stringify(r));
r = await attempt("/late");
check("button clickable only after 8s: the late click counts, no fallback", r.how === "click" && r.posts === 1 && !/own click/.test(r.logs), JSON.stringify(r));
r = await attempt("/crosshost");
check("script submit to another host: counts as sent, no fallback", r.how === "click" && r.posts === 1 && !/own click/.test(r.logs), JSON.stringify(r));

await browser.close(); server.close();
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
