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
| **10** | **會話上下文與配額欄位區分** | `Ctx` 顯示當前會話 Token 與模型上下文視窗（如 `Ctx 19.9k/1M`），`5h` 與 `Wk` 則專門顯示帳號配額。 | 兩者獨立解析與渲染；`context_window` 不會干擾配額欄位。迴歸案例 TC-04、TC-67~TC-78。 |
| **11** | **數字前出現暗色 `~`（例：`5h ~73.1%`）** | 這個值超過 10 分鐘沒有被任何來源確認過。最常見是 OAuth access token 過期（agy 通常一小時換發一次），輪詢一律收到 `401 UNAUTHENTICATED`。 | 檢查 token 效期：`python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.gemini/antigravity-cli/antigravity-oauth-token')))['token']['expiry'])"`。已過期就讓 agy 重新換發（重啟 session 或重新登入）；**HUD 不會自己續期**，那需要 agy 的 OAuth client secret。token 一更新，下一次輪詢自動恢復，不必重啟狀態列。 |
| **12** | **百分比整場不動，但沒有 `~` 標記** | 載荷持續帶著 `quota`，所以數值被視為即時——但 agy 只在收到回應時才更新那一段，兩次對話之間它本來就不會變。 | 對照 `usage_hud_cache.json`：`source: "api"` 的 bucket 才是輪詢拿到的伺服器數值。若 `last_api_error` 存在，代表輪詢正在失敗，比照第 11 項處理。 |
| **13** | **倒數卡在同一個數字（例：永遠 `3h11m`）** | 舊版把 `reset_in_seconds` 每次 render 都重新錨定到當下，等於不斷把截止時間往後推。 | 已修正：`reset_time`（絕對時間）優先，只有相對秒數時錨定一次並存入 `anchor_reset_in` 重複使用。迴歸案例 TC-60 / TC-61。 |
| **14** | **用量開場算一次之後就不動** | API 讀數只在 30 秒內優先於 stdin 載荷，但失敗冷卻是 60 秒。任何一次輪詢失敗都保證有一段時間讓 agy 那份凍結的載荷奪回顯示權，而且 `write_cache` 會把它寫回快取，蓋掉輪詢真正拿到的值。 | 已修正：優先權視窗改為與過期門檻同為 600 秒，失敗冷卻降為 15 秒，冷卻永遠短於優先權視窗。迴歸案例 TC-79。 |
| **15** | **倒數又卡住了（第 13 項修好之後）** | 輪詢寫進快取的 bucket 只有絕對的 `resets_at`，沒有 `anchor_reset_in`。載荷路徑因此找不到可沿用的錨點，每次 render 又重新錨定成「現在 + `reset_in_seconds`」——第 13 項的缺陷從 API 路徑繞了回來。 | 已修正：快取裡的絕對期限與載荷的相對秒數若相差在 900 秒內視為同一個視窗，直接沿用該絕對期限；超過才重新錨定。迴歸案例 TC-80 / TC-81。 |
| **16** | **`5h` 顯示 `0.0%` 卻沒有倒數** | 這是正常行為，不是缺陷。配額 API 對未使用的視窗會把重置時間一路推成「現在 + 5 小時」，那個倒數永遠不會走動，顯示它等於顯示一個壞掉的時鐘。 | 有用量後倒數就會出現。真正已到期的視窗仍會顯示 `(0m)`。迴歸案例 TC-82 / TC-83 / TC-84。 |
| **17** | **快取旁邊多出 `.lock` 與 `.render` 兩個檔** | 這是輪詢 daemon 的兩個狀態檔：`usage_hud_cache.json.lock` 由 daemon 用 `flock` 持有，核心保證同時只有一個持有者，並在行程死亡時自動釋放；`usage_hud_cache.json.render` 由每次渲染蓋章，daemon 用它判斷還有沒有人在看。 | 不需處理，**也不要手動刪除 `.lock`**。daemon 持有的是那個 inode 的鎖，刪掉檔案不會解鎖，只會讓下一個行程建出一個新 inode 並成功上鎖——結果是兩個 daemon 同時輪詢。要停掉 daemon 就結束該行程；它本來也會在連續 120 秒沒有渲染後自行結束。`.render` 刪掉無害，下一次渲染就會重建。 |
| **18** | **`Ctx` 一直顯示 `0`** | agy 在 session 剛開始、還沒有任何一輪對話時，`context_window` 底下的 Token 欄位全部是 `0`（實測 17 筆載荷皆如此），累計量自然是 0。 | 進行一輪對話後就會開始累加。若對話過後仍是 `0`，代表你這版 agy 沒有回報 Token 用量——用第三章的攔截腳本抓一筆載荷，檢查 `context_window` 底下 `total_input_tokens` 與 `current_usage` 是否有值。 |
| **19** | **`Ctx` 的數字比視窗上限還大** | 這是正常的。`Ctx` 顯示的是本次 session **累計**消耗的 Token，不是當前上下文佔用量，累計量本來就會超過視窗大小，所以也不再顯示 `/1M` 分母。 | 想知道離撐爆視窗還有多遠，看數字的**顏色**——顏色仍然取自當前視窗佔用率，綠/黃/紅門檻不變。 |
| **20** | **壓縮上下文後 `Ctx` 沒有下降** | 刻意如此。壓縮並沒有消耗任何 Token，只是把已經花掉的東西移出視窗；讓累計量下降等於謊稱那些 Token 被退還了。 | 累計量只累加上升的部分，並以載荷的 `session_id` 為界，換 session 才重新起算。 |
| **21** | **同時開多個 agy，`Ctx` 會不會互相干擾？** | 不會。快取雖然只有一份，但累計量是**依 session 分開記帳**的（`context` 是以 session id 為鍵的映射），每個 session 各算各的。 | 最多同時追蹤 8 個 session，超過就淘汰最久沒出現的那個。被淘汰的 session 若之後又出現，會從當下重新起算。 |
| **22** | **使用中但 `5h` 恆顯示 `0.0%` 無倒數，且數值與 agy `/usage` 不符** | agy 連線到不同環境的 Cloud Code 端點（例如 `daily-cloudcode-pa.googleapis.com`），但 HUD 輪詢寫死在生產端點 (`cloudcode-pa.googleapis.com`)，伺服器判定未在生產端點消耗因此回傳 0.0%，覆蓋了 CLI payload 實際有消耗的數值。 | 已於 v1.3.2 修正：`detect_quota_api_url()` 自動由 `cli.log` 偵測當前 agy 實際呼叫的 Cloud Code 端點；且防禦規則確保若快取 API 讀數為 0.0% 但 payload 報告該視窗已有使用量時，優先採納 payload 正確值。迴歸案例 TC-85、UC-47~UC-51。 |

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
- **Tier 8: Line Layout (TC-44 ~ TC-47)**
  驗證模型名稱位於行首、輸出（去除 ANSI 後）不含任何進度條字元 `[` `]`，以及無模型資訊時行首直接是 `5h`。
