# Claude Code Usage HUD — Spec

## Purpose
A global Claude Code `statusLine` that shows, in one line:
1. Current model name
2. 5-hour rolling rate-limit usage
3. Weekly rate-limit usage
4. Current session's context window usage (tokens used / max)

## Scope decisions
- Account-level rate limits only (5h + weekly), not derived/estimated from local
  transcripts. If the native payload doesn't have the field, fall back to the
  last value cached on disk; if there is none, show `N/A` for that item — no
  computation/estimation from other sources.
- Requires a Claude.ai Pro/Max login for `rate_limits` to be populated. API-key
  users will see `N/A` for both rate-limit items.
- No extra info beyond model name + the three usage items (no cwd, no git branch,
  no cost).

## Output format
```
<model> | 5h 45.0% (2h10m) | Wk 23.0% (3d04h) | Ctx 156K/200K
```
- Model name truncated to 20 chars.
- Percentage only (no progress bar), always one decimal place.
- Color thresholds: green <70%, yellow 70-89.9%, red >=90% (ANSI codes).
- Reset countdown format: `Xd0Yh` if >=1 day, `XhYYm` if >=1 hour, else `Xm`.
- Any missing/unparseable field with no usable cache renders as `N/A` for that
  segment only — the rest of the line still renders.
- Cached values are rendered identically to live ones (no staleness marker).
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
  API response in a session — absent before that. Handled by the disk cache
  below rather than rendering `N/A`.
- `context_window.used_percentage` can be `null` early in a session — treated
  as `0` rather than `N/A`, since `context_window_size` (the max) is still known.

## Cold-start cache
- File: `~/.claude/usage_hub/cache.json` (override with `USAGE_HUB_CACHE`, used
  by the tests so they never touch the real `~/.claude`).
- Shape: `{ version: 1, saved_at: <unix s>, rate_limits: { five_hour, seven_day },
  context_window_size }`. Each bucket stores `used_percentage` + `resets_at`.
- Read on every invocation. Resolution order per bucket: live payload value ->
  fresh cached value -> `N/A`.
- A cache is "fresh" for 7 days (`saved_at`); older than that is ignored.
- A cached bucket whose `resets_at` has already passed has rolled over: renders
  `0.0%` with no countdown (nothing ran to accrue usage since).
- `context_window_size` is also cached, so a payload with no `context_window`
  still renders `Ctx 0/200K` instead of `Ctx N/A`.
- Written after the line is printed, only when a live bucket was present and the
  values actually changed (this runs on every render — avoid pointless writes).
  Buckets merge over the previous cache so a payload carrying only `five_hour`
  doesn't drop `seven_day`. Write is `mkdirSync -p` -> temp file -> `renameSync`.
- Every cache read/write failure (missing, corrupt, unwritable, wrong version) is
  swallowed: the line still renders and the exit code stays 0.

## Implementation
- Language: Node.js (no python3 on target machine).
- File: `statusline.js`, single dependency-free script, shebang `#!/usr/bin/env node`.
- Must run fast (invoked after every UI render) — no network calls, and the only
  disk I/O is one small synchronous cache read plus one write when the cached
  values changed. Both degrade silently on failure.

## Install
- `install.sh`: one-click installer, run via
  `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/claudecode/usage_hub/install.sh | bash`
- Downloads `statusline.js` to `~/.claude/usage_hub/statusline.js`.
- Backs up any existing `~/.claude/settings.json` before writing, then merges in
  `statusLine: { type: "command", command: "node ~/.claude/usage_hub/statusline.js" }`
  without touching other settings keys.
- Requires `node` in PATH; exits with an error message if missing.

## Testing
- `test-statusline.js`: spawns `statusline.js` as a child process for each case,
  feeds JSON on stdin, points `USAGE_HUB_CACHE` at a temp dir, asserts on stdout.
  Covers: full valid payload, no bar characters in output, missing `rate_limits`,
  missing `context_window`, missing `model`, malformed JSON, empty stdin,
  non-object JSON (array/string), extreme percentages (0, 70, 100, negative,
  >100, NaN/Infinity-equivalent via string), long model name truncation,
  ASCII-only output; plus cache behaviour: file written, cold start uses cache,
  live wins over cache, expired window -> `0.0%` with no countdown, >7-day cache
  ignored, corrupt cache, unknown cache version, unwritable cache path, per-bucket
  merge, no rewrite when unchanged, cache dir created.
