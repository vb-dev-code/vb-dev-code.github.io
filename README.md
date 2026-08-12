# varunb.me — portfolio site

This repository serves Varun Bhardwaj's product portfolio at **https://varunb.me**
via GitHub Pages (custom domain in `CNAME`, apex + `www`).

## This repo is portfolio-only

It hosts **only** the portfolio: the homepage, the case-study pages, the
background page, their shared stylesheet in `assets/`, and the capture/verify
scripts in `tools/`.

**Do not deploy other projects into this repo.** Because the custom domain maps
the entire repository to `varunb.me`, any folder committed here becomes publicly
served at `varunb.me/<folder>/`. Personal tools and internal projects were
removed for exactly this reason — publish those from their own repos.

If you're on another machine and about to add a project here: don't. Give it its
own repo and (if it needs hosting) its own Pages site or domain.

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
