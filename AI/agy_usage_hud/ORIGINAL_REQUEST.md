# Original User Request

## Initial Request — 2026-07-31T16:55:46+08:00

Working directory: /home/ivan/script-docs/AI/agy_usage_hud
Integrity mode: development

專案名稱：AGY Statusline HUD 審查與安裝驗證 (Code Review & Setup Verification)

## 異動內容與專案現狀 (Changes & Content Overview)

### 1. `statusline_hud.py` (標準 Statusline 攔截器)
- **寫法**：無狀態 Python 3 管道腳本，從 `stdin` 讀取 `agy` payload，單次輸出單行純 ASCII ANSI 狀態列。
- **邏輯**：
  - 解析 `model.display_name`（上限 24 字元，超過自動截斷）。
  - 自動依模型名稱分流配額池（`gemini-*` vs `3p-*`）。
  - 格式化 5h 與 Weekly 配額百分比（三段顏色：綠 `<70%`、黃 `70~90%`、紅 `>=90%`）。
  - 格式化倒數時間 `(XhYYm)` / `(XdYYh)`。
  - 絕不崩潰：異常 payload 一律降級顯示 `5h --% | Wk --%` 並保持 exit code 0。

### 2. `test_statusline.py` (單元測試套件)
- 包含 Tier 0 ~ Tier 8 共 47 項單元測試，包含真實 agy 1.1.8 擷取數據，目前 47/47 PASS。

### 3. `setup.sh` (自動安裝腳本)
- 自動備份 `settings.json` 為 `settings.json.bak.<timestamp>`，並以展開後的絕對路徑安全合併寫入 `statusLine` 設定。

## 後續執行計畫 (Execution Plan)

### Phase 1: 團隊審查 (Teamwork Review)
由 Teamwork 多 Agent 團隊審查 `statusline_hud.py` 與 `test_statusline.py` 之邊界防禦與純 ASCII 合規性。

### Phase 2: 安裝與設定合併 (Installation & Verification)
執行 `./setup.sh` 確保環境之 `settings.json` 指向本專案腳本。

### Phase 3: 驗證輸出 (Output Verification)
確認輸出格式符合：
`Gemini 3.6 Flash (High) | 5h 0.1% (3h11m) | Wk 15.1% (4d23h)`

## Acceptance Criteria

- [ ] 執行 `python3 test_statusline.py` 通過全部 47 項測試。
- [ ] 執行 `./setup.sh` 成功更新 `~/.gemini/antigravity-cli/settings.json` 且無 JSON 語法錯誤。
- [ ] 輸出遵守純 ASCII 規範且 exit code 0。
