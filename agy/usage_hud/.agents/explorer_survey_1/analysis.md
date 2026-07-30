# AGY Pure-ASCII Usage Statusline 深度調查分析報告 (Survey & Analysis Report)

## 1. 執行摘要 (Executive Summary)

本報告針對 AGY Pure-ASCII Usage Statusline 專案進行全方位的程式碼結構、數據流、ASCII 渲染邏輯、異常容錯機制與需求對齊調查。
本專案為 Antigravity CLI (`agy`) TUI 設計之純 ASCII 狀態列攔截腳本，旨在透過 stdin 讀取 CLI 傳入之 JSON 配額資料，即時顯示 5 小時滾動視窗 (5h) 與每週 (Weekly) 之 AI 配額使用率與重置倒數時間。

經深入靜態程式碼分析與邊界條件檢查，目前系統整體架構簡潔、無外部套件相依，但在極限邊界情境（如超長模型名稱截斷、非 ASCII 字元剝離、NaN/Inf 浮點數例外處理）仍存在缺陷，需進一步強化與建立完整驗證測試及繁體中文說明文件。

---

## 2. 專案檔案結構與清單 (File Inventory)

專案根目錄路徑：`/home/ivan/project/script-docs/agy/usage_hud`

| 檔案路徑 | 檔案類型 | 大小/行數 | 核心職責說明 |
| --- | --- | --- | --- |
| `statusline_hud.py` | Python 3 腳本 | 192 行 (5537 bytes) | 狀態列核心攔截與 ASCII 渲染腳本，從 stdin 讀取 JSON 並輸出狀態列 |
| `test_statusline.py` | Python 3 測試套件 | 143 行 (5068 bytes) | 自動化測試腳本，驗證 basic test cases 與 ASCII 純度 |
| `setup.sh` | Bash 腳本 | 30 行 (1086 bytes) | 部署與權限設定腳本 (`chmod +x`)，兼顯示 CLI 設定指引 |
| `README.md` | Markdown 文件 | 50 行 (1743 bytes) | 專案基本說明與快速啟用指引 |
| `.agents/ORIGINAL_REQUEST.md` | 需求規格文件 | 35 行 (1565 bytes) | 原始任務需求說明書 |

---

## 3. `statusline_hud.py` 架構與數據流分析 (Architecture & Data Flow)

### 3.1 數據流 (Data Flow)

```
                 AGY CLI TUI Trigger
                        │
                        ▼ (stdin: JSON payload string)
               +─────────────────+
               |  sys.stdin.read |
               +─────────────────+
                        │
         ┌──────────────┴──────────────┐
         ▼ (Empty/Invalid)             ▼ (Valid JSON)
+──────────────────────+    +─────────────────────+
| Fallback Statusline  |    |     json.loads      |
| [........] --%       |    +─────────────────────+
+──────────────────────+               │
                                       ▼
                            +─────────────────────+
                            |  render_statusline  |
                            +─────────────────────+
                                       │
                     ┌─────────────────┼─────────────────┐
                     ▼                 ▼                 ▼
          +──────────────────+ +───────────────+ +───────────────+
          | parse_quota_data | | model_name    | | Non-ASCII     |
          +──────────────────+ | truncation    | | sanitization  |
                     │         +───────────────+ +───────────────+
           ┌─────────┴─────────┐
           ▼                   ▼
     (5h Quota)         (Weekly Quota)
           │                   │
      ┌────┴────┐         ┌────┴────┐
      ▼         ▼         ▼         ▼
  Progress  Duration  Progress  Duration
    Bar     Format      Bar     Format
      │         │         │         │
      └────┬────┘         └────┬────┘
           │                   │
           ▼                   ▼
    Color Coding        Color Coding
           │                   │
           └─────────┬─────────┘
                     │
                     ▼
             Assembled Output Line
                     │
                     ▼
             stdout (print)
```

### 3.2 核心函數職責與實作解析 (Functions Breakdown)

1. **`format_duration(seconds: float) -> str`** (Lines 21-43)
   - **功能**：將重置剩餘秒數轉換為 ASCII 時間字串（如 `2h10m`、`3d04h` 或 `0m`）。
   - **現有邏輯**：
     - 若 `seconds is None` 或轉換失敗，傳回 `"--"`。
     - 若 `total_seconds <= 0`，傳回 `"0m"`。
     - 按 `86400`（天）、`3600`（小時）、`60`（分鐘）換算。
   - **潛在問題**：
     - 當 `seconds` 為 `float('inf')` 或極大值時，`int(seconds)` 會拋出 `OverflowError`，目前 `except (ValueError, TypeError)` 未捕獲 `OverflowError`！

