# Supabase Self-Hosted 自動化部署與配置腳本

> 最後更新：2026-08-27

在 Linux 伺服器／VM 上快速自動化部署與配置 Supabase Self-Hosted (v0.8.0+) 環境的 Shell 腳本。

本腳本自動整合 Supabase 官方最新 setup 腳本，處理環境變數自動帶入、核心帳密安全配置、Docker 容器名稱衝突排除、對外 Port 衝突檢測與同機多專案 Port 智慧偏移，並支援完整 CLI 參數、非互動式（CI/CD）自動化以及選用擴充模組（Compose Overrides）。

---

## 🚀 下載與執行 (Quick Start)

### 互動模式 (預設)

下載至本地後直接執行，依照終端機提示逐步設定：

```bash
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/deploy-supabase/deploy-supabase.sh -o deploy-supabase.sh \
  && chmod +x deploy-supabase.sh \
  && ./deploy-supabase.sh
```

### 非互動／自動化模式 (CLI 參數)

支援透過參數直接指定配置，適合自動化腳本或 CI/CD 流程：

```bash
# 全預設值一鍵自動安裝 (專案名稱 supabase-app、網域 ivan.lab)
./deploy-supabase.sh --yes

# 自訂專案名稱、網域、啟用反向代理與指定擴充模組
./deploy-supabase.sh \
  --name my-supabase \
  --domain myapp.example.com \
  --protocol https \
  --reverse-proxy y \
  --overrides kong,s3,caddy \
  --yes
```

---

## 🛠️ 核心功能與特色

1. **雙模式執行（互動提示 / CLI 參數）**：
   - 支援全互動式問答模式，Enter 即可套用智慧預設值。
   - 支援完整 CLI 參數與 `-y, --yes` 非互動模式，輕鬆納入自動化維運流程。

2. **核心帳號密碼安全自訂**：
   - 支援自訂或自動生成高強度隨機密碼（PostgreSQL 資料庫、Studio Dashboard 管理帳號密碼、MinIO/S3 Root 帳號密碼）。
   - 官方腳本同步自動生成安全的 JWT Secret 與 API Key。

3. **同機多專案 Port 智慧偏移與隔離**：
   - **連號次序偏移**：輸入專案號次 $N$（例如第 2 個專案輸入 $1$），全體對外 Port 自動 $+N$。若誤輸入 Port（如 8001），腳本會智慧算回偏移量。
   - **API Gateway HTTP 基準 Port 偏移**：指定 Gateway HTTP 基準 Port（如 8001），其他 Port 按比例自動對齊推算。
   - **手動個別 Port 輸入**：針對特殊網路架構逐一指定個別服務 Port。

4. **Port 衝突預先檢測**：
   - 執行部署前自動掃描宿主機 Ports（`ss -tuln`），若發現 Gateway、Postgres、Pooler 等 Port 已被佔用即時發出警告或中斷以防衝突。

5. **容器名稱衝突排除 (Multi-Tenant Ready)**：
   - 自動清掃 `docker-compose.yml` 及相關 Override 設定檔中寫死的 `container_name`。
   - 自動將 Compose `name` 修訂為自訂專案名稱，徹底避免同機多 Supabase 實例時 Docker Compose 的命名衝突。

6. **擴充模組整合 (Docker Compose Overrides)**：
   - 支援官方與社群常用擴充模組：`kong` (Kong API Gateway)、`pg15` (Postgres 15 引擎，預設為 PG 17)、`caddy` / `nginx` (HTTPS 反向代理)、`s3` (MinIO S3 儲存)、`rustfs` (高效能儲存)、`logs` (Logflare 日誌增強)。

---

## 📋 預設服務 Port 對照表

| 服務名稱 | 腳本內部變數 | 預設對外 Host Port | 說明 |
| :--- | :--- | :--- | :--- |
| **API Gateway (HTTP)** | `API_GW_HTTP_PORT` | `8000` | Supabase API Gateway / Studio Dashboard / REST API 統一入口 |
| **Kong HTTPS** | `KONG_HTTPS_PORT` | `8443` | Kong SSL 入口（僅啟用 `kong` 模組時有效） |
| **PostgreSQL (Direct)** | `POSTGRES_PORT` | `5432` | 資料庫主服務直連 Port |
| **Supavisor Pooler** | `POOLER_PORT` | `6543` | 連線池 Transaction 代理 Port |

