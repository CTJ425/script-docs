#!/usr/bin/env bash
# =================================================================
# One-click installer for the AGY (Antigravity CLI) pure-ASCII
# usage statusline.
#
#   curl -fsSL <raw-url>/setup.sh | bash     # no clone needed
#   ./setup.sh                               # from a local clone
#
# Installs statusline_hud.py into ~/.gemini/antigravity-cli/ and
# registers it as the "statusLine" command in that directory's
# settings.json (always as an absolute path -- Antigravity CLI does
# not expand '~' in that field).
# =================================================================
set -euo pipefail

SCRIPT_NAME="setup.sh"
RAW_BASE="${AGY_HUD_RAW_BASE:-https://raw.githubusercontent.com/CTJ425/script-docs/main/agy/usage_hud}"
INSTALL_DIR="${AGY_HUD_DIR:-$HOME/.gemini/antigravity-cli}"
SCRIPT_FILE="statusline_hud.py"
SETTINGS_FILE="$INSTALL_DIR/settings.json"

log()  { printf '[%s] %s\n' "$SCRIPT_NAME" "$*"; }
die()  { printf '[%s] ERROR: %s\n' "$SCRIPT_NAME" "$*" >&2; exit 1; }

usage() {
  cat <<USAGE
Usage:
  ./${SCRIPT_NAME} [--no-test]
  curl -fsSL <raw-url>/${SCRIPT_NAME} | bash

Options:
  --no-test   Skip the test suite (it only runs from a local clone anyway).
  -h, --help  Show this help.

Environment:
  AGY_HUD_DIR       Install directory (default: ~/.gemini/antigravity-cli)
  AGY_HUD_RAW_BASE  Base URL to download from when not run from a clone.
USAGE
}

RUN_TESTS=1
while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-test) RUN_TESTS=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
done

# When piped in ('curl | bash') BASH_SOURCE[0] is unset, and dirname "" would
# silently resolve to the caller's working directory -- picking up whatever
# happens to sit there. Only treat it as a clone when it is a real file.
LOCAL_DIR=""
src="${BASH_SOURCE[0]:-}"
if [ -n "$src" ] && [ -f "$src" ]; then
  LOCAL_DIR="$(cd "$(dirname "$src")" && pwd -P)"
fi

PYTHON_BIN="$(command -v python3 || command -v python || true)"
[ -n "$PYTHON_BIN" ] || die "python3 is required but was not found in PATH."

mkdir -p "$INSTALL_DIR"

# Reject anything that is not plausibly the script we asked for before it is
# installed and executed on every prompt render.
validate_downloaded() {
  local file="$1"
  [ -s "$file" ] || die "Downloaded $SCRIPT_FILE is empty."
  head -n 1 "$file" | grep -q '^#!' || die "Downloaded $SCRIPT_FILE does not start with a shebang."
  grep -q 'render_statusline' "$file" ||
    die "Downloaded $SCRIPT_FILE does not look like the expected script."
}

if [ -n "$LOCAL_DIR" ] && [ -f "$LOCAL_DIR/$SCRIPT_FILE" ]; then
  log "Installing $SCRIPT_FILE from $LOCAL_DIR"
  cp "$LOCAL_DIR/$SCRIPT_FILE" "$INSTALL_DIR/$SCRIPT_FILE"
else
  log "Downloading $SCRIPT_FILE from $RAW_BASE"
  tmp="$(mktemp)" || die "Could not create a temporary file."
  trap 'rm -f "$tmp"' EXIT
  curl -fsSL "$RAW_BASE/$SCRIPT_FILE" -o "$tmp" || die "Failed to download $RAW_BASE/$SCRIPT_FILE"
  validate_downloaded "$tmp"
  cp "$tmp" "$INSTALL_DIR/$SCRIPT_FILE"
fi
chmod +x "$INSTALL_DIR/$SCRIPT_FILE"

if [ -f "$SETTINGS_FILE" ]; then
  backup="$SETTINGS_FILE.bak.$(date +%s)"
  cp "$SETTINGS_FILE" "$backup"
  log "Backed up existing settings to $backup"
fi

# Merge rather than overwrite, and abort instead of silently discarding a
# settings file we cannot parse -- it holds far more than just statusLine.
"$PYTHON_BIN" - "$SETTINGS_FILE" "$INSTALL_DIR/$SCRIPT_FILE" "$PYTHON_BIN" <<'PYEOF'
import json
import os
import sys

settings_path, script_path, python_bin = sys.argv[1], sys.argv[2], sys.argv[3]

settings = {}
if os.path.exists(settings_path):
    with open(settings_path, encoding="utf-8") as fh:
        raw = fh.read()
    if raw.strip():
        try:
            settings = json.loads(raw)
        except ValueError as exc:
            sys.exit(
                f"ERROR: {settings_path} is not valid JSON ({exc}).\n"
                "Refusing to overwrite it -- fix the file, then re-run."
            )
        if not isinstance(settings, dict):
            sys.exit(f"ERROR: {settings_path} does not contain a JSON object.")

settings["statusLine"] = {
    "type": "command",
    "command": f'{python_bin} "{script_path}"',
}

with open(settings_path, "w", encoding="utf-8") as fh:
    json.dump(settings, fh, indent=2, ensure_ascii=False)
    fh.write("\n")
PYEOF

log "Installed to $INSTALL_DIR/$SCRIPT_FILE"
log "Registered statusLine in $SETTINGS_FILE"

if [ "$RUN_TESTS" -eq 1 ] && [ -n "$LOCAL_DIR" ] && [ -f "$LOCAL_DIR/test_statusline.py" ]; then
  log "Running the test suite..."
  "$PYTHON_BIN" "$LOCAL_DIR/test_statusline.py"
fi

log "Done. Restart agy (or start a new session) to see the statusline."
