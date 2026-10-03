# Claude Code Usage HUD — Spec

## Purpose
A Claude Code plugin (function hooks) that shows, in one line under the prompt (on the mode pills' row):
1. Current model name and reasoning effort
2. 5-hour rolling rate-limit usage and its reset countdown
3. Weekly rate-limit usage (no reset time)
4. Current session's context window usage (tokens used / max)

## Scope decisions
- Account-level rate limits only (5h + weekly), as Claude Code reports them.
  No estimation from transcripts. Missing with nothing stored -> `–`.
- Requires a Claude.ai Pro/Max login for rate limits to be populated.
- No extra info beyond model + effort and the three usage items.
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
interrupt`) and the HUD row beneath it. Not `$.ui.status`: Claude
Code shows that as a pinned notice, prefixed `⚠ usage-hud: `, and the plugin
cannot turn the prefix off.
- The row is one `Text` (`wrap="truncate-end"`) of nested `Text` runs. Each run
  carries a tone (`Span`, `types/index.d.ts`):
  | Tone | What | Drawn |
  | --- | --- | --- |
  | `label` | `5h`, `Wk`, `Ctx` | `dimColor` |
  | `data` | model, effort, percentages, countdown, tokens | theme key `suggestion` |
  | `warn` | a percentage at or past `WARN_PCT` | theme key `error` |
  | none | separators, `–` | `dimColor` |
- The line is held in `$.state` `usage-hud.line` (`Span[] | null`); each look
  writes it, and the write redraws the row.
- Before the first look the hook returns the engine's line alone. Claude Code
  raises `PromptHint` on the terminal and desktop surfaces only.
- Segments are three spaces apart; ` · ` binds a value to its qualifier
  (model to effort, 5h usage to its countdown).
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
- A stored window whose `resetsAt` has passed renders `0.0%` with no countdown.
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
- `.claude-plugin/plugin.json`: manifest, names the `$.state` contract.
- `hooks/hooks.json`: `{ "modules": ["./register.tsx"] }`.
- `hooks/register.tsx`: hooks and the refresh step (every `$` call).
- `hooks/hud.ts`: pure logic (precedence, store parsing, formatting).
- `types/index.d.ts`: `Bucket`/`Buckets`/`Span` and the `PluginState`
  contract (`lastLive`, `effort`, `line`).
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
on terminal and desktop while idle, and under the engine's line mid-turn, the tones (dim label, `suggestion` value, `error` at
the mark), the hint line alone before the first look, full line,
`–` with no reading, model truncation, clamping and unknown kinds,
non-interactive sessions, a failing read, timer refresh, `session.measure`,
`session.end` stopping the timer, cold start from the store, rolled-over window,
7-day expiry, malformed store, store write, a fresh lower reading lowering the
store, an idle replay deferring to another session's write, an ended live
window, per-window merge, a replay right after a hot reload, effort from the
main loop only and dropped for a model without it, the settings' effort
before the first request, the `!` mark on the
rounded figure (89.4 -> `89%`, 89.6 -> `90%!`), no weekly reset time, and
`1M` context windows.
