# Kubernetes 節點前置環境初始化

自動判斷作業系統家族，套用 Kubernetes 節點的前置需求，最後逐項驗證並顯示結果。

**適用**：RHEL / Rocky / AlmaLinux / CentOS 8-10、Fedora、Ubuntu 20.04+、Debian 11+

---

## 一鍵執行

```bash
# 互動模式（有終端機時會問要不要重開機）
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/container/k8s_env_init/k8s_env_initialization.sh | sudo bash

# 全自動：設定完直接重開機
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/container/k8s_env_init/k8s_env_initialization.sh | sudo bash -s -- --yes
```

| 參數 | 說明 |
| :--- | :--- |
| `-y`, `--yes` | 結束後直接重開機，不詢問。 |
| `--no-reboot` | 完全不重開機也不詢問，適合自動化流程。 |
| `--keep-firewall` | 保留 firewalld / ufw 不關閉，改由你自己開通埠號。 |
| `-h`, `--help` | 顯示說明。 |

---

## 會做什麼

| # | 項目 | 動作 |
| :-- | :--- | :--- |
| 1 | 防火牆 | 停用並關閉開機啟動（RHEL 為 `firewalld`，Debian 為 `ufw`）。加 `--keep-firewall` 可跳過。 |
| 2 | SELinux | RHEL 家族用 `grubby` 加入 `selinux=0` 核心參數，**需重開機生效**。Debian 家族跳過（AppArmor 為 Kubernetes 原生支援，不需關閉）。 |
| 3 | Swap | `swapoff -a`，並在 `/etc/fstab` 註解掉 swap 那行（冪等，重跑不會疊出 `###`）。原始檔備份到 `/etc/fstab.orig`。 |
| 4 | 核心模組 | 寫入 `/etc/modules-load.d/crio.conf` 並立即載入 `overlay`、`br_netfilter`。 |
| 5 | Sysctl | 寫入 `/etc/sysctl.d/99-kubernetes-cri.conf`：`bridge-nf-call-iptables`、`bridge-nf-call-ip6tables`、`ip_forward` 全設為 1。 |

執行完會印出驗證摘要，每項標記 `OK` / `WARN` / `INFO`。SELinux 在重開機前顯示 `INFO`，屬正常。

---

## 不想關防火牆？

`--keep-firewall` 會保留防火牆，你需要自己開通這些埠：

```bash
# Control Plane
sudo firewall-cmd --permanent --add-port={6443,2379-2380,10250-10259}/tcp
# Worker
sudo firewall-cmd --permanent --add-port={10250,10256}/tcp --add-port=30000-32767/tcp
# Calico VXLAN（全部節點）
sudo firewall-cmd --permanent --add-port=4789/udp
sudo firewall-cmd --reload
```

---

## 下一步

節點重開機後，用 [k8s_install](../k8s_install) 建立叢集：

```bash
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/container/k8s_install/k8s_cluster_install.sh | sudo bash -s -- --role cp --yes
```

---

## 授權

MIT License。
