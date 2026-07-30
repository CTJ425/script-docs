# AGY Pure-ASCII Usage Statusline 使用者指南 (USER_GUIDE)

本手冊提供 Antigravity CLI (`agy`) 之純 ASCII 狀態列攔截器 (`statusline_hud.py`) 的完整使用指南，涵蓋系統架構、前置需求、部署流程、`settings.json` 持久化配置、輸出格式解讀及自動化驗證步驟。

---

## 第一章：系統簡介 (System Overview & Features)

`statusline_hud.py` 是一個專為 Antigravity CLI (`agy`) TUI 設計的輕量級 Pure-ASCII 狀態列攔截器。透過標準輸入 (`stdin`) 接收 JSON 格式的配額載荷，並於終端輸出即時、視覺化且具 ANSI 色彩標示的用量狀態列。

### 核心功能特點

1. **100% 純 ASCII (Zero Unicode / Emoji Compliance)**
   所有輸出字元（不包含 ANSI 顏色控制碼 `\033[...]`）皆嚴格限定在 ASCII 字元集內 (`ord(c) < 128`)。避免在缺少特殊字型或英數字寬度不一的終端環境中發生字元錯位、重疊或亂碼問題。
2. **零背景服務消耗 (Zero Daemon Architecture)**
   非背景 Daemon 服務，無背景常駐程序、無網路 HTTP 請求。僅在 agy CLI TUI 觸發狀態列更新時被動透過管道處理， CPU 與記憶體消耗幾乎為零。
3. **雙時間視窗雙軌監控 (Dual Window Quota Tracking)**
   同時追蹤 **5 小時滾動視窗 (5h Rolling Window)** 與 **每週配額 (Weekly Quota)**，即時掌握近期使用爆發度與長週期用量剩餘狀況。
4. **三段式 ANSI 警示色彩 (3-Tier ANSI Alert Indicators)**
   依據使用百分比自動顯示三段動態色彩：
   - 綠色 (`< 70.0%`)：用量正常。
   - 黃色 (`70.0% ~ 89.9%`)：使用率較高，提示注意。
   - 紅色 (`>= 90.0%`)：用量即將耗盡，發出高風險警告。
5. **模型名稱自動裁切與安全清理 (Model Truncation & Sanitization)**
   自動過濾模型名稱中的非 ASCII 字元，並嚴格裁切至最多 20 個字元，防止模型名稱過長導致 TUI 狀態列換行擠壓。
6. **全方位的安全降級機制 (Fault-Tolerant Fallback)**
   面對空管道 (`EOF`)、非標準或損毀之 JSON 載荷、異常資料型別時，腳本不會崩潰或拋出未捕獲異常，而是自動降級輸出保底狀態列 `5h: [........] --% | Wk: [........] --%`。

---

## 第二章：前置需求 (Prerequisites)

在安裝與設定 `statusline_hud.py` 之前，請確認您的執行環境滿足以下條件：

| 項目 | 需求規格 | 說明 |
|---|---|---|
| **作業系統** | Linux / macOS / WSL (POSIX 終端) | 需支援標準 POSIX shell 與 ANSI 轉義碼 |
| **Python 版本** | Python 3.6+ (推薦 Python 3.8+) | 僅使用標準庫 (`sys`, `json`, `re`, `math`)，無需 `pip` 安裝任何第三方套件 |
| **CLI 工具** | Antigravity CLI (`agy`) | 支援 `/statusline` 命令或 `settings.json` 設定 |
| **終端色彩** | ANSI 8-color / 256-color 支持 | 建議設定 `export TERM=xterm-256color` 以獲得的最佳色彩效果 |

---

## 第三章：一鍵部署 (One-Click Deployment)

本專案支援外掛安裝指令 `agy plugin install`，以及透過 Raw 網址一鍵下載部署。

### 方式一：`agy plugin install` 外掛安裝 (推薦)

在終端執行以下指令直接安裝：

```bash
agy plugin install https://github.com/CTJ425/script-docs.git
```

### 方式二：Raw 網址一鍵下載與設定

無需預先 Git Clone，直接透過 GitHub Raw 網址下載並置於 `~/.gemini/antigravity-cli/` 目錄：

```bash
mkdir -p ~/.gemini/antigravity-cli
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/agy/usage_hud/statusline_hud.py -o ~/.gemini/antigravity-cli/statusline_hud.py
chmod +x ~/.gemini/antigravity-cli/statusline_hud.py
```

### 方式三：專案內部自動化部署 (setup.sh)

若已 Clone 專案至本地，可執行專案內附之 `./setup.sh`：

```bash
cd /home/ivan/project/script-docs/agy/usage_hud
./setup.sh
```

`setup.sh` 執行流程包括：
1. 為 `statusline_hud.py` 自動添加可執行權限 (`chmod +x statusline_hud.py`)。
2. 自動執行 `test_statusline.py` 完整測試套件 (涵蓋 18 個邊界與防護測試案例)。
3. 印出設定說明與配置指引。

---

## 第四章：TUI 動態套用與 settings.json 持久化設定 (Configuration)

您可以使用兩種方式在 `agy` 中套用純 ASCII 狀態列：

### 方式 A：TUI 會話隨切隨用 (即時動態生效)

在 `agy` CLI TUI 會話介面中，直接輸入以下 slash 命令：

```text
/statusline /home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py
```

- **適用場景**：臨時測試、開發偵錯或單次 session 快速驗證。
- **生效範圍**：僅對當前開啟的 agy TUI 會話生效，關閉終端後即失效。

### 方式 B：`settings.json` 持久化設定 (永久生效)

