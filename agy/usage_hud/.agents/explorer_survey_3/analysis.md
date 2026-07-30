# Explorer 3 Detailed Survey Analysis Report: Documentation, settings.json Integration & User Workflows

## 1. Executive Summary

本報告針對 AGY Pure-ASCII Usage Statusline 專案 (`/home/ivan/project/script-docs/agy/usage_hud`) 之使用者手冊 (`USER_GUIDE.md`)、疑難排解手冊 (`TROUBLESHOOTING.md`)、`settings.json` 整合機制與一鍵驗證流程進行完整需求調查與規格擬定。

Statusline 腳本 (`statusline_hud.py`) 是一個基於管道 (`stdin`) 的純 ASCII 狀態列攔截器，專為 Antigravity CLI (`agy`) 設計。為了確保使用者體驗良好、安裝設定流暢且在遭遇問題時能快速排查，本調查確立了繁體中文技術文件的完整架構與內容規範。

---

## 2. Existing System Inspection Findings

### 2.1 現有檔案資產盤點 (Asset Inventory)
1. **`README.md`**:
   - 目前內容極為精簡 (50 行)，包含專案規格說明、簡要啟用步驟 (/statusline 與 settings.json)、檔案結構。
   - 缺點: 未涵蓋完整參數說明、極限邊界行為、進階測試、異常診斷與詳細設定指導。
2. **`setup.sh`**:
   - 30 行 Shell 腳本，目前執行 `chmod +x statusline_hud.py` 並調用 `test_statusline.py` 執行測試，最後輸出 console 指導。
   - 可作為一鍵驗證與安裝的入口點。
3. **`statusline_hud.py`**:
   - 主狀態列腳本 (192 行)，從 stdin 讀取 JSON 載荷。
   - 解析 5h 與 Weekly 配額使用率 (支援 `used_percent` 與 `remaining_fraction`) 與倒數時間 (`reset_in_seconds`, `reset_in`)，支援多元 Key 匹配 (`rolling_5h`, `5h`, `weekly`, `week` 等)。
   - 燈號門檻: 綠色 (`<70%`)、黃色 (`70%~90%`)、紅色 (`>=90%`)。
   - 輸出 100% Pure ASCII 進度條 `[===.....]` 及當前模型名稱 (`active_model`)。
   - 空值或 JSON 解析失敗時，自動降級為 fallback 安全輸出 `5h: [........] --% | Wk: [........] --%`。
4. **`test_statusline.py`**:
   - 自主驗證測試套件 (143 行)，包含 6 個測試案例，覆蓋標準用量、黃/紅警示、舊版欄位、異常 JSON、倒數 0 秒與純 ASCII 字元檢驗 (`verify_ascii`)。

---

## 3. Traditional Chinese User Manual Requirements (`USER_GUIDE.md`)

`USER_GUIDE.md` 必須採用結構清晰、專業且易讀的繁體中文編寫，包含以下六大核心章節：

### 章節一：系統簡介與核心特點 (Overview & Features)
- **定位**: 專為 Antigravity CLI (`agy`) TUI 設計之即時配額狀態列。
- **特點**:
  1. **100% 純 ASCII (Zero Unicode/Emoji)**: 避免終端字型缺失導致字符重疊或亂碼。
  2. **零背景資源消耗 (Zero Daemon)**: 無背景服務、無 HTTP 請求，隨 TUI prompt 觸發即時計算。
  3. **雙時區配額監控**: 同時監控 5 小時滾動視窗 (5h Rolling Window) 與每週配額 (Weekly Quota)。
  4. **三段式 ANSI 警示色彩**: 綠色 (正常)、黃色 (警示)、紅色 (危險)。

### 章節二：前置環境與相容性需求 (Prerequisites)
- **作業系統**: Linux / macOS / WSL (POSIX 終端環境)。
- **Python 版本**: Python 3.8+ (僅依賴標準庫 `sys`, `json`, `re`，無須 `pip install` 任何套件)。
- **CLI 需求**: Antigravity CLI (`agy`) 版本支援 `/statusline` 或 `settings.json` 配置。

### 章節三：安裝與一鍵快速部署 (Installation Guide)
- **自動安裝 (推薦)**:
  ```bash
  cd /home/ivan/project/script-docs/agy/usage_hud
  ./setup.sh
  ```
- **手動安裝**:
  ```bash
  chmod +x /home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py
  ```

### 章節四：TUI 動態套用與 settings.json 持久化設定 (Configuration Guide)
- **方式 A：TUI 會話隨切隨用 (即時動態生效)**
  在 `agy` TUI 終端內輸入：
  ```bash
  /statusline /home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py
  ```
  *備註：此方式僅對當前 session 生效。*

- **方式 B：`settings.json` 持久化設定 (永久生效)**
  編輯 `~/.gemini/antigravity-cli/settings.json`：
  ```json
  {
    "statusLine": {
      "type": "command",
      "command": "/home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py"
    }
  }
  ```
  *重點規範：`command` 必須填寫絕對路徑 (Absolute Path)，確保 CLI 在不同工作目錄下皆能正確執行。*

### 章節五：狀態列輸出解讀與規格 (Display Specification)
- **標準輸出樣式**:
  `5h: [===.....] 35.0% (1h30m) | Wk: [====....] 50.0% (2d00h) | gemini-3.6-flash`
- **欄位說明**:
  - `5h`: 5 小時滾動視窗配額使用率與進度條。
  - `Wk`: 每週配額使用率與進度條。
  - `(1h30m)`: 重置時間倒數 (格式: `Xm`, `XhYYm`, `XdYYh`)。
  - `gemini-3.6-flash`: 當前使用之 AI 模型名稱 (`active_model`)。
