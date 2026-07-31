# AGY Usage HUD

專為 **Antigravity CLI (`agy`)** TUI 設計的純 ASCII 狀態列，監控 **5 小時滾動視窗** 與 **每週** 的 AI 配額使用率與重置倒數。

```text
Gemini 3.6 Flash (High) | 5h 0.1% (3h11m) | Wk 15.1% (4d23h)
```

設計與資料契約見 [SPEC.md](./SPEC.md)；疑難排解見 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)。

---

## 特點

- **100% 純 ASCII**（不含 ANSI 色碼）：相容所有終端字型與編碼，不會有寬度錯位或亂碼。
- **無背景服務、無網路請求**：只在 agy 更新狀態列時被動從 stdin 讀一次 JSON。
- **三段式警示色**：綠 (`<70%`)、黃 (`70~90%`)、紅 (`>=90%`)。
- **只有數字百分比，沒有進度條**：用量高低完全由數字的顏色表達，不佔橫向空間，窄終端也不會被擠掉。
- **模型名稱置於行首**：它是唯一永遠短且永遠已知的欄位，終端截斷尾巴時仍看得到自己在用哪個模型。
- **自動選對配額池**：agy 把 Gemini 模型與第三方模型分開計額（`gemini-*` 與 `3p-*`），依當前模型自動取用對應的那一組。
- **資料缺漏顯示 `--%` 而非 `0.0%`**：payload 沒帶到用量時顯示灰色 `--%`，不會偽裝成「幾乎沒用量」。
- **絕不崩潰**：空輸入、壞 JSON、非字典載荷一律降級輸出並回傳 exit code 0。

## 需求

- Python 3.6+（僅用標準庫，不需 `pip install`）
- Antigravity CLI (`agy`)，支援 `/statusline` 或 `settings.json` 的 `statusLine`
- 終端支援 ANSI 色彩（建議 `TERM=xterm-256color`）

---

## 安裝

### 方式一：一行指令（推薦）

`setup.sh` 會下載腳本到 `~/.gemini/antigravity-cli/`，並把 `statusLine` **合併**寫入該目錄的 `settings.json`（既有設定保留，並先備份成 `settings.json.bak.<timestamp>`；若該檔不是合法 JSON 會中止而不覆蓋）：

```bash
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/AI/agy_usage_hud/setup.sh | bash
```

可用環境變數：`AGY_HUD_DIR`（安裝目錄）、`AGY_HUD_RAW_BASE`（下載來源，供 fork 使用）。

### 方式二：本地 clone

從 clone 出來的目錄執行同一支腳本（會額外跑一次測試套件）：

```bash
./setup.sh
```

或在 agy TUI 內臨時套用：

```bash
/statusline $(pwd)/statusline_hud.py
```

> [!IMPORTANT]
> `settings.json` 的 `command` 必須是**絕對路徑**——Antigravity CLI 不會展開 `~`。
> `setup.sh` 寫入的就是展開後的絕對路徑；手動設定時請用 `realpath` 取得。

### 解除安裝

刪除 `~/.gemini/antigravity-cli/settings.json` 中的 `statusLine` 欄位（或還原安裝時產生的 `.bak` 檔），並移除 `~/.gemini/antigravity-cli/statusline_hud.py`。

---

## 輸出格式

```text
 Gemini 3.6 Flash (High) | 5h 0.1% (3h11m) | Wk 15.1% (4d23h)
 (1)                    (2) (3) (4)  (5)     (6)
```

1. 模型名稱（青色，非 ASCII 字元會被移除，上限 24 字元）。無模型資訊時整段省略，行首直接是 `5h`
2. 分隔符（暗色）
3. 5 小時滾動視窗標示
4. 用量百分比，固定 1 位小數，依門檻上色
5. 重置倒數（暗色）
6. 每週配額，欄位同上

**重置倒數格式**：`<=0` → `0m`；有天數 → `2d04h`；有小時 → `1h30m`；否則 `45m`。

**警示色**：

| 用量 | 顏色 | ANSI |
|---|---|---|
| `0.0% ~ 69.9%` | 綠 | `\033[1;32m` |
| `70.0% ~ 89.9%` | 黃 | `\033[1;33m` |
| `>= 90.0%` | 紅 | `\033[1;31m` |

**未知與降級**：某個視窗沒有可用數據時該段顯示暗色 `--%`（不附倒數）；整包載荷無法解析時輸出

```text
5h --% | Wk --%
```

---

## 驗證

```bash
# 1. 完整邊界測試套件（55 案例，Tier 0-9）
python3 ./test_statusline.py

# 2. 管道模擬 agy 實際送出的載荷（欄位取自 agy 1.1.8 實測）
echo '{"model":{"id":"Gemini 3.6 Flash (High)","display_name":"Gemini 3.6 Flash (High)"},"quota":{"gemini-5h":{"remaining_fraction":0.9986155,"reset_in_seconds":11515},"gemini-weekly":{"remaining_fraction":0.8492495,"reset_in_seconds":431793}}}' \
  | python3 ~/.gemini/antigravity-cli/statusline_hud.py

# 3. 純 ASCII 合規性
echo '{"quota":{"gemini-5h":{"remaining_fraction":0.58}}}' | python3 ~/.gemini/antigravity-cli/statusline_hud.py \
  | LC_ALL=C grep -P "[\x80-\xFF]" && echo "FAIL: Non-ASCII detected" || echo "PASS: Pure ASCII"

# 4. settings.json 語法與路徑
python3 -c "import json,os; p=os.path.expanduser('~/.gemini/antigravity-cli/settings.json'); print('Config valid:', json.load(open(p)).get('statusLine'))"
```

測試套件預期輸出 `Total: 55 | Passed: 55 | Failed: 0` 並回傳 exit code 0。

---

## 檔案

| 檔案 | 用途 |
|---|---|
| [statusline_hud.py](./statusline_hud.py) | 狀態列主腳本 |
| [test_statusline.py](./test_statusline.py) | 邊界測試套件（Tier 0-9，55 案例，含 agy 1.1.8 實測 payload）|
| [setup.sh](./setup.sh) | 一鍵安裝（下載 + 合併寫入 `settings.json`）|
| [SPEC.md](./SPEC.md) | 設計決策與資料契約 |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | 疑難排解 |
