# Proxmox VE 客製化 CPU 與反偵測 Windows 虛擬機（Anti-VM）

> 最後更新：2026-10-22

在 Proxmox VE 上建立可繞過常見沙箱、反作弊與虛擬化檢測的 Windows 11 虛擬機。
內容涵蓋兩個核心部分：**Host 層級的客製化 CPU 模型設定（`/etc/pve/virtual-guest/cpu-models.conf`）與 MSR 防護**，以及**以真實消費級硬體為範本的一鍵建機腳本（`pve_antivm_create.sh`）**，同時兼顧 Intel 第 12~14 代 UHD 770 SR-IOV iGPU VF 驅動的相容性。

---

## 一、客製化 CPU 設定與內容解析

Proxmox VE 預設的 `host` CPU 類型雖然會透傳實體 CPU 型號，但仍會在 CPUID 中暴露 `KVMKVMKVM` 簽章、開啟 KVM 半虛擬化 flags（`+kvm_pv_eoi`、`+kvm_pv_unhalt`），且預設使用 40-bit 實體位址寬度，容易被反虛擬化檢測工具（如 Pafish、VMAware、Al-Khaser）識破。

透過 Proxmox VE 的 `/etc/pve/virtual-guest/cpu-models.conf`，可以定義全域共用的自訂 CPU 模型。

### 1. 設定檔位置與完整內容

設定檔位於 `/etc/pve/virtual-guest/cpu-models.conf`（存放於 pmxcfs 叢集檔案系統，存檔後立即生效，不需重啟服務）：

```ini
# SR-IOV iGPU compatible stealth CPU model (hides KVM, preserves VBS/Hyper-V state for Intel VF driver)
cpu-model: hiddenvmcpu
    flags -kvm_pv_eoi;-kvm_pv_unhalt
    phys-bits host
    hidden 1
    reported-model host

# Strict bare-metal CPU model (only for full PF passthrough or non-VF VMs)
cpu-model: hiddenvmcpu-strict
    flags -hypervisor;-kvm_pv_eoi;-kvm_pv_unhalt
    phys-bits host
    hidden 1
    hv-vendor-id GenuineIntel
    reported-model host
```

可直接透過以下指令在 PVE 節點上建立設定檔：

```bash
mkdir -p /etc/pve/virtual-guest
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/pve-antivm/cpu-models.conf \
  -o /etc/pve/virtual-guest/cpu-models.conf
```

### 2. 為什麼分成兩種 CPU 模型？

| 模型名稱（套用時需加 `custom-` 前綴） | 適用情境 | 關鍵差異與原因 |
| :--- | :--- | :--- |
| **`custom-hiddenvmcpu`** | 掛載 **Intel SR-IOV iGPU VF** 的 Windows VM（預設） | 隱藏 KVM 簽章與半虛擬化 flags，但**保留 Hyper-V enlightenments (`hv_*`) 與 CPUID Hypervisor Present bit**。因為 Windows 內的 Intel Iris Xe / UHD Graphics SR-IOV VF 驅動必須偵測到 Hyper-V 分割區介面才能初始化，若強行關閉 `-hypervisor` 會導致顯示卡出現 **Code 43**。 |
| **`custom-hiddenvmcpu-strict`** | **獨立顯卡完整直通 (Full PF Passthrough)** 或無 VF 的裸機隱蔽 VM | 額外加上 `-hypervisor`（將 CPUID Leaf `0x1` ECX bit 31 清為 `0`，使 Windows WMI `HypervisorPresent` 變為 `False`）並設定 `hv-vendor-id GenuineIntel`（將 CPUID Leaf `0x40000000` 簽章覆寫為 `GenuineIntel`）。 |

### 3. 各項參數作用與 QEMU 轉譯對照

