# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 18 + Vite 5 + React Router (HashRouter), TypeScript, deployed as a static
site to GitHub Pages. Content pipeline: `site/scripts/sync-content.mjs` scans
every `README.md` in the repo and writes its raw bytes into the generated
`site/src/content/manifest.json`; the front end renders those bytes with
`react-markdown` + `remark-gfm` + `rehype-slug`, and `prism-react-renderer`
highlights fenced code.

**Confirmed 2026-09-30:** MUI (`@mui/material`, `@mui/icons-material`, Emotion)
is to be removed and replaced by a custom token + CSS presentation layer. The
markdown-to-component mapping, app shell, and code block are rewritten against
those tokens. React, Vite, Router, react-markdown and prism-react-renderer stay.

## Users

Primary: a sysadmin / infrastructure engineer arriving for the first time from
GitHub or a search result, who has found a script that would do the job and now
has to decide whether they dare run it against a real machine. They read
Traditional Chinese.

Secondary: the author and colleagues who already know what the repo contains
and return only to locate and copy one specific command.

**Confirmed priority:** design serves the first-time visitor first. The landing
page carries persuasion and trust; subproject pages carry look-up.

## Product Purpose

Publish an operations handbook whose pages are directly executable. Every
script has a page stating its use case, parameters and risks, and can be run on
a target machine with a single `curl` line — without cloning the repo and
without reading the full source on a production box first.

Success: a stranger reaches a script page, understands what it will do to their
machine, and copies a command they trust.

## Positioning

The mechanism a neighboring docs site cannot truthfully copy: three enforced
constraints against doc/script drift.

1. **Single source.** Every page is a byte-for-byte render of the corresponding
   folder's `README.md`. No second copy of the prose exists, so docs and script
   always come from the same commit. A smoke test asserts byte equality.
2. **Rehearsable.** Every script that changes host state supports `--help` and
   `--dry-run`.
3. **CI-gated.** Shell syntax + ShellCheck, Docker Compose configs, and whether
   every `raw.githubusercontent.com` command in the docs still resolves are each
   verified in CI — so a broken published command is caught before a reader
   copies it.

## Operating Context

- Readers arrive mid-task, often on a terminal-adjacent second screen, and leave
  with a command on the clipboard that they paste into a root shell.
- Content is authored as GitHub-flavored Markdown READMEs: dense tables,
  `> [!TIP]` / `> [!IMPORTANT]` alerts, long `curl | sudo bash` one-liners with
  line continuations, relative links written for GitHub.
- Subprojects live at exactly `<category>/<project>/README.md`. The first-level
  folder is the category and the only thing that decides the sidebar group.
  Current categories: `AI/` (AI CLI usage statuslines), `container/` (containers
  and Kubernetes), `script/` (host-level one-off scripts). A new category is a
  new top-level folder and needs no front-end change.

## Capabilities and Constraints

- **Chrome only.** The HTML/TSX may hold nothing but chrome: product name,
  tagline, meta description. All prose lives in a `README.md`. Writing doc
  content into the front end is forbidden — it is what the single-source
  guarantee rules out.
- **No hardcoded project list.** Navigation, routes, page titles, nav labels and
  search are all manifest-driven. Adding a subproject is a folder plus a README.
- **Nothing may be added to a page that the README did not say.** No invented
  hero copy, claims, badges, counts or testimonials on top of rendered content.
- **HashRouter is required** — GitHub Pages has no SPA rewrite. In-page anchors
  must navigate as hash-only targets so they do not clobber the current route.
- **Anchor ids must stay aligned** between the TOC extractor and `rehype-slug`
  (both use `github-slugger`), including duplicate-heading `-1`/`-2` suffixes.
- **Copy actions read the markdown AST string**, never DOM text.
- **Static build only.** No server, no runtime data source; `npm run verify`
  (typecheck + smoke test + production build) is the gate.
- **Confirmed must-keep:** the light/dark dual theme, including applying the
  stored mode before first paint so there is no flash.
- **Explicitly open to redesign or removal** (user did not mark them must-keep):
  the sidebar full-text search, the right-hand "On this page" TOC, and the
  per-page provenance strip.

## Brand Commitments

- Product name: **Script Docs**. It is simultaneously the root `README.md` H1,
  the `<title>`, and the app-bar title, and all three must name it identically.
- Tagline (root README's opening line): 一份可以直接執行的維運手冊。
- Interface language: Traditional Chinese (zh-TW). Code, identifiers, commands,
  file paths and log output stay verbatim in their original form.
- Published URL: <https://ctj425.github.io/script-docs/>. License: MIT.
- No logo, wordmark, brand palette or typeface has ever been chosen. The current
  blue/Roboto/Material appearance is the MUI default theme, not a decision —
  treat it as anti-reference, not as identity.

## Evidence on Hand

- 8 real subprojects with complete READMEs, plus their actual shell / compose
  sources in-repo.
- 8 real, CI-verified one-liner commands, listed in the root README.
- Real CI workflows: `.github/workflows/ci.yml`, `.github/workflows/pages.yml`.
- A real `CHANGELOG.md`.
- **Absent, and not to be fabricated:** install counts, stars, downloads, user
  testimonials, company logos, benchmarks, uptime figures, "trusted by" claims,
  screenshots of the scripts running, and any imagery or illustration assets.
  The repo contains no images at all.

## Product Principles

1. **The command is the product.** The page exists to get one trustworthy line
   onto a reader's clipboard; everything else is supporting evidence.
2. **Earn the root shell.** The reader is about to run this as root on a machine
   they care about. Risk, reversibility and `--dry-run` are first-class content,
   not footnotes.
3. **One source, no drift.** The site may never hold a second copy of anything a
   README says. If it would look better restated in TSX, it belongs in the README.
4. **Structure comes from the filesystem.** Categories, titles, nav labels and
   ordering are derived, never authored in the front end.
5. **Degrade, don't crash.** The same discipline the scripts follow (parse
   failure degrades, never breaks) applies to the site: a missing doc, an unknown
   language, an unsafe link protocol all render as something safe.

## Accessibility & Inclusion

No formal standard was established. Product-specific needs that are already
real: light and dark themes at usable contrast (the current build renders body
text, list items and table cells at secondary-text color, which fails this);
long `curl` commands must remain readable and copyable without a mouse; the
interface is zh-TW, so the type system must handle CJK alongside Latin
monospace command text.
