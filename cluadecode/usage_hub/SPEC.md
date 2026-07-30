# Claude Code Usage HUD — Spec

## Purpose
A global Claude Code `statusLine` that shows, in one line:
1. Current model name
2. 5-hour rolling rate-limit usage
3. Weekly rate-limit usage
4. Current session's context window usage (tokens used / max)

## Scope decisions
- Account-level rate limits only (5h + weekly), not derived/estimated from local
  transcripts. If the native payload doesn't have the field, show `N/A` for that
  item — no fallback computation.
- Requires a Claude.ai Pro/Max login for `rate_limits` to be populated. API-key
  users will see `N/A` for the two rate-limit bars.
- No extra info beyond model name + the three usage items (no cwd, no git branch,
  no cost).

## Output format
```
<model> | 5h [====....] 45% (2h10m) | Wk [==......] 23% (3d04h) | Ctx 156K/200K
```
- Model name truncated to 20 chars.
- Progress bars: pure ASCII (`=` filled, `.` empty), length 8.
- Color thresholds: green <70%, yellow 70-89.9%, red >=90% (ANSI codes).
- Reset countdown format: `Xd0Yh` if >=1 day, `XhYYm` if >=1 hour, else `Xm`.
- Any missing/unparseable field renders as `N/A` for that segment only — the
  rest of the line still renders.
- On top-level parse failure (empty stdin, invalid JSON, non-object), print a
  static fallback line and exit 0. Never throw/crash — Claude Code should never
  see a non-zero exit or stack trace from this command.

## Data source (Claude Code statusLine stdin JSON)
Confirmed against the official docs (https://code.claude.com/docs/en/statusline):
- `model.display_name` -> model name
- `rate_limits.five_hour.used_percentage` / `.resets_at` -> 5h bar
- `rate_limits.seven_day.used_percentage` / `.resets_at` -> weekly bar
- `context_window.used_percentage` / `.context_window_size` -> context tokens
  (used tokens derived as `round(used_percentage / 100 * context_window_size)`)

Documented caveats:
- `rate_limits` is only populated for Pro/Max logins, and only after the first
  API response in a session — absent before that (renders as `N/A`).
- `context_window.used_percentage` can be `null` early in a session — treated
  as `0` rather than `N/A`, since `context_window_size` (the max) is still known.

## Implementation
- Language: Node.js (no python3 on target machine).
- File: `statusline.js`, single dependency-free script, shebang `#!/usr/bin/env node`.
- Must run fast (invoked after every UI render) — no network calls, no disk I/O
  beyond reading stdin.

## Install
- `install.sh`: one-click installer, run via
  `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/cluadecode/usage_hub/install.sh | bash`
- Downloads `statusline.js` to `~/.claude/usage_hub/statusline.js`.
- Backs up any existing `~/.claude/settings.json` before writing, then merges in
  `statusLine: { type: "command", command: "node ~/.claude/usage_hub/statusline.js" }`
  without touching other settings keys.
- Requires `node` in PATH; exits with an error message if missing.

## Testing
- `test-statusline.js`: spawns `statusline.js` as a child process for each case,
  feeds JSON on stdin, asserts on stdout. Covers: full valid payload, missing
  `rate_limits`, missing `context_window`, missing `model`, malformed JSON,
  empty stdin, non-object JSON (array/string), extreme percentages (0, 100,
  negative, >100, NaN/Infinity-equivalent via string), long model name
  truncation, ASCII-only output assertion.