| `cpu-models.conf` 設定項 | 展開後的 QEMU `-cpu` 參數 | 反偵測作用說明 |
| :--- | :--- | :--- |
| `reported-model host` | `-cpu host,...` | 直接向 Guest 呈現宿主機的真實 CPU 名稱與微架構特徵（例如 `13th Gen Intel(R) Core(TM) i7-13700K`），避免出現 `QEMU Virtual CPU` 或 `Common KVM processor`。 |
| `hidden 1` | `kvm=off` | 隱藏 KVM 預設在 CPUID Leaf `0x40000000` 暴露的 `KVMKVMKVM` 字串。 |
| `phys-bits host` | `host-phys-bits=true` | 讓 Guest 看到的實體記憶體位址位元數（CPUID `0x80000008` EAX）與宿主機真實 CPU 一致（例如 39 或 46 bits），避免 QEMU 預設 `40` bits 被沙箱檢測判定為虛擬機。 |
| `flags -kvm_pv_eoi;-kvm_pv_unhalt` | `-kvm_pv_eoi,-kvm_pv_unhalt` | 覆寫並關閉 PVE 預設為 Guest 注入的 KVM 半虛擬化 EOI 中斷與 spinlock 最佳化旗標。 |
| `flags -hypervisor` *(僅 strict)* | `-hypervisor` | 隱藏 CPUID `0x1` ECX 第 31 位元的 Hypervisor Present 旗標。 |
| `hv-vendor-id GenuineIntel` *(僅 strict)* | `hv-vendor-id=GenuineIntel` | 將 Hyper-V Vendor ID 從預設的 `Microsoft Hv` 替換為處理器原生字串 `GenuineIntel`。 |

### 4. 如何套用到虛擬機與驗證

在 Proxmox VE 中引用 `/etc/pve/virtual-guest/cpu-models.conf` 內的模型時，名稱前方**必須加上 `custom-` 前綴**：

```bash
# 套用 SR-IOV iGPU 相容的隱蔽 CPU 模型
qm set <VMID> --cpu custom-hiddenvmcpu

# 或套用嚴格裸機 CPU 模型（不使用 Intel SR-IOV VF 時）
qm set <VMID> --cpu custom-hiddenvmcpu-strict
```

> [!IMPORTANT]
> 設定完成後需對虛擬機進行**冷重開機（Stop 後再 Start）**，新的 QEMU `-cpu` 參數才會生效；在 Windows 內單純點選「重新啟動」不會重新產生 QEMU 程序。

可用 `qm showcmd` 檢查 PVE 實際展開的 QEMU `-cpu` 參數（以 `custom-hiddenvmcpu` 為例）：

```bash
qm showcmd 100 --pretty | grep -F -- -cpu
# 展開結果：
# -cpu 'host,-cet-ibt,-cet-ss,hv_evmcs,hv_ipi,hv_relaxed,hv_reset,hv_runtime,hv_spinlocks=0x1fff,hv_stimer,hv_synic,hv_time,hv_vapic,hv_vpindex,kvm=off,-kvm_pv_eoi,-kvm_pv_unhalt,host-phys-bits=true'
```

### 5. Host 層級 KVM MSR 未知暫存器防護

許多反虛擬化工具會故意讀取真實 CPU 才有、但 KVM 未實作的 MSR（Model-Specific Register）暫存器；若 KVM 回傳 `#GP`（General Protection Fault）異常，程式即可判定處於虛擬機中。在 Host 啟用 `ignore_msrs=1` 可讓未實作的 MSR 讀取靜默回傳 `0`：

```bash
# 立即生效
echo 1 > /sys/module/kvm/parameters/ignore_msrs
echo 0 > /sys/module/kvm/parameters/report_ignored_msrs

# 寫入 modprobe 設定確保重開機後保留
echo "options kvm ignore_msrs=1 report_ignored_msrs=0" > /etc/modprobe.d/kvm-antivm.conf
```

---

## 二、建立反偵測虛擬機腳本（`pve_antivm_create.sh`）

除了 CPU 之外，Windows 沙箱與反作弊程式還會檢查 **SMBIOS (DMI)、ACPI 表頭、磁碟/光碟機型號、網卡 MAC OUI、VirtIO PCI 裝置 ID (`VEN_1AF4`) 以及 `QEMUVGID`**。`pve_antivm_create.sh` 會自動完成上述 Host 環境檢查，並以真實市售主機為範本一鍵建立高隱蔽性的 Windows 11 VM。

### 1. 一鍵執行與參數說明

