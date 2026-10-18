// Tests publish-status.mjs against a real git clone + local bare remote.
// Usage: node test/publish-test.mjs (from newsstand/renew)
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const RENEW_DIR = fileURLToPath(new URL("..", import.meta.url)); // newsstand/renew

const ROOT = mkdtempSync(join(tmpdir(), "wsj-publish-"));
const REMOTE = join(ROOT, "remote.git"), CLONE = join(ROOT, "clone"), BIN = join(ROOT, "bin"), NOTES = join(ROOT, "notifications.log");
mkdirSync(BIN, { recursive: true });
// fake osascript: records notifications instead of showing them
writeFileSync(join(BIN, "osascript"), `#!/bin/sh\necho "$2" >> "${NOTES}"\n`);
chmodSync(join(BIN, "osascript"), 0o755);
const env = { ...process.env, PATH: `${BIN}:${process.env.PATH}` };
const sh = (cwd, ...args) => spawnSync(args[0], args.slice(1), { cwd, encoding: "utf8", env });
const git = (cwd, ...args) => sh(cwd, "git", ...args);

git(ROOT, "init", "--quiet", "--bare", "-b", "main", REMOTE);
git(ROOT, "clone", "--quiet", REMOTE, CLONE);
for (const [k, v] of [["user.name", "test"], ["user.email", "test@example.com"]]) git(CLONE, "config", k, v);
mkdirSync(join(CLONE, "newsstand", "renew"), { recursive: true });
for (const f of ["publish-status.mjs", "file-lock.mjs"]) cpSync(join(RENEW_DIR, f), join(CLONE, "newsstand", "renew", f));
writeFileSync(join(CLONE, ".gitignore"), "newsstand/renew/state/\n");
const STATUS = join(CLONE, "newsstand", "status.json");
const setStatus = (ts) => writeFileSync(STATUS, JSON.stringify({ renewed: { nyt: { ok: true, ts } } }, null, 2) + "\n");
setStatus(1);
writeFileSync(join(CLONE, "README.md"), "readme\n");
git(CLONE, "add", "-A"); git(CLONE, "commit", "--quiet", "-m", "init"); git(CLONE, "push", "--quiet", "-u", "origin", "main");

