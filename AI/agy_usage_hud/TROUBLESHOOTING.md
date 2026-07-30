# AGY Usage HUD 疑難排解手冊 (TROUBLESHOOTING)

本手冊提供 Antigravity CLI (`agy`) 之純 ASCII 狀態列攔截器 (`statusline_hud.py`) 的問題排查與診斷指南，包含快速診斷流程樹、常見 7 大問題排查矩陣、Raw JSON 載荷抓取技巧及單元測試迴歸維護指引。

---

## 第一章：快速診斷樹 (Quick Diagnostic Flowchart)

當您遇到狀態列無法顯示、格式異常或運作不符合預期時，請依據以下流程樹進行快速自我診斷：

```text
                                [ 狀態列發生問題 ]
                                        |
                 +----------------------+----------------------+
                 |                                             |
       【現象 1：狀態列完全未顯示】                   【現象 2：顯示 ANSI 轉義碼亂碼】
                 |                                             |
       +---------+---------+                         +---------+---------+
       |                   |                         |                   |
 (權限檢查)           (路徑與設定檢查)         (TERM 變數檢查)      (終端模擬器檢查)
  `chmod +x`          `settings.json`          `export TERM=`      使用 ANSI 256 色
  檢查可執行屬性       確認為絕對路徑            `xterm-256color`     相容終端機 (tmux/iterm)
         |                 |
         +--------+--------+
                  |
        [ 步驟一：檢查執行檔與設定 ]
                  |
                 v
                 |
                 +----------------------+----------------------+
                 |                                             |
       【現象 3：狀態列恆顯示 --% 降級】               【現象 4：模型名稱過長擠壓換行】
                 |                                             |
       +---------+---------+                         +---------+---------+
       |                   |                         |                   |
 (Payload 檢查)      (Schema 鍵名對齊)          (自動截斷驗證)       (ASCII 清理驗證)
  抓取 Raw JSON       檢查 `quota` 結構          檢查是否超過 20 字   確認非 ASCII 已過濾
  `/tmp/...log`       `rolling_5h/weekly`        (自動保留前 20 字)   `sanitize_ascii`
         |                 |
         +--------+--------+
                  |
        [ 步驟二：抓取 Payload 與單元測試 ]
```

---

## 第二章：常見 7 大問題排查矩陣 (Troubleshooting Matrix)

下表整理了 `statusline_hud.py` 整合與運作過程中最常遇到的 7 大典型問題、根本原因及對應解決方案：

| 序號 | 問題現象 (Issue) | 根本原因 (Root Cause) | 診斷與解決方案 (Solution) |
|---|---|---|---|
| **1** | **Permission Denied / 狀態列無視訊輸出** | 腳本檔缺少 POSIX 可執行權限 (`+x`)。 | 執行 `chmod +x ~/.gemini/antigravity-cli/statusline_hud.py` 賦予權限。 |
| **2** | **`settings.json` 修改後未生效** | 在 `settings.json` 中使用了相對路徑 (如 `./statusline_hud.py`) 或未展開的波浪號路徑 (`~/...`)——Antigravity CLI 不會展開 `~`。 | `"command"` 必須是**已展開的**絕對路徑，例如 `/home/alice/.gemini/antigravity-cli/statusline_hud.py`。用 `realpath ~/.gemini/antigravity-cli/statusline_hud.py` 取得。`setup.sh` 會自動寫入正確的絕對路徑。 |
| **3** | **JSON Key 大小寫寫錯導致設定無效** | 配置文件中的 JSON 鍵名寫成 `statusline` 或 `Statusline`，未遵循 CamelCase。 | 修正 `settings.json` 鍵名為小駝峰 `"statusLine"` (注意 `L` 大寫)。 |
| **4** | **顯示 `\033[1;32m` 等 ANSI 色彩亂碼** | 終端模擬器不支援 ANSI 色彩，或環境變數 `TERM` 未正確設定。 | 在 Shell 配置文件 (`~/.bashrc` 或 `~/.zshrc`) 中新增 `export TERM=xterm-256color` 並重新載入。 |
| **5** | **配額全數顯示 `--%` 降級輸出** | `agy` CLI 傳入的 `stdin` 載荷為空、格式非合法 JSON，或鍵名改變。 | 參考第三章使用 `debug_interceptor.sh` 抓取 Raw JSON 載荷，分析 `quota` 資料結構。 |
| **6** | **重置時間顯示負數 (如 `-500s`)** | 本地系統時間與 API 伺服器時間漂移，導致倒數算式計算出負數。 | `statusline_hud.py` 內建防禦邏輯，自動將 `<= 0` 的秒數收斂收歸顯示為 `0m`，無須額外處置。 |
| **7** | **超長模型名稱造成狀態列換行錯位** | API 回傳的模型名稱字串過長 (例如超過 30 個字元)。 | `statusline_hud.py` 內建自動裁切與純 ASCII 清理，模型名稱嚴格限制保留前 20 個字元，確保不換行。 |

