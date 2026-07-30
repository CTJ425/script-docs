#!/usr/bin/env bash
set -e

HUD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="$(which python3 2>/dev/null || which python 2>/dev/null || echo "/usr/bin/python3")"

echo "=================================================="
echo "AGY Pure-ASCII Statusline 部署與安裝"
echo "=================================================="

echo "[1/2] 設定執行權限..."
chmod +x "$HUD_DIR/statusline_hud.py"

echo "[2/2] 執行自動化審查與單元測試..."
"$PYTHON_BIN" "$HUD_DIR/test_statusline.py"

echo ""
echo "--------------------------------------------------"
echo "如何在 agy CLI 中套用純 ASCII 狀態列："
echo "--------------------------------------------------"
echo "方式 A (隨切隨用)：在 agy 終端內輸入："
echo "  /statusline $HUD_DIR/statusline_hud.py"
echo ""
echo "方式 B (持久化生效)：在 ~/.gemini/antigravity-cli/settings.json 新增："
echo '  "statusLine": {'
echo '    "type": "command",'
echo "    \"command\": \"$HUD_DIR/statusline_hud.py\""
echo '  }'
echo "=================================================="