const publish = () => sh(join(CLONE, "newsstand", "renew"), process.execPath, "publish-status.mjs", "Record test renewal");
const remoteStatus = () => git(REMOTE, "show", "main:newsstand/status.json").stdout;
const head = () => git(CLONE, "rev-parse", "HEAD").stdout.trim();
const notes = () => (existsSync(NOTES) ? readFileSync(NOTES, "utf8") : "");
let failed = 0;
const check = (name, cond, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : "  " + detail}`); if (!cond) failed++; };

// a. ordinary change -> committed and pushed
setStatus(2);
let r = publish();
check("a change is committed and pushed", r.status === 0 && /"ts": 2/.test(remoteStatus()), r.stdout + r.stderr);

// b. nothing changed -> no commit, exit 0
const h0 = head();
r = publish();
check("b nothing to publish", r.status === 0 && head() === h0 && /already published/.test(r.stdout), r.stdout + r.stderr);

// c. change that is only staged -> still committed and pushed
setStatus(3); git(CLONE, "add", "newsstand/status.json");
r = publish();
check("c staged-only change is published", r.status === 0 && /"ts": 3/.test(remoteStatus()), r.stdout + r.stderr);

// d. unrelated staged file stays out of the commit
writeFileSync(join(CLONE, "README.md"), "edited\n"); git(CLONE, "add", "README.md");
setStatus(4);
r = publish();
const files = git(CLONE, "show", "--name-only", "--format=", "HEAD").stdout.trim();
// (autostash hands a staged edit back unstaged; its content must survive)
check("d commit contains only status.json; the unrelated edit survives", r.status === 0 && files === "newsstand/status.json" && readFileSync(join(CLONE, "README.md"), "utf8") === "edited\n", `files=${files}\n${r.stdout}${r.stderr}`);
git(CLONE, "reset", "--quiet", "README.md"); git(CLONE, "checkout", "--quiet", "README.md");

// e. push rejected -> exit 1, one notification, a pending marker; a second failure doesn't notify again;
//    the next publish with a clean tree pushes the stranded commit and clears the marker
const PENDING = join(CLONE, "newsstand", "renew", "state", "publish-pending");
const banners = () => notes().split("\n").filter(Boolean).length;
const hook = join(REMOTE, "hooks", "pre-receive");
writeFileSync(hook, "#!/bin/sh\nexit 1\n"); chmodSync(hook, 0o755);
setStatus(5);
const before = banners();
r = publish();
check("e rejected push fails loudly and leaves a pending marker", r.status === 1 && /push/.test(r.stdout) && banners() === before + 1 && existsSync(PENDING), r.stdout + r.stderr);
r = publish();
check("e a second failure in a row doesn't notify again", r.status === 1 && banners() === before + 1, `banners=${banners() - before}`);
rmSync(hook);
r = publish();
check("e retry pushes the stranded commit and clears the marker", r.status === 0 && /"ts": 5/.test(remoteStatus()) && /pushed/.test(r.stdout) && !existsSync(PENDING), r.stdout + r.stderr);

// f. conflict markers (invalid JSON) -> refused, nothing committed
const h1 = head();
writeFileSync(STATUS, "<<<<<<< Updated upstream\n{}\n=======\n{}\n>>>>>>> Stashed changes\n");
r = publish();
check("f invalid JSON is refused", r.status === 1 && /not valid JSON/.test(r.stdout) && head() === h1 && !/<<<</.test(remoteStatus()), r.stdout + r.stderr);
git(CLONE, "checkout", "--quiet", "newsstand/status.json");

// g. unresolved merge conflict -> refused
git(CLONE, "checkout", "--quiet", "-b", "other"); setStatus(6); git(CLONE, "commit", "--quiet", "-am", "other");
git(CLONE, "checkout", "--quiet", "main"); setStatus(7); git(CLONE, "commit", "--quiet", "-am", "main");
git(CLONE, "merge", "--quiet", "other");
const h2 = head();
r = publish();
check("g unresolved merge is refused", r.status === 1 && /unresolved merge conflicts|middle of a rebase or merge/.test(r.stdout) && head() === h2, r.stdout + r.stderr);
git(CLONE, "merge", "--abort");

// h. the owner is mid-rebase (conflict in an unrelated file) -> refused, and the rebase is left exactly as it was
git(CLONE, "checkout", "--quiet", "-b", "side"); writeFileSync(join(CLONE, "README.md"), "side\n"); git(CLONE, "commit", "--quiet", "-am", "side");
git(CLONE, "checkout", "--quiet", "main"); writeFileSync(join(CLONE, "README.md"), "main\n"); git(CLONE, "commit", "--quiet", "-am", "main readme");
git(CLONE, "checkout", "--quiet", "side");
git(CLONE, "rebase", "main"); // stops on the README conflict
const rebaseDir = join(CLONE, ".git", "rebase-merge");
const wasRebasing = existsSync(rebaseDir);
setStatus(8);
r = publish();
check("h refuses while the owner's rebase is in progress, and leaves it alone", wasRebasing && r.status === 1 && /middle of a rebase/.test(r.stdout) && existsSync(rebaseDir), `wasRebasing=${wasRebasing} ${r.stdout}${r.stderr}`);
git(CLONE, "rebase", "--abort");
git(CLONE, "checkout", "--quiet", "main");

// i. the publisher's own pull hits a rebase conflict (status.json changed elsewhere) -> fails loudly and
//    leaves the rebase for the owner instead of aborting it
const OTHER = join(ROOT, "other");
git(ROOT, "clone", "--quiet", REMOTE, OTHER);
for (const [k, v] of [["user.name", "test"], ["user.email", "test@example.com"]]) git(OTHER, "config", k, v);
writeFileSync(join(OTHER, "newsstand", "status.json"), JSON.stringify({ renewed: { nyt: { ok: true, ts: 900 } } }, null, 2) + "\n");
git(OTHER, "commit", "--quiet", "-am", "elsewhere"); git(OTHER, "push", "--quiet");
git(CLONE, "reset", "--quiet", "--hard", "origin/main");
setStatus(901);
r = publish();
const stuck = existsSync(join(CLONE, ".git", "rebase-merge")) || existsSync(join(CLONE, ".git", "rebase-apply"));
check("i own rebase conflict: fails, says so, and leaves the rebase in place", r.status === 1 && /left in progress/.test(r.stdout) && stuck, `stuck=${stuck} ${r.stdout}${r.stderr}`);
git(CLONE, "rebase", "--abort");

console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