---

## 第三章：Raw JSON 載荷抓取與除錯工具指令 (Raw Payload Debugging)

當狀態列顯示降級格式 (`--%`) 時，表示從 `agy` CLI 送入管道的 JSON 內容可能不符預期或發生 Parse Error。您可以透過以下除錯工具來捕獲即時載荷。

### 1. 使用除錯攔截腳本 (Debug Interceptor)

建立或執行以下 Shell 除錯攔截指令，將管道輸入同時備份至 `/tmp/agy_statusline_payload.log`：

```bash
#!/usr/bin/env bash
# 除錯攔截器：/tmp/debug_interceptor.sh
LOG_FILE="/tmp/agy_statusline_payload.log"
cat - | tee "$LOG_FILE" | python3 ~/.gemini/antigravity-cli/statusline_hud.py
```

在 `settings.json` 中將 `"command"` 臨時替換為除錯腳本路徑：

```json
{
  "statusLine": {
    "type": "command",
    "command": "/tmp/debug_interceptor.sh"
  }
}
```

### 2. 檢視與驗證擷取到的 Raw JSON

在 agy CLI 觸發狀態列後，即可檢視捕捉到的真實 JSON 載荷：

```bash
cat /tmp/agy_statusline_payload.log | python3 -m json.tool
```

合格的 JSON 載荷結構範例：

```json
{
  "active_model": "gemini-3.6-flash",
  "quota": {
    "rolling_5h": {
      "used_percent": 35.0,
      "reset_in_seconds": 5400
    },
    "weekly": {
      "used_percent": 50.0,
      "reset_in_seconds": 172800
    }
  }
}
```

### 3. 重放測試 (Replay Test)

抓取到歷史 Raw JSON 檔案後，可用以下指令隨時回放重現問題：

```bash
cat /tmp/agy_statusline_payload.log | python3 ~/.gemini/antigravity-cli/statusline_hud.py
```

---

## 第四章：單元測試與迴歸維護 (Unit Testing & Regression Maintenance)

本專案附帶完備的自動化測試套件 `test_statusline.py`，包含 6 大層級共 26 個邊界測試案例。在對 `statusline_hud.py` 進行任何修改或擴充時，必須執行此測試套件以確保沒有引入迴歸 (Regression)。

### 1. 執行完整測試套件

在專案目錄下執行以下指令：

```bash
python3 ./test_statusline.py
```

### 2. 測試層級分級說明 (Test Tiers)

- **Tier 1: Core Usage & Indicator Formatting (TC-01 ~ TC-03)**
  驗證標準用量、綠/黃/紅三段 ANSI 色彩轉換門檻 (`<70%` 綠色、`70%~90%` 黃色、`>=90%` 紅色)。
- **Tier 2: Field Variations & Compatibility (TC-04 ~ TC-05、TC-26)**
  驗證舊版欄位如 `remaining_fraction` 換算 (`(1.0 - rem) * 100`)、多元 Key 名稱適應 (`5h`, `week`, `model`)，以及沒有 `quota` 外層、bucket 直接放在頂層的載荷。
- **Tier 3: Boundary Values & Input Sanitization (TC-06 ~ TC-13)**
  驗證超長模型名稱裁切 (<=20 字元)、Unicode/Emoji 非 ASCII 清理、`used_percent` 邊界夾持 (`<0%` 與 `>100%`)、負數與浮點字串 (`"3600.5"`) 重置秒數解析、`inf` / `nan` 特殊浮點數防護。
- **Tier 4: Malformed Payload & Error Defense (TC-14 ~ TC-18)**
  驗證空輸入 (`stdin EOF`)、毀損 JSON 語法、JSON Array 陣列 (`[1,2,3]`)、JSON 原始型別 (`"string"`) 及空字典 (`{}`) 的安全降級輸出。
- **Tier 5: Unknown vs Zero (TC-19 ~ TC-22)**
  驗證資料缺漏（缺 bucket、缺欄位、值無法解析）必須顯示 `--%`，不得偽裝成 `0.0%`；同時驗證載荷中真正的 `0.0` 仍顯示 `0.0%`。
- **Tier 6: Line Layout (TC-23 ~ TC-25)**
  驗證模型名稱位於行首、輸出（去除 ANSI 後）不含任何進度條字元 `[` `]`，以及無模型資訊時行首直接是 `5h`。

### 3. 如何擴充與新增自訂測試案例

若在未來維護過程中發現新邊界情境，可在 `test_statusline.py` 中的 `test_cases` 列表末端新增測試條目（如 `TC-27`）：

```python
{
    "id": "TC-27",
    "tier": "Tier 4: Defense",
    "name": "Custom Edge Case Description",
    "payload": json.dumps({"custom_key": "val"}),
    "check_str_part": "5h \033[2m--%\033[0m"
}
```

新增完成後重新執行 `python3 test_statusline.py`，確定全數顯示 `✅ PASS` 即可完成迴歸驗證。
