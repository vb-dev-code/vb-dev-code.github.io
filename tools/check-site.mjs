/**
 * Pre-publish verification. Run from repo root:  node tools/check-site.mjs
 * Exit 0 = all checks pass. Exit 1 = at least one failure.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const failures = [];
const fail = (m) => failures.push(m);

// The banned-content literals (real name/phone/email) must never be committed
// to this public repo, so they live in a git-ignored file instead of in this
// script. If that file is missing or unreadable, the banned-content check
// cannot do its job — fail loudly rather than silently skipping it, since a
// check that quietly stops checking is worse than no check at all.
const BANNED_PATTERNS_PATH = path.join(ROOT, 'tools', 'banned-patterns.json');
let BANNED_PATTERNS = null;
try {
  const raw = fs.readFileSync(BANNED_PATTERNS_PATH, 'utf8');
  BANNED_PATTERNS = JSON.parse(raw);
  if (!Array.isArray(BANNED_PATTERNS) || BANNED_PATTERNS.length === 0) {
    throw new Error('banned-patterns.json must be a non-empty JSON array of strings');
  }
} catch (e) {
  fail(`banned-patterns.json missing; cannot verify banned content (${e.message})`);
}

const htmlFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name === 'docs') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) htmlFiles.push(p);
  }
})(ROOT);

if (htmlFiles.length === 0) fail('no HTML files found');

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  // required document furniture
  if (!/<html lang="en">/.test(html)) fail(`${rel}: missing <html lang="en">`);
  if (!/<meta name="viewport"/.test(html)) fail(`${rel}: missing viewport meta`);
  if (!/<title>[^<]+<\/title>/.test(html)) fail(`${rel}: missing or empty <title>`);
  if (!/<meta name="description" content="[^"]+"/.test(html)) fail(`${rel}: missing description meta`);

  // banned content — only checkable if banned-patterns.json loaded above;
  // its own failure was already recorded and doesn't need repeating per file.
  if (BANNED_PATTERNS) {
    for (const token of BANNED_PATTERNS) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(escaped, 'i').test(html)) fail(`${rel}: contains banned token -> ${token}`);
    }
  }

  // no external requests
  const isAllowedExternal = (url) => url.startsWith('https://apps.apple.com/')
                                   || url.startsWith('https://www.linkedin.com/');
  const checkExternalUrl = (url) => {
    if (!isAllowedExternal(url)) fail(`${rel}: external resource not allowed -> ${url}`);
  };

  for (const m of html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
    checkExternalUrl(m[1]);
  }

  // srcset="url desc, url desc, ..."
  for (const m of html.matchAll(/\bsrcset="([^"]+)"/g)) {
    for (const part of m[1].split(',')) {
      const url = part.trim().split(/\s+/)[0];
      if (/^https?:\/\//i.test(url)) checkExternalUrl(url);
    }
  }

  // inline style="... url(https://...) ..."
  for (const m of html.matchAll(/\bstyle="([^"]*)"/g)) {
    for (const um of m[1].matchAll(/url\(\s*['"]?(https?:\/\/[^'")]+)['"]?\s*\)/gi)) {
      checkExternalUrl(um[1]);
    }
  }

  // <style> blocks: @import and url()
  for (const sm of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = sm[1];
    for (const um of css.matchAll(/url\(\s*['"]?(https?:\/\/[^'")]+)['"]?\s*\)/gi)) {
      checkExternalUrl(um[1]);
    }
    for (const im of css.matchAll(/@import\s+(?:url\(\s*)?['"]?(https?:\/\/[^'")\s;]+)['"]?\)?/gi)) {
      checkExternalUrl(im[1]);
    }
  }

  // <meta http-equiv="refresh" content="...url=...">
  for (const m of html.matchAll(/<meta\s+http-equiv="refresh"\s+content="([^"]*)"/gi)) {
    const um = m[1].match(/url=(\S+)/i);
    if (um) {
      const url = um[1].replace(/['";]+$/, '');
      if (/^https?:\/\//i.test(url)) checkExternalUrl(url);
    }
  }

  // every img needs alt text and must resolve
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0];
    if (!/\balt="[^"]*"/.test(tag)) fail(`${rel}: <img> without alt attribute -> ${tag.slice(0, 80)}`);
    const src = tag.match(/\bsrc="([^"]+)"/)?.[1];
    if (!src) { fail(`${rel}: <img> without src`); continue; }
    if (!src.endsWith('.webp')) fail(`${rel}: image is not webp -> ${src}`);
    const abs = src.startsWith('/') ? path.join(ROOT, src) : path.resolve(path.dirname(file), src);
    if (!fs.existsSync(abs)) fail(`${rel}: image not found -> ${src}`);
  }

  // internal links (root-relative and relative) must resolve
  for (const m of html.matchAll(/href="([^"]*)"/g)) {
    const raw = m[1];
    if (!raw || raw.startsWith('#')) continue; // pure fragment link
    if (/^(mailto:|tel:)/i.test(raw)) continue;
    if (/^https?:\/\//i.test(raw)) continue; // absolute URL, handled by external-resource check

    const hrefPath = raw.split(/[?#]/)[0];
    if (!hrefPath) continue; // e.g. "?query" or "" left after stripping

    const resolved = hrefPath.startsWith('/')
      ? path.join(ROOT, hrefPath)
      : path.resolve(path.dirname(file), hrefPath);

    // a trailing slash (including "/") means "directory" -> requires an index.html file inside
    let target = hrefPath.endsWith('/') ? path.join(resolved, 'index.html') : resolved;

    let stat;
    try { stat = fs.statSync(target); } catch { /* missing */ }

    let ok = false;
    if (stat) {
      if (stat.isFile()) ok = true;
      else if (stat.isDirectory()) {
        // href pointed at a directory without a trailing slash -> still needs an index.html file
        try { ok = fs.statSync(path.join(target, 'index.html')).isFile(); } catch { /* missing */ }
      }
    }
    if (!ok) fail(`${rel}: dead internal link -> ${raw}`);
  }
}

// status pill vocabulary
const ALLOWED_PILLS = new Set(['Live', 'Beta', 'Prototype', 'Passed']);
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  for (const m of html.matchAll(/<[a-zA-Z][^>]*\bclass="([^"]*)"[^>]*>([^<]*)</g)) {
    const classAttr = m[1];
    if (!/\bpill\b/.test(classAttr)) continue; // not a pill element (matches "pill" and "pill--live")
    const label = m[2].trim();
    if (!ALLOWED_PILLS.has(label)) {
      fail(`${path.relative(ROOT, file)}: disallowed status label "${label}"`);
    }
  }
}

if (failures.length) {
  console.error(`FAIL (${failures.length})`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`PASS — ${htmlFiles.length} page(s) checked`);
