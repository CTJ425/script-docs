# 變更紀錄

這個 repo 的版本歷史。git tag 會加上 `v` 前綴，下面的標題不加。
每一個 GitHub Release 的內文都以這份檔案為準。

---

## 1.3.0 (2026-09-04)

### 新功能

#### AI / agy_usage_hud
- **輪詢改由常駐程式負責，不再每次渲染時才啟動**：從渲染裡觸發的單次抓取，只有在 TUI 重繪時才會輪詢，所以沒有渲染就不會更新，間隔常數寫多少都一樣。現在由一個獨立的 `--bg-daemon` 依自己的節奏輪詢，連續 120 秒沒有任何渲染更新它的心跳時就自動結束。`--bg-fetch` 保留為單次執行，作為迴圈的主體。
- **只會有一個常駐程式，由核心仲裁**：常駐程式在整個生命週期都持有 `fcntl.flock`，作業系統只會放行一個輪詢程式，並在該程式結束時自動釋放鎖，不再需要任何「鎖過期」的判斷規則。先前兩種設計都是依序呼叫檔案系統 API，實測都會讓多個程式同時以為自己拿到鎖，因為它們仲裁的是*路徑*，而不是自己檢查過的那個檔案。
- **`Ctx` 改為顯示 session 的累計用量**：每次壓縮 context，視窗佔用量就會下降，看起來像用量被退回。現在這個欄位只累加上升的部分，並依 `session_id` 分開記帳：一台機器上所有 agy session 共用同一個快取檔，只用一個欄位的話，同時開兩個 session 會在每次渲染時互相重設。agy 的欄位名稱無法判斷哪個數字是累計量（`used_percentage` 只由 `total_input_tokens` 導出，而 `current_usage.input_tokens` 大了兩個數量級），只累加上升的部分在兩種解讀下都正確。讀到 `0` 時不會把已經有消耗的 session 重新歸零，因為欄位缺漏和真正閒置的 0 無法分辨，一旦因此歸零就會永久多算。視窗的分母拿掉了，因為累計量沒有上限；警示色仍依佔用率決定，所以警告不會消失。
- **未使用的視窗不顯示倒數**：配額 API 每次輪詢都會把未使用視窗的 `resetTime` 推到「現在 + 視窗長度」，所以 `0.0%` 的倒數永遠不會走動，現在直接省略。真正已經到期的期限仍顯示 `0m`。

### 修正

#### AI / agy_usage_hud
- **用量在 session 開始幾分鐘後就不再變動**：API 讀數只比 `stdin` 載荷優先 30 秒，而失敗後的冷卻時間是 60 秒，所以每次輪詢暫時失敗，顯示都會交回給 agy 已經凍結的載荷，接著 `write_cache` 又把那個數字蓋過輪詢到的值。現在優先期間改為過期門檻（600 秒），冷卻時間改為 15 秒，冷卻永遠不會比優先期間長。
- **先前修好錨點後，倒數又凍結了**：輪詢程式寫入的配額只記錄絕對的 `resets_at`，沒有 `anchor_reset_in`，所以載荷路徑每次渲染都重新以 `now + reset_in_seconds` 定錨。現在只要兩者描述的是同一個視窗，就沿用快取裡的絕對期限，只有差距超過 900 秒時才重新定錨。
- **沒有 `fcntl` 的平台每次渲染都會啟動一個注定失敗的常駐程式**：import 在建立鎖檔之前執行，所以啟動閘門沒有任何東西可以據以擋下。

#### 整個 repo
- **每份公開的 README 都加上最後更新日期**：每個 H1 下方加一行 `> 最後更新：YYYY-MM-DD`，填的是各檔案實際最後修改的日期，而不是統一蓋同一天。`CLAUDE.md`（以及兩份鏡像檔）現在規定日期要和內容在同一個 commit 一起更新。
- **`agy_usage_hud` 的 `.claude/route.config.json`**：`paths.prod` 退回 plugin 預設的 `["src/"]`，而這個 repo 沒有這個資料夾，所以這裡每一次 builder 派工都被拒絕。
- **`.gitignore`**：加入 `.claude/routing/`，那是派工的遙測資料，不是文件。

### 測試
- **98 → 131 個案例**。新增的案例會啟動真實的程式：UC-32 讓十六個程式搶同一把鎖，跑三輪，因為八個程式的版本曾讓有問題的實作連續通過三次。TC-59 綁定的優先期間被淘汰後，它的測試資料年齡從 120 秒改為 900 秒；名稱與斷言不變。

---