- **色彩對照表**:
  - `< 70.0%`: 綠色 (`\033[1;32m`)
  - `70.0% ~ 89.9%`: 黃色 (`\033[1;33m`)
  - `>= 90.0%`: 紅色 (`\033[1;31m`)

### 章節六：一鍵驗證與測試步驟 (Verification Steps)
- 步驟 1: 執行 `./setup.sh` 進行自動化驗證。
- 步驟 2: 管道測試指令驗證輸出格調。
- 步驟 3: 純 ASCII 驗證檢測。

---

## 4. Traditional Chinese Troubleshooting Manual Requirements (`TROUBLESHOOTING.md`)

`TROUBLESHOOTING.md` 旨在解決安裝、設定、執行與資料載荷極端異常狀況，包含四大章節：

### 章節一：快速診斷樹 (Diagnostic Flowchart)
1. 終端機狀態列未顯示？ -> 檢查權限與絕對路徑。
2. `settings.json` 修改後未生效？ -> 檢查 JSON 語法與檔名結構。
3. 顯示轉義碼 `\033[1;32m` 亂碼？ -> 檢查 TERM 環境變數與 Terminal ANSI 支援。
4. 狀態列顯示 `--%` 降級輸出？ -> 檢查 `agy` 傳入之 `stdin` JSON 內容。

### 章節二：常見問題排查矩陣 (Troubleshooting Matrix)

| 問題現象 (Issue) | 可能原因 (Possible Causes) | 解決方案 (Solutions) |
|---|---|---|
| 1. 狀態列無顯示 / Permission Denied | 腳本未設置可執行權限 | 執行 `chmod +x statusline_hud.py` |
| 2. `settings.json` 配置無效 | 使用相對路徑或 JSON 格式錯誤 | 1. 使用 `realpath statusline_hud.py`<br>2. 用 `python3 -m json.tool` 驗證 JSON |
| 3. Key 大小寫寫錯 | 寫成 `statusline` 而非 `statusLine` | 修正為 `"statusLine"` (CamelCase) |
| 4. ANSI 色彩亂碼 | 終端不支援 ANSI 8-color | 設定 `export TERM=xterm-256color` |
| 5. 配額全為 `--%` | `stdin` 為空或 JSON key 變更 | 使用 Raw JSON Log 腳本擷取分析 |
| 6. 重置時間顯示負數 | 伺服器時間漂移 | 腳本內部自動收斂為 `0m` |
| 7. 超長模型名稱擠壓狀態列 | 模型名稱超過 20 字元 | 自動截斷並補 `...` |

### 章節三：Raw JSON 載荷擷取與排查技巧 (Raw Payload Debugging)
編寫除錯 Shell 腳本 `debug_interceptor.sh`:
```bash
#!/usr/bin/env bash
LOG_FILE="/tmp/agy_statusline_payload.log"
cat - | tee "$LOG_FILE" | python3 /home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py
```

### 章節四：單元測試與迴歸測試指引 (Testing & Maintenance)
- 如何新增測試案例至 `test_statusline.py`。
- 如何在 CI/CD 或改版時執行完整邊界測試。

---

## 5. settings.json Integration Requirements & One-Click Verification Plan

### 5.1 `settings.json` Integration Requirements
1. **目標路徑**: `~/.gemini/antigravity-cli/settings.json`
2. **完整配置規格**:
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "/home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py"
     }
   }
   ```
3. **驗證與防錯機制**:
   - `command` 必須為 `statusline_hud.py` 之絕對路徑。
   - `settings.json` 必須保持為嚴格合法的 JSON 格式。

### 5.2 一鍵驗證步驟 (One-Click Verification Steps)
1. **一鍵腳本驗證**:
   ```bash
   ./setup.sh
   ```
2. **Pipe 管道輸入驗證**:
   ```bash
   echo '{"active_model":"gemini-3.6-flash","quota":{"rolling_5h":{"used_percent":35.0,"reset_in_seconds":5400},"weekly":{"used_percent":50.0,"reset_in_seconds":172800}}}' | python3 statusline_hud.py
   ```
3. **純 ASCII 驗證 (Zero Non-ASCII Check)**:
   ```bash
   echo '{"quota":{"5h":{"used_percent":42.0}}}' | python3 statusline_hud.py | LC_ALL=C grep -P "[\x80-\xFF]" && echo "FAIL" || echo "PASS"
   ```
4. **`settings.json` 語法驗證**:
   ```bash
   python3 -c "import json, os; p=os.path.expanduser('~/.gemini/antigravity-cli/settings.json'); json.load(open(p)) if os.path.exists(p) else print('Config not created yet')"
   ```

---

## 6. Conclusion & Recommendations for Implementer

1. **文件創建規格**:
   - 建立高質量的繁體中文 `USER_GUIDE.md` 與 `TROUBLESHOOTING.md`。
   - 更新 `README.md`，將其作為項目導覽與快速入口，引導使用者至 `USER_GUIDE.md` 與 `TROUBLESHOOTING.md`。
2. **settings.json 範例**:
   - 在 `USER_GUIDE.md` 與 `setup.sh` 中清晰提供備用複製與一鍵設定片段。
3. **一鍵驗證整合**:
   - 擴充 `setup.sh`，使其在測試通過後可選擇性幫使用者檢查/設定 `settings.json` 或提供一鍵測試指令。