2. **`make_ascii_progress_bar(percent: float, length: int = 8) -> str`** (Lines 45-56)
   - **功能**：產生 8 字元寬度的 ASCII 進度條，使用 `=` 代表已用量，`.` 代表剩餘量（例如 `[====....]`）。
   - **現有邏輯**：
     - 夾擠 (Clamp) 數值至 `[0.0, 100.0]`。
     - 計算填充長度 `int(round((clamped / 100.0) * length))`。
   - **潛在問題**：
     - 當 `percent` 為 `float('nan')` 時，`float('nan')` 成功傳回 `nan`，`clamped` 變為 `nan`；隨後 `round(nan)` 會引發 `ValueError: cannot convert float NaN to integer`。因 `try...except` 僅包裹在 `clamped` 宣告外，未包裹 `round()`，導致崩潰！

3. **`get_color_code(percent: float) -> str`** (Lines 58-71)
   - **功能**：依使用率門檻回傳 ANSI 色彩 Esc Code。
   - **色彩規則**：
     - `>= 90.0%`：紅色 (`\033[1;31m`)
     - `>= 70.0%`：黃色 (`\033[1;33m`)
     - `< 70.0%`：綠色 (`\033[1;32m`)

4. **`extract_quota_item(quota_dict: dict, possible_keys: list)`** (Lines 73-91)
   - **功能**：從 JSON 結構中彈性尋找匹配之配額項目字典。
   - **相容性支援**：
     - 5h 鍵名：`["rolling_5h", "5h", "rolling5h", "five_hour", "5_hour"]`
     - Weekly 鍵名：`["weekly", "week", "7d", "seven_days"]`
   - **層級搜尋**：支援第一層與第二層巢狀字典搜尋。

5. **`parse_quota_data(data: dict)`** (Lines 93-136)
   - **功能**：解析 `5h` 與 `weekly` 配額數據。
   - **欄位相容**：支援 `used_percent` 直接讀取，或從 `remaining_fraction` 倒推 `(1.0 - rem_frac) * 100.0`。

6. **`render_statusline(data: dict) -> str`** (Lines 139-171)
   - **功能**：將解析後數據格式化拼接為單行純 ASCII 狀態列。
   - **輸出格式範例**：
     `5h: \033[1;32m[===.....] 35.0%\033[0m \033[2m(1h30m)\033[0m \033[2m|\033[0m Wk: \033[1;32m[====....] 50.0%\033[0m \033[2m(2d00h)\033[0m \033[2m|\033[0m \033[1;36mgemini-3.6-flash\033[0m`
   - **潛在問題**：
     - 未對 `active_model`（或 `model`）長度進行限制，若模型名稱過長（如 50+ 字元）會破壞狀態列版面。
     - 未對 `active_model` 進行 ASCII 字符過濾，若傳入包含 Emoji 或全形中文的模型名稱，會破壞 100% 純 ASCII 規格要求。

7. **`main()`** (Lines 174-191)
   - **功能**：stdin 讀取入口與全域 Exception Fallback 機制。
   - **Fallback 輸出**：
     `5h: \033[2m[........] --%\033[0m \033[2m|\033[0m Wk: \033[2m[........] --%\033[0m`

---

## 4. 需求與缺口對照矩陣 (Requirements & Gap Analysis)

依據 `.agents/ORIGINAL_REQUEST.md` 規範，對照現有程式碼狀態如下：

