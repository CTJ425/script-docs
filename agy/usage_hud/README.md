# AGY Statusline Usage Indicator (Pure ASCII Version)

專為 **Antigravity CLI (`agy`)** TUI 設計的純 ASCII 狀態列，透過 `/statusline` 自訂腳本機制，實時監控 **5 小時滾動視窗 (5h)** 與 **每週 (Weekly)** 的 AI 配額使用率與重置倒數時間。

---

## 🌟 特點與規格

- **100% 純 ASCII 內容 (Zero Unicode/Emoji)**：
  - 相容所有終端字型與編碼環境，無亂碼問題。
  - 範例輸出：
    `5h: [===.....] 35.0% (1h30m) | Wk: [====....] 50.0% (2d00h) | gemini-3.6-flash`
- **無 HTTP / 無背景服務**：
  - 專注於 CLI 終端 Prompt 底欄顯示，零背景記憶體開銷與網路連接。
- **三段式 ANSI 警示色彩**：
  - 綠色 (`<70%`)、黃色 (`70%~90%`)、紅色 (`>=90%`)。
- **嚴格驗證**：
  - 附帶 [test_statusline.py](file:///home/ivan/project/script-docs/agy/usage_hud/test_statusline.py) 自動化審查與純 ASCII 驗證測試。

---

## 🚀 啟用步驟

### 方式一：直接透過 `agy plugin install` 安裝 (推薦)

在終端執行外掛安裝指令：
```bash
agy plugin install https://github.com/CTJ425/script-docs.git
```

### 方式二：一鍵下載與設定 (Raw 指令 / 無需預先 Clone)

透過 Raw 網址直接下載 `statusline_hud.py` 腳本並持久化至 `~/.gemini/antigravity-cli/settings.json`：

```bash
# 下載 statusline 腳本
mkdir -p ~/.gemini/antigravity-cli
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/agy/usage_hud/statusline_hud.py -o ~/.gemini/antigravity-cli/statusline_hud.py
chmod +x ~/.gemini/antigravity-cli/statusline_hud.py
```

於 `~/.gemini/antigravity-cli/settings.json` 中配置：
```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.gemini/antigravity-cli/statusline_hud.py"
  }
}
```

### 方式三：本地 Clone 專案套用

在 `agy` TUI 終端內輸入：
```bash
/statusline /home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py
```

寫入 `~/.gemini/antigravity-cli/settings.json` 持久化：
```json
{
  "statusLine": {
    "type": "command",
    "command": "/home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py"
  }
}
```

---

## 📁 檔案結構

- [statusline_hud.py](file:///home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py): 純 ASCII 狀態列主腳本。
- [test_statusline.py](file:///home/ivan/project/script-docs/agy/usage_hud/test_statusline.py): 自動化審查與 100% ASCII 驗證測試套件。
- [setup.sh](file:///home/ivan/project/script-docs/agy/usage_hud/setup.sh): 安裝與驗證腳本。
