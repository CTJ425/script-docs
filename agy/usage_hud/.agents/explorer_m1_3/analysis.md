# M1 需求與既有測試交叉比對暨舊版 JSON 載荷相容性分析報告 (Analysis Report)

## 1. 執行摘要 (Executive Summary)

本報告為 **Milestone M1 (Core Robustness & Edge Case Fixes)** 之 Explorer 3 交叉驗證報告。
核心任務為：
1. 交叉比對 M1 修復需求（模型名稱截斷、純 ASCII 過濾、`NaN`/`Inf` 浮點數防護、極限時間與非 Dict Payload 防禦）與現有單元測試 `test_statusline.py` 的相容性，確保所有 M1 變更 100% 回溯相容 (Backward Compatible)，不破壞既有測試案例。
2. 全面梳理並驗證歷史與各式 CLI/TUI 版本之舊版 Payload 格式（包含 `remaining_fraction` 剩餘比例、`used_percent` 直接百分比、字串型態數字 `"3600.5"`、`reset_in` / `reset_time` / `reset_in_seconds` 欄位異名、多層 nested bucket 字典與非 dict payload）。
3. 建立完整的邊界條件與舊版 Payload 相容性交叉驗證矩陣，提供給 Implementer 團隊作為程式碼修復與測試撰寫之依據。

---

## 2. 既有單元測試相容性分析 (`test_statusline.py`)

現有 `test_statusline.py` 包含 6 個自動化測試案例，使用 `subprocess.Popen` 呼叫 `statusline_hud.py`，並進行純 ASCII 檢查 (`ord(c) < 128`) 與字串/色彩比對。

### 2.1 現有 6 個測試案例與 M1 變更對照

| 測試編號 | 測試名稱 | 輸入 Payload 特徵 | 現有斷言 (Assertion) 條件 | M1 修復影響評估 | 相容性結論 |
|---|---|---|---|---|---|
| **Case 1** | 標準用量與綠色燈號 (<70%) | `active_model`: "gemini-3.6-flash"<br>`rolling_5h`: 35.0%, 5400s<br>`weekly`: 50.0%, 172800s | `5h: \033[1;32m[===.....] 35.0%\033[0m` | 模型名稱 16 字元未超過 20 字元截斷限制；5400s 轉為 `1h30m`，172800s 轉為 `2d00h`。 | **100% 相容** |
| **Case 2** | 高用量黃色警示 (70% ~ 90%) | `active_model`: "gemini-3.6-pro"<br>`rolling_5h`: 75.5%, 3600s<br>`weekly`: 88.0%, 86400s | `check_color: "\033[1;33m"` | 色彩判定門檻（70%~90% 黃色）保持不變。模型名稱 14 字元不被截斷。 | **100% 相容** |
| **Case 3** | 極高用量紅色警告 (>=90%) | `active_model`: "gemini-3.6-flash"<br>`rolling_5h`: 95.2%, 1200s<br>`weekly`: 98.0%, 43200s | `check_color: "\033[1;31m"` | 色彩判定門檻（>=90% 紅色）保持不變。 | **100% 相容** |
| **Case 4** | 相容舊版欄位 (remaining_fraction 替代用) | `active_model`: "claude-3-5-sonnet"<br>`5h`: `remaining_fraction`: 0.40, `reset_in`: 7200<br>`week`: `remaining_fraction`: 0.10, `reset_in`: 259200 | `check_str_part: "60.0%"` | `(1.0 - 0.40)*100 = 60.0%` 計算邏輯保留；舊版鍵名 `5h` 與 `week` 繼續解析。 | **100% 相容** |
| **Case 5** | 空輸入/異常 JSON 容錯備用輸出 | `{invalid json syntax` | `check_str_part: "[........] --%"` | 異常 JSON 繼續由 `main()` Catch 例外並印出純 ASCII Fallback 狀態列。 | **100% 相容** |
| **Case 6** | 倒數時間極短與0秒處理 | `active_model`: "test-model"<br>`rolling_5h`: 0.0%, 0s<br>`weekly`: 0.0%, -500s | `check_str_part: "(0m)"` | `reset_in_seconds` <= 0 繼續回傳 `"0m"`。 | **100% 相容** |

