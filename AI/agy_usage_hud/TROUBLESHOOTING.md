# AGY Usage HUD 疑難排解手冊 (TROUBLESHOOTING)

本手冊提供 Antigravity CLI (`agy`) 之純 ASCII 狀態列攔截器 (`statusline_hud.py`) 的問題排查與診斷指南，包含快速診斷流程樹、常見問題排查矩陣、Raw JSON 載荷抓取技巧及單元測試迴歸維護指引。

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
       【現象 3：狀態列恆顯示 --% 降級】               【現象 4：模型名稱異常或過長】
                 |                                             |
       +---------+---------+                         +---------+---------+
       |                   |                         |                   |
 (Payload 檢查)      (Schema 鍵名對齊)          (自動截斷驗證)       (型別與 ASCII 驗證)
  抓取 Raw JSON       檢查 `quota` 結構          檢查是否超過 24 字   `model` 應為物件，取
  第三章攔截器        `gemini-5h/3p-5h`          (自動保留前 24 字)   `display_name`；非字串
                                                                      不得被 `str()` 成 repr
         |                 |
         +--------+--------+
                  |
        [ 步驟二：抓取 Payload 與單元測試 ]
```

---

## 第二章：常見問題排查矩陣 (Troubleshooting Matrix)

下表整理了 `statusline_hud.py` 整合與運作過程中最常遇到的典型問題、根本原因及對應解決方案：

| 序號 | 問題現象 (Issue) | 根本原因 (Root Cause) | 診斷與解決方案 (Solution) |
|---|---|---|---|
| **1** | **Permission Denied / 狀態列無視訊輸出** | 腳本檔缺少 POSIX 可執行權限 (`+x`)。 | 執行 `chmod +x ~/.gemini/antigravity-cli/statusline_hud.py` 賦予權限。 |
| **2** | **`settings.json` 修改後未生效** | 在 `settings.json` 中使用了相對路徑 (如 `./statusline_hud.py`) 或未展開的波浪號路徑 (`~/...`)——Antigravity CLI 不會展開 `~`。 | `"command"` 必須是**已展開的**絕對路徑，例如 `/home/alice/.gemini/antigravity-cli/statusline_hud.py`。用 `realpath ~/.gemini/antigravity-cli/statusline_hud.py` 取得。`setup.sh` 會自動寫入正確的絕對路徑。 |
| **3** | **JSON Key 大小寫寫錯導致設定無效** | 配置文件中的 JSON 鍵名寫成 `statusline` 或 `Statusline`，未遵循 CamelCase。 | 修正 `settings.json` 鍵名為小駝峰 `"statusLine"` (注意 `L` 大寫)。 |
| **4** | **顯示 `\033[1;32m` 等 ANSI 色彩亂碼** | 終端模擬器不支援 ANSI 色彩，或環境變數 `TERM` 未正確設定。 | 在 Shell 配置文件 (`~/.bashrc` 或 `~/.zshrc`) 中新增 `export TERM=xterm-256color` 並重新載入。 |
| **5** | **配額全數顯示 `--%` 降級輸出** | `agy` CLI 傳入的 `stdin` 載荷為空、格式非合法 JSON，或 bucket 鍵名改變。agy 1.1.8 的鍵名是 `gemini-5h` / `gemini-weekly` / `3p-5h` / `3p-weekly`，**不是** `rolling_5h` / `weekly`。 | 參考第三章抓取 Raw JSON 載荷，比對 `quota` 底下的實際鍵名；若 agy 換了新前綴，在 `statusline_hud.py` 的 `FIVE_H_NAMES` / `WEEKLY_NAMES` 或家族判斷處補上。 |
| **6** | **重置時間顯示負數 (如 `-500s`)** | 本地系統時間與 API 伺服器時間漂移，導致倒數算式計算出負數。 | `statusline_hud.py` 內建防禦邏輯，自動將 `<= 0` 的秒數收斂收歸顯示為 `0m`，無須額外處置。 |
| **7** | **超長模型名稱造成狀態列換行錯位** | API 回傳的模型名稱字串過長 (例如超過 30 個字元)。 | `statusline_hud.py` 內建自動裁切與純 ASCII 清理，模型名稱嚴格限制保留前 24 個字元，確保不換行。 |
| **8** | **模型名稱顯示成 `{'id': 'Gemini 3.6 F`** | 載荷的 `model` 是物件而非字串，卻被 `str()` 轉成 Python repr 後截斷。 | 已於 `extract_model_name()` 修正：物件取 `display_name`，退而取 `id`；`sanitize_ascii()` 對非字串一律回傳空字串，不再 `str()`。迴歸案例 TC-14。 |
| **9** | **百分比不動 / 與 agy `/usage` 對不上** | 顯示到了另一個配額池。agy 對 Gemini 模型與第三方模型分開計額，切換模型就會換池。 | 確認 `quota` 中 `gemini-*` 與 `3p-*` 兩組數值，以及當前模型屬於哪一族；家族由模型名稱是否含 `gemini` 判定。 |
| **10** | **百分比疑似顯示成 context window 用量** | 載荷另有 `context_window.used_percentage`，那是**上下文視窗**不是配額。 | 本腳本只讀 `quota`，不讀 `context_window`；TC-04 釘住此行為。 |

---

## 第三章：Raw JSON 載荷抓取與除錯工具指令 (Raw Payload Debugging)

當狀態列顯示降級格式 (`--%`) 時，表示從 `agy` CLI 送入管道的 JSON 內容可能不符預期或發生 Parse Error。您可以透過以下除錯工具來捕獲即時載荷。

> [!IMPORTANT]
> 這是本專案唯一可信的資料來源。agy 的狀態列載荷沒有公開文件，**任何未經攔截驗證的欄位假設都應視為未證實**——本腳本先前的 schema 全屬臆測，測試 25/25 全綠但狀態列在 TUI 裡是壞的。

### 1. 使用除錯攔截腳本 (Debug Interceptor)

建立或執行以下 Shell 除錯攔截指令，將管道輸入同時備份至 `/tmp/agy_statusline_payload.log`：

```bash
#!/usr/bin/env bash
# 除錯攔截器：/tmp/debug_interceptor.sh
LOG_FILE="/tmp/agy_statusline_payload.log"
cat - | tee -a "$LOG_FILE" | python3 ~/.gemini/antigravity-cli/statusline_hud.py
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

狀態列每次重繪都會追加一筆，且**彼此之間沒有換行分隔**，所以 `python3 -m json.tool` 會在第二筆開頭報 `Extra data`。用 `raw_decode` 逐筆切開：

```bash
python3 - /tmp/agy_statusline_payload.log <<'PY'
import json, sys
raw = open(sys.argv[1], encoding="utf-8").read()
dec, i, objs = json.JSONDecoder(), 0, []
while i < len(raw):
    while i < len(raw) and raw[i] in " \t\r\n":
        i += 1
    if i >= len(raw):
        break
    obj, i = dec.raw_decode(raw, i)
    objs.append(obj)
print(f"{len(objs)} payload(s)")
print(json.dumps(max(objs, key=lambda o: len(json.dumps(o))), indent=2))
PY
```

agy 1.1.8 實測載荷結構（節錄本腳本會讀的欄位；完整形狀見 [SPEC.md](./SPEC.md)）：

```json
{
  "model": {
    "id": "Gemini 3.6 Flash (High)",
    "display_name": "Gemini 3.6 Flash (High)",
    "effort": "high"
  },
  "quota": {
    "gemini-5h":     { "remaining_fraction": 0.9986155, "reset_time": "2026-07-31T04:47:27Z", "reset_in_seconds": 11515 },
    "gemini-weekly": { "remaining_fraction": 0.8492495, "reset_time": "2026-08-05T01:32:05Z", "reset_in_seconds": 431793 },
    "3p-5h":         { "remaining_fraction": 1, "reset_time": "2026-07-31T06:35:28Z", "reset_in_seconds": 17996 },
    "3p-weekly":     { "remaining_fraction": 1, "reset_time": "2026-08-07T01:35:28Z", "reset_in_seconds": 604796 }
  },
  "agent_state": "idle",
  "plan_tier": "Google AI Pro",
  "version": "1.1.8"
}
```

注意三點：`model` 是**物件**不是字串；bucket 依模型家族分成 `gemini-*` 與 `3p-*`；用量只給 `remaining_fraction`（0–1），沒有 `used_percent`。

> [!WARNING]
> 攔截到的載荷含 `email`、`session_id`、`cwd`、`transcript_path` 等個人資訊。要當成測試 fixture 提交前務必先置換掉。

### 2.5 抓完記得還原

```bash
# 還原 statusLine 指向真正的腳本
python3 - <<'PY'
import json, os
p = os.path.expanduser("~/.gemini/antigravity-cli/settings.json")
s = json.load(open(p, encoding="utf-8"))
s["statusLine"] = {"type": "command",
                   "command": f'python3 "{os.path.expanduser("~/.gemini/antigravity-cli/statusline_hud.py")}"'}
json.dump(s, open(p, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
PY

rm -f /tmp/debug_interceptor.sh /tmp/agy_statusline_payload.log
```

### 3. 重放測試 (Replay Test)

抓取到歷史 Raw JSON 檔案後，可用以下指令隨時回放重現問題：

```bash
cat /tmp/agy_statusline_payload.log | python3 ~/.gemini/antigravity-cli/statusline_hud.py
```

---

## 第四章：單元測試與迴歸維護 (Unit Testing & Regression Maintenance)

本專案附帶自動化測試套件 `test_statusline.py`，包含 9 大層級共 47 個邊界測試案例。在對 `statusline_hud.py` 進行任何修改或擴充時，必須執行此測試套件以確保沒有引入迴歸 (Regression)。

> [!IMPORTANT]
> **Tier 0 是這套測試唯一的地基**：它把第三章攔截到的真實載荷原封不動重播。上一版測試整套建立在臆造的 schema 上，25/25 全綠但狀態列在 TUI 裡是壞的——新增案例時請從真實載荷出發，不要從想像的欄位出發。

### 1. 執行完整測試套件

在專案目錄下執行以下指令：

```bash
python3 ./test_statusline.py
```

### 2. 測試層級分級說明 (Test Tiers)

- **Tier 0: Captured Payloads (TC-01 ~ TC-04)**
  重播 agy 1.1.8 實測載荷的三個生命週期階段（`authenticating` 無模型無配額、`initializing` 有模型無配額、`idle` 全欄位齊備），並驗證 `context_window.used_percentage` 不會被誤當成配額。
- **Tier 1: Colour Thresholds (TC-05 ~ TC-08)**
  驗證綠/黃/紅三段門檻，含 70.0% 與 90.0% 兩個臨界點。
- **Tier 2: Quota Family Selection (TC-09 ~ TC-13b)**
  驗證 Gemini 模型取 `gemini-*`、非 Gemini 模型取 `3p-*`、鍵名大小寫不敏感、只有另一族時的退讓、無前綴鍵仍可解析，以及沒有 `quota` 外層、bucket 直接放在頂層的載荷。
- **Tier 3: Model Extraction (TC-14 ~ TC-21)**
  驗證物件型 `model` 取 `display_name` 優先於 `id`、**絕不輸出 Python repr**（TC-14 為本次迴歸案例）、無可用名稱時整段省略、舊版字串型仍相容、超長裁切 (<=24 字元)、非 ASCII 清理、垃圾型別防禦。
- **Tier 4: Usage Field Variations (TC-22 ~ TC-26)**
  驗證 `used_percent` / `used_percentage` / `remaining_fraction` 三種來源與優先序、`reset_in` 別名，以及只有 `reset_time` 時仍能顯示百分比。
- **Tier 5: Boundary Values (TC-27 ~ TC-32)**
  驗證百分比上下夾持、負數與浮點字串 (`"3600.5"`) 重置秒數解析、`inf` / `nan` 防護、日/時兩種倒數格式。
- **Tier 6: Malformed Payload Defence (TC-33 ~ TC-39)**
  驗證空輸入、毀損 JSON、JSON Array、JSON 原始型別、空字典，以及 `quota` 或 bucket 非物件時的安全降級。
- **Tier 7: Unknown vs Zero (TC-40 ~ TC-43)**
  驗證資料缺漏（缺 bucket、缺欄位、值無法解析）必須顯示 `--%`，不得偽裝成 `0.0%`；同時驗證載荷中真正的 `0.0` 仍顯示 `0.0%`。
- **Tier 8: Line Layout (TC-44 ~ TC-46)**
  驗證模型名稱位於行首、輸出（去除 ANSI 後）不含任何進度條字元 `[` `]`，以及無模型資訊時行首直接是 `5h`。

每個案例另外一律斷言 exit code 為 0、stderr 為空、輸出純 ASCII。

### 3. 如何擴充與新增自訂測試案例

在 `test_statusline.py` 的 `build_test_cases()` 末端新增條目。`check_str_part` 與 `check_absent_str_part` 都可傳字串或字串陣列；前者比對含 ANSI 的原始輸出（因此可斷言色碼），後者比對去除 ANSI 後的純文字（避免逸出序列的位元組遮蔽或偽造命中）：

```python
{
    "id": "TC-47",
    "tier": "Tier 6: Defence",
    "name": "Custom edge case description",
    "payload": json.dumps({"custom_key": "val"}),
    "check_str_part": f"5h {DIM}--%{RESET}",
    "check_absent_str_part": ["0.0%", "{"],
}
```

新增完成後重新執行 `python3 test_statusline.py`，確定全數 `PASS` 即完成迴歸驗證。

### 4. 驗證測試本身有鑑別力

新增迴歸案例後，請確認它在**修復前**的程式碼上會失敗——否則等於沒測：

```bash
mkdir -p /tmp/regress && cd "$(git rev-parse --show-toplevel)/agy/usage_hud"
git show <修復前的 commit>:agy/usage_hud/statusline_hud.py > /tmp/regress/statusline_hud.py
cp test_statusline.py /tmp/regress/
python3 /tmp/regress/test_statusline.py | grep -E '^\[FAIL\]|SUMMARY'
```