## 1.2.1 (2026-08-29)

### 文件

#### AI / skill / versioning
- **每個位數的語意規則**：`version` skill 寫了 `x.y.z` 格式，卻從沒說明每一位代表什麼。現在附上一張表：`x` 代表破壞相容性、`y` 代表新功能、`z` 代表修錯或文件修改，並規定進位時右側所有位數歸 `0`。
- **1.0 之前的規則**：`x` 還是 `0` 時，破壞性變更只加 `y`，不加 `x`。進到 `1.0.0` 需要使用者宣告介面已經穩定，skill 絕不自行決定。
- **移除一條無法判斷的規則**：「只有大改動才進 minor 或 major」沒有給 agent 任何可以套用的判準，改由位數表取代。
- **命名說明**：`x.y.z` 和 `x.x.x` 指的是同一個版號。skill 寫成 `x.y.z`，是為了能分別指稱每一位。

---

## 1.2.0 (2026-08-29)

### 新功能

#### AI / skill / versioning（新增）
- **給 Claude Code 用的 `version` skill**：可移植的版號與發布 skill。規則寫在 skill 裡，各專案的路徑寫在自己的 `.claude/version.config.json`，所以一份 skill 服務所有 repo，不必猜檔名。
- **用 `gh` 自動建立 GitHub Release**：建立 Release，或用 `gh release edit --notes-file` 覆寫寫錯的內文。Release 內文取自 CHANGELOG 的段落，所以 CHANGELOG 仍是唯一的真實來源。
- **CHANGELOG 段落擷取**：一段 `python3` 程式讀出單一版本的段落。`re.escape` 讓 `0.9.2` 不會命中 `0.9.20`，遇到下一個版本標題就停止。
- **Bootstrap 流程**：skill 會偵測版號檔、CHANGELOG、分支與 tag 格式，先提出設定草案請你核准，核准前不寫入任何檔案。
- **README**：用 symlink 安裝、`git pull` 更新，另附驗證清單。

#### 整個 repo
- **`CHANGELOG.md`（新增）**：整個 repo 的版本歷史，從 Release v1.0.0 到 v1.1.0 回填。
- **`.claude/version.config.json`（新增）**：`version` skill 用的路徑設定。
- **內容管線**：`site/scripts/sync-content.mjs` 現在會略過 `skill` 資料夾。skill 是 Claude Code 的資產，不是維運文件，而且 `AI/skill/<name>/README.md` 比網站發布的兩層規則多一層。

---

## 1.1.0 (2026-08-27)

### 新功能與強化

#### deploy-supabase（相容 v0.8.0+）
- **CLI 參數與非互動模式**：完整支援 CLI 參數，以及給 CI/CD 與自動化部署用的 `-y` / `--non-interactive` 旗標。
- **自訂核心帳密**：可自訂或自動產生高強度的帳密，涵蓋 PostgreSQL（`--db-password`）、Studio Dashboard（`--dashboard-user`、`--dashboard-password`）與 MinIO/S3（`--minio-user`、`--minio-password`）。
- **Envoy Gateway 與 Studio 架構**：對齊 Supabase v0.8.0+ 的架構：Studio 經由 API Gateway（port 8000）路由，Kong 改為選用的 override。
- **擴充 override 模組**：支援 `kong`、`pg15`（預設為 PG 17）、`caddy`、`nginx`、`s3`、`rustfs` 與 `logs`，並支援官方的 `run.sh` 工具。
- **反向代理**：支援 `-r` / `--reverse-proxy` 旗標，整理對外網址並去掉特殊的主機 port。
- **文件**：README 加上 CLI 參數對照表、架構說明與驗證方式。

#### AI / agy_usage_hud
- **Context Window（CTX）**：狀態列 HUD 加入 Context Window 用量欄位。

---

## 1.0.1 (2026-08-06)

### 文件更新

- **deploy-supabase**：
  - 文件中的執行指令改成先下載腳本再執行，確保互動模式的 stdin 能正常運作。

---

## 1.0.0 (2026-08-06)

### 首次發布：Supabase Self-Hosted 自動化部署腳本

- **deploy-supabase**：
  - 在 Linux 上自動部署 Supabase Self-Hosted 的互動式 bash 腳本。
  - 支援多租戶與同機多專案的 Port 偏移。
  - 部署前檢測 Port 衝突。
  - 去除 Docker Compose 的容器名稱衝突。
  - 支援官方 Docker Compose override（Caddy、Nginx、MinIO、Logflare、PG17）。
  - 整合文件網站。