### 2.2 回溯相容性總結
經過逐一驗證，M1 的所有修復（例如：模型名稱截斷至 max 20 字元、防護 `NaN`/`Inf` 浮點數、純 ASCII Sanitization）完全涵蓋並滿足現有 6 個單元測試案例，**零迴歸風險 (Zero Regression Risk)**。

---

## 3. 舊版 Payload 格式與相容性矩陣 (Legacy Payload Compatibility Matrix)

為了支援 Antigravity CLI 的歷史版本演進與多元 Payload 格式，必須確保 `statusline_hud.py` 能彈性解析各種鍵名與資料型態。

### 3.1 配額區塊鍵名 (Quota Bucket Keys)
* **5h Rolling 視窗**：支援 `rolling_5h`, `5h`, `rolling5h`, `five_hour`, `5_hour`
* **Weekly 每週視窗**：支援 `weekly`, `week`, `7d`, `seven_days`
* **數據結構層級**：
  1. 根物件包裹：`data["quota"]["rolling_5h"]`
  2. 根層級直接提供：`data["rolling_5h"]`
  3. 雙層 Nested Bucket：`data["quota"]["default_bucket"]["rolling_5h"]`

### 3.2 模型名稱鍵名 (Model Keys)
* 優先順序：`data["active_model"]` -> `data["model"]` -> `data["model_name"]` -> `data["activeModel"]`
* 型態容錯：若值非 `str`（如 `int`, `dict`, `None`），安全轉為字串或空字串。

### 3.3 用量數值表示法 (Usage Value Formats)

| 表示法類型 | JSON 欄位結構範例 | 解析與換算公式 | 優先級與例外處理 |
|---|---|---|---|
| **Direct Percent (數字)** | `"used_percent": 35.0` 或 `35` | 直接讀取並轉 float 捨入至小數一位 `35.0` | **最高優先級** |
| **Direct Percent (字串)** | `"used_percent": "75.5"` | `float("75.5")` -> `75.5` | 若無法解析轉為 `0.0` |
| **Remaining Fraction (數字)**| `"remaining_fraction": 0.40` | `used_pct = round((1.0 - float(0.40)) * 100.0, 1)` -> `60.0` | 當 `used_percent` 為 `None` 時觸發 |
| **Remaining Fraction (字串)**| `"remaining_fraction": "0.10"` | `used_pct = round((1.0 - float("0.10")) * 100.0, 1)` -> `90.0` | 若無法解析轉為 `0.0` |
| **NaN / Inf 特殊值** | `"used_percent": "nan"` 或 `float('inf')` | 檢測 `math.isnan` / `math.isinf` 轉為 `0.0` | 防止 `round(nan)` 引發 `ValueError` |

### 3.4 重置時間表示法 (Reset Seconds Formats)

| 欄位名稱異名 | 範例數值 | 預期輸出 | 注意事項與轉譯邏輯 |
|---|---|---|---|
| `reset_in_seconds` | `5400` | `1h30m` | 標準整數秒數 |
| `reset_in` | `7200` | `2h00m` | 舊版縮寫欄位 |
| `reset_seconds` | `1800` | `30m` | 替代鍵名 |
| `reset_time` | `3600` | `1h00m` | 替代鍵名 |
| **浮點數字串** | `"3600.5"` | `1h00m` | 現有 `int("3600.5")` 會報錯！修復需改用 `int(float(sec))` |
| **負數秒數** | `-500` | `0m` | 小於等於 0 回傳 `"0m"` |
| **Inf / NaN** | `"inf"` / `"nan"` | `--` | `float('inf')` 轉 `int` 會拋出 `OverflowError`，需回傳 `"--"` |
| **Null / 缺失** | `null` / 缺欄位 | `0m` 或 `--` | 轉為 0s 或預設 `--` |

