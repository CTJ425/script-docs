# Claude Code Usage HUD

A global Claude Code statusline showing model name, 5-hour / weekly rate-limit
usage, and current session context-window usage.

```
Claude Sonnet 5 | 5h 45.0% (2h10m) | Wk 23.0% (3d04h) | Ctx 156K/200K
```

## Requirements
- Node.js in `PATH`
- Claude.ai Pro/Max login (rate-limit usage shows `N/A` for API-key accounts)

Claude Code doesn't include rate-limit data until a session's first API response,
so the last known values are cached in `~/.claude/usage_hub/cache.json` and shown
meanwhile — a new session opens with real numbers instead of `N/A`. A cached
window whose reset time has already passed shows `0.0%`; a cache older than 7
days is ignored.

## One-click install
```bash
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/claudecode/usage_hub/install.sh | bash
```
Restart Claude Code afterward. This writes `statusLine` into `~/.claude/settings.json`
(backing up any existing file first) and copies `statusline.js` to `~/.claude/usage_hub/`.

## Manual install
1. Copy `statusline.js` anywhere, e.g. `~/.claude/usage_hub/statusline.js`.
2. Add to `~/.claude/settings.json`:
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node ~/.claude/usage_hub/statusline.js"
     }
   }
   ```
3. Restart Claude Code.

## Uninstall
Remove the `statusLine` key from `~/.claude/settings.json` (or restore your
`.bak` file created during install) and delete `~/.claude/usage_hub/`.

## Testing
```bash
node test-statusline.js
```
