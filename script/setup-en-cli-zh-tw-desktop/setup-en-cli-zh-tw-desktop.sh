#!/usr/bin/env bash
set -euo pipefail

echo "############################################"
echo "# 1. 安裝英文語系套件（讓 CLI 訊息能顯示英文）"
echo "############################################"
sudo dnf install -y glibc-langpack-en

echo ""
echo "############################################"
echo "# 2. 將家目錄下的中文資料夾改為英文名稱"
echo "############################################"
cd "$HOME"

declare -A dir_map=(
  ["下載"]="Downloads"
  ["文件"]="Documents"
  ["桌面"]="Desktop"
  ["圖片"]="Pictures"
  ["影片"]="Videos"
  ["音樂"]="Music"
  ["公共"]="Public"
  ["模板"]="Templates"
)

for zh in "${!dir_map[@]}"; do
  en="${dir_map[$zh]}"
  if [ -d "$zh" ]; then
    if [ -d "$en" ]; then
      echo "偵測到 $en 已存在，將「$zh」的內容合併進去..."
      cp -a "$zh"/. "$en"/
      rm -rf "$zh"
    else
      echo "重新命名：$zh -> $en"
      mv "$zh" "$en"
    fi
  else
    echo "略過：找不到資料夾「$zh」（可能已經改過名稱了）"
  fi
done

echo "更新 xdg-user-dirs 設定..."
LC_ALL=C xdg-user-dirs-update --force

echo ""
echo "############################################"
echo "# 3. 設定「只在終端機視窗生效」的英文訊息語言"
echo "############################################"
BASHRC="$HOME/.bashrc"
MARK_START="# >>> CLI 英文訊息設定 (only pts) >>>"
MARK_END="# <<< CLI 英文訊息設定 (only pts) <<<"

if grep -qF "$MARK_START" "$BASHRC" 2>/dev/null; then
  echo "偵測到已經設定過，略過（不重複加入）。"
else
  {
    echo ''
    echo "$MARK_START"
    echo '# 只在真正的終端機視窗（pts 虛擬終端機）且為互動模式時才套用，避免滲透到桌面環境本身'
    # shellcheck disable=SC2016  # written verbatim into the rc file; must not expand here
    echo 'if [[ $- == *i* ]] && [[ "$(tty)" == /dev/pts/* ]]; then'
    echo '    export LC_MESSAGES=en_US.UTF-8'
    echo '    export LANGUAGE=en_US:en'
    echo 'fi'
    echo "$MARK_END"
  } >> "$BASHRC"
  echo "已加入 ~/.bashrc"
fi

echo ""
echo "############################################"
echo "# 完成"
echo "############################################"
echo "目前 xdg-user-dirs 設定："
cat "$HOME/.config/user-dirs.dirs"
echo ""
echo "請【完整登出目前的 GNOME 工作階段】再重新登入一次，"
echo "讓桌面環境（Nautilus、檔案總管、GTK 對話框）套用新的英文資料夾路徑。"
echo "登入後打開新的終端機視窗，dnf/ls 等指令訊息應該會是英文，桌面選單維持中文。"
