# ivan note

> 最後更新：2026-11-03

個人技術部落格：記下我做過的事、踩過的坑，以及過程中寫出來的 script 和用過的工具。

---

## 這個 repo 是什麼

這個 repo 是部落格的全部原稿，也是它的備份：文章、工具筆記，以及文章裡提到的腳本原始碼。網站沒有另一份內容，每一頁都直接來自這個 repo 裡的檔案，所以在 GitHub 上直接讀也是完整的：

| 內容 | 放在哪 | 檔案格式 |
| --- | --- | --- |
| 文章 | [`posts/`](./posts) | `YYYY-MM-DD-<slug>.md`，開頭有 frontmatter；資料夾裡依日期排列 |
| 工具 | [`tools/`](./tools) | `<slug>.md`，開頭有 frontmatter |
| 腳本 | `AI/`、`container/`、`script/` | `<分類>/<專案>/README.md`，原文照登 |
| 首頁、關於 | [`pages/`](./pages) | `home.md`、`about.md` |
| 圖片 | `posts/img/`、`tools/img/` | 跟引用它的文章放在一起，用相對路徑 |

腳本頁是特別的一種：它是該資料夾 `README.md` 的**逐位元組渲染**，網站上看到的和 GitHub 上看到的是同一份。這也是這個專案的核心約束 —— 自動化腳本最常見的死法不是寫錯邏輯，而是文件與腳本各自漂移，所以：

- **單一來源**：腳本頁就是 README，不另外維護一份文案。
- **可預演**：會動到主機狀態的腳本盡量支援 `--help` 與 `--dry-run`；不支援的，README 會寫明它會動到哪些東西。
- **CI 守門**：shell 語法與 ShellCheck、Docker Compose 設定，以及文件裡每一條 `raw.githubusercontent.com` 指令是否仍能解析，都在 CI 逐條驗證。

---

## 腳本

子專案依用途分成三類，資料夾結構就是分類本身 —— 網站上的分組也是從第一層資料夾名稱自動長出來的。

### 🤖 [`AI/`](./AI) —— AI CLI 與 agent

把用量配額顯示在 AI CLI 的提示列旁，以及給 Claude Code 用的全域設定與發布流程 skill。用量列解析失敗一律降級顯示，不會崩潰。

| 專案 | 說明 |
| --- | --- |
| [AGY Usage HUD](./AI/agy_usage_hud) | Antigravity CLI (`agy`) 狀態列：模型名稱、Context Window 用量、5h 與每週配額用量、重置倒數 |
| [Claude Code Usage HUD](./AI/claudecode_usage_hub) | Claude Code plugin（mod），在輸入框下方顯示一行：模型與 effort、5h 用量與重置倒數、每週用量、context window，各 session 共用最新用量 |
| [Global CLAUDE.md](./AI/md) | 給 Claude Code 用的全域指令檔，套用在所有專案 |
| [Release Skills](./AI/skill) | 給 Claude Code 用的版號（`versioning`）與發布管線（`ship`）skill，路徑寫在各專案的設定檔裡（不在網站上顯示，只在 GitHub） |

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
| [apollo-windows-vm](./script/apollo-windows-vm) | 把 Proxmox VE 上 Windows VM 的串流主機換成 Apollo（內建虛擬螢幕），並依客戶端解析度自動設定 DPI |
| [deploy-supabase](./script/deploy-supabase) | Supabase Self-Hosted 自動化部署，支援多專案同機部署、Port 智慧偏移與擴充模組 |
| [pve-antivm](./script/pve-antivm) | Proxmox VE 客製化 CPU（`cpu-models.conf`）與反偵測 Windows 11 虛擬機一鍵建立腳本（相容 Intel SR-IOV iGPU VF） |
| [pve_link_iso](./script/pve_link_iso) | 用 symbolic link 把 NAS 上的 ISO 掛進 Proxmox VE 的 ISO 目錄，PVE 看得到但不必複製檔案 |
| [setup-en-cli-zh-tw-desktop](./script/setup-en-cli-zh-tw-desktop) | 終端機輸出英文訊息、桌面環境維持繁體中文 |
| [setup-windows-terminal](./script/setup-windows-terminal) | Windows 11 終端機一鍵設定：安裝或升級 Oh My Posh、PowerShell 7、Coreutils 與 Nerd Font，並設定 Windows Terminal |

---

## 一行指令執行

