# Script Docs

虛擬化、容器與 Kubernetes 的自動化腳本合集。每支腳本都可以用一行指令執行，不需要先 clone。

📖 **線上文件：<https://ctj425.github.io/script-docs/>**
網站內容直接由各專案的 `README.md` 渲染，只維護這一份。

---

## 一行指令執行 (One-liners)

| 用途 | 指令 |
| --- | --- |
| **Antigravity CLI (`agy`) 用量狀態列**<br>純 ASCII 雙視窗 (5h / 每週) AI 配額狀態列 | `agy plugin install https://github.com/CTJ425/script-docs.git`<br>或 `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/agy/usage_hud/setup.sh \| bash` |
| **Claude Code 用量狀態列**<br>模型 + 5h / 每週用量 + context window | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/cluadecode/usage_hub/install.sh \| bash` |
| **RHEL/Rocky VM 封裝成範本**<br>清理機器識別碼並裝上開機設定精靈 | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/RHEL-Family-Temp/seal-rhel-template.sh \| sudo bash -s -- --yes --poweroff` |
| **Kubernetes 節點前置環境**<br>關閉 swap、載入核心模組、設定 sysctl | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/k8s_env_init/k8s_env_initialization.sh \| sudo bash -s -- --yes` |
| **建立 Kubernetes Control Plane**<br>CRI-O + kubeadm + Calico | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/k8s_install/k8s_cluster_install.sh \| sudo bash -s -- --role cp --yes` |
| **Proxmox VE ISO 軟連結同步** | `curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/pve_link_iso/pve_link_iso.sh \| sudo bash -s -- -s /mnt/pve/ISO -t /mnt/pve/ISO/template/iso` |
| **Ollama + Open WebUI** | `git clone https://github.com/CTJ425/script-docs.git && cd script-docs/Container/ollama && docker compose up -d` |

> [!TIP]
> 每支腳本都支援 `--help`，破壞性的腳本也都支援 `--dry-run`。第一次使用時建議先跑 `--dry-run` 看看會做什麼：
> ```bash
> curl -fsSL <上面任一網址> | sudo bash -s -- --dry-run
> ```

---

## 子專案

| 專案 | 說明 |
| --- | --- |
| 🤖 [agy/usage_hud](./agy/usage_hud) | Antigravity CLI (`agy`) 純 ASCII 5h 與每週用量狀態列 (配額監控 + 重置倒數) |
| 🤖 [cluadecode/usage_hub](./cluadecode/usage_hub) | Claude Code 狀態列：模型名稱、5h / 每週用量、context window，含冷啟動快取 |
| 📦 [RHEL-Family-Temp](./RHEL-Family-Temp) | RHEL/Rocky/Alma 虛擬機範本封裝 + 首次開機互動式網路設定精靈 |
| ☸️ [k8s_env_init](./k8s_env_init) | Kubernetes 節點前置環境（swap、SELinux、核心模組、sysctl），支援 RHEL 與 Debian 家族 |
| ☸️ [k8s_install](./k8s_install) | Kubernetes 1.36 叢集部署（CRI-O + Calico），含 MetalLB / KubeVirt / Gateway API / TrueNAS CSI |
| 🐳 [Container/ollama](./Container/ollama) | Ollama + Open WebUI 本地 LLM，GPU 與 CPU 兩種模式 |
| 🔗 [pve_link_iso](./pve_link_iso) | Proxmox VE ISO 軟連結同步工具 |

---

## 新增子專案

建立資料夾、放一份 `README.md`、push。網站會自動長出對應頁面與導覽項目 —— 不需要改任何前端程式碼。

```bash
mkdir my_script
$EDITOR my_script/README.md
git add my_script && git commit -m "Add my_script" && git push
```

網站原始碼在 [`site/`](./site)，內容管線與設計說明見 [`site/README.md`](./site/README.md)。

---

## 授權

MIT License，詳見各資料夾中的 `LICENSE`。
