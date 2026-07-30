# AGY Pure-ASCII Usage Statusline 測試基礎設施、邊界條件與穩健性分析報告

## 1. 執行摘要 (Executive Summary)

本報告由 **Explorer 2** 針對 AGY Pure-ASCII Usage Statusline 專案 (`/home/ivan/project/script-docs/agy/usage_hud`) 之測試基礎設施、現有測試套件、潛在邊界缺陷及穩健性需求進行深度檢驗與分析。

現有狀態列腳本 `statusline_hud.py` 與測試檔 `test_statusline.py` 已實現基本 5h/Weekly 雙重配額解析與純 ASCII 進度條輸出，但經由靜態程式碼審查與極限邊界分析，發現若干影響穩定性與合規性的潛在缺陷（包含：超長模型名稱未截斷、Unicode/Emoji 非 ASCII 字元洩漏風險、`float('inf')` 導致的 `OverflowError` 崩潰風險、`nan` 數值計算例外、非字典 JSON 載荷型態異常處理等）。

本報告提出了 12 項極限邊界測試案例需求矩陣，並提供相應的修復建議與驗證規範。

---

## 2. 現有測試基礎設施與運行機制分析

### 2.1 專案結構與測試載具
專案目錄結構如下：
- `statusline_hud.py`: 純 ASCII 狀態列核心解析與渲染腳本（192 行）。
- `test_statusline.py`: 自動化審查與純 ASCII 驗證測試套件（143 行）。
- `setup.sh`: 部署腳本，自動執行 `chmod +x` 並調用 `python3 test_statusline.py`。
- `README.md`: 說明文件。

### 2.2 現有測試套件 (`test_statusline.py`) 運作原理
1. **測試執行器 (`run_statusline_test`)**：
   使用 Python `subprocess.Popen` 開啟 `statusline_hud.py` 子行程，將 JSON 載荷字串經由 `stdin` 傳入，擷取 `stdout` 與 `stderr`。
2. **ASCII 合規驗證器 (`verify_ascii`)**：
   使用 ANSI Regex `re.compile(r'\x1b\[[0-9;]*m')` 剝離色彩與樣式 Escape Sequence 後，檢查剩餘字元之 Unicode Codepoint `ord(c)` 是否皆 `< 128`。
3. **現有 6 個測試案例覆蓋範圍**：
   - Case 1: 標準用量 (<70%，綠色燈號)
   - Case 2: 高用量 (70%~90%，黃色警示)
   - Case 3: 極高用量 (>=90%，紅色警告)
   - Case 4: 相容舊版欄位 (`remaining_fraction`, `5h`, `reset_in`)
   - Case 5: 空輸入 / 異常 JSON 語法 (`{invalid json syntax`)
   - Case 6: 倒數時間極短與 0 秒 / 負數秒數處理 (`0s`, `-500s`)

---

## 3. `statusline_hud.py` 原始碼深度靜態分析

針對 `statusline_hud.py` 的 7 個核心函式進行逐行邏輯檢驗：

### 3.1 `format_duration(seconds: float) -> str`
- **邏輯分析**：接收 `seconds`，試圖轉為 `int(seconds)`。若 `total_seconds <= 0` 返回 `"0m"`。
- **漏洞點 A：`OverflowError` 未捕捉**
  ```python
  try:
      total_seconds = int(seconds)
  except (ValueError, TypeError):
      return "--"
  ```
  當 `seconds` 為 `float('inf')` 或 `"inf"` 時，`int(float('inf'))` 會引發 `OverflowError: cannot convert float infinity to integer`。由於只捕捉了 `(ValueError, TypeError)`，此例外將導致程式 Crash。
- **漏洞點 B：浮點數格式字串重置時間解析失誤**
  若傳入字串 `"3600.5"`，`int("3600.5")` 會引發 `ValueError` 而返回 `"--"`，無法先經由 `float("3600.5")` 轉為 `3600`。

### 3.2 `make_ascii_progress_bar(percent: float, length: int = 8) -> str`
- **漏洞點：`float('nan')` 計算例外**
  ```python
  try:
      clamped = max(0.0, min(100.0, float(percent)))
  except (ValueError, TypeError):
      clamped = 0.0
  ```
  在 Python 中，`float('nan')` 不會觸發 `ValueError` 或 `TypeError`。`min(100.0, float('nan'))` 或 `max(...)` 的結果仍為 `nan`。後續執行 `int(round((nan / 100.0) * length))` 時，會爆出 `ValueError: cannot convert float NaN to integer`，且該行在 `try` 區塊之外，造成程式崩潰。

### 3.3 `parse_quota_data(data: dict)`
- **漏洞點：非字典 JSON 載荷 (`list`, `int`, `str`, `None`)**
  `parse_quota_data` 假設 `data` 為 `dict`，呼叫 `data.get("quota", {})`。若 `data` 為非 dict 物件（例如 JSON 傳入 `[1, 2, 3]` 或 `"string"`），在單元測試中直接呼叫 `parse_quota_data` 或 `render_statusline` 會引發 `AttributeError: 'list' object has no attribute 'get'`。