> [!NOTE]
> 在 Supabase v0.8.0+ 架構中，Studio Dashboard 整合於 API Gateway (Port 8000) 背後統一路由，無須額外開放獨立 Port。

---

## ⚙️ CLI 參數清單 (CLI Options)

| 參數 | 預設值 | 說明 |
| :--- | :--- | :--- |
| `-n, --name <NAME>` | `supabase-app` | 專案名稱（自動正規化為符合 Docker 規範格式） |
| `-d, --domain <DOMAIN>` | `ivan.lab` | 基礎 Domain 或目標完整網址 |
| `-p, --protocol <http\|https>` | `http` | 通訊協定 |
| `-r, --reverse-proxy <y\|n>` | `n` | 是否預計使用對外反向代理（自動去除對外 URL 特規 Port） |
| `--port-offset <N>` | - | 專案連號次序偏移量（如 `1` 代表所有 Port $+1$） |
| `--gateway-port <PORT>` | `8000` | 指定 API Gateway HTTP 對外 Port |
| `--kong-https-port <PORT>` | `8443` | 指定 Kong HTTPS 對外 Port |
| `--db-port <PORT>` | `5432` | 指定 Postgres Direct 對外 Port |
| `--pooler-port <PORT>` | `6543` | 指定 Supavisor Pooler Transaction 對外 Port |
| `--overrides <LIST>` | - | 擴充模組逗號分隔清單（如 `kong,s3,caddy`） |
| `--db-password <PASS>` | 自動生成 | 自訂 PostgreSQL 資料庫密碼 |
| `--dashboard-user <USER>` | `supabase` | 自訂 Studio Dashboard 登入帳號 |
| `--dashboard-password <PASS>` | 自動生成 | 自訂 Studio Dashboard 登入密碼 |
| `--minio-user <USER>` | `supa-storage` | 自訂 MinIO/S3 Root 管理員帳號 |
| `--minio-password <PASS>` | 自動生成 | 自訂 MinIO/S3 Root 管理員密碼 |
| `-y, --yes, --non-interactive` | - | 非互動模式，自動接受預設值與確認 |
| `-h, --help` | - | 顯示使用說明 |

---

## 📖 部署步驟說明

1. **執行腳本**：啟動 `deploy-supabase.sh`（或帶入 CLI 參數）。
2. **輸入基本資訊**：
   - 專案名稱 (預設: `supabase-app`)
   - 基礎 Domain (預設: `ivan.lab`)
   - 完整 Domain (預設: `<random-ref>.<base-domain>`)
   - 通訊協定 (預設: `http`)
   - 反向代理設定 (`y/N`)
3. **Port 設定**：選擇是否為同機多專案部署並設定偏移量。
4. **帳號密碼設定**：選擇自訂或自動生成高強度隨機密碼。
5. **官方 Setup**：腳本自動拉取官方腳本生成安全的 JWT Secret 與 API 金鑰。
6. **模組選擇**：按需啟用擴充模組 (Overrides)。
7. **啟動服務**：
   腳本完成配置後，切換至生成之專案目錄並啟動：
   ```bash
   cd <專案名稱>
   docker compose up -d
   # 或使用官方工具腳本
   sh run.sh start
   ```

---

## ❓ 疑難排解 (Troubleshooting)

| 症狀 | 排查與修復方向 |
| :--- | :--- |
| **Port 衝突警告** | 檢查是否已有其他服務（例如本地已有 PostgreSQL 佔用 5432 埠）。部署時請選擇開啟 Port 自動偏移或透過 `--port-offset` / `--db-port` 調整。 |
| **無法訪問 Studio 或 API** | 請確認 DNS 解析或測試機 `/etc/hosts` 已將設定的 Domain 指向該 Linux 宿主機 IP。 |
| **Docker Compose 衝突** | 腳本已自動移除 `container_name` 寫死設定。若為手動調整，請確保 `COMPOSE_PROJECT_NAME` 唯一。 |

---

## 📄 授權 (License)

本專案基於 [MIT License](LICENSE) 釋出。
