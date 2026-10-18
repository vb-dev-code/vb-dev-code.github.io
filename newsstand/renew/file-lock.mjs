// Cross-process locks for the renewal jobs, on the kernel's flock via
// open(O_EXLOCK): exclusive, taken atomically at open, and released by the
// kernel when the holder closes the file or dies — even by SIGKILL — so there is
// no stale lock to detect, no pid to trust and nothing to clean up. The file is
// never deleted and holds the owner's pid only for log messages. Used for the
// shared browser profile, for status.json (written by renew.mjs and the WSJ
// scheduler, published by publish-status.mjs) and to keep the WSJ scheduler to
// one instance. macOS only, like the launchd jobs that use it.
import { closeSync, constants, ftruncateSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { dirname } from "node:path";

const O_EXLOCK = 0x20; // <fcntl.h> on Darwin; Node doesn't export it

// Resolves to release(). Rejects with code "ELOCKED" if the lock is still held
// after waitMs (0 = don't wait); any other error (say, an unwritable directory)
// is passed through, so callers can tell contention from a broken setup.
export async function acquireLock(path, { waitMs = 10 * 60e3, pollMs = 2000, log = () => {} } = {}) {
  if (process.platform !== "darwin") throw new Error("file-lock.mjs needs macOS (O_EXLOCK)");
  const file = `${path}.lock`;
  mkdirSync(dirname(file), { recursive: true });
  const deadline = Date.now() + waitMs;
  let announced = false;
  for (;;) {
    try {
      const fd = openSync(file, constants.O_CREAT | constants.O_RDWR | O_EXLOCK | constants.O_NONBLOCK);
      ftruncateSync(fd);
      writeSync(fd, String(process.pid), 0);
      let held = true;
      return () => { if (held) { held = false; closeSync(fd); } };
    } catch (e) {
      if (e.code !== "EAGAIN" && e.code !== "EWOULDBLOCK") throw e;
    }
    let owner = "?";
    try { owner = readFileSync(file, "utf8").trim() || "?"; } catch {}
    if (Date.now() >= deadline) throw Object.assign(new Error(`${file} is held by pid ${owner}`), { code: "ELOCKED" });
    if (!announced) { log(`${file} is held by pid ${owner} — waiting for it`); announced = true; }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
