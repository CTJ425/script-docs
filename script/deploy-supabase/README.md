# Supabase Self-Hosted 自動化部署與配置腳本

在 Linux 伺服器／VM 上快速自動化部署與配置 Supabase Self-Hosted 環境的互動式 Shell 腳本。

本腳本自動整合 Supabase 官方最新 setup 腳本，處理環境變數自動帶入、Docker 容器名稱衝突排除、對外 Port 衝突檢測與同機多專案 Port 智慧偏移，並支援選用擴充模組（Compose Overrides）。

---

## 🚀 下載與執行 (Quick Start)

因腳本包含互動式提示與輸入，請下載至本地後再執行：

```bash
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/deploy-supabase/deploy-supabase.sh -o deploy-supabase.sh \
  && chmod +x deploy-supabase.sh \
  && ./deploy-supabase.sh
```

---

## 🛠️ 核心功能與特色

1. **智慧互動配置**：
   - 支援專案名稱輸入與格式正規化（符合 Docker 命名規範）。
   - 自動生成 20 字元亂數 Project Ref 做為預設子網域。
   - 靈活設定目標網域 (Domain) 與通訊協定 (`http` / `https`)。

2. **同機多專案 Port 智慧偏移與隔離**：
   - **連號次序偏移**：輸入專案號次 $N$（例如第 2 個專案輸入 $1$），全體對外 Port 自動 $+N$。若誤輸入 Port（如 8001），腳本會智慧算回偏移量。
   - **Kong HTTP 基準 Port 偏移**：指定 Kong HTTP 基準 Port（如 8001），其他 Port 按比例自動對齊推算。
   - **手動個別 Port 輸入**：針對特殊網路需求逐一指定個別服務 Port。

3. **Port 衝突預先檢測**：
   - 執行部署前自動掃描宿主機 Ports（`ss -tuln`），若發現 Kong、Studio、Postgres 等 Port 已被佔用即時發出警告。

4. **容器名稱衝突排除 (Multi-Tenant Ready)**：
   - 自動清掃 `docker-compose.yml` 及相關 Override 設定檔中寫死的 `container_name`。
   - 自動將 Compose `name` 修訂為自訂專案名稱，徹底避免同機多 Supabase 實例時 Docker Compose 的命名衝突。

5. **擴充模組整合 (Docker Compose Overrides)**：
   - 支援選用豐富的官方／自訂擴充模組（Caddy / Nginx 反向代理、Envoy Gateway、MinIO S3 儲存、RustFS、Logflare 日誌服務、Postgres 17 引擎等）。

---

## 📋 預設服務 Port 對照表

| 服務名稱 | 腳本內部變數 | 預設對外 Host Port | 說明 |
| :--- | :--- | :--- | :--- |
| **Kong HTTP** | `KONG_HTTP_PORT` | `8000` | Supabase API Gateway & Rest API 入口 |
| **Kong HTTPS** | `KONG_HTTPS_PORT` | `8443` | SSL 入口 |
| **Studio Dashboard**| `STUDIO_PORT` | `3000` | Supabase 管理後台 Web UI |
| **PostgreSQL** | `POSTGRES_PORT` | `5432` | 資料庫主服務對外 Port |
| **PgBouncer Pooler** | `POOLER_PORT` | `6543` | 連線池 Transaction 代理 Port |

---

## 📖 部署步驟說明

1. **執行腳本**：啟動 `deploy-supabase.sh`。
2. **輸入基本資訊**：
   - 專案名稱 (預設: `supabase-app`)
   - 基礎 Domain (預設: `ivan.lab`)
   - 完整 Domain (預設: `<random-ref>.<base-domain>`)
   - 通訊協定 (預設: `http`)
3. **Port 設定**：選擇是否為同機多專案部署並設定偏移量。
4. **官方 Setup**：腳本自動拉取官方腳本生成安全的 JWT Secret、PostgreSQL 密碼與 API 金鑰。
5. **模組選擇**：按需啟用擴充模組 (Overrides)。
6. **啟動服務**：
   腳本完成配置後，切換至生成之專案目錄並啟動：
   ```bash
   cd <專案名稱>
   docker compose up -d
   ```

---

## ❓ 疑難排解 (Troubleshooting)

| 症狀 | 排查與修復方向 |
| :--- | :--- |
| **Port 衝突警告** | 檢查是否已有其他服務（例如本地已有 PostgreSQL 服用 5432 埠）。部署時請選擇開啟 Port 自動偏移。 |
| **無法訪問 Studio 或 API** | 請確認 DNS 解析或測試機 `/etc/hosts` 已將設定的 Domain 指向該 Linux 宿主機 IP。 |
| **Docker Compose 衝突** | 腳本已自動移除 `container_name` 寫死設定。若為手動調整，請確保 `COMPOSE_PROJECT_NAME` 唯一。 |

---

## 📄 授權 (License)

本專案基於 [MIT License](LICENSE) 釋出。
