# Claude Code Usage HUD

> 最後更新：2026-10-07

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
`⚠ usage-hud:`. Each segment is
labelled: `5h` the 5-hour window, `Wk` the week, `Ctx` the context window.
In the terminal the labels stay plain text, which every font and multiplexer
draws one column wide; Claude Desktop draws small vector icons in their place,
or the terminal's text if you choose it (see [Options](#options)).
Color separates what a segment is from its value: the labels and separators
are dim, the values are in the theme's accent color, and a window at 90% or
more turns to the error color and is marked with `!` (`5h 93%!`).

- **Effort** comes from the session's model requests. Before the first one,
  the settings' `effortLevel` for the model (`modelSettings.<model>`, else the
  top level) stands in; a model without an effort setting shows none.
- A window with no figure yet shows `–`.

## Requirements
- Claude Code with plugin function hooks (`hooks/hooks.json` → `modules`).
  The API is early access and may change between releases.
- Claude.ai Pro/Max login (rate-limit usage shows `–` for API-key accounts)

## Install
1. Add the marketplace. From GitHub:
   ```bash
   claude plugin marketplace add CTJ425/script-docs
   ```
   Or from a local clone, which installs exactly what is checked out
   (unpushed commits included):
   ```bash
   git clone https://github.com/CTJ425/script-docs.git
   claude plugin marketplace add ./script-docs
   ```
   Both register the marketplace as `script-docs`; add only one of them.
2. Install the plugin:
   ```bash
   claude plugin install usage-hud@script-docs
   ```
3. Check it is installed and enabled:
   ```bash
   claude plugin list
   ```
   `usage-hud@script-docs` should show `Status: ✔ enabled`.
4. Restart Claude Code. The line appears under the prompt; the usage figures
   fill in after the first reply (or at once, from the store, if another
   session already has them).

### Options
| Option | Values | Default |
| --- | --- | --- |
| `desktopLabels` | `icons`: Claude Desktop labels the segments with icons. `text`: it shows `5h` / `Wk` / `Ctx` as text, the same line as the terminal. | `icons` |

The terminal always shows text, whichever you choose. Set it on the options
screen `claude plugin install` shows, or later in a terminal session under
`/config` (the *Desktop labels* row). It is saved in your user settings,
which the Desktop's Code tab reads too. If a session already open does not
switch, restart it.

### Update
```bash
claude plugin marketplace update script-docs
claude plugin update usage-hud@script-docs
```
Restart Claude Code afterward.

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
To remove everything, also drop the marketplace, the stored usage and the
cached copies (`uninstall` keeps every version it ever installed):
```bash
claude plugin marketplace remove script-docs
rm -f ~/.claude/plugins/store/usage-hud_script-docs-*.json
rm -rf ~/.claude/plugins/cache/script-docs/usage-hud
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