| 用途 | 指令 |
| --- | --- |
| **AGY Usage HUD** | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/AI/agy_usage_hud/setup.sh \| bash` |
| **Claude Code Usage HUD** | `claude plugin marketplace add CTJ425/script-docs && claude plugin install usage-hud@script-docs` |
| **RHEL/Rocky VM 封裝成範本**<br>清理機器識別碼並裝上開機設定精靈 | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/RHEL-Family-Temp/seal-rhel-template.sh \| sudo bash -s -- --yes --poweroff` |
| **Supabase Self-Hosted 自動化部署** | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/deploy-supabase/deploy-supabase.sh -o deploy-supabase.sh \<br>  && chmod +x deploy-supabase.sh \<br>  && ./deploy-supabase.sh` |
| **Kubernetes 節點前置環境**<br>關閉 swap、載入核心模組、設定 sysctl | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/container/k8s_env_init/k8s_env_initialization.sh \| sudo bash -s -- --yes` |
| **建立 Kubernetes Control Plane**<br>CRI-O + kubeadm + Calico | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/container/k8s_install/k8s_cluster_install.sh \| sudo bash -s -- --role cp --yes` |
| **Proxmox VE ISO 軟連結同步** | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/pve_link_iso/pve_link_iso.sh \| sudo bash -s -- -s /mnt/pve/ISO -t /mnt/pve/ISO/template/iso` |
| **Proxmox VE 反偵測 Win11 VM 建立**<br>含客製化 CPU 與硬體偽裝 | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/pve-antivm/pve_antivm_create.sh -o /root/pve_antivm_create.sh && chmod +x /root/pve_antivm_create.sh` |
| **Windows 11 終端機設定**<br>在 Windows PowerShell 執行 | `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/CTJ425/script-docs/main/script/setup-windows-terminal/setup-windows-terminal.ps1 \| iex"` |
| **Ollama + Open WebUI** | `git clone https://github.com/CTJ425/script-docs.git && cd script-docs/container/ollama && docker compose up -d` |

> [!TIP]
> 第一次在一台機器上使用時，先跑 `--dry-run` 看它會做什麼，確認無誤再拿掉（支援的有 RHEL 範本封裝、Kubernetes 兩支與 PVE ISO 同步）：
> ```bash
> curl -fsSL <上面的網址> | sudo bash -s -- --dry-run
> ```

---

## 新增內容

**一篇文章**：在 `posts/` 放一個 `YYYY-MM-DD-<slug>.md`，日期與 frontmatter 的 `date` 相同。網址只用 `<slug>`（`/posts/<slug>/`），日期只是讓 GitHub 上的資料夾依時間排列。

```markdown
---
title: 標題
date: 2026-10-02
summary: 一兩句話，會出現在列表、搜尋結果與 RSS 裡。
tags: [kubernetes, linux]
tools: [ollama]          # 這篇在講哪些工具（tools/ 裡的檔名）
scripts: [k8s-install]   # 這篇在講哪些腳本（網址上的 slug）
---
```

圖片放在 `posts/img/<slug>/`，連結都用相對路徑，GitHub 和網站兩邊都會正確：

```markdown
![叢集拓樸](img/k8s-install/topology.png)
[上一篇](./2026-10-02-script-docs-drift.md)、[Ollama](../tools/ollama.md)、[k8s_install](../container/k8s_install)
```

repo 是公開的，`draft: true` 只會讓文章不出現在網站上，GitHub 上仍然看得到。還沒準備公開的稿子寫在分支上，合併進 `main` 才發佈。

**一項工具**：在 `tools/` 放一個 `<slug>.md`。`status` 是 `using`（使用中）、`tried`（試過）或 `dropped`（已淘汰）；自己寫的 GitHub 專案加 `mine: true` 並填 `repo: owner/name`。

**一支腳本**：建立 `<分類>/<專案>/README.md`，標題寫在第一個 `#`，標題正下方放一行 `> 最後更新：YYYY-MM-DD`。要加標籤時，在同一個資料夾放 `docs.json`：`{ "tags": ["kubernetes"] }`。

放哪一類？**看「主題是什麼」，不是看用什麼語言寫的** —— 用 bash 寫的 Kubernetes 叢集部署屬於 `container/`，因為主題是叢集；`script/` 留給在主機上跑完就結束的一次性作業。三類都不合適時，直接開第四個資料夾即可，它會自動成為新的分組。

路徑深度固定是 `<分類>/<專案>/README.md`。放在根目錄或多包一層，建置會直接失敗並指出該怎麼移。

---

## 網站

網站是 [Astro](https://astro.build) 的靜態站，原始碼在 [`site/`](./site)，設計與建置說明見 [`site/README.md`](./site/README.md)。

```bash
cd site
npm ci
npm run dev       # 開發伺服器
npm run verify    # 型別檢查 + 對比度與內容檢查 + build + 產出檢查（CI 跑的同一道關卡）
```

---

## 授權

MIT License，詳見各資料夾中的 `LICENSE`。
