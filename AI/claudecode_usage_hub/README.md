# Claude Code Usage HUD

> 最後更新：2026-10-03

A Claude Code plugin that shows model and reasoning effort, 5-hour usage with
its reset countdown, weekly usage, and current session context-window usage as
one line directly under the prompt, on the same row as the mode pill.

```
⏵⏵ auto mode on · Opus 5.5 · high   5h 45% · 2h10m   Wk 23%   Ctx 156K/1M
```

It is a *mod*: a plugin of function hooks that runs inside Claude Code. It
takes the place of Claude Code's hint text (`(shift+tab to cycle)`, `?
for shortcuts`) while idle; during a turn the hint (`esc to interrupt`) keeps
that row and the HUD moves to the row under it. Claude Code draws the mode
pill itself, ahead of any plugin, so no row can go between the pill and the
prompt. It draws there rather than as a plugin status line, which Claude Code would show as a notice prefixed
`⚠ usage-hud:`. Color separates what a segment is from its value: the labels
(`5h`, `Wk`, `Ctx`) and separators are dim, the values are in the theme's
accent color, and a window at 90% or more turns to the error color and is
marked with `!` (`5h 93%!`).

- **Effort** comes from the session's model requests. Before the first one,
  the settings' `effortLevel` for the model (`modelSettings.<model>`, else the
  top level) stands in; a model without an effort setting shows none.
- A window with no figure yet shows `–`.

## Requirements
- Claude Code with plugin function hooks (`hooks/hooks.json` → `modules`).
  The API is early access and may change between releases.
- Claude.ai Pro/Max login (rate-limit usage shows `–` for API-key accounts)

## Install
```bash
claude plugin marketplace add CTJ425/script-docs
claude plugin install usage-hud@script-docs
```
Restart Claude Code afterward. Update later with
`claude plugin update usage-hud@script-docs`.

### Upgrading from the statusline script (1.x)
The old version was a `statusLine` command. Remove the `statusLine` key from
`~/.claude/settings.json` and delete `~/.claude/usage_hub/`, or both lines show.

## How it stays current
- Claude Code pushes a `session.measure` event after each turn and whenever a
  rate-limit window moves a whole point; a 5-second timer covers the rest
  (decimals, countdowns, and usage while the session waits on a subagent).
- Claude Code doesn't report rate limits until a session's first API response,
  so the last known values are kept in the plugin's store and shown meanwhile —
  a new session opens with real numbers instead of `–`. A stored window whose
  reset time has already passed shows `0.0%`; values older than 7 days are
  ignored.
- The store is shared by all your sessions. An idle session only knows the
  usage from its own last API response, so it shows what an active session
  stored instead, and never overwrites it. A session's own new reading always
  wins, even when it is lower inside the same window.

## Uninstall
```bash
claude plugin uninstall usage-hud@script-docs
```

## Development
Load the folder for one session (it hot-reloads on save):
```bash
claude --plugin-dir ./AI/claudecode_usage_hub
```
Check and test it:
```bash
claude plugin validate AI/claudecode_usage_hub
claude plugin test AI/claudecode_usage_hub
```
