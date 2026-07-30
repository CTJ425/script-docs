# RHEL/Rocky VM 範本封裝與開機初次設定

把一台已裝好的 RHEL 家族虛擬機清理成乾淨範本，並裝上首次開機的互動式網路設定精靈。
從範本複製出來的新機器第一次以 root 從 Console 登入時，會自動引導設定主機名稱與靜態 IP。

**適用**：RHEL / Rocky Linux / AlmaLinux / CentOS Stream 8.x、9.x、10.x（需要 NetworkManager）

---

## 一鍵封裝

在母版虛擬機 (Master VM) 上以 root 執行：

```bash
# 1. 先看看會做什麼，不改動系統
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/RHEL-Family-Temp/seal-rhel-template.sh | sudo bash -s -- --dry-run

# 2. 確認後封裝並自動關機，關機後即可轉為 VM 範本
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/RHEL-Family-Temp/seal-rhel-template.sh | sudo bash -s -- --yes --poweroff
```

| 參數 | 說明 |
| :--- | :--- |
| `--dry-run` | 只顯示會執行的動作，不修改系統。 |
| `--yes` | 略過確認提示。 |
| `--poweroff` | 完成後自動關機。 |
| `-h`, `--help` | 顯示說明。 |

環境變數 `SCD_RAW_BASE` 可指向自己的 fork 或分支，腳本會從那裡下載精靈檔案。

> [!IMPORTANT]
> 封裝後請用 `history -c && history -w && exit` 離開，否則目前這個 shell 的指令歷史會在登出時被寫回磁碟，留在範本裡。

---

## 檔案

| 檔案 | 安裝位置 | 用途 |
| :--- | :--- | :--- |
| `seal-rhel-template.sh` | — | 封裝主腳本 |
| `initial-setup.sh` | `/usr/local/bin/` | 首次開機設定精靈 |
| `99-firstboot.sh` | `/etc/profile.d/` | 登入觸發器 |

封裝腳本會優先使用同目錄下的 `initial-setup.sh` 與 `99-firstboot.sh`；透過 `curl` 執行時則從 repo 下載，並驗證下載內容確實是預期的腳本後才安裝。腳本內**沒有**內嵌副本，避免同一份程式碼要維護兩個版本。

---

## 封裝做了什麼

| 類別 | 動作 |
| :--- | :--- |
| 身分識別 | 清除 NIC 的 MAC / UUID（NetworkManager keyfile 會重新產生 UUID）、SSH host key、`machine-id`、udev persistent 規則 |
| 訂閱 | RHEL 才執行 `subscription-manager` unregister / clean |
| 主機名稱 | 從 `/etc/hosts` 精準移除目前主機名稱（保留其他自訂條目與 `localhost`），主機名稱重設為 `localhost.localdomain` |
| 清理 | `/tmp`、`/var/tmp`、dnf 快取、`/var/log` 與 journal、各使用者的 `.bash_history` |
| 選用元件 | cloud-init、insights-client、katello、iSCSI initiator name |

`machine-id` 依版本處理：RHEL 8（systemd 239）寫入空檔，RHEL 9/10 寫入 `uninitialized` —— 這是 systemd 官方的 first-boot 機制。

`/etc/resolv.conf` 若是符號連結會保留不動；它指向 `/run` 下的暫存檔，重開機自然重建。直接刪除會永久破壞 NetworkManager 的 DNS 管理。

---

## 首次開機體驗

新機器開機後以 root 從 Console 登入，自動出現：

```text
==========================================================
 Welcome to Rocky Linux 9.8 Initial Setup
 This script will run only once on the first root login.
==========================================================

--- Step 1: Select Network Interface ---
Only one ethernet device found. Auto-selected 'ens192'.

--- Step 2: Configure Network Settings for 'ens192' ---
Change [192.168.10.50] ipv4: 192.168.1.120
Change [24] netmask (CIDR prefix, e.g. 24, or subnet mask): 255.255.255.0
Change [192.168.10.1] gateway (press Enter to keep, type 'none' to clear): 192.168.1.1
Change [192.168.10.254] dns (space/comma separated, ...): 8.8.8.8 8.8.4.4

--- Step 3: Configure Hostname ---
Change [localhost.localdomain] hostname: web-prod-01

Setup is complete. Creating flag file to prevent this script from running again.
Reboot now to apply all changes? (y/n): y
```

精靈的特性：

* 只有一張網卡時自動選取，多張才詢問。
* 遮罩可輸入 CIDR (`24`) 或點分十進制 (`255.255.255.0`)，後者會自動換算。
* IP / Gateway / DNS 格式錯誤會要求重新輸入，不會帶著半套設定崩潰。
* Gateway 與 DNS 可輸入 `none` 清空。
* 設定主機名稱後同步更新 `/etc/hosts`，避免 `sudo` 因本機解析逾時卡頓 5~10 秒。
* 完成後建立 `/etc/firstboot_completed`，之後不再觸發。
* `/run/initial-setup.lock` 原子鎖避免多重登入同時觸發。

觸發器只在「bash + 非 SSH + root + stdin 是真的終端機 + 精靈確實已安裝」時才執行，所以 Ansible、SFTP、SCP 等沒有終端機的 root 連線不會卡在等待輸入。

---

## 授權

MIT License。