| 需求編號 | 需求名稱 | 詳細規範要求 | 現況評估 (Current Status) | 缺口與補強方向 (Gap Analysis) |
| --- | --- | --- | --- | --- |
| **R1** | **自動化驗證與極限邊界測試** | 擴充測試套件，涵蓋超長 AI 模型名稱截斷、負數與異常重置時間、損毀/無效 JSON 載荷容錯、純 ASCII 色彩剝離驗證。 | `test_statusline.py` 僅 6 個基礎測試，欠缺超長模型名稱、Unicode 剝離、NaN 浮點數等極限測試。 | 需新增極限邊界測試案例 (如超長名稱、非 ASCII 字元輸入、NaN/Inf 數值、非字串型態 Payload)。 |
| **R2** | **邊界缺陷修復與穩健性強化** | `statusline_hud.py` 在極端情況下保持 100% 安定，無 Crash、無 Non-ASCII 字元溢出。 | 1. 無長度截斷邏輯；<br>2. 無非 ASCII 字元剝離；<br>3. `round(nan)` 與 `int(inf)` 有拋出未捕獲 Exception 風險。 | 1. 增加 `active_model` 長度截斷 (例如限制最大 20 字元，超過補 `...`)；<br>2. 增加 `active_model` 與字串欄位 ASCII 過濾器；<br>3. 擴充 `format_duration` 與 `make_ascii_progress_bar` 異常捕獲 (`OverflowError`, `isnan`)。 |
| **R3** | **使用者手冊與疑難排解文件** | 撰寫繁體中文手冊：<br>1. `USER_GUIDE.md` (安裝, `settings.json` 整合, TUI 開關)；<br>2. `TROUBLESHOOTING.md` (疑難排解與常見問題)。 | 專案目錄下尚無 `USER_GUIDE.md` 與 `TROUBLESHOOTING.md`。 | 撰寫高品質繁體中文 `USER_GUIDE.md` 與 `TROUBLESHOOTING.md`，提供完整設定檔範例與除錯步驟。 |

---

## 5. 邊界漏洞與修復建議規格 (Vulnerability & Fix Specifications)

### 5.1 超長 AI 模型名稱截斷 (Model Name Truncation)
- **問題描述**：若 `active_model` 為 `gemini-3.6-pro-preview-experimental-2026-very-long-name`，狀態列字串會被無限制拉長。
- **建議修復**：
  ```python
  MAX_MODEL_LEN = 20
  if len(model_name) > MAX_MODEL_LEN:
      model_name = model_name[:MAX_MODEL_LEN - 3] + "..."
  ```

### 5.2 純 ASCII 字元剝離 (Non-ASCII Stripping)
- **問題描述**：若 `active_model` 包含非 ASCII 字元（如 Emoji 或中文 `claude-3-🚀-flash`），原樣輸出會破壞純 ASCII 規格。
- **建議修復**：
  ```python
  # 僅保留 ASCII printable 字元 (ord 32 到 126)
  model_name = "".join(c for c in model_name if 32 <= ord(c) <= 126)
  ```

### 5.3 浮點數 NaN 與 Inf 異常保護 (NaN / Inf Floating Protection)
- **問題描述**：`math.isnan` / `math.isinf` 或 `round(nan)` 引發 `ValueError`，`int(inf)` 引發 `OverflowError`。
- **建議修復**：
  ```python
  # 在 format_duration 與 make_ascii_progress_bar 中捕獲 (ValueError, TypeError, OverflowError)
  # 並對 float('nan') 進行預先篩選：
  if isinstance(percent, float) and (math.isnan(percent) or math.isinf(percent)):
      percent = 0.0
  ```

### 5.4 負數重置時間 (Negative Reset Seconds)
- **問題描述**：負數重置時間（如 `-500` 秒）目前回傳 `"0m"`。此行為符合預期，但應於測試套件中納入明確驗證。

---

## 6. 後續開發與實作指引 (Implementation Guidance for Implementer)

建議後續實作階段分為三個層面執行：

1. **`statusline_hud.py` 穩健性強化**：
   - 加入 ASCII 字符過濾函數 `sanitize_ascii(text: str) -> str`。
   - 加入模型名稱截斷邏輯 (`MAX_MODEL_LEN = 20`)。
   - 強化 `format_duration` 與 `make_ascii_progress_bar` 對 `OverflowError`、`NaN`、`Inf` 的防禦。

2. **`test_statusline.py` 測試套件擴充**：
   - 案例 7: 超長模型名稱自動截斷驗證。
   - 案例 8: 包含 Emoji 與中文非 ASCII 字元之過濾驗證。
   - 案例 9: JSON 含有 `NaN` / `Infinity` / 負數時間 / 極大秒數驗證。
   - 案例 10: `active_model` 為非字串型態 (如 dict, list, int) 之防護驗證。

3. **文件撰寫**：
   - 撰寫 `USER_GUIDE.md` (繁體中文)，包含安裝步驟、`settings.json` 設定範例、TUI 開關指令、ASCII 規格說明。
   - 撰寫 `TROUBLESHOOTING.md` (繁體中文)，包含常見問題、權限修正 (`chmod +x`)、路徑檢查、無顯示時之排查 SOP。

---
*報告完成時間：2026-07-30 | 撰寫者：Explorer 1*
