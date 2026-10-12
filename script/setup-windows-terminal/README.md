# Windows 11 終端機一鍵設定（Oh My Posh）

> 最後更新：2026-10-12

一次裝好（或更新到最新版）Oh My Posh、PowerShell 7、Coreutils 與 Nerd Font，並把它們接進 PowerShell profile 和 Windows Terminal：
打開 Windows Terminal 就是 PowerShell 7 加上 Oh My Posh 提示列、Graphite Mono 配色與常用快捷鍵，`ls` 是 Linux 那個 `ls`。
重複執行是安全的，第二次以後就是「全部升級到最新版」。

---

## 使用環境

| 項目 | 需求 |
| :--- | :--- |
| 作業系統 | Windows 11 |
| winget | 內建於「應用程式安裝程式」（App Installer）。找不到 `winget` 時，先從 Microsoft Store 安裝或更新「應用程式安裝程式」。 |
| Windows Terminal | Windows 11 內建。請先**開過一次**，它才會產生 `settings.json`。支援 Store 版、Store Preview 版與免安裝版。 |
| 權限 | 用**一般使用者**執行即可；安裝 PowerShell 7 與 Coreutils 時會跳出 UAC 視窗要求確認。 |
| 網路 | 需要能連到 winget 來源與 GitHub（下載腳本、Windows Terminal 設定檔、字型）。 |

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
| 5. Windows Terminal | 把 [`windows-terminal.json`](./windows-terminal.json) 的設定合併進 `settings.json`（內容見下一節）。修改前先備份成 `settings.json.bak`；已經全部套用過就不會改寫檔案。 |

---

## Windows Terminal 設定

要套用的設定集中在 [`windows-terminal.json`](./windows-terminal.json)：用 clone 執行時讀同一個資料夾的檔案，用一鍵指令執行時從 GitHub 下載。想調整就改這個檔案，腳本不必動。

| 設定 | 值 | 效果 |
| :--- | :--- | :--- |
| `defaultProfile` | `{574e775e-4f2a-5b96-ac1e-a2962a402336}` | 新分頁預設開 PowerShell 7 |
| `profiles.defaults.font.face` | `MesloLGS Nerd Font` | 所有分頁用 Nerd Font，Oh My Posh 的圖示才顯示得出來 |
| `profiles.defaults.colorScheme` | `Graphite Mono` | 所有分頁用 Graphite Mono 配色（低彩度的深灰配色，定義在 `schemes`） |
| `copyFormatting` | `none` | 複製時只複製純文字，不帶顏色與字型 |
| `copyOnSelect` | `false` | 選取文字不會自動複製 |
| `newTabMenu` | `remainingProfiles` | 新分頁選單列出所有設定檔 |

快捷鍵：

| 按鍵 | 動作 |
| :--- | :--- |
| `Ctrl+C` | 複製（有選取文字時；保留換行） |
| `Ctrl+V` | 貼上 |
| `Alt+Shift+D` | 複製目前分頁並分割窗格 |
| `Ctrl+Shift+F` | 搜尋 |

合併規則：

* 只動上面列出的鍵。`profiles.list`（每台電腦自動產生的設定檔清單）和你其他的設定都保留。
* `profiles.defaults` 逐鍵合併：例如你原本設了字型大小，會保留下來，只換字型名稱。
* 配色：同名的 `Graphite Mono` 原地替換，沒有就新增；其他配色不動。
* 快捷鍵：原本綁在同一組按鍵上的動作會被換成上表的動作，不論它寫在舊式的 `actions` 或新版的 `keybindings` 裡；其他快捷鍵不動。

---

## 注意事項

* **在系統管理員視窗裡不會載入 Oh My Posh**，除非是在 Windows Terminal 裡開的（沿用 microsoft/WindowsDeveloperConfig 的做法）。
* profile 裡的設定以 `# >>> oh-my-posh (managed) >>>`、`# >>> coreutils ls (managed) >>>` 標記；重複執行只會替換這兩段，不會重複加入。不想要了，刪掉標記之間的內容即可。
* `settings.json.bak` 只在**第一次**修改時建立，之後重複執行不會覆蓋，所以它一直是原始檔。要還原就把它改名回 `settings.json`。
* `settings.json` 裡有 `//` 或 `/* */` 註解時，腳本不會修改它（改寫會把註解洗掉），會提示你手動把 `windows-terminal.json` 的內容合併進去。舊版陣列格式的 `profiles` 也一樣。
* Coreutils 的 `cat`、`cp`、`mv`、`rm` 等指令名稱與 PowerShell 的別名相同，PowerShell 會優先用自己的別名；腳本只把 `ls` 讓給 Coreutils。
* 想換主題：把 profile 裡的 `oh-my-posh init pwsh` 改成 `oh-my-posh init pwsh --config <主題檔或網址>`，可用主題見 Oh My Posh 官方文件的 Themes 頁面。

---

## 授權

MIT License。