### 3.4 `render_statusline(data: dict) -> str`
- **漏洞點 A：超長 AI 模型名稱未截斷**
  ```python
  model_name = data.get("active_model", data.get("model", ""))
  if model_name:
      model_part = f" {COLOR_DIM}|{COLOR_RESET} {COLOR_CYAN}{model_name}{COLOR_RESET}"
  ```
  目前對 `model_name` 完全未限制長度。若傳入長達 100 字元的模型名稱（如 `gemini-3.6-pro-preview-long-identifier-v1-alpha-beta-gamma-extended`），將會直接輸出完整的超長字串，破壞終端狀態列排版。
- **漏洞點 B：Non-ASCII（Unicode / Emoji）字元溢出**
  若 `active_model` 或 JSON 中的文字包含 UTF-8 多位元組字元（例如 `"active_model": "gemini-⚡-pro"` 或 `"claude-中文版"`），`render_statusline` 會直接將其拼接輸出，違反 ORIGINAL_REQUEST 中 **100% Pure ASCII** 的硬性指標。
- **漏洞點 C：非字串型態之 `active_model`**
  若 `active_model` 為 dict 或 int（如 `"active_model": {"name": "test"}`），會輸出遺留的 `"{'name': 'test'}"` 格式，可能夾帶非 ASCII 字元。

---

## 4. 極限邊界與穩健性需求矩陣 (Edge Case & Robustness Matrix)

下表彙整本調查所發現之全數邊界情境、潛在風險、當前行為與預期修復規格：

| 編號 | 邊界測試情境 | 輸入範例 / 載荷 | 當前行為 | 潛在風險 | 預期修復規格 |
|---|---|---|---|---|---|
| **E1** | 超長 AI 模型名稱 | `"active_model": "gemini-3.6-pro-preview-very-long-model-name-abcdefghijklmnopqrstuvwxyz"` (65字元) | 原樣輸出長字串 | 破壞 TUI 狀態列排版 | 截斷至上限（如 20 字元），補上 `...`（例如 `gemini-3.6-pro-pr...`） |
| **E2** | 包含 Unicode/Emoji 之模型名稱 | `"active_model": "gemini-⚡-pro-中文"` | 原樣輸出 `gemini-⚡-pro-中文` | 違反 100% Pure ASCII 規範 | 過濾非 ASCII 字元 (`ord(c) < 128`)，僅保留 Safe ASCII |
| **E3** | 重置時間為浮點數字串 | `"reset_in_seconds": "5400.75"` | `int("5400.75")` 拋出 `ValueError`，降級為 `"--"` | 時間顯示不準確 | 容錯解析：先轉 `float` 再轉 `int`，正確顯示 `1h30m` |
| **E4** | 重置時間為負數 | `"reset_in_seconds": -3600` | 返回 `0m` | 無崩潰，但需規範 | 統一輸出 `0m`（或 `--`），不產生負數時間字串如 `-1h` |
| **E5** | 重置時間為非數值字串 | `"reset_in_seconds": "invalid_time"` | 返回 `--` | 無 | 容錯返回 `"--"` 或 `0m`，不 Crash |
| **E6** | 重置時間為 `float('inf')` 或極大值 | `"reset_in_seconds": 1e308` / `"inf"` | 拋出 `OverflowError`（**Crash**） | 終端程式死鎖/異常崩潰 | 捕捉 `OverflowError`，安全回退為 `"--"` |
| **E7** | 用量百分比為 `NaN` (Not a Number) | `"used_percent": "NaN"` 或 `NaN` | `make_ascii_progress_bar` 中 `int(round(nan))` 拋出 `ValueError`（**Crash**） | 狀態列崩潰 | `math.isnan()` 檢測，預設回退為 `0.0%` |
| **E8** | 用量百分比超出 `[0, 100]` | `"used_percent": 150.0` 或 `-20.0` | 進度條限制於 `[0, 8]`，但百分比印出 `150.0%` / `-20.0%` | 排版與數值不合理 | 數值限制（Clamp）於 `0.0% ~ 100.0%` |
| **E9** | 非字典型態 JSON 載荷 | `"[1, 2, 3]"` 或 `"123"` 或 `"null"` | `render_statusline` 存取 `.get()` 觸發 `AttributeError` | 單元測試直接呼叫時 Crash | 內部入口先檢驗 `isinstance(data, dict)` |
| **E10** | 純 ASCII 色彩剝離與排版驗證 | 任意有效/無效輸出 | `verify_ascii` 經 regex 剝離 ANSI | ANSI 剝離不乾淨洩漏 control code | 驗證 ANSI 剝離後 100% 為 pure ASCII (<128) 且無剩餘 escape 碼 |
| **E11** | 缺少全數 Quota 鍵值 | `{}` 或 `{"active_model": "test"}` | 正確顯示 `5h: [........] 0.0% (0m)` | 無 | 正確安全降級，輸出 0.0% 與 (0m) |
| **E12** | 損毀/半截 JSON Payload | `{"quota": {"rolling_5h":` | `main()` 捕獲 `json.loads` 例外並印出備用狀態列 | 無 | 輸出 fallback 狀態列 `5h: [........] --% \| Wk: [........] --%` |