```bash
# 下載腳本至 PVE 節點
curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/script/pve-antivm/pve_antivm_create.sh \
  -o /root/pve_antivm_create.sh
chmod +x /root/pve_antivm_create.sh

# 查看參數說明
/root/pve_antivm_create.sh --help

# 建立範例：VMID 9000、儲存區 local-lvm、64GB 系統碟、直通 Intel iGPU VF (0000:00:02.1 或 mapping=igpu-vf1)
/root/pve_antivm_create.sh 9000 Win11-AntiVM local-lvm \
  local:iso/Win11_23H2_x64.iso 64 mapping=igpu-vf1
```

#### 位置參數

| 順序 | 參數 | 預設值 | 說明 |
| :--- | :--- | :--- | :--- |
| `$1` | `VMID` | `9000` | Proxmox VE 虛擬機 ID。 |
| `$2` | `VMNAME` | `Win11-AntiVM` | 虛擬機名稱。 |
| `$3` | `STORAGE` | 自動偵測 | 自動選取第一個支援 `images` 且狀態為 `active` 的儲存區，若無則使用 `local-lvm`。 |
| `$4` | `WIN_ISO` | 空字串 | Windows 安裝光碟（例如 `local:iso/Win11.iso`），留空則後續手動掛載。 |
| `$5` | `DISK_GB` | `64` | 系統碟容量（GB）。建議 `>= 64`，避免觸發沙箱的「小硬碟容量」啟發式規則。 |
| `$6` | `HOSTPCI_DEV` | 空字串 | 選用 PCIe 直通裝置或 PVE Resource Mapping（如 `0000:00:02.1` 或 `mapping=igpu-vf1`）。 |

#### 環境變數覆寫

| 變數 | 預設值 | 說明 |
| :--- | :--- | :--- |
| `RAM_MB` | `16384` | 記憶體大小（MB），建議 `>= 8192`。 |
| `CPU_CORES` | `8` | CPU 核心數，建議 `>= 4`。 |
| `PROFILE_IDX` | 隨機 (`0`~`3`) | 指定固定硬體範本索引（`0`~`3`）。 |
| `STRICT_NO_HV` | `0` | 設為 `1` 時會在 `args` 末尾強制附加 `-cpu 'host,kvm=off,-hypervisor,phys-bits=host'`。 |

---

### 2. 內建實體硬體範本（`TEMPLATES`）

腳本內建 4 組真實市售硬體組合，每次執行時會搭配該廠牌真實的 MAC OUI 前綴，並隨機產生主機板序號、機殼序號、SSD 序號、記憶體序號與系統 UUID：

| `PROFILE_IDX` | 主機板廠牌與型號 | BIOS 資訊 | ACPI OEM (`id` / `table`) | 網卡 OUI | 記憶體型號 | SSD 與光碟機型號 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`0`** | ASRock `B660M Pro RS` | AMI `14.01` (`10/23/2025`) | `ALASKA` / `A_M_I___` | `A8:A1:59` | Kingston `KF432C16BB/16` (DDR4-3200) | `Samsung SSD 980 PRO 1TB` / `ASUS DRW-24D5MT` |
| **`1`** | ASUS `ROG STRIX Z790-E GAMING WIFI` | AMI `1801` (`12/08/2025`) | `ALASKA` / `A_M_I___` | `1C:87:2C` | Corsair `CMK32GX5M2B5600C36` (DDR5-5600) | `WD_BLACK SN850X 1000GB` / `ASUS DRW-24D5MT` |
| **`2`** | MSI `PRO Z690-A WIFI DDR4` (`MS-7D25`) | AMI `1.G0` (`09/15/2025`) | `ALASKA` / `A_M_I___` | `E0:D4:E8` | Kingston `KF436C18BBK2/32` (DDR4-3600) | `Samsung SSD 870 EVO 1TB` / `HL-DT-ST DVDRAM GH24NSD5` |
| **`3`** | Intel `NUC13RNGi9` (`NUC13SBBi9`) | Intel `RNRPL579.0064` | `INTEL ` / `NUC13RNG` | `00:1B:21` | Crucial `CT16G48C40S5` (DDR5-4800) | `Crucial P5 Plus 1000GB` / `ASUS SDRW-08D2S-U` |

---

### 3. 腳本反偵測設計細節

