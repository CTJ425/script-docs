# Windows 11 終端機一鍵設定（Oh My Posh）

> 最後更新：2026-10-12

一次裝好（或更新到最新版）Oh My Posh、PowerShell 7、Coreutils 與 Nerd Font，並把它們接進 PowerShell profile 和 Windows Terminal：
打開 Windows Terminal 就是 PowerShell 7 加上 Oh My Posh 提示列，`ls` 是 Linux 那個 `ls`。
重複執行是安全的，第二次以後就是「全部升級到最新版」。

---

## 使用環境

| 項目 | 需求 |
| :--- | :--- |
| 作業系統 | Windows 11 |
| winget | 內建於「應用程式安裝程式」（App Installer）。找不到 `winget` 時，先從 Microsoft Store 安裝或更新「應用程式安裝程式」。 |
| Windows Terminal | Windows 11 內建。請先**開過一次**，它才會產生 `settings.json`。支援 Store 版、Store Preview 版與免安裝版。 |
| 權限 | 用**一般使用者**執行即可；安裝 PowerShell 7 與 Coreutils 時會跳出 UAC 視窗要求確認。 |
| 網路 | 需要能連到 winget 來源與 GitHub（下載腳本、字型）。 |

---

## 一鍵執行

在**Windows PowerShell**（開始選單的「Windows PowerShell」，或 Windows Terminal 裡的 Windows PowerShell 分頁）貼上：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/CTJ425/script-docs/main/script/setup-windows-terminal/setup-windows-terminal.ps1 | iex"
```

全新的 Windows 預設不允許執行 `.ps1`，`-ExecutionPolicy Bypass` 只對這一次執行生效，不需要先改系統設定（腳本本身會把目前使用者的執行原則設成 `RemoteSigned`，之後的 profile 才能載入）。

請不要從 PowerShell 7（`pwsh`）裡執行：PowerShell 7 正在使用中時，winget 沒辦法替它升級。

想先下載、看過內容再執行：

```powershell
irm https://raw.githubusercontent.com/CTJ425/script-docs/main/script/setup-windows-terminal/setup-windows-terminal.ps1 -OutFile setup-windows-terminal.ps1
Unblock-File .\setup-windows-terminal.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-windows-terminal.ps1
```

執行完成後，**關閉所有終端機視窗，重新開啟 Windows Terminal**。

---

## 安裝的套件

都透過 winget（`--source winget`）安裝；已經裝過的會改用 `winget upgrade` 更新到最新版。

| 套件 | winget ID | 用途 |
| :--- | :--- | :--- |
| Oh My Posh | `JanDeDobbeleer.OhMyPosh` | 終端機提示列主題引擎，顯示目前路徑、Git 分支、執行時間等資訊。 |
| PowerShell 7 | `Microsoft.PowerShell` | 新版 PowerShell（`pwsh`），設為 Windows Terminal 的預設分頁。 |
| Coreutils | `Microsoft.Coreutils` | Microsoft 打包的 Linux 常用指令（`ls`、`cp`、`find`、`grep`…），以 uutils 為基礎，需要 PowerShell 7.4 以上。 |
| MesloLGS Nerd Font | 由 `oh-my-posh font install meslo` 安裝 | 含圖示字元的字型，提示列的圖示才不會變成方框。 |

---

## 做了什麼

| 步驟 | 動作 |
| :--- | :--- |
| 1. 套件 | 依序安裝或升級上表三個 winget 套件，然後重新讀取 `PATH`。沒有 winget 時直接停止並提示安裝方式。已是最新版會顯示 `is up to date`；無法用 winget 升級的（例如從 Microsoft Store 裝的 PowerShell）只顯示警告，不中斷。 |
| 2. 字型 | `oh-my-posh font install meslo`，安裝 Meslo Nerd Font 字型家族。失敗只會警告，其餘步驟照常進行。 |
| 3. PowerShell profile | 在 Windows PowerShell 5.1 與 PowerShell 7 的 profile（`文件\WindowsPowerShell\`、`文件\PowerShell\` 下的 `Microsoft.PowerShell_profile.ps1`）加入 Oh My Posh 初始化區塊；PowerShell 7 另外移除 `ls` 別名，讓 `ls` 執行 Coreutils 的 `ls.exe`。profile 原有的內容會保留。 |
| 4. 執行原則 | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`，讓本機的 profile 能載入。被群組原則鎖住時只會警告。 |
| 5. Windows Terminal | 把預設分頁設為 PowerShell 7（`{574e775e-4f2a-5b96-ac1e-a2962a402336}`），並把所有分頁的預設字型設為 `MesloLGS Nerd Font`。修改前先備份成 `settings.json.bak`。 |

---

## 注意事項

* **在系統管理員視窗裡不會載入 Oh My Posh**，除非是在 Windows Terminal 裡開的（沿用 microsoft/WindowsDeveloperConfig 的做法）。
* profile 裡的設定以 `# >>> oh-my-posh (managed) >>>`、`# >>> coreutils ls (managed) >>>` 標記；重複執行只會替換這兩段，不會重複加入。不想要了，刪掉標記之間的內容即可。
* `settings.json.bak` 只在**第一次**修改時建立，之後重複執行不會覆蓋，所以它一直是原始檔。要還原就把它改名回 `settings.json`。
* `settings.json` 裡有 `//` 或 `/* */` 註解時，腳本不會修改它（改寫會把註解洗掉），會印出要手動設定的兩個值：`"defaultProfile"` 與 `"profiles"` → `"defaults"` → `"font"` → `"face"`。舊版陣列格式的 `profiles` 也一樣。
* Coreutils 的 `cat`、`cp`、`mv`、`rm` 等指令名稱與 PowerShell 的別名相同，PowerShell 會優先用自己的別名；腳本只把 `ls` 讓給 Coreutils。
* 想換主題：把 profile 裡的 `oh-my-posh init pwsh` 改成 `oh-my-posh init pwsh --config <主題檔或網址>`，可用主題見 Oh My Posh 官方文件的 Themes 頁面。

---

## 授權

MIT License。
