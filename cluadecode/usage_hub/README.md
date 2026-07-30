# Claude Code Usage HUD

A global Claude Code statusline showing model name, 5-hour / weekly rate-limit
usage, and current session context-window usage.

```
Claude Sonnet 5 | 5h [====....] 45% (2h10m) | Wk [==......] 23% (3d04h) | Ctx 156K/200K
```

## Requirements
- Node.js in `PATH`
- Claude.ai Pro/Max login (rate-limit bars show `N/A` for API-key accounts)

## One-click install
```bash
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/cluadecode/usage_hub/install.sh | bash
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
