---
version: 1
slug: "site-src"
primary_target: "site/src"
related_targets: []
---

Scope: the whole documentation site (`site/`), every route. Visitor mode: **Read**.
Audience: a sysadmin arriving for the first time from GitHub or search, about to decide
whether to paste a `curl | sudo bash` into a machine they care about. Secondary: the
author returning to find one command. Trust first, look-up second (user-confirmed).
Task: understand what a script does to a host, then copy one command.
Content: every page is a byte-for-byte render of a `README.md`; the front end may hold
chrome only. Constraint: light and dark themes are both required and must not flash.

Unresolved: none open; MUI removal and the four category hues are confirmed.

## Direction contract

THESIS: This site is a boxed-software reference manual, so it is built as one. It
refuses the category-default arrangement — sidebar, content well, right-hand TOC,
restrained grey, one blue-violet accent — in which a category is a line of text in a
list. Here a category is a full-strength colour board you are standing on, and the
README is a milk-acetate leaf hinged a millimetre above it.

OWN-WORLD: A warm manual-page cream leaf (graphite-milk in dark) over a section board
at full strength: chrome yellow `AI/`, teal `container/`, ultramarine `script/`, with
grass, oxide orange, violet and sienna held in reserve for future categories.
Vermilion is held out of the whole system and spends only on danger. Two punched
binder holes down the left margin; a rotated spine label at the far left edge; a
stepped tab rail down the right fore edge, one tab per category, height proportional
to that category's page count, the open tab extending and becoming the board. Hairline
panels, no elevation, no card stack, no gradient, no glass. Type does three jobs and
only three: a heavy near-condensed grotesque in caps for display, a serif for every
word meant to be read, a mono for machine voice — commands, labels, metadata, state. Body sets at one size, 62-character measure; headings hang in a fifth margin
column outside the four-column field. Commands sit in punched windows cut through the
leaf to the board beneath.

STORY: The visitor lands on a page that is visibly a manual opened at a tab, not a
website about scripts. They read what the script does, what it changes, and whether it
is reversible, in type set to be read rather than skimmed past. They see the page
declare its own provenance and its own age. They copy one command from a punched
window and leave, having decided it was safe to.

FIRST VIEWPORT: The root README as the open manual at its `AI/` tab. Far left: the
rotated spine label and two punched holes. Right fore edge: the full-height stepped
tab rail, one saturated band per category, the open one extended. Between them the
cream leaf with its hard short shadow along the cut edge. The README's own H1 sets as
the display line at the largest size on the site; the tagline directly under it in
serif at reading size; the provenance line as a mono strip on the rule beneath. The
first punched window — the first `curl` one-liner — is above the fold, and copying is
the only primary action on the page.

FORM: The fused challenger `rw-manual-acetate-tab-board`, which beat the assigned
grounded direction (candidate 3 of 7, engineering drawing title block) on both
audience identification and product clarity. Seed key `5bb5bdf5`. Raised by the four
declined challengers, each raise named: **staleness is material** (from the sticker
accretion — a leaf whose `最後更新` is old yellows by a measurable step, so a stale
page admits it); **one continuous ruled field, never a card stack** (from the daylight
section); **a strict margin column that keeps position, and passed headings stay
creased rather than erased** (from the orizuru sequence); **state is a mark, never a
hue — punched hole, struck rule, doubled line, errata slip — and anchor navigation
settles on heading pitch, never between** (from the cutting-bench rail). Build path:
code-led, by necessity — this harness has no image generation, so there is no comp and
no comp round. Signature interaction: nothing eases or fades; every page and theme
change is a two-frame `steps(2)` 90ms hinge at the punched edge, and the leaf's alpha
is solved at runtime by binary search over sRGB source-over compositing against the
active board hue until the reading field lands in a fixed luminance band, then
published as a custom property — reading contrast is computed, not eyeballed.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
