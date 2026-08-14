# Script Docs

一份**可以直接執行的維運手冊**。每支腳本都在自己的說明頁上帶著使用情境、參數與風險，並且能用一行 `curl` 指令在目標機器上跑起來 —— 不必先 clone，也不必在正式環境上讀完整份原始碼才敢動手。

📖 **線上文件：<https://ctj425.github.io/script-docs/>**

---

## 為什麼有這個專案

自動化腳本最常見的死法不是寫錯邏輯，而是**文件與腳本各自漂移**：README 上的參數腳本早就改掉了，複製貼上的指令指向已經改名的 repo。這裡用三個約束把漂移擋住：

- **單一來源**：網站每一頁都是對應資料夾 `README.md` 的逐位元組渲染，不另外維護一份文案。文件與腳本永遠出自同一個 commit。
- **可預演**：會動到主機狀態的腳本一律支援 `--help` 與 `--dry-run`。先看它要做什麼，再決定要不要真的做。
- **CI 守門**：shell 語法與 ShellCheck、Docker Compose 設定、以及文件裡每一條 `raw.githubusercontent.com` 指令是否仍能解析，都在 CI 逐條驗證 —— 貼出去的指令壞掉時，是我們先知道，而不是複製它的人。

---

## 內容

子專案依用途分成三類，資料夾結構就是分類本身 —— 網站的側欄群組也是從第一層資料夾名稱自動長出來的。

### 🤖 [`AI/`](./AI) —— AI CLI 用量狀態列

把用量配額顯示在提示列上。純 ASCII、無背景服務、無網路請求，解析失敗一律降級而不崩潰。

| 專案 | 說明 |
| --- | --- |
| [AGY Usage HUD](./AI/agy_usage_hud) | Antigravity CLI (`agy`) 狀態列：模型名稱、Context Window 用量、5h 與每週配額用量、重置倒數 |
| [Claude Code Usage HUD](./AI/claudecode_usage_hub) | Claude Code 狀態列：模型名稱、5h / 每週用量、context window，含冷啟動快取 |

### ☸️ [`container/`](./container) —— 容器與 Kubernetes

叢集與容器環境的建置作業，把手動流程收斂成可重跑的腳本與 compose 設定。

| 專案 | 說明 |
| --- | --- |
| [k8s_env_init](./container/k8s_env_init) | Kubernetes 節點前置環境（swap、SELinux、核心模組、sysctl），自動判斷 RHEL 或 Debian 家族並逐項驗證 |
| [k8s_install](./container/k8s_install) | Kubernetes 1.36 叢集部署（CRI-O + Calico），另附 MetalLB / KubeVirt / Gateway API / TrueNAS CSI |
| [ollama](./container/ollama) | Ollama + Open WebUI 本地 LLM，預設 NVIDIA GPU 加速，另附 CPU-only override |

### 🔧 [`script/`](./script) —— 單純的維運腳本

不依賴容器或叢集，直接在主機上跑完就結束的一次性作業。

| 專案 | 說明 |
| --- | --- |
| [RHEL-Family-Temp](./script/RHEL-Family-Temp) | 把已裝好的 RHEL/Rocky/Alma 虛擬機清理成乾淨範本，並裝上首次開機的互動式網路設定精靈 |
| [deploy-supabase](./script/deploy-supabase) | Supabase Self-Hosted 自動化部署，支援多專案同機部署、Port 智慧偏移與擴充模組 |
| [pve_link_iso](./script/pve_link_iso) | 用 symbolic link 把 NAS 上的 ISO 掛進 Proxmox VE 的 ISO 目錄，PVE 看得到但不必複製檔案 |

---

## 一行指令執行 (One-liners)

| 用途 | 指令 |
| --- | --- |
| **AGY Usage HUD** | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/AI/agy_usage_hud/setup.sh \| bash` |
| **Claude Code Usage HUD** | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/AI/claudecode_usage_hub/install.sh \| bash` |
| **RHEL/Rocky VM 封裝成範本**<br>清理機器識別碼並裝上開機設定精靈 | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/RHEL-Family-Temp/seal-rhel-template.sh \| sudo bash -s -- --yes --poweroff` |
| **Supabase Self-Hosted 自動化部署** | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/deploy-supabase/deploy-supabase.sh -o deploy-supabase.sh \<br>  && chmod +x deploy-supabase.sh \<br>  && ./deploy-supabase.sh` |
| **Kubernetes 節點前置環境**<br>關閉 swap、載入核心模組、設定 sysctl | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/container/k8s_env_init/k8s_env_initialization.sh \| sudo bash -s -- --yes` |
| **建立 Kubernetes Control Plane**<br>CRI-O + kubeadm + Calico | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/container/k8s_install/k8s_cluster_install.sh \| sudo bash -s -- --role cp --yes` |
| **Proxmox VE ISO 軟連結同步** | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/pve_link_iso/pve_link_iso.sh \| sudo bash -s -- -s /mnt/pve/ISO -t /mnt/pve/ISO/template/iso` |
| **Ollama + Open WebUI** | `git clone https://github.com/CTJ425/script-docs.git && cd script-docs/container/ollama && docker compose up -d` |

> [!TIP]
> 第一次在一台機器上使用時，先跑 `--dry-run` 看它會做什麼，確認無誤再拿掉：
> ```bash
> curl -fsSL <上面任一網址> | sudo bash -s -- --dry-run
> ```

---

## 網站與內容管線

網站是 React + Vite 的靜態站，部署在 GitHub Pages。導覽、路由與搜尋全部由內容管線從 repo 裡的 `README.md` 產生，前端不硬編碼任何子專案。

新增子專案只要三步 —— 在對應分類下建立資料夾、放一份 `README.md`、push。網站會自動長出對應頁面，並歸到該分類的導覽群組底下，不需要改任何前端程式碼：

```bash
mkdir script/my_script          # 或 AI/ 、container/
$EDITOR script/my_script/README.md
git add script/my_script && git commit -m "Add my_script" && git push
```

分類資料夾（`AI` / `container` / `script`）就是側欄的群組名稱，README 的第一個 `#` 標題則是該頁的標題與導覽標籤。

**放哪一類？看「主題是什麼」，不是看用什麼語言寫的** —— 用 bash 寫的 Kubernetes 叢集部署屬於 `container/`，因為主題是叢集；`script/` 留給在主機上跑完就結束的一次性作業。三類都不合適時，直接開第四個資料夾即可，它會自動成為新的側欄群組。

路徑深度固定是 `<分類>/<專案>/README.md`。放在根目錄（沒分類）或多包一層（太深），建置會直接失敗並指出該怎麼移 —— 這比產出一個永遠沒人點得到的頁面好。

網站原始碼在 [`site/`](./site)，內容管線與設計說明見 [`site/README.md`](./site/README.md)。

---

## 授權

MIT License，詳見各資料夾中的 `LICENSE`。