若要讓狀態列在所有 agy 啟動時自動生效，需修改配置檔案 `~/.gemini/antigravity-cli/settings.json`。

1. 開啟或建立配置檔案 `~/.gemini/antigravity-cli/settings.json`。
2. 新增或更新 `"statusLine"` 設定項：

```json
{
  "statusLine": {
    "type": "command",
    "command": "/home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py"
  }
}
```

> ⚠️ **重要絕對路徑規範 (Absolute Path Rule)**：
> `"command"` 欄位 **必須** 填寫 `statusline_hud.py` 的完整絕對路徑 (`/home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py`)。
> 請勿使用相對路徑 (如 `./statusline_hud.py`) 或波浪號路徑 (如 `~/...`)，否則在不同工作目錄下啟動 agy 時，CLI 將無法定位與執行腳本。

---

## 第五章：狀態列輸出與色彩解讀 (Display Specification)

### 1. 標準輸出視覺結構 (Visual Layout)

狀態列格式範例：

```text
5h: [===.....] 35.0% (1h30m) | Wk: [====....] 50.0% (2d00h) | gemini-3.6-flash
```

各分段區域說明：

```text
 5h: [===.....] 35.0% (1h30m) | Wk: [====....] 50.0% (2d00h) | gemini-3.6-flash
|--| |--------| |---| |-----| | |--| |--------| |---| |-----| | |----------------|
 (1)    (2)      (3)    (4)   (5)(6)    (7)      (8)    (9)  (5)       (10)
```

1. **`5h:`**：5 小時滾動視窗配額標示。
2. **`[===.....]`**：5h 8 格純 ASCII 進度條（`=` 代表已使用量，`.` 代表剩餘容量）。
3. **`35.0%`**：5h 用量百分比（以顏色標示用量等級，精確至小數點後 1 位）。
4. **`(1h30m)`**：5h 重置倒數時間。
5. **`|`**：區域分隔符號 (Dim 暗色顯示)。
6. **`Wk:`**：每週配額 (Weekly Quota) 標示。
7. **`[====....]`**：Weekly 8 格純 ASCII 進度條。
8. **`50.0%`**：Weekly 用量百分比。
9. **`(2d00h)`**：Weekly 重置倒數時間。
10. **`gemini-3.6-flash`**：當前使用之 AI 模型名稱（青色 Cyan 標示，上限 20 字元）。

### 2. 重置倒數時間格式化規範

重置時間傳入秒數後自動轉譯為 ASCII 簡短格式：
- `seconds <= 0` 顯示 `0m`
- `days > 0` 顯示 `XdYYh` (如 `2d04h`)
- `hours > 0` 顯示 `XhYYm` (如 `1h30m`)
- `minutes` 顯示 `Xm` (如 `45m`)

### 3. ANSI 三段式警示色彩燈號對照表

| 百分比區間 (Quota Usage) | 燈號顏色 | ANSI 控制碼 | 狀態含意 |
|---|---|---|---|
| **0.0% ~ 69.9%** | 🟢 綠色 (Green) | `\033[1;32m` | 容量充足，使用正常 |
| **70.0% ~ 89.9%** | 🟡 黃色 (Yellow) | `\033[1;33m` | 使用率偏高，請留意剩餘額度 |
| **90.0% ~ 100.0%** | 🔴 紅色 (Red) | `\033[1;31m` | 額度即將耗盡 / 已耗盡，高風險警告 |

### 4. 降級備用輸出 (Fallback Layout)

當接收到空輸入、非 JSON 語法或非字典 (Non-Dict) 載荷時，輸出降級格式：

```text
5h: [........] --% | Wk: [........] --%
```

---

## 第六章：一鍵驗證與測試步驟 (Verification Steps)

完成安裝配置後，可透過以下步驟驗證狀態列的功能與合規性：

### 步驟一：執行全套邊界自動化單元測試

執行內建單元測試套件，確認 18 個邊界測試全數通過 (PASS)：

```bash
python3 /home/ivan/project/script-docs/agy/usage_hud/test_statusline.py
```

預期結果：印出 `📊 SUMMARY: Total: 18 | Passed: 18 | Failed: 0` 並返回 Exit Code `0`。

### 步驟二：管道 Pipe 手動載荷模擬測試

模擬 agy CLI 傳送標準 JSON 載荷給狀態列：

```bash
echo '{"active_model":"gemini-3.6-flash","quota":{"rolling_5h":{"used_percent":35.0,"reset_in_seconds":5400},"weekly":{"used_percent":50.0,"reset_in_seconds":172800}}}' | python3 /home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py
```

預期輸出：
`5h: [===.....] 35.0% (1h30m) | Wk: [====....] 50.0% (2d00h) | gemini-3.6-flash` (附帶 ANSI 色彩)。

### 步驟三：純 ASCII 字符合規性驗證

利用 `grep` 檢查輸出字元是否含有非 ASCII 字元 (`ord >= 128`)：

```bash
echo '{"quota":{"5h":{"used_percent":42.0}}}' | python3 /home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py | LC_ALL=C grep -P "[\x80-\xFF]" && echo "FAIL: Non-ASCII detected" || echo "PASS: 100% Pure ASCII Verified"
```

預期結果：印出 `PASS: 100% Pure ASCII Verified`。

### 步驟四：`settings.json` 配置正確性驗證

確認 `settings.json` 語法無誤且路徑正確：

```bash
python3 -c "import json, os; p=os.path.expanduser('~/.gemini/antigravity-cli/settings.json'); data=json.load(open(p)); print('Config valid:', data.get('statusLine', {}))"
```

預期結果：印出 `Config valid: {'type': 'command', 'command': '/home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py'}`。