1. **移除所有 VirtIO PCI 與 QEMU 專屬裝置**：
   - `--balloon 0`：移除 `virtio-balloon-pci`（避免裝置管理員出現 `PCI\VEN_1AF4`）。
   - `--agent 0`：移除 `virtio-serial` 與 `org.qemu.guest_agent.0` 通道（同時不在 Guest 內安裝 VirtIO 驅動與 `qemu-ga`）。
   - `qm set $VMID --delete vmgenid`：移除預設建立的 VM Generation ID，避免在 Windows `HKLM:\HARDWARE\ACPI` 與裝置管理員中暴露 `QEMUVGID` / `VEN_QEMU`。
2. **原生儲存與網卡控制器**：
   - `--sata0`：使用 Q35 原生 Intel ICH9 AHCI 控制器搭配 Windows 內建 `storahci.sys` 驅動，加上隨機序號 `serial=S69ENX0...` 與 `ssd=1,discard=on`。
   - `--net0 e1000e`：使用 Intel 82574L Gigabit 網卡，並將 PVE 預設的 `BC:24:11` MAC 前綴替換為對應主機板廠的真實 OUI。
3. **ACPI 表頭與 IDE 型號覆寫（`--args`）**：
   - `-machine 'x-oem-id=ALASKA,x-oem-table-id=A_M_I___'`：將 ACPI 表頭預設的 `BOCHS ` / `BXPC    ` 替換為真實 AMI BIOS 簽章。
   - `-global 'ide-hd.model=...' -global 'ide-cd.model=...'`：覆寫 AHCI/IDE 裝置預設回報的 `QEMU HARDDISK` 與 `QEMU DVD-ROM` 字串。
4. **完整 SMBIOS 結構注入（Type 0 / 1 / 2 / 3 / 4 / 11 / 17）**：
   - **Type 1 (System)**：透過 PVE 原生 `--smbios1` 搭配 `base64=1` 寫入，完整保留廠牌與產品名稱中的空白與逗號。
   - **Type 0 (BIOS)、Type 2 (Baseboard)、Type 3 (Chassis)、Type 4 (Processor)、Type 11 (OEM Strings)、Type 17 (Memory Device)**：透過 `--args` 的 `-smbios` 參數逐項注入，其中字串內的逗號會透過 `qesc()` 自動跳脫為 `,,`（例如 `American Megatrends International,, LLC.`）。
   - **踩坑注意**：QEMU 11.x 的 `-smbios type=3` 不接受 `type=<chassis_type>` 子參數（會報 `Invalid parameter 'type'`），因此腳本中僅傳入 `manufacturer`、`version`、`serial`、`asset` 與 `sku`。

---

## 三、產生的虛擬機設定檔範例（`/etc/pve/qemu-server/<VMID>.conf`）

以下為腳本建立並搭配 Intel SR-IOV iGPU VF 與核心綁定（`affinity`）後的虛擬機設定檔結構範例（序號、UUID 與 MAC 均為腳本隨機產生的示範值）：

```ini
# /etc/pve/qemu-server/100.conf
affinity: 0-7
agent: 0
args: -machine 'x-oem-id=ALASKA,x-oem-table-id=A_M_I___' -global 'ide-hd.model=Samsung SSD 980 PRO 1TB' -global 'ide-cd.model=ASUS DRW-24D5MT' -smbios 'type=0,vendor=American Megatrends International,, LLC.,version=14.01,date=10/23/2025,uefi=on' -smbios 'type=2,manufacturer=ASRock,product=B660M Pro RS,version=1.0,serial=A1B2C3-100,asset=Default string,location=Default string' -smbios 'type=3,manufacturer=ASRock,version=1.0,serial=CHASSIS0001,asset=Default string,sku=Default string' -smbios 'type=4,sock_pfx=LGA1700,manufacturer=Intel(R) Corporation,version=13th Gen Intel(R) Core(TM) i7-13700K,serial=To Be Filled By O.E.M.,asset=To Be Filled By O.E.M.,part=To Be Filled By O.E.M.,max-speed=5000,current-speed=2600' -smbios 'type=11,value=Default string' -smbios 'type=17,loc_pfx=DDR4_A2,bank=BANK 0,manufacturer=Kingston,serial=RAM00001,asset=9876543210,part=KF432C16BB/16,speed=3200'
balloon: 0
bios: ovmf
boot: order=sata0;ide2;ide0
cores: 8
cpu: custom-hiddenvmcpu
efidisk0: local-lvm:vm-100-disk-0,efitype=4m,ms-cert=2023k,pre-enrolled-keys=1,size=4M
hostpci0: mapping=igpu-vf1,pcie=1
ide0: none,media=cdrom
ide2: none,media=cdrom
machine: pc-q35-11.0+pve2
memory: 16384
name: Win11-AntiVM
net0: e1000e=A8:A1:59:12:34:56,bridge=vmbr0,firewall=1
numa: 0
ostype: win11
sata0: local-lvm:vm-100-disk-1,discard=on,serial=S69ENX0EXAMPLE01,size=64G,ssd=1
smbios1: base64=1,family=QjY2ME0gUHJvIFJT,manufacturer=QVNSb2Nr,product=QjY2ME0gUHJvIFJT,serial=TTgwRVhBTVBMRTAx,sku=U0tVLU04MEVYQU1QTEUwMQ==,uuid=00000000-0000-4000-8000-000000000001,version=MS4w
sockets: 1
tpmstate0: local-lvm:vm-100-disk-2,size=4M,version=v2.0
vga: none
```

