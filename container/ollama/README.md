# Ollama + Open WebUI

> 最後更新：2026-07-30

用 Docker Compose 跑本地大型語言模型。預設走 NVIDIA GPU 加速，另附 CPU-only override。

---

## 一鍵啟動

```bash
git clone https://github.com/CTJ425/script-docs.git
cd script-docs/container/ollama

# GPU 模式（預設）
docker compose up -d

# CPU-only 模式（沒有顯示卡的主機）
docker compose -f docker-compose.yml -f docker-compose.cpu.yml up -d
```

開啟 <http://localhost:8080>，第一個註冊的帳號自動成為管理員。

```bash
docker compose ps        # 兩個容器都要是 Up
docker compose logs -f   # 看啟動過程
```

| 服務 | 位置 | 說明 |
| :--- | :--- | :--- |
| Open WebUI | `http://localhost:8080` | 聊天介面 |
| Ollama API | `http://127.0.0.1:11434` | 僅綁定 loopback，見下方安全性說明 |

版本已鎖定（`ollama/ollama:0.32.2`、`open-webui:v0.10.2`），避免上游改版把環境弄壞。

> [!NOTE]
> CPU override 使用 `!reset` 語法清除 GPU 保留設定，需要 Docker Compose **v2.24 以上**。

---

## 下載模型

網頁介面：左下角 **管理控制台 → 設定 → 模型**，輸入模型名稱後拉取。

或用指令：

```bash
docker exec -it ollama ollama pull llama3:8b
docker exec -it ollama ollama pull qwen2.5:7b
docker exec -it ollama ollama list
```

---

## GPU 前置需求

需要 NVIDIA 驅動 + NVIDIA Container Toolkit。以 Ubuntu 為例：

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
  && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

RHEL / Rocky 請改用 `dnf` 與對應的 `.repo`，設定指令相同。

驗證 GPU 真的有在用：模型回答問題時，在主機執行 `nvidia-smi`，應看到 `ollama` 佔用 VRAM 且 GPU-Util 上升。

---

## 安全性

> [!IMPORTANT]
> **Ollama API 沒有任何身分驗證。** 只要連得到 `11434`，就能執行模型、下載模型、耗用你的 GPU。

本設定檔預設把它綁在 `127.0.0.1:11434`，外部連不到；Open WebUI 是透過 compose 內部網路連 Ollama，不經過這個埠，所以功能不受影響。

只有在確定網路可信、且有防火牆保護時，才改成對外開放：

```yaml
ports:
  - 11434:11434    # 對外開放，請自行確認防火牆
```

**關閉 WebUI 公開註冊**（放在公網時務必設定）：

```yaml
environment:
  - OLLAMA_BASE_URL=http://ollama:11434
  - WEBUI_SIGNUP_ALLOWED=false
```

---

## 資料與備份

模型與對話資料都在 Docker volume 裡：

| Volume | 內容 |
| :--- | :--- |
| `ollama-data` | 下載的模型（可能很大） |
| `openwebui-data` | 帳號、對話紀錄、設定 |

```bash
# 備份
docker run --rm -v ollama_openwebui-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/openwebui-backup.tar.gz -C /data .

# 停止（保留資料）
docker compose down

# 停止並刪除所有資料
docker compose down -v
```

Volume 實際名稱前綴視專案目錄而定，用 `docker volume ls` 確認。

---

## 疑難排解

| 症狀 | 排查方向 |
| :--- | :--- |
| `could not select device driver "nvidia"` | Container Toolkit 沒裝好或沒 `nvidia-ctk runtime configure`；沒有 GPU 請改用 CPU override。 |
| WebUI 模型清單是空的 | 還沒拉模型；或 ollama 容器尚未就緒，等 healthcheck 通過後重新整理。 |
| `!reset` 語法錯誤 | Docker Compose 版本低於 v2.24，請升級。 |
| 8080 埠被占用 | 改成 `- 8081:8080`。 |
