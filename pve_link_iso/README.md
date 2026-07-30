# Proxmox VE ISO 軟連結同步

把放在 NAS / NFS / SMB 分享區裡的 ISO，用 symbolic link 掛進 Proxmox VE 的 ISO 目錄，
這樣 PVE 網頁介面看得到它們，但檔案不需要複製一份。

---

## 一鍵執行

```bash
# 先看看會連結哪些檔案，不做任何變更
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/pve_link_iso/pve_link_iso.sh | sudo bash -s -- --dry-run

# 實際執行（預設來源 /mnt/pve/ISO、目標 /mnt/pve/ISO/template/iso）
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/pve_link_iso/pve_link_iso.sh | sudo bash

# 自訂目錄
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/pve_link_iso/pve_link_iso.sh | sudo bash -s -- \
  -s /mnt/nas/iso -t /var/lib/vz/template/iso
```

| 參數 | 說明 |
| :--- | :--- |
| `-s`, `--source DIR` | 遞迴掃描 ISO 的來源目錄（預設 `/mnt/pve/ISO`）。 |
| `-t`, `--target DIR` | 建立軟連結的 PVE ISO 目錄（預設 `/mnt/pve/ISO/template/iso`）。 |
| `-n`, `--dry-run` | 只顯示會做什麼，不變更任何檔案。 |
| `-q`, `--quiet` | 只輸出結果摘要，適合 cron。 |
| `-h`, `--help` | 顯示說明。 |

也可以用環境變數 `SOURCE_DIR` / `TARGET_DIR` 取代參數，所以不需要編輯腳本內容。

---

## 行為

1. 刪除目標目錄中既有的 `.iso` **軟連結**（一般檔案與非 `.iso` 連結不會被動到）。
2. 遞迴掃描來源目錄的 `*.iso`（不分大小寫），跳過目標目錄本身與 Synology 的 `@eaDir`。
3. 為每個 ISO 建立同名軟連結，已存在的跳過。
4. 印出 Linked / Skipped / Failed 統計；有失敗時以非 0 結束（方便 cron 偵測）。

檔名重複時只會保留一個連結 —— 不同子目錄放了同名 ISO 的話，第二個會被計為 skipped 並顯示來源路徑。

---

## Crontab 自動同步

```bash
sudo crontab -e
```

```cron
# 每天 03:10 同步一次
10 3 * * * /root/pve_link_iso/pve_link_iso.sh -q >> /var/log/pve_link_iso.log 2>&1
```

用 root crontab，否則可能沒有目標目錄的寫入權限。腳本全程使用絕對路徑，不依賴工作目錄。

查看結果：

```bash
sudo tail -n 100 /var/log/pve_link_iso.log
```

---

## 疑難排解

| 症狀 | 排查方向 |
| :--- | :--- |
| `Source directory does not exist` | 確認 NAS 分享區已掛載；cron 執行時掛載可能還沒完成。 |
| `Target directory does not exist` | 確認 PVE 儲存設定，目錄通常是 `<storage>/template/iso`。 |
| 建立連結失敗 | 檢查目標目錄權限，以及檔案系統是否支援 symbolic link（例如 FAT 不支援）。 |
| PVE 介面看不到 ISO | 確認該 storage 的內容類型有勾選 `ISO image`。 |

---

## 授權

MIT License。