- **從範本複製後的注意事項**：Proxmox VE 在 `qm clone` 時會重新為新 VM 產生一組預設的 `BC:24:11:xx:xx:xx` MAC 位址，若需要通過 MAC OUI 檢測，複製後請將 `net0` 的 MAC 前三碼改回板廠 OUI（例如 `A8:A1:59`、`1C:87:2C`、`E0:D4:E8`），並可在完成安裝後將預設顯示卡設為 `vga: none`（改由直通顯卡或虛擬螢幕輸出）。

---

## 四、Windows 客體機內反偵測驗證（`Verify-AntiVM.ps1`）

同目錄下附帶 Windows 端驗證工具，可在 VM 內直接透過 PowerShell 執行 22 項以上的唯讀檢測（包含 C# 原生機器碼探測 CPUID `0x1` / `0x40000000`、RDTSC + CPUID VM-Exit 週期數、SMBIOS Type 0/1/2/3/17、ACPI 機碼、磁碟/光碟機型號、MAC OUI、PCI VirtIO 裝置與驅動程式）：

```powershell
# 1. 執行內建 22+ 項 Anti-VM 指標檢測，並匯出報表至 C:\AntiVM_Test\Reports
$d = 'C:\AntiVM_Test'
New-Item -ItemType Directory $d -Force | Out-Null
Invoke-WebRequest https://raw.githubusercontent.com/CTJ425/script-docs/main/script/pve-antivm/Verify-AntiVM.ps1 -OutFile "$d\Verify-AntiVM.ps1" -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$d\Verify-AntiVM.ps1" -ReportDir "$d\Reports"

# 2. (選用) 自動下載並執行開源檢測套件 Pafish v0.6 與 VMAware CLI
Invoke-WebRequest https://raw.githubusercontent.com/CTJ425/script-docs/main/script/pve-antivm/Install-And-Run-Suites.ps1 -OutFile "$d\Install-And-Run-Suites.ps1" -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$d\Install-And-Run-Suites.ps1" -WorkDir $d
```

若想在 PVE Host 上將驗證腳本打包成 `antivm-tools.iso`，讓 `pve_antivm_create.sh` 在建機時自動掛載到 `ide0`：

```bash
genisoimage -o /var/lib/vz/template/iso/antivm-tools.iso -V "ANTIVM_TOOLS" -r -J \
  /root/antivm-windows-tests/
```

---

## 五、目錄檔案清單

| 檔案 | 用途 |
| :--- | :--- |
| `cpu-models.conf` | Proxmox VE `/etc/pve/virtual-guest/cpu-models.conf` 客製化 CPU 設定檔（含 `hiddenvmcpu` 與 `hiddenvmcpu-strict`） |
| `pve_antivm_create.sh` | PVE Host 端一鍵建立反偵測 Windows 11 虛擬機腳本 |
| `Verify-AntiVM.ps1` | Windows Guest 端 22+ 項 Anti-VM 指標檢測腳本（含原生 CPUID / RDTSC 探測） |
| `Install-And-Run-Suites.ps1` | Windows Guest 端自動下載並執行 Pafish 與 VMAware 的輔助腳本 |
| `Run-AntiVM-Check.bat` | 封裝進 `antivm-tools.iso` 供雙擊執行的批次檔 |

---

## 授權

MIT License。
