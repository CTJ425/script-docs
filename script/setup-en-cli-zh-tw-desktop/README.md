# 終端機英文訊息、桌面環境維持中文

> 最後更新：2026-09-17

讓終端機（CLI）指令的輸出訊息變成英文，方便查資料、貼錯誤訊息，同時桌面環境（GNOME 選單、Nautilus 檔案總管）維持繁體中文不受影響。

---

## 一鍵執行

以一般使用者身分執行（腳本內部會用 `sudo` 安裝套件）：

```bash
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/setup-en-cli-zh-tw-desktop/setup-en-cli-zh-tw-desktop.sh | bash
```

執行完成後，**完整登出目前的 GNOME 工作階段再重新登入**，桌面環境才會套用新的英文資料夾路徑。

---

## 做了什麼

| 步驟 | 動作 |
| :--- | :--- |
| 1. 安裝語系 | `dnf install -y glibc-langpack-en`，補齊英文語系檔，讓 CLI 訊息能顯示英文。 |
| 2. 改資料夾名稱 | 把家目錄下的中文資料夾（下載、文件、桌面、圖片、影片、音樂、公共、模板）改成英文名稱（Downloads、Documents、Desktop…），並執行 `xdg-user-dirs-update --force` 更新設定。若英文資料夾已存在，會把中文資料夾內容合併進去再刪除中文資料夾。 |
| 3. 設定 CLI 專用語言 | 在 `~/.bashrc` 加入一段設定：只有在**互動式的終端機視窗（pts）**中才把 `LC_MESSAGES` 與 `LANGUAGE` 設為英文，不會影響桌面環境本身（登入畫面、GNOME 選單仍是中文）。已經加過就會偵測到並略過，不會重複寫入。 |

---

## 注意事項

* 步驟 2 會**搬移／合併**家目錄下的既有資料夾，執行前建議確認資料夾內沒有正在使用中的檔案（例如開啟中的下載工具）。
* 找不到某個中文資料夾（例如已經改過名稱）時，該項目會被略過，不會中斷腳本。
* `~/.bashrc` 的設定區塊以 `# >>> CLI 英文訊息設定 (only pts) >>>` 標記，重複執行腳本不會造成重複加入。

---

## 授權

MIT License。
