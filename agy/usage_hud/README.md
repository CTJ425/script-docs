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
  - 附帶 [test_statusline.py](./test_statusline.py) 自動化審查與純 ASCII 驗證測試。
- **資料缺漏時顯示 `--%` 而非 `0.0%`**：
  - payload 沒帶到某個視窗的用量時，該段顯示灰色 `[........] --%`，不會偽裝成「幾乎沒用量」。

---

## 🚀 啟用步驟

### 方式一：直接透過 `agy plugin install` 安裝 (推薦)

在終端執行外掛安裝指令：
```bash
agy plugin install https://github.com/CTJ425/script-docs.git
```

### 方式二：一行指令安裝 (推薦 / 無需預先 Clone)

`setup.sh` 會下載腳本到 `~/.gemini/antigravity-cli/`，並自動把 `statusLine` **合併**寫入該目錄的 `settings.json`（既有設定會保留，並先備份成 `settings.json.bak.<timestamp>`）：

```bash
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/agy/usage_hud/setup.sh | bash
```

可用環境變數調整：`AGY_HUD_DIR`（安裝目錄）、`AGY_HUD_RAW_BASE`（下載來源，供 fork 使用）。

> [!IMPORTANT]
> `settings.json` 的 `command` 必須是**絕對路徑**——Antigravity CLI 不會展開 `~`。
> `setup.sh` 會自動寫入展開後的絕對路徑，手動設定時請自行用 `realpath` 取得。

### 方式三：本地 Clone 專案套用

從 clone 出來的目錄直接執行同一支腳本（會額外跑一次測試套件）：

```bash
./setup.sh
```

或在 `agy` TUI 終端內臨時套用（`$(pwd)` 會展開成絕對路徑）：

```bash
/statusline $(pwd)/statusline_hud.py
```

---

## 📁 檔案結構

- [statusline_hud.py](./statusline_hud.py): 純 ASCII 狀態列主腳本。
- [test_statusline.py](./test_statusline.py): 自動化審查與 100% ASCII 驗證測試套件。
- [setup.sh](./setup.sh): 一鍵安裝腳本（下載 + 合併寫入 `settings.json`，clone 執行時另跑測試）。
