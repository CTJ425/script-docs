#!/usr/bin/env bash
# One-click installer for the Claude Code Usage HUD statusline.
# Usage: curl -fsSL <raw-url>/install.sh | bash
set -euo pipefail

REPO_RAW_BASE="${USAGE_HUB_RAW_BASE:-https://raw.githubusercontent.com/CTJ425/script-docs/main/cluadecode/usage_hub}"
CLAUDE_DIR="$HOME/.claude"
INSTALL_DIR="$CLAUDE_DIR/usage_hub"
SCRIPT_NAME="statusline.js"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required but was not found in PATH." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"

# Download to a temp file and sanity-check it before it becomes code that runs
# on every prompt render. A truncated transfer or an HTML error page would
# otherwise be installed silently.
# A directory, so the file keeps its .js extension: `node --check` refuses to
# run on an extensionless path because it cannot infer the module format.
tmpdir="$(mktemp -d)" || { echo "Error: could not create a temporary directory." >&2; exit 1; }
trap 'rm -rf "$tmpdir"' EXIT
tmp="$tmpdir/$SCRIPT_NAME"

curl -fsSL "$REPO_RAW_BASE/$SCRIPT_NAME" -o "$tmp"
[ -s "$tmp" ] || { echo "Error: downloaded $SCRIPT_NAME is empty." >&2; exit 1; }
head -n 1 "$tmp" | grep -q '^#!' || {
  echo "Error: downloaded $SCRIPT_NAME does not start with a shebang." >&2; exit 1; }
grep -q 'renderStatusLine' "$tmp" || {
  echo "Error: downloaded $SCRIPT_NAME does not look like the expected script." >&2; exit 1; }
node --check "$tmp" || { echo "Error: downloaded $SCRIPT_NAME is not valid JavaScript." >&2; exit 1; }

cp "$tmp" "$INSTALL_DIR/$SCRIPT_NAME"
chmod +x "$INSTALL_DIR/$SCRIPT_NAME"

mkdir -p "$CLAUDE_DIR"
if [ -f "$SETTINGS_FILE" ]; then
  cp "$SETTINGS_FILE" "$SETTINGS_FILE.bak.$(date +%s)"
fi

# shellcheck disable=SC2016  # the ${...} below are JS template literals, not shell expansions
node -e '
const fs = require("fs");
const settingsPath = process.argv[1];
const command = process.argv[2];

let settings = {};
if (fs.existsSync(settingsPath)) {
  const raw = fs.readFileSync(settingsPath, "utf8");
  if (raw.trim()) {
    // Abort rather than start from {}: this file holds hooks, permissions and
    // env too, and silently replacing all of it with just statusLine would be
    // a far worse outcome than refusing to install.
    try {
      settings = JSON.parse(raw);
    } catch (e) {
      console.error(`Error: ${settingsPath} is not valid JSON (${e.message}).`);
      console.error("Refusing to overwrite it -- fix the file, then re-run.");
      process.exit(1);
    }
    if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
      console.error(`Error: ${settingsPath} does not contain a JSON object.`);
      process.exit(1);
    }
  }
}

settings.statusLine = { type: "command", command };
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
' "$SETTINGS_FILE" "node \"$INSTALL_DIR/$SCRIPT_NAME\""

echo "Usage HUD statusline installed to $INSTALL_DIR/$SCRIPT_NAME"
echo "Restart Claude Code (or start a new session) to see it in the status bar."
