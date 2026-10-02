---
version: 1
slug: "site-src"
primary_target: "site/src"
related_targets: []
---

Scope: the whole site (`site/`), every route. Visitor mode: **Read**.
Audience: three readers — a peer arriving from GitHub or search with a task and a
doubt about pasting a `curl | sudo bash` into a machine they care about; the author,
returning to find one command or remember why a tool was dropped; and anyone judging
the work. Trust first, look-up second.
Task: understand what a script does to a host, then copy one command — or find what
the author used, whether they still do, and why.
Content: posts, tools and pages are authored for this site; every script page is a
byte-for-byte render of a `README.md`. The front end may hold chrome only.
Constraint: light and dark themes are both required and must not flash; real URLs,
per-page share tags, a feed, and a search index are not optional.

Unresolved: none open. English is deferred; comments, analytics and generated Open
Graph images are deferred.

## Direction contract

THESIS: This site is a field notebook, so it is built as one. It refuses the
category-default blog arrangement — card grid, hero image, gradient, rounded pills,
one accent — in which a post is a rectangle in a grid. Here the page is one sheet of
warm paper, and a list is that sheet divided by hairlines.

OWN-WORLD: Warm manual-page cream (graphite in dark) under a paper grain, one ink in
three weights, hairline rules. The only saturated thing is the punched command window,
and its colour is the command's origin: chrome yellow `AI/`, teal `container/`,
ultramarine `script/`, the binder's tan for everything else, with grass, oxide orange,
violet and sienna held in reserve. Vermilion is held out of the whole system and spends
only on danger. Type does three jobs and only three: a heavy near-condensed grotesque
in caps for display, a serif for every word meant to be read, a mono for the machine's
voice — commands, labels, dates, state. Body sets at one size, 75ch measure.

STORY: The visitor lands on a page that reads like a notebook, not a feed. They see
what the author has written, what they have used, and whether they still use it — each
status a shape and a word. On a script page they read what it does and what it changes,
see the page declare its own source, size and age, and copy one command from a punched
window that tells them, in its own head, when the command says `sudo` or `--dry-run`.

FIRST VIEWPORT: The site name at display size, the tagline under it in serif, two lines
of the author's own introduction. Below the fold, three hairline-ruled lists — latest
posts, tools in use, recently revised scripts — all the same row.

FORM: Derived from the previous "boxed-software manual" system by keeping what carried
over — the type system, the paper grain, derived colour, the punched window, the ageing
paper, state as a mark — and dropping what only worked for a three-category manual: the
band, spine, tab rail and the runtime-solved reading leaf. Colour is now derived at build
time and asserted by `check-contrast.mjs` against every surface text can land on.
Signature interaction: nothing eases or fades; every change is a two-frame `steps(2)`
90ms hinge.

FINISH: unreviewed is unfinished — screenshots of every route in both themes at desktop
and phone width, and `npm run verify` green.
