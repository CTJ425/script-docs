#!/usr/bin/env bash
# One-click installer for the Claude Code Usage HUD statusline.
# Usage: curl -fsSL <raw-url>/install.sh | bash
set -euo pipefail

REPO_RAW_BASE="https://raw.githubusercontent.com/CTJ425/script-docs/main/cluadecode/usage_hub"
CLAUDE_DIR="$HOME/.claude"
INSTALL_DIR="$CLAUDE_DIR/usage_hub"
SCRIPT_NAME="statusline.js"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required but was not found in PATH." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
curl -fsSL "$REPO_RAW_BASE/$SCRIPT_NAME" -o "$INSTALL_DIR/$SCRIPT_NAME"
chmod +x "$INSTALL_DIR/$SCRIPT_NAME"

mkdir -p "$CLAUDE_DIR"
if [ -f "$SETTINGS_FILE" ]; then
  cp "$SETTINGS_FILE" "$SETTINGS_FILE.bak.$(date +%s)"
fi

node -e '
const fs = require("fs");
const settingsPath = process.argv[1];
const command = process.argv[2];

let settings = {};
if (fs.existsSync(settingsPath)) {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (e) {
    settings = {};
  }
}

settings.statusLine = { type: "command", command };
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
' "$SETTINGS_FILE" "node \"$INSTALL_DIR/$SCRIPT_NAME\""

echo "Usage HUD statusline installed to $INSTALL_DIR/$SCRIPT_NAME"
echo "Restart Claude Code (or start a new session) to see it in the status bar."
