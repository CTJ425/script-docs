# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro 7 (static output) + TypeScript, with a plain-Node content layer.
Posts, tools and pages are markdown with frontmatter (Astro content collections
via the `glob` loader, pointed at `../posts`, `../tools`, `../pages`). Script
pages come from a custom loader that reads each `<category>/<project>/README.md`
as bytes. One unified pipeline (`remark-gfm` → `rehype-raw` → `rehype-sanitize` →
`rehype-slug` → the site's own transform) renders all four, and `prismjs` tokenises
fenced code. Search is Pagefind, built after Astro. Almost no client JavaScript: a
theme toggle, copy buttons, table-of-contents marks, and the search page.

Colour is derived in `site/src/lib/design.mjs` and inlined into `<head>`; there are
no colour literals in any stylesheet.

**Replaced 2026-10-02:** the previous React + Vite single-page app (HashRouter,
manifest.json holding every README, runtime colour solving) is gone. It could not
give a blog what a blog needs — real URLs, per-page share previews, a feed, an
index search engines can read.

## Users

Three readers, all of whom read Traditional Chinese:

- **Peers** — engineers and sysadmins who arrive from GitHub or a search result with
  a task (a Kubernetes node to prepare, a template VM to seal) and want to know
  whether to trust a script before pasting it into a root shell.
- **The author, later** — returning to find one command, or to remember why a tool
  was dropped.
- **Anyone judging the work** — a hiring manager or collaborator reading the site to
  see how the author thinks and what they have actually run.

**Priority:** the first two. A page earns the third reader by being honest and
specific, not by being written for them.

## Product Purpose

A personal information blog. It publishes what the author has written (scripts),
what the author has used (tools, with an honest status), and the notes in between
(posts) — and it connects them: a post names the tools and scripts it is about, and
those pages point back.

Success: a stranger reaches a script page, understands what it will do to their
machine, and copies a command they trust; and a returning reader can find what the
author used, whether they still do, and why.

## Positioning

The mechanism a generic tech blog cannot truthfully copy: **the commands are
verified, and the script pages are the repository's own files.**

1. **Single source.** A script's page is a byte-for-byte render of its `README.md`.
   There is no second copy of the prose, so the page and GitHub cannot disagree.
   `verify-dist` recomputes a fingerprint of the file's bytes and compares it to the
   one on the page.
2. **Rehearsable.** Every script that changes host state supports `--help` and
   `--dry-run`. The command window shows the flag when it is in the command.
3. **CI-gated.** Shell syntax and ShellCheck, Docker Compose configs, and whether
   every `raw.githubusercontent.com` command in the docs still resolves are each
   verified in CI.

What this does *not* claim: that a script works on the reader's machine. That is why
`--dry-run` is first-class.

## Content Model

| Kind | Where | Authored as | Owner of the words |
| --- | --- | --- | --- |
| Post | `posts/<slug>.md` | frontmatter + markdown | the author, for this site |
| Tool | `tools/<slug>.md` | frontmatter + markdown | the author, for this site |
| Script | `<category>/<project>/README.md` | markdown, no frontmatter | the file — rendered verbatim |
| Page | `pages/{home,about}.md` | frontmatter + markdown | the author, for this site |

- **Tool status** is `using`, `tried` or `dropped`, each shown as a mark and a word.
  A tool the author wrote themselves carries `mine: true` and a `repo`.
- **Links between kinds** are by slug: a post lists `tools:` and `scripts:`; a tool
  lists `scripts:`. The destination pages list the posts that mention them. An unknown
  slug fails the build.
- **Tags** are shared across all three kinds; `/tags/<tag>/` lists everything.
- **Scripts** are `<category>/<project>/README.md`, exactly two levels; the first level
  is the category and the only thing that groups them.

## Operating Context

- Readers arrive mid-task, often on a terminal-adjacent second screen, and leave with
  a command on the clipboard that they paste into a root shell.
- Script content is GitHub-flavoured markdown: dense tables, `> [!TIP]` /
  `> [!IMPORTANT]` alerts, long `curl | sudo bash` one-liners with line continuations,
  and relative links written for GitHub. The renderer rewrites those links: a folder
  that is a published script becomes a site route; any other path becomes a GitHub link.
- The repository is both the scripts' source and the site's content. A push to `main`
  republishes.

## Capabilities and Constraints

- **Chrome only in the front end.** `.astro` / `.ts` / `.css` hold the product name,
  the tagline, navigation and UI labels. All prose lives in markdown.
- **A script page says only what its README says.** Provenance (file, bytes, revision
  date, category) is derived state and may sit beside it; invented intros, claims,
  counts, badges and testimonials may not.
- **Real URLs.** Every page is `…/index.html` under a trailing-slash path, so it works
  unchanged on any static host, is indexable, and has its own
  `<title>`, description, canonical and Open Graph tags.
- **Deploy-agnostic.** Origin and base path come from `SITE_URL` / `BASE_PATH`; the
  site is served by Cloudflare Pages at a domain root, and where it is hosted is a
  setting, not an edit.
- **Static build only.** No server, no database. `npm run verify` is the gate.
- **Copy reads the `<pre>`'s own text**, which holds the command and nothing else.
- **Must keep:** light and dark themes, with the stored choice applied before first
  paint so there is no flash.
- **Interface language:** Traditional Chinese (zh-TW). Code, identifiers, commands, file
  paths and log output stay verbatim. English is deferred, not excluded.
- **Deferred (not built):** comments, analytics, generated Open Graph images, an English
  edition.

## Brand Commitments

- Product name: **ivan note** — the root `README.md`'s H1. The masthead, the home
  `<title>` and the feed read it from there, and `verify-dist` asserts it.
- Tagline: the root README's first paragraph (個人資訊部落格：我寫過的 script、用過的工具，
  以及 GitHub 上的專案筆記。).