- **Tier 9: Cold-Start Cache & Time-Rolling (TC-48 ~ TC-55)**
  驗證冷啟動寫入與回填、倒數隨系統時鐘推進、視窗過期歸零、快取超過 7 天即忽略、跨家族 bucket 合併，以及快取毀損或目錄不可寫時的安全降級。
- **Tier 10: Live API Precedence & Provenance (TC-56 ~ TC-66)**
  驗證輪詢數值優先於 stdin 載荷且不被其覆寫、超過優先權窗口後讓位、倒數錨點的重用與重新錨定、過期數據的 `~` 標記，以及輪詢失敗時仍寫出完整可讀的快取。
- **Tier 11: In-Process Unit Checks (UC-01 ~ UC-13)**
  背景行程有沒有被啟動、時間戳怎麼被解析，都無法從 stdout 觀察（子行程是 detached，用等待去看它是 race）。這一層直接 import `statusline_hud` 呼叫函式本身，涵蓋 ISO-8601 解析、token 效期（含提前量窗口），以及 `maybe_trigger_bg_fetch` 的每一道閘門。

每個案例另外一律斷言 exit code 為 0、stderr 為空、輸出純 ASCII。

測試套件預設帶 `USAGE_HUD_DISABLE_BG_FETCH=1`，需要驗證輪詢的案例才個別放行；任何案例都不得依賴可連線的 API 或有效 token，也不得讓子行程寫進使用者真正的快取檔。

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
