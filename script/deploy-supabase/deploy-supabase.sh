#!/usr/bin/env bash

set -e

log()  { printf "\033[1;34m===> %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m[警告] %s\033[0m\n" "$*"; }
die()  { printf "\033[1;31m[錯誤] %s\033[0m\n" "$*" >&2; exit 1; }

usage() {
  cat << 'EOF'
使用方式: ./deploy-supabase.sh [OPTIONS]
Supabase Self-Hosted (v0.8.0+) 自動化部署與配置腳本

基本選項 (未指定時將進入互動式問答模式):
  -n, --name <NAME>            專案名稱 (預設: supabase-app)
  -d, --domain <DOMAIN>        基礎 Domain 或目標完整網址 (預設: ivan.lab)
  -p, --protocol <http|https>  通訊協定 (預設: http)
  -r, --reverse-proxy <y|n>    是否預計使用對外反向代理 (預設: n)
  --port-offset <N>            專案連號次序偏移量 (例如 1 代表 Port 全體 +1)
  --gateway-port <PORT>        指定 API Gateway HTTP 對外 Port (預設: 8000)
  --kong-https-port <PORT>     指定 Kong HTTPS 對外 Port (預設: 8443)
  --db-port <PORT>             指定 Postgres Direct 對外 Port (預設: 5432)
  --pooler-port <PORT>         指定 Supavisor Pooler Transaction 對外 Port (預設: 6543)
  --overrides <LIST>           擴充模組逗號分隔清單 (如: kong,s3,caddy)

核心帳號密碼自訂選項:
  --db-password <PASS>         自訂 PostgreSQL 資料庫密碼 (預設: 自動隨機生成)
  --dashboard-user <USER>      自訂 Studio Dashboard 登入帳號 (預設: supabase)
  --dashboard-password <PASS>  自訂 Studio Dashboard 登入密碼 (預設: 自動隨機生成)
  --minio-user <USER>          自訂 MinIO/S3 Root 管理員帳號 (預設: supa-storage)
  --minio-password <PASS>      自訂 MinIO/S3 Root 管理員密碼 (預設: 自動隨機生成)

執行選項:
  -y, --yes, --non-interactive 非互動模式，自動接受預設值與確認
  -h, --help                   顯示此說明訊息
EOF
  exit 0
}

# 1. 參數解析 (CLI 參數支援)
CLI_NAME=""
CLI_DOMAIN=""
CLI_PROTOCOL=""
CLI_REVERSE_PROXY=""
CLI_PORT_OFFSET=""
CLI_GATEWAY_PORT=""
CLI_KONG_HTTPS_PORT=""
CLI_DB_PORT=""
CLI_POOLER_PORT=""
CLI_OVERRIDES=""

CLI_DB_PASSWORD=""
CLI_DASHBOARD_USER=""
CLI_DASHBOARD_PASSWORD=""
CLI_MINIO_USER=""
CLI_MINIO_PASSWORD=""

NON_INTERACTIVE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      ;;
    -n|--name)
      CLI_NAME="$2"; shift 2
      ;;
    -d|--domain)
      CLI_DOMAIN="$2"; shift 2
      ;;
    -p|--protocol)
      CLI_PROTOCOL="$2"; shift 2
      ;;
    -r|--reverse-proxy)
      CLI_REVERSE_PROXY="$2"; shift 2
      ;;
    --port-offset)
      CLI_PORT_OFFSET="$2"; shift 2
      ;;
    --gateway-port)
      CLI_GATEWAY_PORT="$2"; shift 2
      ;;
    --kong-https-port)
      CLI_KONG_HTTPS_PORT="$2"; shift 2
      ;;
    --db-port)
      CLI_DB_PORT="$2"; shift 2
      ;;
    --pooler-port)
      CLI_POOLER_PORT="$2"; shift 2
      ;;
    --overrides)
      CLI_OVERRIDES="$2"; shift 2
      ;;
    --db-password)
      CLI_DB_PASSWORD="$2"; shift 2
      ;;
    --dashboard-user)
      CLI_DASHBOARD_USER="$2"; shift 2
      ;;
    --dashboard-password)
      CLI_DASHBOARD_PASSWORD="$2"; shift 2
      ;;
    --minio-user)
      CLI_MINIO_USER="$2"; shift 2
      ;;
    --minio-password)
      CLI_MINIO_PASSWORD="$2"; shift 2
      ;;
    -y|--yes|--non-interactive)
      NON_INTERACTIVE=1; shift
      ;;
    *)
      die "未知參數: $1 (使用 --help 查看使用說明)"
      ;;
  esac