- Published on Cloudflare Pages. License: MIT.
- No logo, wordmark or illustration exists. The favicon is the binder: a tan square
  with two punched holes.
- The earlier name, **Script Docs**, now names only the repository.

## Evidence on Hand

- Ten published scripts with complete READMEs, plus their real shell / Python /
  compose sources in the repo.
- Eight CI-verified one-liner commands, listed in the root README.
- A real CI workflow: `.github/workflows/ci.yml`.
- A real `CHANGELOG.md`.
- **Seed entries.** The two posts and four tool cards on the site at launch are
  drafted from what the repository itself shows (what was written, which tool each
  script serves). Their statuses and one-line verdicts are the author's to correct.
- **Absent, and not to be fabricated:** install counts, stars, downloads, user
  testimonials, company logos, benchmarks, uptime figures, "trusted by" claims,
  screenshots of the scripts running, and any imagery. The repository contains no
  images at all.

## Product Principles

1. **The command is the product.** A script page exists to get one trustworthy line
   onto a reader's clipboard; everything else is supporting evidence.
2. **Earn the root shell.** The reader is about to run this as root on a machine they
   care about. Risk, reversibility and `--dry-run` are first-class content, not
   footnotes.
3. **One source, no drift.** A script's page is its README. If a sentence would look
   better restated in a template, it belongs in the README.
4. **Honest status.** A tool is `using`, `tried` or `dropped`, and an old page admits
   its age. The site never claims a freshness the file does not have.
5. **Structure comes from the filesystem.** Categories, titles, slugs and ordering are
   derived from folders and files, never authored in the front end.
6. **Degrade, don't crash.** A missing doc, an unknown language, an unsafe link
   protocol and a missing search index all render as something safe.

## Accessibility & Inclusion

No formal standard was established. Product-specific needs that are already real:

- Light and dark at enforced contrast: every ink clears 4.5:1 on the paper, the
  recessed wells, aged paper and the danger field (`check-contrast.mjs`).
- Long `curl` commands stay readable and copyable without a mouse; the command window
  scrolls horizontally rather than wrapping a command nobody could check.
- State is never colour alone: status is a square plus a word; table-of-contents
  position is a circle, a crease or a hole.
- The interface is zh-TW, so the type system sets CJK alongside Latin monospace; labels
  are 12px because a 黑體 glyph at 11px is not legible.
- A skip link, visible focus on every control, and `prefers-reduced-motion` honoured.
