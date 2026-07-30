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

**AI CLI 狀態列（HUD）** —— 把用量配額顯示在提示列上，純 ASCII、無背景服務、無網路請求，解析失敗一律降級不崩潰。

| 專案 | 說明 |
| --- | --- |
| 🤖 [AGY Usage HUD](./agy/usage_hud) | Antigravity CLI (`agy`) 狀態列：模型名稱、5h 與每週配額用量、重置倒數 |
| 🤖 [Claude Code Usage HUD](./claudecode/usage_hub) | Claude Code 狀態列：模型名稱、5h / 每週用量、context window，含冷啟動快取 |

**系統與叢集維運** —— 虛擬化、容器與 Kubernetes 的一次性建置作業，把手動流程收斂成可重跑的腳本。

| 專案 | 說明 |
| --- | --- |
| 📦 [RHEL-Family-Temp](./RHEL-Family-Temp) | 把已裝好的 RHEL/Rocky/Alma 虛擬機清理成乾淨範本，並裝上首次開機的互動式網路設定精靈 |
| ☸️ [k8s_env_init](./k8s_env_init) | Kubernetes 節點前置環境（swap、SELinux、核心模組、sysctl），自動判斷 RHEL 或 Debian 家族並逐項驗證 |
| ☸️ [k8s_install](./k8s_install) | Kubernetes 1.36 叢集部署（CRI-O + Calico），另附 MetalLB / KubeVirt / Gateway API / TrueNAS CSI |
| 🐳 [Container/ollama](./Container/ollama) | Ollama + Open WebUI 本地 LLM，預設 NVIDIA GPU 加速，另附 CPU-only override |
| 🔗 [pve_link_iso](./pve_link_iso) | 用 symbolic link 把 NAS 上的 ISO 掛進 Proxmox VE 的 ISO 目錄，PVE 看得到但不必複製檔案 |

---

## 一行指令執行 (One-liners)

| 用途 | 指令 |
| --- | --- |
| **AGY Usage HUD** | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/agy/usage_hud/setup.sh \| bash` |
| **Claude Code Usage HUD** | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/claudecode/usage_hub/install.sh \| bash` |
| **RHEL/Rocky VM 封裝成範本**<br>清理機器識別碼並裝上開機設定精靈 | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/RHEL-Family-Temp/seal-rhel-template.sh \| sudo bash -s -- --yes --poweroff` |
| **Kubernetes 節點前置環境**<br>關閉 swap、載入核心模組、設定 sysctl | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/k8s_env_init/k8s_env_initialization.sh \| sudo bash -s -- --yes` |
| **建立 Kubernetes Control Plane**<br>CRI-O + kubeadm + Calico | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/k8s_install/k8s_cluster_install.sh \| sudo bash -s -- --role cp --yes` |
| **Proxmox VE ISO 軟連結同步** | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/pve_link_iso/pve_link_iso.sh \| sudo bash -s -- -s /mnt/pve/ISO -t /mnt/pve/ISO/template/iso` |
| **Ollama + Open WebUI** | `git clone https://github.com/CTJ425/script-docs.git && cd script-docs/Container/ollama && docker compose up -d` |

> [!TIP]
> 第一次在一台機器上使用時，先跑 `--dry-run` 看它會做什麼，確認無誤再拿掉：
> ```bash
> curl -fsSL <上面任一網址> | sudo bash -s -- --dry-run
> ```

---

## 網站與內容管線

網站是 React + Vite 的靜態站，部署在 GitHub Pages。導覽、路由與搜尋全部由內容管線從 repo 裡的 `README.md` 產生，前端不硬編碼任何子專案。

新增子專案只要三步 —— 建立資料夾、放一份 `README.md`、push。網站會自動長出對應頁面與導覽項目，不需要改任何前端程式碼：

```bash
mkdir my_script
$EDITOR my_script/README.md
git add my_script && git commit -m "Add my_script" && git push
```

網站原始碼在 [`site/`](./site)，內容管線與設計說明見 [`site/README.md`](./site/README.md)。

---

## 授權

MIT License，詳見各資料夾中的 `LICENSE`。
