#!/usr/bin/env bash

set -e

log()  { printf "\033[1;34m===> %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m[警告] %s\033[0m\n" "$*"; }
die()  { printf "\033[1;31m[錯誤] %s\033[0m\n" "$*" >&2; exit 1; }

if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
  echo "使用方式: ./deploy-supabase.sh"
  echo "Supabase Self-Hosted 自動化部署與配置腳本"
  exit 0
fi

echo "=================================================="
echo "    Supabase Self-Hosted 自動化部署與配置腳本"
echo "=================================================="
echo ""

# 2. 安全的 input 讀取函式 (支援 Enter 預設值與 Pipe 輸入)
read_p_def() {
  local prompt=$1
  local default=$2
  local reply=""
  read -r -p "${prompt} (預設: ${default}): " reply || true
  echo "${reply:-$default}"
}

# 驗證整數數字 (1-65535)
validate_port() {
  local port=$1
  local name=$2
  if [[ ! "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 0 ] || [ "$port" -gt 65535 ]; then
    die "欄位 ${name} 必須為 0 到 65535 之間的有效整數 (您輸入的數值: '$port')"
  fi
}

# 3. 專案名稱輸入與正規化
INPUT_PROJECT_NAME=$(read_p_def "請輸入專案名稱" "supabase-app")
PROJECT_NAME=$(echo "$INPUT_PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/_/g')
if [ "$PROJECT_NAME" != "$INPUT_PROJECT_NAME" ]; then
  log "已自動將專案名稱正規化為符合 Docker 規範的格式: '${PROJECT_NAME}'"
fi

# 產生 20 字元亂數 Project Ref 做為預設子網域
PROJECT_REF=$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom | head -c 20)

INPUT_BASE_DOMAIN=$(read_p_def "請輸入基礎 Domain" "ivan.lab")
BASE_DOMAIN=${INPUT_BASE_DOMAIN}

DEFAULT_DOMAIN="${PROJECT_REF}.${BASE_DOMAIN}"
INPUT_FULL_DOMAIN=$(read_p_def "請輸入目標完整 Domain/網址" "${DEFAULT_DOMAIN}")
FULL_DOMAIN=$(echo "$INPUT_FULL_DOMAIN" | sed -e 's|^https*://||' -e 's|:[0-9]*.*$||' -e 's|/.*$||')

INPUT_PROTOCOL=$(read_p_def "請選擇通訊協定 (http/https)" "http")
PROTOCOL=${INPUT_PROTOCOL}

echo ""
USE_REVERSE_PROXY=""
read -r -p "是否預計使用對外反向代理 (Reverse Proxy)？(對外 URL 自動去除特規 Port) (y/N) [N]: " USE_REVERSE_PROXY || true
USE_REVERSE_PROXY=${USE_REVERSE_PROXY:-N}

echo ""
echo "--------------------------------------------------"
echo "            對外 Port (Host Port) 設定與隔離檢測"
echo "--------------------------------------------------"
NEED_PORT_OFFSET=""
read -r -p "是否為同台 VM 的多專案部署？(要自動進行對外 Port 偏移請打 y/N) [N]: " NEED_PORT_OFFSET || true
NEED_PORT_OFFSET=${NEED_PORT_OFFSET:-N}

KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443
STUDIO_PORT=3000
POSTGRES_PORT=5432
POOLER_PORT=6543

if [[ "$NEED_PORT_OFFSET" =~ ^[Yy]$ ]]; then
  echo ""
  echo "請選擇對外 Port 設定方式:"
  echo "  1) 輸入專案連號次序 (例如第 2 個專案輸入 1 則 Port 全體 +1)"
  echo "  2) 指定 Kong HTTP 基準 Port (例如輸入 8001，其餘 Port 自動按比例推算)"
  echo "  3) 手動個別輸入每個 Port (HTTP, HTTPS, Studio, Postgres, Pooler)"
  PORT_MODE=""
  read -r -p "請選擇 [1/2/3] (預設 1): " PORT_MODE || true
  PORT_MODE=${PORT_MODE:-1}

  if [ "$PORT_MODE" = "1" ]; then
    OFFSET=""
    read -r -p "請輸入專案次序 N (例如第 2 個專案請輸入 1): " OFFSET || true
    OFFSET=${OFFSET:-1}
    validate_port "$OFFSET" "專案次序 N"
    
    # 智慧容錯：若使用者誤輸入成目標 Port (如 8001)，自動換算 OFFSET
    if [ "$OFFSET" -ge 1000 ]; then
      TARGET_BASE_PORT=$OFFSET
      OFFSET=$((TARGET_BASE_PORT - 8000))
      log "檢測到您輸入的是目標 Port ${TARGET_BASE_PORT}，自動計算連號偏移量為 N = +${OFFSET}"
    fi

    KONG_HTTP_PORT=$((KONG_HTTP_PORT + OFFSET))
    KONG_HTTPS_PORT=$((KONG_HTTPS_PORT + OFFSET))
    STUDIO_PORT=$((STUDIO_PORT + OFFSET))
    POSTGRES_PORT=$((POSTGRES_PORT + OFFSET))
    POOLER_PORT=$((POOLER_PORT + OFFSET))

  elif [ "$PORT_MODE" = "2" ]; then
    NEW_BASE_PORT=""
    read -r -p "請輸入目標 Kong HTTP Port (例如 8001): " NEW_BASE_PORT || true
    NEW_BASE_PORT=${NEW_BASE_PORT:-8001}
    validate_port "$NEW_BASE_PORT" "Kong HTTP Port"

    OFFSET=$((NEW_BASE_PORT - 8000))
    KONG_HTTP_PORT=$NEW_BASE_PORT
    KONG_HTTPS_PORT=$((KONG_HTTPS_PORT + OFFSET))
    STUDIO_PORT=$((STUDIO_PORT + OFFSET))
    POSTGRES_PORT=$((POSTGRES_PORT + OFFSET))
    POOLER_PORT=$((POOLER_PORT + OFFSET))

  else
    KONG_HTTP_PORT=$(read_p_def "請輸入 Kong HTTP 對外 Port" "8000")
    validate_port "$KONG_HTTP_PORT" "Kong HTTP Port"

    KONG_HTTPS_PORT=$(read_p_def "請輸入 Kong HTTPS 對外 Port" "8443")
    validate_port "$KONG_HTTPS_PORT" "Kong HTTPS Port"

    STUDIO_PORT=$(read_p_def "請輸入 Studio Dashboard 對外 Port" "3000")
    validate_port "$STUDIO_PORT" "Studio Port"

    POSTGRES_PORT=$(read_p_def "請輸入 Postgres 對外 Port" "5432")
    validate_port "$POSTGRES_PORT" "Postgres Port"

    POOLER_PORT=$(read_p_def "請輸入 Pooler Transaction 對外 Port" "6543")
    validate_port "$POOLER_PORT" "Pooler Port"
  fi
fi

if [[ "$USE_REVERSE_PROXY" =~ ^[Yy]$ ]]; then
  PUBLIC_URL="${PROTOCOL}://${FULL_DOMAIN}"
  API_URL="${PROTOCOL}://${FULL_DOMAIN}"
  SITE_URL_FULL="${PROTOCOL}://${FULL_DOMAIN}"
else
  PUBLIC_URL="${PROTOCOL}://${FULL_DOMAIN}:${KONG_HTTP_PORT}"
  API_URL="${PROTOCOL}://${FULL_DOMAIN}:${KONG_HTTP_PORT}"
  SITE_URL_FULL="${PROTOCOL}://${FULL_DOMAIN}:${STUDIO_PORT}"
fi

echo ""
echo "--> 正在檢測宿主機對外 Port 是否重複佔用..."
for p in "$KONG_HTTP_PORT" "$KONG_HTTPS_PORT" "$STUDIO_PORT" "$POSTGRES_PORT" "$POOLER_PORT"; do
  if command -v ss >/dev/null 2>&1 && ss -tuln | grep -q ":${p} "; then
    warn "對外 Port ${p} 目前已被主機上的其他程序佔用！請注意避開衝突。"
  fi
done

echo ""
echo "--------------------------------------------------"
echo "              即將套用以下對外 Port 配置"
echo "--------------------------------------------------"
echo " 專案名稱 (Project Name) : ${PROJECT_NAME}"
echo " 專案資料夾              : ./${PROJECT_NAME}"
echo " 隨機 Project Ref       : ${PROJECT_REF}"
echo " 完整目標 Domain         : ${FULL_DOMAIN}"
echo " 通訊協定 (Protocol)     : ${PROTOCOL}"
echo " 反向代理 (Reverse Proxy): ${USE_REVERSE_PROXY}"
if [[ "$USE_REVERSE_PROXY" =~ ^[Yy]$ ]]; then
echo " Kong HTTP Port (內部)   : ${KONG_HTTP_PORT}"
echo " Kong HTTPS Port (內部)  : ${KONG_HTTPS_PORT}"
echo " Studio Dashboard (內部) : ${STUDIO_PORT}"
else
echo " Kong HTTP Port (對外)   : ${KONG_HTTP_PORT}"
echo " Kong HTTPS Port (對外)  : ${KONG_HTTPS_PORT}"
echo " Studio Dashboard (對外) : ${STUDIO_PORT}"
fi
echo " Postgres Port (對外)    : ${POSTGRES_PORT}"
echo " Pooler Port (對外)      : ${POOLER_PORT}"
echo " Public URL              : ${PUBLIC_URL}"
echo " API External URL        : ${API_URL}"
echo " Site URL                : ${SITE_URL_FULL}"
echo "--------------------------------------------------"
CONFIRM=""
read -r -p "確認開始安裝？ (Y/n): " CONFIRM || true
CONFIRM=${CONFIRM:-Y}
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "已取消部署。"
  exit 0
fi

# 4. 下載與執行官方 Setup 腳本
echo ""
echo "--> 正在下載 Supabase 官方 Setup 腳本..."
TMP_SETUP=$(mktemp)
curl -fsSL https://supabase.link/setup.sh -o "$TMP_SETUP" || die "下載 Supabase 官方 setup.sh 腳本失敗！"

echo "--> 正在執行 Supabase 官方 Setup 腳本..."
sh "$TMP_SETUP" -y -p "${PROJECT_NAME}" || die "執行 setup.sh 腳本時發生錯誤！"
rm -f "$TMP_SETUP"

if [ ! -d "${PROJECT_NAME}" ]; then
  die "找不到專案目錄 ./${PROJECT_NAME}！"
fi

cd "${PROJECT_NAME}"

# 確保 .env 檔案存在
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
  else
    die "在 ${PROJECT_NAME} 目錄下找不到 .env 或是 .env.example 檔案！"
  fi
fi

# 5. 寫入 / 更新 .env 設定檔
echo "--> 正在將自訂設定自動帶入 ${PROJECT_NAME}/.env ..."

set_env_var() {
  local key=$1
  local value=$2
  local env_file=".env"

  if grep -q "^${key}=" "$env_file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$env_file"
  else
    echo "${key}=${value}" >> "$env_file"
  fi
}

set_env_var "COMPOSE_PROJECT_NAME" "${PROJECT_NAME}"
set_env_var "KONG_HTTP_PORT" "${KONG_HTTP_PORT}"
set_env_var "KONG_HTTPS_PORT" "${KONG_HTTPS_PORT}"
set_env_var "STUDIO_PORT" "${STUDIO_PORT}"
set_env_var "POSTGRES_PORT" "${POSTGRES_PORT}"
set_env_var "POOLER_PROXY_PORT_TRANSACTION" "${POOLER_PORT}"
set_env_var "SUPABASE_PUBLIC_URL" "${PUBLIC_URL}"
set_env_var "API_EXTERNAL_URL" "${API_URL}"
set_env_var "SITE_URL" "${SITE_URL_FULL}"
set_env_var "PROXY_DOMAIN" "${FULL_DOMAIN}"

# 5.1 移除 docker-compose 設定中的寫死 container_name 與修訂專案名稱，避免多專案容器名稱衝突
echo "--> 正在移除 docker-compose 設定檔中寫死的 container_name..."
if [ -f docker-compose.yml ]; then
  sed -i '/container_name:/d' docker-compose.yml
  sed -i "s/^name: .*/name: ${PROJECT_NAME}/" docker-compose.yml
  for cf in docker-compose.*.yml; do
    if [ -f "$cf" ]; then
      sed -i '/container_name:/d' "$cf"
    fi
  done
fi

# 5.5. Docker Compose Overrides (選用擴充模組) 設定
echo ""
echo "--------------------------------------------------"
echo "       Docker Compose Overrides (選用擴充模組)"
echo "--------------------------------------------------"
ASK_OVERRIDES=""
read -r -p "是否要選擇設定擴充模組 (Overrides)？(y/N) [N]: " ASK_OVERRIDES || true
ASK_OVERRIDES=${ASK_OVERRIDES:-N}

SELECTED_OVERRIDES_LIST=""

if [[ "$ASK_OVERRIDES" =~ ^[Yy]$ ]]; then
  echo ""
  echo "請逐一選擇欲啟用的擴充模組 (按 Enter 預設跳過 / 輸入 y 啟用):"
  echo ""

  ask_module() {
    local mod=$1
    local desc=$2
    local choice=""
    read -r -p " -> 是否啟用 ${mod} (${desc})？(y/N) [N]: " choice || true
    choice=${choice:-N}
    if [[ "$choice" =~ ^[Yy]$ ]]; then
      if [ -f "./run.sh" ]; then
        echo "   [+] 正在透過 run.sh 啟用模組: ${mod} ..."
        if sh run.sh config add "$mod"; then
          SELECTED_OVERRIDES_LIST="${SELECTED_OVERRIDES_LIST} ${mod}"
        else
          warn "啟用模組 ${mod} 失敗！"
        fi
      else
        current_compose=$(grep "^COMPOSE_FILE=" .env 2>/dev/null | cut -d= -f2-)
        [ -z "$current_compose" ] && current_compose="docker-compose.yml"
        override_file="docker-compose.${mod}.yml"
        if [ -f "$override_file" ] && [[ "$current_compose" != *"$override_file"* ]]; then
          current_compose="${current_compose}:${override_file}"
          set_env_var "COMPOSE_FILE" "${current_compose}"
          echo "   [+] 已將 ${override_file} 加入 .env 的 COMPOSE_FILE"
          SELECTED_OVERRIDES_LIST="${SELECTED_OVERRIDES_LIST} ${mod}"
        fi
      fi
    fi
  }

  ask_module "caddy"  "Caddy HTTPS 反向代理"
  ask_module "nginx"  "Nginx HTTPS 反向代理"
  ask_module "envoy"  "Envoy API Gateway"
  ask_module "s3"     "MinIO S3 儲存後端"
  ask_module "rustfs" "RustFS 高效能儲存"
  ask_module "logs"   "Logflare 日誌增強服務"
  ask_module "pg17"   "Postgres 17 資料庫引擎"
fi

# 6. 輸出最終 Summary
echo ""
echo "=================================================="
echo "          Supabase 配置完成 Summary"
echo "=================================================="
echo " 專案目錄                : $(pwd)"
echo " 專案名稱 (Project Name) : ${PROJECT_NAME}"
echo " 隨機 Project Ref       : ${PROJECT_REF}"
echo " 完整目標 Domain         : ${FULL_DOMAIN}"
echo " 反向代理 (Reverse Proxy): ${USE_REVERSE_PROXY}"
if [[ "$USE_REVERSE_PROXY" =~ ^[Yy]$ ]]; then
echo " Kong HTTP Port (內部)   : ${KONG_HTTP_PORT}"
echo " Kong HTTPS Port (內部)  : ${KONG_HTTPS_PORT}"
echo " Studio Dashboard (內部) : ${STUDIO_PORT}"
else
echo " Kong HTTP Port (對外)   : ${KONG_HTTP_PORT}"
echo " Kong HTTPS Port (對外)  : ${KONG_HTTPS_PORT}"
echo " Studio Dashboard (對外) : ${STUDIO_PORT}"
fi
echo " Postgres Port (對外)    : ${POSTGRES_PORT}"
echo " Pooler Port (對外)      : ${POOLER_PORT}"
if [ -n "$SELECTED_OVERRIDES_LIST" ]; then
echo " 已啟用 Overrides 模組   : ${SELECTED_OVERRIDES_LIST}"
fi
echo "--------------------------------------------------"
echo " Public URL / Studio     : ${PUBLIC_URL}"
echo " API External URL        : ${API_URL}"
echo " Site (Auth Redirect)    : ${SITE_URL_FULL}"
echo "=================================================="
echo ""
echo "提示: 官方 Setup 腳本已為您自動生成安全的 JWT_SECRET、PostgreSQL 密碼與 API 金鑰。"
echo "請確保您的 DNS / /etc/hosts 已將 *.${BASE_DOMAIN} 解析至此主機 IP。"
echo "專案位置: $(pwd)"
echo "現在你可以切換到該目錄執行 'docker compose up -d' 來啟動服務。"
