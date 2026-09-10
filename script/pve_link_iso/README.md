# Proxmox VE ISO 軟連結同步

> 最後更新：2026-09-10

把放在 NAS / NFS / SMB 分享區裡的 ISO，用 symbolic link 掛進 Proxmox VE 的 ISO 目錄，
這樣 PVE 網頁介面看得到它們，但檔案不需要複製一份。

---

## 一鍵執行

```bash
# 先看看會連結哪些檔案，不做任何變更
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/pve_link_iso/pve_link_iso.sh | sudo bash -s -- --dry-run

# 實際執行（預設來源 /mnt/pve/ISO、目標 /mnt/pve/ISO/template/iso）
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/pve_link_iso/pve_link_iso.sh | sudo bash

# 自訂目錄
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/pve_link_iso/pve_link_iso.sh | sudo bash -s -- \
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

1. **增量對齊 (Reconciliation)**：遞迴掃描來源目錄的 `*.iso`（不分大小寫），自動跳過目標目錄本身、Synology / QNAP 回收筒（`#recycle` / `@Recycle`）、快照（`.zfs` / `.snapshot`）與 `@eaDir`。
2. **就地維護軟連結**：
   - 目標目錄中指向正確的既有軟連結予以保留（`Unchanged`），不重複刪除與建立，確保 PVE 無服務空窗期（Zero-downtime）。
   - 新發現的 ISO 建立軟連結（`Linked`）；若來源路徑變更則就地更新連結。
   - 一般檔案與非 `.iso` 連結絕不動到；同名 ISO 衝突時保留先掃描到的項目並顯示衝突路徑。
3. **過期清理 (Prune)**：清理目標目錄中已失效（dangling）或來源端已移除的舊軟連結。
4. **統計摘要**：印出 Linked / Unchanged / Pruned / Skipped / Failed 統計；若執行有失敗則以非 0 結束（方便 cron 偵測）。

檔名重複時只會保留一個連結 —— 不同子目錄放了同名 ISO 的話，第二個會被計為 skipped 並顯示來源與衝突路徑。

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
