# Apollo 串流主機（Proxmox VE 上的 Windows VM）

> 最後更新：2026-10-21

把 Proxmox VE 上 Windows Server 2025 VM 的串流主機，從原生 Sunshine 加上 MttVDD 虛擬螢幕，換成 [Apollo](https://github.com/ClassicOldSong/Apollo)（Sunshine 的分支，內建 SudoVDA 虛擬螢幕）。
目標是不論用 Moonlight 客戶端還是瀏覽器（[moonlight-web-stream](https://github.com/MrCreativ3001/moonlight-web-stream)）連線，都會自動配合客戶端的解析度，並依解析度自動設定 Windows 的顯示縮放（DPI）。

這份是 2026-10-21 實際安裝的紀錄，`set-dpi.cs` 是串流開始時自動調整 DPI 的小程式。

---

## 環境

| 主機 | GPU | 編碼器 | 備註 |
| :--- | :--- | :--- | :--- |
| WinClient01 | Intel UHD 770 SR-IOV VF | Quick Sync（`h264_qsv` / `hevc_qsv`） | AV1 只能解碼，啟動時的 `av1_qsv` 錯誤可忽略 |
| WinClient03 | RTX 3060（直通） | NVENC | |
| WinClient04 | GT 1030（直通） | 軟體編碼（`libx264`） | GT 1030 沒有 NVENC；這台只開 H.264 |

- 作業系統：Windows Server 2025 Standard（26100）。
- Apollo：**v0.4.6**（2025-07-13，最後一版正式版；之後只有 2025-08 的 `v0.4.7-alpha.1`，上游一年多沒有新版）。
- 遠端操作用 WinRM（5985，NTLM，本機 administrator）。

---

## 安裝步驟

以下指令都在 VM 裡用**系統管理員身分的 Windows PowerShell** 執行。

### 1. 備份並移除 Sunshine 與 MttVDD

```powershell
$b = 'C:\SunshineBackup-20261021'
New-Item -ItemType Directory $b -Force | Out-Null
Copy-Item 'C:\Program Files\Sunshine\config' "$b\config" -Recurse -Force
Copy-Item C:\VirtualDisplayDriver "$b\VirtualDisplayDriver" -Recurse -Force

Stop-Service SunshineService -Force
# MSI 版 Sunshine；產品代碼用 Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\* 查
Start-Process msiexec.exe -ArgumentList '/x','{D90C23CD-B6A3-4D67-88D8-3C068BAAB939}','/qn','/norestart' -Wait

# MttVDD（MikeTheTech Virtual Display Driver）：移除裝置再刪驅動套件
pnputil /remove-device "ROOT\DISPLAY\0000"
pnputil /enum-drivers   # 找 Original Name 為 mttvdd.inf 的 Published Name（例如 oem12.inf）
pnputil /delete-driver oem12.inf /uninstall
Remove-Item C:\VirtualDisplayDriver -Recurse -Force
```

一定要移除舊的虛擬螢幕驅動，不然它會和 Apollo 的 SudoVDA 同時存在，變成兩個虛擬螢幕。

### 2. 直通的 NVIDIA 顯示卡：先裝驅動並重開機

GT 1030 是 Pascal 架構，NVIDIA 已經把 Pascal 移到 R580 分支，只出安全性更新。2026-10-21 的最新版是 **582.78**（桌機版、DCH、WHQL）：

```powershell
$f = 'C:\Windows\Temp\nv-582.78.exe'
Invoke-WebRequest https://us.download.nvidia.com/Windows/582.78/582.78-desktop-win10-win11-64bit-international-dch-whql.exe -OutFile $f -UseBasicParsing
(Get-AuthenticodeSignature $f).SignerCertificate.Subject   # 應為 CN=NVIDIA Corporation
Start-Process $f -ArgumentList '-s','-noreboot','-noeula','-clean' -Wait
Restart-Computer
```

> [!IMPORTANT]
> 裝完驅動**一定要重開機**再測 Apollo。沒重開時系統還有待處理的檔案替換（`PendingFileRenameOperations`），Apollo 建好虛擬螢幕後讀不到它的顯示路徑，log 會出現 `Failed to collect path source data or none was available!`，客戶端則收到 `503 Failed to initialize video capture/encoding`。

### 3. 安裝 Apollo

```powershell
$f = 'C:\Windows\Temp\Apollo-0.4.6.exe'
Invoke-WebRequest https://github.com/ClassicOldSong/Apollo/releases/download/v0.4.6/Apollo-0.4.6.exe -OutFile $f -UseBasicParsing
(Get-FileHash $f).Hash   # 42B2AEFAACB3474511517A56B96EE9F0517F30AC38B5DD2FDA9FD5B478F5021A
Start-Process $f -ArgumentList '/S' -Wait
```

靜默安裝會建立 `ApolloService`（自動啟動），並裝好 SudoVDA，裝置管理員裡會出現「SudoMaker Virtual Display Adapter」。設定檔在 `C:\Program Files\Apollo\config`。

### 4. 沿用舊的配對（從 Sunshine 換過來時）

把 Sunshine 的憑證和狀態檔複製過去，主機的 uniqueid、Web UI 帳密和所有已配對的客戶端都會保留，客戶端不用重新配對：

```powershell
$b = 'C:\SunshineBackup-20261021\config'; $c = 'C:\Program Files\Apollo\config'
Stop-Service ApolloService -Force
Copy-Item "$b\credentials\*" "$c\credentials\" -Force
Copy-Item "$b\sunshine_state.json" $c -Force
Start-Service ApolloService
```

`sunshine.conf` **不要整份蓋過去**：Apollo 預設的 conf 有一行 `server_cmd`，把舊 conf 裡有用的設定（例如 `encoder = quicksync`）加在後面就好。

### 5. `sunshine.conf`

三台共用的設定：

```ini
server_cmd = [{"name":"Bubbles","cmd":"bubbles.scr","elevated":false}]
headless_mode = enabled
global_prep_cmd = [{"do":"C:\\ProgramData\\ApolloDpi\\set-dpi.exe","undo":"","elevated":false}]
```

各台不同的設定：

| 主機 | 另外加的設定 |
| :--- | :--- |
| WinClient01 | `encoder = quicksync` |
| WinClient03 | （不用加，自動選到 NVENC） |
| WinClient04 | `encoder = software`、`hevc_mode = 1`、`av1_mode = 1`（只宣告 H.264） |

- `headless_mode = enabled`：不論客戶端是誰、選哪個 app，一律用虛擬螢幕，解析度與更新率照客戶端的要求建立。官方 Moonlight 不會送 `virtualDisplay=1`，沒有這行的話選 `Desktop` 不保證會走虛擬螢幕。
- `hevc_mode = 1` / `av1_mode = 1`：不對客戶端宣告 HEVC / AV1，客戶端只能用 H.264。

改完 `Restart-Service ApolloService`。

### 6. 依解析度自動設定 DPI（`set-dpi.cs`）

Apollo 不會設定 Windows 的顯示縮放。它設定裡的 `scale_factor` 是渲染解析度的倍率，不是 DPI。所以這裡用全域 prep-cmd 補上：串流開始時，Apollo 已經建好虛擬螢幕並設好解析度，接著才執行 prep-cmd，這時 `set-dpi.exe` 讀取環境變數 `APOLLO_CLIENT_WIDTH` / `APOLLO_CLIENT_HEIGHT`，依**短邊**決定縮放：

| 短邊 | DPI |
| :--- | :--- |
| ≥ 2160 | 200% |
| ≥ 1440 | 150% |
| 其他 | 100% |

編譯與部署（Windows 內建的 .NET Framework 編譯器即可，不用另外安裝）：

```powershell
$d = 'C:\ProgramData\ApolloDpi'
New-Item -ItemType Directory $d -Force | Out-Null
Invoke-WebRequest https://raw.githubusercontent.com/CTJ425/script-docs/main/script/apollo-windows-vm/set-dpi.cs -OutFile "$d\set-dpi.cs" -UseBasicParsing
& C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:winexe /optimize /out:$d\set-dpi.exe $d\set-dpi.cs
```

每次執行的結果記在 `C:\ProgramData\ApolloDpi\set-dpi.log`：

```text
2026-10-21T21:56:21 client 2560x1440 source=0 2560x1440 recommended=100% was=150% set=150% rc=0 now=150%
2026-10-21T21:56:37 client 3840x2160 source=0 3840x2160 recommended=150% was=200% set=200% rc=0 now=200%
2026-10-21T21:56:53 client 1920x1080 source=0 1920x1080 recommended=100% was=150% set=100% rc=0 now=100%
```

- `now` 是設定後重新讀回的值，和 `set` 相同才代表真的套用。
- 用的是未公開的 `DisplayConfigGetDeviceInfo` / `DisplayConfigSetDeviceInfo`（類型 `-3` / `-4`），值是「相對於 Windows 建議縮放差幾級」，所以 `was` 會受上一次連線的設定影響，這是正常的。
- 必須是編譯好的 exe。第一版用 PowerShell 腳本，光是 PowerShell 啟動、`Add-Type` 加上 Defender 掃描，在 CPU 降頻的主機上一次就要 6–11 秒；prep-cmd 是同步執行的，串流開始會跟著延遲這麼久。exe 版約 0.1 秒。
- 編成 `/target:winexe`，執行時不會跳出視窗。

### 7. Tailscale

```powershell
$f = 'C:\Windows\Temp\tailscale-setup-amd64.msi'
Invoke-WebRequest https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi -OutFile $f -UseBasicParsing
Start-Process msiexec.exe -ArgumentList '/i',$f,'/qn','/norestart' -Wait
```

登入要開瀏覽器，不能用密碼。透過 WinRM 遠端執行 `tailscale up` 時，WinRM 連線一結束程序就會被中止，登入網址打開了也不會完成。所以改用 SYSTEM 身分的排程工作，讓它在 VM 上等到登入完成：

```powershell
$log = 'C:\Windows\Temp\ts-up.log'
$act = New-ScheduledTaskAction -Execute cmd.exe -Argument "/c `"`"C:\Program Files\Tailscale\tailscale.exe`" up --unattended --accept-routes --timeout 30m > $log 2>&1`""
$pr  = New-ScheduledTaskPrincipal -UserId SYSTEM -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask TailscaleLogin -Action $act -Principal $pr -Force | Out-Null
Start-ScheduledTask TailscaleLogin; Start-Sleep 10
Get-Content $log   # 內含 https://login.tailscale.com/a/... 登入網址
```

`--unattended` 讓沒有使用者登入 Windows 時 Tailscale 也保持連線。登入完成後刪掉排程工作：`Unregister-ScheduledTask TailscaleLogin -Confirm:$false`。

### 8. moonlight-web-stream

- 角色預設把 `videoSize` 改成 `native`（存在 `server/data.json` 的 `roles.<id>.default_settings`，**先停服務再改**）。
- 瀏覽器本機存的設定（localStorage `mlSettings`）會蓋過角色預設。用過的瀏覽器要在設定頁把影像大小改成 native 一次。

---

## 注意事項

### 新配對的客戶端沒有啟動權限

Apollo 會給每個配對的客戶端各自一組權限，新配對的預設只有「列出 app」與「看串流」（`perm = 50331648`），沒有「啟動 app」和任何輸入權限。moonlight-web 啟動串流時會失敗：

```text
failed to start moonlight stream: request: Parse(InvalidXmlStatusCode { message: Some("Permission denied") })
```

每次新配對後都要把權限打開：到 Apollo Web UI（`https://<主機>:47990`）的客戶端清單勾選，或停掉 `ApolloService` 後，把 `sunshine_state.json` 裡那個客戶端的 `perm` 改成 `119480064`（全部權限）。從 Sunshine 沿用過來的舊配對已經是全部權限。

### 自動解析度與 DPI 的限制

- **解析度只在連線時決定**。串流中途調整視窗或旋轉手機不會跟著變，要重新連線；這是 Moonlight 協定的限制。
- **連線時要選 `Desktop`，不要選 `Virtual Display`**。Apollo 內建的 `Virtual Display` app 不會執行全域 prep-cmd（`src/process.cpp`），選它不會調 DPI。開了 `headless_mode` 後 `Desktop` 一樣走虛擬螢幕。
- **官方 Moonlight 的解析度要設成「Native」**，才會送裝置本身的解析度。
- **moonlight-web 的 native 是瀏覽器視窗的 CSS 像素**（`web/stream.ts`，沒有乘上 `devicePixelRatio`）。在 1920x1080、125% 縮放的電腦上，Chrome 會要求約 1536x842，DPI 落在 100%；手機或 Retina 這類高 DPI 螢幕上，解析度偏低、畫面較模糊。
- moonlight-web 的所有瀏覽器共用同一組配對，在 Windows 看來是同一個螢幕。
- **在 Windows 登入畫面連線時，DPI 不會套用**：DPI 是每個使用者各自的設定，還沒登入時沒有使用者可以套用。登入後斷線重連一次就會套用。

### 串流沒有聲音

每次連線 log 都會出現 `Couldn't get default audio endpoint` 和 `The stream will not have audio`。原因是 VM 裡沒有任何「喇叭」輸出端點：iGPU VF 沒有音訊；NVIDIA 只有 HDMI 音訊，但沒接螢幕就不會有端點。換成 Apollo 之前，原生 Sunshine 也一樣沒有聲音。要有聲音得在 VM 裡加一個虛擬音效卡（例如 VB-Audio Virtual Cable），或在 PVE 給 VM 加模擬音效裝置（`audio0: device=ich9-intel-hda,driver=none`，要冷開機一次）。

### 其他

- GT 1030 用 `libx264` 軟體編碼 1536x842 時，Apollo 穩定在約 2 個 vCPU；解析度和位元率越高越吃 CPU，必要時調 `sw_preset`。
- 在 PowerShell 裡用 `Add-Type` 定義 struct 時，`$s.header.type = -3` 改的是複本，原本的 struct 不會變；巢狀 struct 要先建好再整個指定回去。`set-dpi` 第一版就是因此一直回傳 `rc=31`。
- Apollo 預設的 `apps.json` 是 v2 格式（每個 app 有 `uuid`），不要把 Sunshine 的 `apps.json` 複製過去。

---

## 驗證方式

不用真的開串流，用客戶端的配對憑證直接呼叫 Apollo 的 nvhttp API，就能讓它走完一次正式的啟動流程：建立虛擬螢幕、執行 prep-cmd。這裡用的是 moonlight-web 存在 `data.json` 裡的 `pair_info.client_certificate` / `client_private_key`：

```bash
C="curl -sk --cert client.crt --key client.key"
H=https://<主機>:47984
$C "$H/serverinfo?uniqueid=x" | grep -E "PairStatus|VirtualDisplayDriverReady"   # 1 / true
$C "$H/applist?uniqueid=x"                                                       # 找 Desktop 的 <ID>
$C "$H/launch?uniqueid=x&appid=<ID>&mode=2560x1440x60&additionalStates=1&sops=0&rikey=00112233445566778899aabbccddeeff&rikeyid=1&localAudioPlayMode=0&surroundAudioInfo=196610"
sleep 12
$C "$H/cancel?uniqueid=x"
```

`launch` 回 `<gamesession>1` 代表成功，接著看 `set-dpi.log` 和 Apollo 的 `sunshine.log`。

---

## 還原

移除 Apollo（`C:\Program Files\Apollo\Uninstall.exe`），重新安裝 Sunshine 和 MttVDD，再從 `C:\SunshineBackup-20261021` 把 `config` 與 `vdd_settings.xml` 放回去。
