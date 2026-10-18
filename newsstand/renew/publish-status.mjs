#!/usr/bin/env node
// Commit and push newsstand/status.json so the Newsstand app picks up renewals.
// Used by local-renew.sh (NYT) and wsj-scheduler.mjs (WSJ, and its retries).
//   node publish-status.mjs "<commit message>"
// - Holds the status lock that the renewal jobs take to write status.json, so
//   the file can't change while it's being committed or autostashed.
// - Commits only status.json (pathspec commit), and only a valid, conflict-free one.
// - Always pulls and pushes, so a commit an earlier failed push left behind goes
//   out with the next publish (a skipped publish froze the app's status for two
//   months in 2026).
// - Leaves a repo that's mid-rebase or mid-merge untouched, and never aborts a rebase.
// On failure: exits nonzero and leaves state/publish-pending, which the WSJ
// scheduler retries every 30 minutes; only the first failure in a row notifies.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireLock } from "./file-lock.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const STATUS = "newsstand/status.json";
const PENDING = join(HERE, "state", "publish-pending");
const message = process.argv[2] || "Record local renewal in status.json";

const git = (...args) => spawnSync("git", args, { cwd: REPO, encoding: "utf8", timeout: 120e3 });
const why = (r) => (r.error?.code ?? `${r.stderr || r.stdout}`.trim().split("\n").pop()) || `exit ${r.status}`;
const fail = (reason) => {
  console.log(`publish FAILED — ${reason}`);
  if (!existsSync(PENDING)) {
    spawnSync("osascript", ["-e", `display notification ${JSON.stringify(`status.json not published: ${reason}`)} with title "Newsstand"`]);
  }
  try { writeFileSync(PENDING, `${new Date().toISOString()} ${reason}\n`); } catch {}
  process.exit(1);
};

const release = await acquireLock(join(HERE, "state", "status-json"), { waitMs: 5 * 60e3, log: console.log })
  .catch((e) => fail(e.message));
try {
  const gitDir = resolve(REPO, git("rev-parse", "--git-dir").stdout.trim() || ".git"); // may be absolute
  const midOperation = () => ["rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"]
    .some((f) => existsSync(join(gitDir, f)));
  if (midOperation()) fail("the repo is in the middle of a rebase or merge — left alone");
  if (git("ls-files", "--unmerged", "--", STATUS).stdout.trim()) fail("status.json has unresolved merge conflicts");
  try { JSON.parse(readFileSync(join(REPO, STATUS), "utf8")); } catch { fail("status.json is not valid JSON"); }

  // Against HEAD, so a change that is only staged still gets committed.
  if (git("diff", "--quiet", "HEAD", "--", STATUS).status !== 0) {
    const commit = git("commit", "--quiet", "-m", message, "--", STATUS);
    if (commit.status !== 0) fail(`commit: ${why(commit)}`);
  }
  // --autostash covers unrelated edits in the checkout; status.json itself is
  // committed by now and can't change under the lock.
  const pull = git("pull", "--rebase", "--autostash", "--quiet");
  if (pull.status !== 0) {
    // Never aborted here: a rebase in progress now may be the owner's, started
    // after the check above, and aborting it would throw away their work.
    fail(`pull: ${why(pull)}${midOperation() ? " — a rebase is left in progress; finish or abort it by hand" : ""}`);
  }
  const ahead = git("rev-list", "--count", "@{upstream}..HEAD");
  if (ahead.status !== 0) fail(`can't compare with upstream: ${why(ahead)}`);
  if (ahead.stdout.trim() === "0") {
    console.log("status.json already published");
  } else {
    const push = git("push", "--quiet");
    if (push.status !== 0) fail(`push: ${why(push)}`);
    console.log("status.json pushed");
  }
  rmSync(PENDING, { force: true });
} finally {
  release();
}
