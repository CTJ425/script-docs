# Claude Code Usage HUD — Spec

## Purpose
A Claude Code plugin (function hooks) that shows, in one line under the prompt (on the mode pills' row):
1. Current model name and reasoning effort
2. 5-hour rolling rate-limit usage and its reset countdown
3. Weekly rate-limit usage (no reset time)
4. Current session's context window usage (tokens used / max)

and, in a pane beside the transcript, the session's background work: how many
subagents and background shells are running and for how long (see
[Background activity](#background-activity)).

## Scope decisions
- Account-level rate limits only (5h + weekly), as Claude Code reports them.
  No estimation from transcripts. Missing with nothing stored -> `–`.
- Requires a Claude.ai Pro/Max login for rate limits to be populated.
- The HUD line holds model + effort and the three usage items, plus a `Bg`
  segment only while the activity pane is not on screen. Everything else about
  background work is in the pane.
- Color tells a label from a value; one warning threshold (`!`, below), not
  the 1.x two-step yellow/red.

## Output format
```
<model> · <effort>   5h 45% · 2h10m   Wk 23%   Ctx 156K/1M
```
Drawn by a `ui.render` hook on `PromptHint` (the dim line under the prompt
that carries the mode pills). The terminal draws the pills itself, ahead of
whatever a hook returns, so nothing can sit between them and the prompt
(checked against a live terminal: a `next(e)` placed after the HUD row in a
column still draws above it). Idle, the hook returns the HUD row alone, which
takes the place of the engine's hint text beside the pills; while
`isWorking`, it returns a column of the engine's line (`next(e)`, `esc to
interrupt`) and the HUD row beneath it. Idle, it does the same whenever the
engine's `hint` is more than its stock text (the mode pill's `<mode> on`,
`(<key> to cycle)`, `<key> for agents`, `? for shortcuts`; `isStockHint` in `hud.ts`): the rest
is state the engine reports on that row (`↓ to manage`, `1 shell`, PR
status, drafts) and the HUD must not hide it. Not `$.ui.status`: Claude
Code shows that as a pinned notice, prefixed `⚠ usage-hud: `, and the plugin
cannot turn the prefix off.
- Labels are icons on the desktop and text on the terminal. A label run
  carries `icon` (`five_hour`, `seven_day`, `context`) and, as its text, the
  terminal's label (`LABEL`: `5h`, `Wk`, `Ctx`). The terminal keeps ASCII:
  symbols such as `◷ ⊞ ◧` fall back to a font that draws them wider than a
  cell, and herdr, which places every non-ASCII cell by cursor address, then
  paints the next cell over half of the glyph (seen 2026-10-04; fine outside
  herdr).
- Option `desktopLabels` (`userConfig`, `icons` | `text`, default `icons`):
  with `text` the desktop draws each label as a dim `Text` of its terminal
  label instead of an `Svg`; everything else on its row stays as below. The
  terminal ignores it. A change in `/config` reloads the module with the new
  value.
- On the terminal the row is one `Text` (`wrap="truncate-end"`) of nested
  `Text` runs. On the desktop it is a `Box` row: each label an `Svg` (12px,
  mid-grey stroke, as the image cannot read the theme; `alt` names the
  window) and each other run a `Text` whose spaces are non-breaking, since the
  page would collapse them. Each run carries a tone (`Span`, `types/index.d.ts`):
  | Tone | What | Drawn |
  | --- | --- | --- |
  | `label` | `5h`, `Wk`, `Ctx` (icons on the desktop) | `dimColor` |
  | `data` | model, effort, percentages, countdown, tokens | theme key `suggestion` |
  | `warn` | a percentage at or past `WARN_PCT` | theme key `error` |
  | none | separators, `–` | `dimColor` |
- Other mods' segments: `PromptHint` carries `tail`, text a hook adds after
  the line. Wherever the HUD row is drawn, the hook appends `tail` to it as
  one dim run three spaces after the last segment (non-breaking on the
  desktop, like every run), and hands the engine its props without `tail`,
  so the text is drawn once: the engine draws `tail` on the terminal only,
  and the HUD row reaches the desktop too. Before the first look the hook
  passes `e` on untouched and the engine draws `tail` itself. Mods share the
  tail by appending to it (`a · b`); the order is their hooks' order.
- The line is held in `$.state` `usage-hud.line` (`Span[] | null`); each look
  writes it, and the write redraws the row.
- Before the first look the hook returns the engine's line alone. Claude Code
  raises `PromptHint` on the terminal and desktop surfaces only.
- Segments are three spaces apart; ` · ` binds a value to its qualifier
  (model to effort, 5-hour usage to its countdown).
- Model name (`$.session.model()`) truncated to 20 chars; ` · <effort>` follows
  it outside that limit, and is left out while no effort is known.
- Percentage clamped to 0..100 and rounded to a whole number.
- `!` follows a percentage, and the `warn` tone colors it, when the rounded
  figure is >= 90 (`WARN_PCT`), so a shown `90%` is always marked. The mark
  stays so the warning reads where color does not.
- 5h reset countdown: `XdYYh` if >=1 day, `XhYYm` if >=1 hour, else `Xm`.
  The weekly window shows no reset time.
- Context tokens: `N` below 1000, `NK` below a million, `N.NM` above (`1M`,
  not `1000K`).
- Any window with no live or stored value renders `–`; the rest still renders.
- Stored values render identically to live ones (no staleness marker).
- A failing read keeps the previous line; no error is surfaced.
- Non-interactive sessions (`-p`, SDK) draw nothing.

## Background activity
What the pane answers first is how many jobs are running and the longest
one's elapsed time; the rows under it are the detail.

### Pane
- `$.ui.open({ id: 'activity', title: 'Background' })`, drawn by a
  `ui.render` hook on `{ component: 'Pane', requestId: 'activity' }`.
- Opened unasked the first time a job runs, and only where the terminal docks
  panes (`viewport.isFullscreen`, read from the `PromptHint` render); never
  closed by the plugin when the work ends, so the transcript does not change
  width under the person.
- `/hud` (registered at `session.start`) opens it when it is not up, at any
  width, and closes it when it is. Closed by `/hud` or by the person
  (`ui.close` origin `person`), `paneOff` is set and it is not opened unasked
  again this session; `/hud` clears it.
- Layout, top to bottom:
  ```
  2 running
  longest 4:12
  ? Claude is asking you
  
  Agents
  > Explore  scan hooks            running  4:12
  > Plan  refresh design           waiting  1:05
  
  Shells
  + tsc -p .                       exit 0   0:09
  ```
  The head is bold; `longest …` is dim, and with nothing running it reads
  `nothing in the background` (or is left out while ended rows remain). The
  question line shows while an AskUserQuestion call is open, in the theme's
  `warning` color. A group with no rows is left out.
- A row is a mark, the name (cut at the pane's edge), a word and the elapsed
  time. The mark and word say the state; the tone only adds to it. Marks are
  ASCII, for the same reason as the labels:
  | Status | Mark | Word | Tone |
  | --- | --- | --- | --- |
  | pending, running, waiting | `>` | the status | `suggestion` |
  | idle (a teammate between turns) | `-` | `idle` | dim |
  | done | `+` | `done`, a shell's `exit N` | dim, the name dim too |
  | failed | `x` | `failed`, a shell's `exit N` | `error` |
  | killed | `x` | `killed` | `error` |
- An agent's `waiting` (held on its own background work or a plan's approval)
  is shown as under way, not as waiting on the person; only an open
  AskUserQuestion says that.
- Order: under way first, then ended, each oldest first. Elapsed time reads
  `m:ss`, `h:mm:ss` past an hour, and stops at the end time once a job ends.
- A `done` row stays 30 s (`LINGER_MS`), then leaves. A `failed` or `killed`
  row stays until the person's next prompt (`prompt.submit` origin
  `composer`), which says they have seen it.

### `Bg` segment
- While the pane is not drawn and shown (`$.ui.panes()`: `isPlaced` and
  `isShown`), the HUD line ends with `   Bg <running> · <longest>` and, while a
  question is open, ` ?<n>` in the `warning` color (`Bg 3 · 4:12 ?1`). With
  nothing running and nothing asked it is left out.
- `Bg` is a label like `5h`; the desktop draws it as an icon (`background`,
  three lines) unless `desktopLabels` is `text`.

### Sources
| What | From |
| --- | --- |
| subagents and their status | `$.agent.list()`; `completed` reads `done` |
| an agent's start time | `agent.spawn`, after `next`, with the `agentId` it answered; an agent the list shows first is timed from then, and one first seen already ended is hidden |
| a background shell's start | `tool.call` on Bash whose result carries `backgroundTaskId` (`run_in_background`, ctrl+b, a timeout) |
| a shell's end | `prompt.submit` with origin `task-notification`: `<task-id>`, `<status>`, and `exit code N` in the summary; `completed` with a non-zero code reads `failed` |
| a question open | a `tool.call` on AskUserQuestion, from before `next` until it settles |
| permission prompts | not shown: no event says one is waiting |

All of it is in `$.state` (`jobs`, `asking`, `activity`, `paneShown`,
`paneOff`), so a hot reload keeps every clock.

### Refresh
- Each change (spawn, shell start or end, question, prompt, `/hud`, a close)
  looks at once.
- While anything runs or a question is open, a 1-second `$.clock.every`
  timer recomputes the activity, so elapsed times move each second; it stops
  when nothing does. The 5-second usage timer also looks, which catches
  agents no `agent.spawn` hook saw start.

## Data source
`$.session.usage()` (`SessionUsage`):
- `rateLimits[]`: `{ kind, percentUsed, resetsAt? }`; only `five_hour` and
  `seven_day` are used. `resetsAt` is ISO 8601, converted to epoch ms.
- `context.window` -> max tokens; `context.tokens` -> used tokens, absent until
  the live window's first response (treated as `0`).

## Effort
- Read from `turn.step`, the event each model request passes through, on the
  main loop only (no `agentId`); a subagent's effort is not the session's.
- The hook observes: it passes the request on unchanged (`yield* next(e)`) and
  records the effort beside it, never ahead of it.
- Held in `$.state` `usage-hud.effort` (`string | null`); a change redraws the
  line at once. `null` when the request carries no effort (a model without the
  setting); unset before the session's first request.
- While unset, the merged settings (`$.settings.read()`) stand in:
  `modelSettings[<model id>].effortLevel`, else `effortLevel`. A guess, since
  `/effort` or the environment can override them; the first request replaces
  it, including with `null`.

## When it refreshes
- `session.start` (interactive only): first render, then a 5-second
  `$.clock.every` timer.
- `session.measure`: pushed after each main-thread turn and when a window moves
  a whole point.
- `session.end`: cancels the timer. A hot reload drops timers itself and fires
  `session.start` again.
- The timer is required, not cosmetic: `session.measure` does not fire for
  sub-point changes, countdowns, or another session's writes.

## Shared store
- `$.store` key `shared`: `{ savedAt, buckets: { five_hour?, seven_day? } }`,
  each bucket `{ pct, resetsAt }` (epoch ms, `resetsAt` may be null). One JSON
  file per plugin under `~/.claude/plugins/store/`, re-read on every `get`, so
  every session sees the others' writes (verified by editing the file under a
  running session).
- Fresh for 7 days (`savedAt`, with 5 minutes of future slack for clock skew);
  older or malformed values are ignored, both for rendering and as a base for
  the next write.
- A stored window whose `resetsAt` has passed renders `0%` with no countdown.
  A stored window with no `resetsAt` renders its percentage without a countdown.
- Written only when a bucket changed; a reading carrying one window keeps the
  other from the store.

## Freshness and precedence
- `$.state` `usage-hud.lastLive` holds this session's own rate limits from its
  last look. Rate limits change only on an API response, so a reading that
  differs from it (or with nothing held) is *fresh*; an equal one is a
  *replay*. `$.state` survives hot reloads, so a reload never turns a replay
  into a fresh reading.
- Per window, live `L`, stored `C`:
  1. `C` absent -> `L`; `L` absent -> `C`.
  2. `L.resetsAt` has passed and `C.resetsAt` is in the future -> `C`.
  3. Fresh -> `L`, even when lower inside the same window (the account can
     lower usage: observed weekly 35% -> 5% with an unchanged reset time).
  4. Replay -> `C` while `C.resetsAt` is in the future; otherwise `L`.
- The same rule picks what is shown and what is stored, so an idle session
  shows the newer usage another session stored and never overwrites it.

## Files
- `.claude-plugin/plugin.json`: manifest, names the `$.state` contract and
  declares the `desktopLabels` option.
- `hooks/hooks.json`: `{ "modules": ["./register.tsx"] }`.
- `hooks/register.tsx`: hooks and the refresh step (every `$` call).
- `hooks/hud.ts`: pure logic (precedence, store parsing, formatting).
- `hooks/activity.ts`: pure logic of the activity pane (jobs, rows, `Bg`,
  task notifications).
- `types/index.d.ts`: `Bucket`/`Buckets`/`Span`, `Job`/`Jobs`/`Row`/`Activity`
  and the `PluginState` contract (`lastLive`, `effort`, `line`, `jobs`,
  `asking`, `activity`, `paneShown`, `paneOff`).
- `tests/usage-hud.test.ts`: `claude plugin test` suite.
- `/.claude-plugin/marketplace.json` (repo root): lists this folder as
  `usage-hud` in the `script-docs` marketplace.

## Install
- `claude plugin marketplace add CTJ425/script-docs`, then
  `claude plugin install usage-hud@script-docs`; restart Claude Code.
- An installed plugin's hooks module loads behind Claude Code's
  `tengu_plugin_hooks_modules` rollout flag (seen in `--debug` output).

## Testing
`claude plugin test AI/claudecode_usage_hub` runs `tests/usage-hud.test.ts`
against the engine with a mocked clock, an in-memory store, and the test's own
`session.usage` / `session.model` answers, reading the line from its
`$.state` writes. Covers: the row drawn in place of the engine's hint text
on terminal and desktop while idle (text labels on the terminal, `Svg` icons with
non-breaking runs on the desktop), `desktopLabels: text` drawing text labels
on the desktop with the terminal unchanged, and under the engine's line mid-turn on both and while idle with background agents, the tones (dim label, `suggestion` value, `error` at
the mark), the hint line alone before the first look, another mod's `tail`
at the end of the HUD row idle and mid-turn (and not on the engine's line),
and drawn by the engine before the first look, full line,
`–` with no reading, model truncation, clamping and unknown kinds,
non-interactive sessions, a failing read, timer refresh, `session.measure`,
`session.end` stopping the timer, cold start from the store, rolled-over window,
7-day expiry, malformed store, store write, a fresh lower reading lowering the
store, an idle replay deferring to another session's write, an ended live
window, per-window merge, a replay right after a hot reload, effort from the
main loop only and dropped for a model without it, the settings' effort
before the first request, the `!` mark on the
rounded figure (89.4 -> `89%`, 89.6 -> `90%!`), no weekly reset time, and
`1M` context windows. For the activity pane: task-notification parsing,
elapsed-time format, agents first seen ended, the 30-second linger and the
failure kept until the next prompt, row order, the `Bg` segment, the pane
opened by the first agent in a fullscreen terminal (and `Bg` left out while it
shows), no pane unasked outside fullscreen with `Bg` in the HUD instead, a
shell's end and exit code from its notification, `?1` while a question is
open, `/hud` toggling and keeping a hidden pane closed, and the 1-second tick
stopping once nothing runs. Closing the pane by the person's own key is not
covered: the test kit raises no `ui.close` with origin `person`.