done

echo "=================================================="
echo "    Supabase Self-Hosted 自動化部署與配置腳本"
echo "=================================================="
echo ""

# 2. 安全的 input 讀取函式 (支援 Enter 預設值與 Pipe 輸入)
read_p_def() {
  local prompt=$1
  local default=$2
  local reply=""
  if [ "$NON_INTERACTIVE" -eq 1 ]; then
    echo "$default"
    return 0
  fi
  read -r -p "${prompt} (預設: ${default}): " reply || true
  echo "${reply:-$default}"
}

# 密碼產生輔助函式
gen_random_secret() {
  local len=${1:-24}
  LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$len"
}

# 驗證整數數字 (1-65535)
validate_port() {
  local port=$1
  local name=$2
  if [[ ! "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    die "欄位 ${name} 必須為 1 到 65535 之間的有效整數 (您輸入的數值: '$port')"
  fi
}

# 3. 專案名稱輸入與正規化
if [ -n "$CLI_NAME" ]; then
  INPUT_PROJECT_NAME="$CLI_NAME"
else
  INPUT_PROJECT_NAME=$(read_p_def "請輸入專案名稱" "supabase-app")
fi
PROJECT_NAME=$(echo "$INPUT_PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/_/g')
if [ "$PROJECT_NAME" != "$INPUT_PROJECT_NAME" ]; then
  log "已自動將專案名稱正規化為符合 Docker 規範的格式: '${PROJECT_NAME}'"
fi

if [ -d "${PROJECT_NAME}" ]; then
  die "專案目錄 ./${PROJECT_NAME} 已經存在！請更換專案名稱或先移除舊專案。"
fi

# 產生 20 字元亂數 Project Ref 做為預設子網域
PROJECT_REF=$(gen_random_secret 20 | tr '[:upper:]' '[:lower:]')

if [ -n "$CLI_DOMAIN" ]; then
  INPUT_BASE_DOMAIN="$CLI_DOMAIN"
else
  INPUT_BASE_DOMAIN=$(read_p_def "請輸入基礎 Domain" "ivan.lab")
fi
BASE_DOMAIN=${INPUT_BASE_DOMAIN}

DEFAULT_DOMAIN="${PROJECT_REF}.${BASE_DOMAIN}"
if [ -n "$CLI_DOMAIN" ]; then
  INPUT_FULL_DOMAIN="$CLI_DOMAIN"
  if [[ "$CLI_DOMAIN" != *"${PROJECT_REF}"* && "$CLI_DOMAIN" != *"."*"."* ]]; then
    INPUT_FULL_DOMAIN="${DEFAULT_DOMAIN}"
  fi
else
  INPUT_FULL_DOMAIN=$(read_p_def "請輸入目標完整 Domain/網址" "${DEFAULT_DOMAIN}")
fi
FULL_DOMAIN=$(echo "$INPUT_FULL_DOMAIN" | sed -e 's|^https*://||' -e 's|:[0-9]*.*$||' -e 's|/.*$||')

if [ -n "$CLI_PROTOCOL" ]; then
  INPUT_PROTOCOL="$CLI_PROTOCOL"
else
  INPUT_PROTOCOL=$(read_p_def "請選擇通訊協定 (http/https)" "http")
fi
PROTOCOL=${INPUT_PROTOCOL}

if [ -n "$CLI_REVERSE_PROXY" ]; then
  USE_REVERSE_PROXY="$CLI_REVERSE_PROXY"
else
  if [ "$NON_INTERACTIVE" -eq 1 ]; then
    USE_REVERSE_PROXY="N"
  else
    echo ""
    read -r -p "是否預計使用對外反向代理 (Reverse Proxy)？(對外 URL 自動去除特規 Port) (y/N) [N]: " USE_REVERSE_PROXY || true
    USE_REVERSE_PROXY=${USE_REVERSE_PROXY:-N}
  fi
fi

# Port 基礎預設值 (Envoy Gateway 8000, Supavisor 5432 & 6543)
API_GW_HTTP_PORT=8000
KONG_HTTPS_PORT=8443
POSTGRES_PORT=5432
POOLER_PORT=6543

if [ -n "$CLI_GATEWAY_PORT" ] || [ -n "$CLI_PORT_OFFSET" ] || [ -n "$CLI_DB_PORT" ] || [ -n "$CLI_POOLER_PORT" ]; then
  if [ -n "$CLI_PORT_OFFSET" ]; then
    OFFSET="$CLI_PORT_OFFSET"
    validate_port "$OFFSET" "專案次序 N"
    if [ "$OFFSET" -ge 1000 ]; then
      OFFSET=$((OFFSET - 8000))
    fi
    API_GW_HTTP_PORT=$((API_GW_HTTP_PORT + OFFSET))
    KONG_HTTPS_PORT=$((KONG_HTTPS_PORT + OFFSET))
    POSTGRES_PORT=$((POSTGRES_PORT + OFFSET))
    POOLER_PORT=$((POOLER_PORT + OFFSET))
  fi
  if [ -n "$CLI_GATEWAY_PORT" ]; then
    validate_port "$CLI_GATEWAY_PORT" "API Gateway HTTP Port"
    API_GW_HTTP_PORT="$CLI_GATEWAY_PORT"
  fi
  if [ -n "$CLI_KONG_HTTPS_PORT" ]; then
    validate_port "$CLI_KONG_HTTPS_PORT" "Kong HTTPS Port"
    KONG_HTTPS_PORT="$CLI_KONG_HTTPS_PORT"
  fi
  if [ -n "$CLI_DB_PORT" ]; then
    validate_port "$CLI_DB_PORT" "Postgres Direct Port"
    POSTGRES_PORT="$CLI_DB_PORT"
  fi
  if [ -n "$CLI_POOLER_PORT" ]; then
    validate_port "$CLI_POOLER_PORT" "Pooler Port"
    POOLER_PORT="$CLI_POOLER_PORT"
  fi
else
  if [ "$NON_INTERACTIVE" -eq 0 ]; then
    echo ""
    echo "--------------------------------------------------"
    echo "            對外 Port (Host Port) 設定與隔離檢測"
    echo "--------------------------------------------------"
    NEED_PORT_OFFSET=""
    read -r -p "是否為同台 VM 的多專案部署？(要自動進行對外 Port 偏移請打 y/N) [N]: " NEED_PORT_OFFSET || true
    NEED_PORT_OFFSET=${NEED_PORT_OFFSET:-N}

    if [[ "$NEED_PORT_OFFSET" =~ ^[Yy]$ ]]; then
      echo ""
      echo "請選擇對外 Port 設定方式:"
      echo "  1) 輸入專案連號次序 (例如第 2 個專案輸入 1 則 Port 全體 +1)"
      echo "  2) 指定 API Gateway HTTP 基準 Port (例如輸入 8001，其餘 Port 自動按比例推算)"
      echo "  3) 手動個別輸入每個 Port (Gateway HTTP, Kong HTTPS, Postgres, Pooler)"
      PORT_MODE=""
      read -r -p "請選擇 [1/2/3] (預設 1): " PORT_MODE || true
      PORT_MODE=${PORT_MODE:-1}

      if [ "$PORT_MODE" = "1" ]; then
        OFFSET=""
        read -r -p "請輸入專案次序 N (例如第 2 個專案請輸入 1): " OFFSET || true
        OFFSET=${OFFSET:-1}
        validate_port "$OFFSET" "專案次序 N"
        
        if [ "$OFFSET" -ge 1000 ]; then
          TARGET_BASE_PORT=$OFFSET
          OFFSET=$((TARGET_BASE_PORT - 8000))
          log "檢測到您輸入的是目標 Port ${TARGET_BASE_PORT}，自動計算連號偏移量為 N = +${OFFSET}"
        fi

        API_GW_HTTP_PORT=$((API_GW_HTTP_PORT + OFFSET))
        KONG_HTTPS_PORT=$((KONG_HTTPS_PORT + OFFSET))
        POSTGRES_PORT=$((POSTGRES_PORT + OFFSET))
        POOLER_PORT=$((POOLER_PORT + OFFSET))

      elif [ "$PORT_MODE" = "2" ]; then
        NEW_BASE_PORT=""
        read -r -p "請輸入目標 API Gateway HTTP Port (例如 8001): " NEW_BASE_PORT || true
        NEW_BASE_PORT=${NEW_BASE_PORT:-8001}
        validate_port "$NEW_BASE_PORT" "API Gateway HTTP Port"

        OFFSET=$((NEW_BASE_PORT - 8000))
        API_GW_HTTP_PORT=$NEW_BASE_PORT
        KONG_HTTPS_PORT=$((KONG_HTTPS_PORT + OFFSET))
        POSTGRES_PORT=$((POSTGRES_PORT + OFFSET))
        POOLER_PORT=$((POOLER_PORT + OFFSET))

      else
        API_GW_HTTP_PORT=$(read_p_def "請輸入 API Gateway (HTTP) 對外 Port" "8000")
        validate_port "$API_GW_HTTP_PORT" "API Gateway HTTP Port"

        KONG_HTTPS_PORT=$(read_p_def "請輸入 Kong (HTTPS，僅啟用 Kong 模組時有效) 對外 Port" "8443")
        validate_port "$KONG_HTTPS_PORT" "Kong HTTPS Port"

        POSTGRES_PORT=$(read_p_def "請輸入 Postgres Direct 對外 Port" "5432")
        validate_port "$POSTGRES_PORT" "Postgres Port"

        POOLER_PORT=$(read_p_def "請輸入 Supavisor Pooler Transaction 對外 Port" "6543")
        validate_port "$POOLER_PORT" "Pooler Port"
      fi
    fi
  fi
fi

validate_port "$API_GW_HTTP_PORT" "API Gateway HTTP Port"
validate_port "$KONG_HTTPS_PORT" "Kong HTTPS Port"
validate_port "$POSTGRES_PORT" "Postgres Port"
validate_port "$POOLER_PORT" "Pooler Port"

if [[ "$USE_REVERSE_PROXY" =~ ^[Yy]$ ]]; then
  PUBLIC_URL="${PROTOCOL}://${FULL_DOMAIN}"
  API_URL="${PROTOCOL}://${FULL_DOMAIN}/auth/v1"
  SITE_URL_FULL="${PROTOCOL}://${FULL_DOMAIN}"
else
  PUBLIC_URL="${PROTOCOL}://${FULL_DOMAIN}:${API_GW_HTTP_PORT}"
  API_URL="${PROTOCOL}://${FULL_DOMAIN}:${API_GW_HTTP_PORT}/auth/v1"
  SITE_URL_FULL="${PROTOCOL}://${FULL_DOMAIN}:${API_GW_HTTP_PORT}"
fi

# --------------------------------------------------
# 核心帳號與密碼配置 (Credentials Setup)
# --------------------------------------------------
POSTGRES_PASSWORD="${CLI_DB_PASSWORD}"
DASHBOARD_USERNAME="${CLI_DASHBOARD_USER:-supabase}"
DASHBOARD_PASSWORD="${CLI_DASHBOARD_PASSWORD}"
MINIO_ROOT_USER="${CLI_MINIO_USER:-supa-storage}"
MINIO_ROOT_PASSWORD="${CLI_MINIO_PASSWORD}"

if [ "$NON_INTERACTIVE" -eq 0 ]; then
  echo ""
  echo "--------------------------------------------------"
  echo "         核心帳號與密碼安全設定 (Credentials)"
  echo "--------------------------------------------------"
  ASK_CUSTOM_AUTH=""
  read -r -p "是否要自訂核心帳號與密碼？(若選擇 N 將自動為您生成高強度隨機密碼) (y/N) [N]: " ASK_CUSTOM_AUTH || true
  ASK_CUSTOM_AUTH=${ASK_CUSTOM_AUTH:-N}

  if [[ "$ASK_CUSTOM_AUTH" =~ ^[Yy]$ ]]; then
    echo "  (提示: 建議使用純英數字元，避免 '#'、'@'、':' 等 URL 保留字元影響資料庫連線解析)"
    DASHBOARD_USERNAME=$(read_p_def "請輸入 Studio Dashboard 登入帳號" "supabase")
    DASHBOARD_PASSWORD=$(read_p_def "請輸入 Studio Dashboard 登入密碼" "$(gen_random_secret 20)")
    POSTGRES_PASSWORD=$(read_p_def "請輸入 PostgreSQL 資料庫密碼" "$(gen_random_secret 24)")
    MINIO_ROOT_USER=$(read_p_def "請輸入 MinIO/S3 Root 管理員帳號" "supa-storage")
    MINIO_ROOT_PASSWORD=$(read_p_def "請輸入 MinIO/S3 Root 管理員密碼" "$(gen_random_secret 20)")
  fi
fi

# 若使用者未自訂，生成隨機安全密碼備用
[ -z "$POSTGRES_PASSWORD" ] && POSTGRES_PASSWORD=$(gen_random_secret 24)
[ -z "$DASHBOARD_PASSWORD" ] && DASHBOARD_PASSWORD=$(gen_random_secret 20)
[ -z "$MINIO_ROOT_PASSWORD" ] && MINIO_ROOT_PASSWORD=$(gen_random_secret 20)

echo ""
echo "--> 正在檢測宿主機對外 Port 是否重複佔用..."
HAS_COLLISION=0
for p in "$API_GW_HTTP_PORT" "$KONG_HTTPS_PORT" "$POSTGRES_PORT" "$POOLER_PORT"; do
  if command -v ss >/dev/null 2>&1 && ss -tuln | grep -qE "(:|\])${p}\s"; then
    warn "對外 Port ${p} 目前已被主機上的其他程序佔用！請確認是否要更換 Port。"
    HAS_COLLISION=1
  fi
done

if [ "$HAS_COLLISION" -eq 1 ] && [ "$NON_INTERACTIVE" -eq 1 ]; then
  die "在非互動模式下檢測到 Port 衝突，已安全中斷部署！"
fi

echo ""
echo "--------------------------------------------------"
echo "              即將套用以下配置"
echo "--------------------------------------------------"
echo " 專案名稱 (Project Name) : ${PROJECT_NAME}"
echo " 專案資料夾              : ./${PROJECT_NAME}"
echo " 隨機 Project Ref       : ${PROJECT_REF}"
echo " 完整目標 Domain         : ${FULL_DOMAIN}"
echo " 通訊協定 (Protocol)     : ${PROTOCOL}"
echo " 反向代理 (Reverse Proxy): ${USE_REVERSE_PROXY}"
if [[ "$USE_REVERSE_PROXY" =~ ^[Yy]$ ]]; then
echo " API Gateway Port (內部) : ${API_GW_HTTP_PORT}"
else
echo " API Gateway Port (對外) : ${API_GW_HTTP_PORT}"
fi
echo " Postgres Port (Direct)  : ${POSTGRES_PORT}"
echo " Pooler Port (Transact)  : ${POOLER_PORT}"
echo " Dashboard 登入帳號       : ${DASHBOARD_USERNAME}"
echo " Dashboard 登入密碼       : ${DASHBOARD_PASSWORD}"
echo " Postgres 資料庫密碼     : ${POSTGRES_PASSWORD}"
echo " Public URL / Studio     : ${PUBLIC_URL}"
echo " API External URL        : ${API_URL}"
echo " Site URL                : ${SITE_URL_FULL}"
echo "--------------------------------------------------"

if [ "$NON_INTERACTIVE" -eq 0 ]; then
  CONFIRM=""
  read -r -p "確認開始安裝？ (Y/n): " CONFIRM || true
  CONFIRM=${CONFIRM:-Y}
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "已取消部署。"
    exit 0
  fi
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
set_env_var "API_GW_HTTP_PORT" "${API_GW_HTTP_PORT}"
set_env_var "KONG_HTTP_PORT" "${API_GW_HTTP_PORT}"
set_env_var "KONG_HTTPS_PORT" "${KONG_HTTPS_PORT}"
set_env_var "POSTGRES_PORT" "${POSTGRES_PORT}"
set_env_var "POOLER_PROXY_PORT_TRANSACTION" "${POOLER_PORT}"
set_env_var "SUPABASE_PUBLIC_URL" "${PUBLIC_URL}"
set_env_var "API_EXTERNAL_URL" "${API_URL}"
set_env_var "SITE_URL" "${SITE_URL_FULL}"
set_env_var "PROXY_DOMAIN" "${FULL_DOMAIN}"

# 核心帳號與密碼覆蓋
set_env_var "DASHBOARD_USERNAME" "${DASHBOARD_USERNAME}"
set_env_var "DASHBOARD_PASSWORD" "${DASHBOARD_PASSWORD}"
set_env_var "POSTGRES_PASSWORD" "${POSTGRES_PASSWORD}"
set_env_var "MINIO_ROOT_USER" "${MINIO_ROOT_USER}"
set_env_var "MINIO_ROOT_PASSWORD" "${MINIO_ROOT_PASSWORD}"

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
SELECTED_OVERRIDES_LIST=""

apply_override_module() {
  local mod=$1
  if [ -f "./run.sh" ]; then
    echo "   [+] 正在透過 run.sh 啟用模組: ${mod} ..."
    if sh run.sh config add "$mod"; then
      SELECTED_OVERRIDES_LIST="${SELECTED_OVERRIDES_LIST} ${mod}"
    else
      warn "啟用模組 ${mod} 失敗！"
    fi
  else
    local current_compose
    current_compose=$(grep "^COMPOSE_FILE=" .env 2>/dev/null | cut -d= -f2-)
    [ -z "$current_compose" ] && current_compose="docker-compose.yml"
    local override_file="docker-compose.${mod}.yml"
    if [ -f "$override_file" ] && [[ "$current_compose" != *"$override_file"* ]]; then
      current_compose="${current_compose}:${override_file}"
      set_env_var "COMPOSE_FILE" "${current_compose}"
      echo "   [+] 已將 ${override_file} 加入 .env 的 COMPOSE_FILE"
      SELECTED_OVERRIDES_LIST="${SELECTED_OVERRIDES_LIST} ${mod}"
    fi
  fi
}

if [ -n "$CLI_OVERRIDES" ]; then
  IFS=',' read -ra ADDR <<< "$CLI_OVERRIDES"
  for mod in "${ADDR[@]}"; do
    mod_trimmed=$(echo "$mod" | xargs)
    if [ -n "$mod_trimmed" ] && [ "$mod_trimmed" != "none" ]; then
      apply_override_module "$mod_trimmed"
    fi
  done
elif [ "$NON_INTERACTIVE" -eq 0 ]; then
  echo ""
  echo "--------------------------------------------------"
  echo "       Docker Compose Overrides (選用擴充模組)"
  echo "--------------------------------------------------"
  ASK_OVERRIDES=""
  read -r -p "是否要選擇設定擴充模組 (Overrides)？(y/N) [N]: " ASK_OVERRIDES || true
  ASK_OVERRIDES=${ASK_OVERRIDES:-N}

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
        apply_override_module "$mod"
      fi
    }

    ask_module "kong"   "Kong API Gateway (取代預設 Envoy)"
    ask_module "pg15"   "Postgres 15 資料庫引擎 (取代預設 PG 17)"
    ask_module "caddy"  "Caddy HTTPS 反向代理"
    ask_module "nginx"  "Nginx HTTPS 反向代理"
    ask_module "s3"     "MinIO S3 儲存後端"
    ask_module "rustfs" "RustFS 高效能儲存"
    ask_module "logs"   "Logflare 日誌增強服務"
  fi
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
echo " API Gateway (HTTP 內部) : ${API_GW_HTTP_PORT}"
else
echo " API Gateway (HTTP 對外) : ${API_GW_HTTP_PORT}"
fi
echo " Postgres Port (Direct)  : ${POSTGRES_PORT}"
echo " Pooler Port (Transact)  : ${POOLER_PORT}"
echo "--------------------------------------------------"
echo " Dashboard 登入帳號       : ${DASHBOARD_USERNAME}"
echo " Dashboard 登入密碼       : ${DASHBOARD_PASSWORD}"
echo " Postgres 資料庫密碼     : ${POSTGRES_PASSWORD}"
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
echo "現在你可以切換到該目錄執行 'docker compose up -d' 或 'sh run.sh start' 來啟動服務。"
