# varunb.me — portfolio site

This repository serves Varun Bhardwaj's product portfolio at **https://varunb.me**
via GitHub Pages (custom domain in `CNAME`, apex + `www`).

## This repo is portfolio-only

It hosts **only** the portfolio: the homepage, the case-study pages, the
background page, their shared stylesheet in `assets/`, and the capture/verify
scripts in `tools/`.

The **published portfolio** is only the linked pages: the homepage, the
case-study folders, the background page, and their shared assets. That is the
surface a visitor sees.

Because the custom domain maps the whole repository to `varunb.me`, any folder
here is also reachable at `varunb.me/<folder>/`. A few non-portfolio projects
live here on purpose (see below). They are kept out of the portfolio by being
(1) unlinked from the homepage and (2) `noindex, nofollow` in their own
`<head>`, so search engines drop them and no visitor stumbles in. That is the
mechanism.

**Never delete a co-hosted project to "hide" it.** Deleting 404s a URL that is
live and in use, whether that is a family tool or a link already sent to an
interviewer. Unlinked plus noindex is how something stays out of the portfolio;
deletion is how you break it. New work is still better off in its own repo, but
if it must be co-hosted here, follow the unlink-and-noindex rule above.

## Co-hosted: `newsstand/`

A live PWA Varun and family use daily for library-pass renewals. Unlinked and
noindex'd, so it is not part of the portfolio surface. Do not delete it.

## Exception: `typeface-design-agent/` — ACTIVE interview submission

**Do not remove this folder.** It is the live prototype for Varun's Typeface
Staff PM interview (PM exercise). The URL `https://varunb.me/typeface-design-agent/`
was emailed to Typeface recruiting (Erica Hernandez) on Aug 6, 2026 and is under
active review by the hiring team. It was mistakenly removed by a repo cleanup on
Aug 12, 2026 and restored the same day — the link 404'd while reviewers may have
been looking. Remove only after the Typeface interview process concludes
(check with Varun first).

## Layout

- `index.html` — homepage: hero, project grid, shelf, contact
- `homecomms/`, `split-decision/`, `mesa/`, `credit-card-advisor/`, `background/`,
  and any other case-study folders — one page each
- `assets/css/site.css` — the whole design system, one file
- `assets/img/` — screenshots, committed as WebP
- `tools/` — `check-site.mjs` (pre-publish verifier), `to-webp.sh`, and the
  per-app screenshot capture scripts
- `CNAME` — the custom domain

## Before publishing a change

Run the verifier from the repo root:

```
node tools/check-site.mjs
```

It checks every page for required meta, no external requests, WebP images with
alt text, resolvable internal links, and the approved status-pill vocabulary.
It reads the banned-token list from `tools/banned-patterns.json`, which is
git-ignored and must exist locally — the check fails loudly if it's missing.