---

## 5. 擴充自動化測試套件需求與規劃 (Test Requirements)

為達成 Acceptance Criteria 中 **"所有擴充邊界單元測試 100% 自動化通過"** 與 **"100% 保持純 ASCII 標準"**，建議將現有的 6 項測試擴充為至少 12~14 項自動化測試案例：

### 擴充測試案例清單 (Proposed Test Cases in `test_statusline.py`):

1. **TC-01: 標準低用量與綠色燈號 (Existing Case 1)**
   - 驗證 `<70%` 使用綠色 ANSI Code `\033[1;32m`，進度條 `[===.....]`。
2. **TC-02: 中高用量與黃色警示 (Existing Case 2)**
   - 驗證 `70%~90%` 使用黃色 ANSI Code `\033[1;33m`。
3. **TC-03: 極高用量與紅色警告 (Existing Case 3)**
   - 驗證 `>=90%` 使用紅色 ANSI Code `\033[1;31m`。
4. **TC-04: 舊版欄位別名相容 (Existing Case 4)**
   - 驗證 `remaining_fraction`, `5h`, `week`, `reset_in` 等多元欄位相容性。
5. **TC-05: 損毀與語法錯誤 JSON 載荷容錯 (Existing Case 5)**
   - 輸入 `{invalid json syntax`，驗證回退輸出 `5h: [........] --% | Wk: [........] --%`。
6. **TC-06: 倒數時間 0 秒與負數處理 (Existing Case 6 & Boundary)**
   - 輸入 `reset_in_seconds: -500` 與 `0`，驗證輸出為 `(0m)` 且無負號時間溢出。
7. **TC-07: 超長 AI 模型名稱截斷測試 (New Boundary)**
   - 輸入 `active_model: "gemini-3.6-pro-preview-extended-long-name-version-100"`（56 字元）。
   - 驗證輸出模型名稱截斷至預設上限（例如 <= 20 字元），且包含截斷標記 `...`。
8. **TC-08: Non-ASCII / Unicode / Emoji 字元剝離過濾 (New Boundary)**
   - 輸入 `active_model: "gemini-⚡-pro-中文-🤖"`。
   - 驗證輸出絕不包含任何非 ASCII 字元 (`ord(c) >= 128`)。
9. **TC-09: 浮點數重置時間與異常字元串解析 (New Boundary)**
   - 輸入 `"reset_in_seconds": "3600.5"` 或 `"7200"`。
   - 驗證能正確解析為 `1h00m` / `2h00m`。
10. **TC-10: 浮點數 Inf 與 NaN 極限值容錯 (New Boundary)**
    - 輸入 `"used_percent": "NaN"`, `"reset_in_seconds": "inf"`。
    - 驗證腳本穩定不崩潰，安全回退為預設值。
11. **TC-11: 超出範圍之用量百分比 Clamp 限制 (New Boundary)**
    - 輸入 `"used_percent": 150.0` 與 `-35.0`。
    - 驗證進度條與百分比數值均被限制在 `0.0% ~ 100.0%`。
12. **TC-12: 非字典型態 JSON 載荷 (New Boundary)**
    - 輸入 `"[1, 2, 3]"` 或 `"12345"` 或 `"null"`。
    - 驗證 `statusline_hud.py` 輸出 fallback 狀態列而不爆發 `AttributeError`。
13. **TC-13: 缺失欄位與空 JSON 物件 (New Boundary)**
    - 輸入 `{}`。
    - 驗證輸出預設空狀態 `5h: [........]  0.0% (0m) | Wk: [........]  0.0% (0m)`。
14. **TC-14: 色彩剝離後 ASCII 完全相容驗證 (New Boundary)**
    - 對所有測試案例之輸出進行 `verify_ascii`，確保 ANSI 剝離後全數 `ord(c) < 128`。

---

## 6. 後續實作與驗證建議 (Recommendations)

1. **`statusline_hud.py` 防禦性邏輯補強建議**：
   - 增加模型名稱截斷常數 `MAX_MODEL_LEN = 20`。
   - 增加 ASCII 淨化函式 `sanitize_ascii(text: str) -> str`，使用 `"".join(c for c in text if ord(c) < 128)` 過濾非 ASCII 字元。
   - 在 `parse_quota_data` 與 `format_duration` 中加入 `OverflowError` 補捉與 `math.isnan()` / `math.isinf()` 防護。
   - 在 `parse_quota_data` 頂層加入 `if not isinstance(data, dict): return fallback` 防禦。
   - 將 `used_percent` 數值 Clamp 限制在 `[0.0, 100.0]`。

2. **驗證方式 (Verification Methodology)**：
   - 更新 `test_statusline.py` 加入上述 14 項測試。
   - 執行 `python3 test_statusline.py` 並確認 14 個測試案例全部回傳 `✅ 測試通過`。