---

## 4. M1 核心修復需求細部交叉驗證 (M1 Fix Requirements Verification)

### 4.1 模型名稱長度截斷與 ASCII 清理

* **需求**：長度超過 20 字元需自動截斷，非 ASCII 字元（Emoji、中文）需剝離。
* **驗證範例 1 (超長 ASCII)**：
  - 輸入：`gemini-3.6-pro-preview-experimental-2026` (42 字元)
  - 處理：截斷至前 20 字元 -> `gemini-3.6-pro-previ`
  - 驗證：狀態列版面完全不拉長溢位。
* **驗證範例 2 (包含 Emoji 與全形中文)**：
  - 輸入：`claude-3-🚀-flash-模型`
  - 處理：剝離 ASCII 範圍 (`ord(c) >= 32 and ord(c) <= 126`) 外之字元 -> `claude-3--flash-`
  - 驗證：100% 保持純 ASCII，`verify_ascii()` 斷言無拋錯。

### 4.2 浮點數 NaN / Inf 穩健性防禦

* **需求**：`float('nan')` 或 `"nan"` 不能引發 `ValueError: cannot convert float NaN to integer`；`float('inf')` 不能引發 `OverflowError`。
* **修復防禦點**：
  1. `make_ascii_progress_bar(percent)`:
     ```python
     try:
         pct = float(percent)
         if math.isnan(pct) or math.isinf(pct):
             clamped = 0.0
         else:
             clamped = max(0.0, min(100.0, pct))
     except (ValueError, TypeError, OverflowError):
         clamped = 0.0
     ```
  2. `format_duration(seconds)`:
     ```python
     if seconds is None:
         return "--"
     try:
         sec_flt = float(seconds)
         if math.isnan(sec_flt) or math.isinf(sec_flt):
             return "--"
         total_seconds = int(sec_flt)
     except (ValueError, TypeError, OverflowError):
         return "--"
     ```

### 4.3 Payload 非 Dict 結構防禦

* **需求**：當傳入非 Dict Payload（如 List `[1, 2, 3]`、字串 `"abc"`、布林值 `true`、數字 `123`）時，不能引發 `AttributeError: 'list' object has no attribute 'get'`。
* **修復防禦點**：
  在 `parse_quota_data(data)` 與 `render_statusline(data)` 開頭加入防禦：
  ```python
  if not isinstance(data, dict):
      data = {}
  ```

---

## 5. 實作建議與擴充測試案例建議 (Implementation & Test Recommendations)

為確保 Implementer 順利實作 M1修復並通過後續 E2E 測試，建議於 `test_statusline.py` 或擴充測試集中新增以下測試案例：

1. **Test 7 (超長模型名稱截斷)**:
   - Payload: `{"active_model": "gemini-3.6-pro-preview-experimental-2026", "quota": ...}`
   - 預期：模型名稱部分長度 <= 20 字元。
2. **Test 8 (Unicode/Emoji 剝離)**:
   - Payload: `{"active_model": "claude-3-🚀-flash-測試", "quota": ...}`
   - 預期：輸出中完全不含 Emoji 與中文字元，且 100% 滿足 `verify_ascii()`。
3. **Test 9 (NaN / Inf / Float 秒數)**:
   - Payload: `{"quota": {"rolling_5h": {"used_percent": "nan", "reset_in_seconds": "3600.5"}, "weekly": {"used_percent": "inf", "reset_in_seconds": "inf"}}}`
   - 預期：正常渲染不崩潰，進度條顯示 `0.0%` 或 `--%`，不拋出 Exception。
4. **Test 10 (Non-dict Payload 防禦)**:
   - Payload: `[1, 2, 3]` 或 `"just a raw string"`
   - 預期：印出預設 Fallback 狀態列 `5h: [........] --% | Wk: [........] --%`。

---
*分析完成時間：2026-07-30 | 撰寫者：Explorer 3*
