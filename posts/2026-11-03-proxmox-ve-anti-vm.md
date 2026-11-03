---
title: 在 Proxmox VE 上打造反偵測 Windows 虛擬機：從客製化 CPU 到硬體偽裝
date: 2026-11-03
summary: 許多反作弊、沙箱與安全掃描工具會檢查虛擬機特徵。這篇文章記錄我如何在 Proxmox VE 上設定客製化 CPU 模型、消除 KVM 特徵、處理 MSR 異常，並透過一鍵腳本偽裝真實硬體，同時兼顧 Intel SR-IOV 內顯驅動相容性。
tags: [proxmox, windows, virtualization, security]
tools: [proxmox-ve]
scripts: [pve-antivm]
---

在虛擬化平台上跑 Windows 11 時，常會遇到某些遊戲反作弊（如 Vanguard、Easy Anti-Cheat、BattlEye）、軟體保護殼或惡意程式分析沙箱拒絕在虛擬機中執行。

很多人一開始會嘗試在 Proxmox VE 的 VM 設定中加上 `cpu: host`，以為這樣就能騙過檢測。但實際上，現代檢測工具（例如 Pafish、VMAware、Al-Khaser）檢查的維度遠比想像中深，單靠 `cpu: host` 幾乎一秒就露餡。

這篇文章記錄我如何從 Host 層級的 CPU 模型設定、核心 MSR 防護，一路做到主機板與週邊裝置的硬體偽裝，以及在 Intel SR-IOV 內顯環境下踩到的關鍵驅動坑。

---

## 為什麼 `cpu: host` 還不夠？

Proxmox 預設的 `cpu: host` 雖然會把實體 CPU 的型號字串（例如 `13th Gen Intel(R) Core(TM) i7-13700K`）帶給 Guest，但在底層 QEMU / KVM 依然留下了大量虛擬化痕跡：

1. **CPUID Leaf `0x40000000` 簽章**：預設會直接回傳字串 `KVMKVMKVM`。
2. **KVM 半虛擬化旗標**：PVE 預設會自動注入 `+kvm_pv_eoi` 與 `+kvm_pv_unhalt` 等最佳化旗標，表明這是一台吃 KVM 加速的虛擬機。
3. **實體記憶體位址位元數（Phys-bits）**：QEMU 預設 Guest 的定址位元數是 `40` bits，而真實桌面處理器通常是 39 或 46 bits。
4. **未實作的 MSR 暫存器**：檢測程式會故意讀取某些實體 CPU 才有、但 KVM 沒有實作的 MSR（Model-Specific Register）。一旦 KVM 拋出 `#GP`（General Protection Fault），程式就知道自己身處虛擬機。

---

## 一、PVE 客製化 CPU 模型（`cpu-models.conf`）

過去消除 KVM 特徵的做法是在 VM 設定檔寫 `args: -cpu ...`。但手動寫 `args` 很難維護，不但容易與 PVE 預設參數衝突，Web UI 調整核心數時也容易出錯。

Proxmox 官方標準做法是使用 `/etc/pve/virtual-guest/cpu-models.conf`。這個檔案位於 PVE 的 `pmxcfs` 叢集檔案系統，修改存檔後**全叢集即時生效，不需重啟任何服務**，Web UI 下拉選單也會自動列出 `custom-<模型名稱>`。

我們定義了兩組模型：

```ini
# SR-IOV iGPU 相容模型（保留 Hyper-V 分割區供 Intel 驅動初始化）
cpu-model: hiddenvmcpu
    flags -kvm_pv_eoi;-kvm_pv_unhalt
    phys-bits host
    hidden 1
    reported-model host

# 嚴格裸機模型（僅用於獨立顯卡直通或無 VF 的虛擬機）
cpu-model: hiddenvmcpu-strict
    flags -hypervisor;-kvm_pv_eoi;-kvm_pv_unhalt
    phys-bits host
    hidden 1
    hv-vendor-id GenuineIntel
    reported-model host
```

### 關鍵參數與踩坑點：Code 43

這裡最關鍵的設計在於 **`hiddenvmcpu` 與 `hiddenvmcpu-strict` 的分流**：

* `hidden 1`：展開為 `kvm=off`，消除 `KVMKVMKVM` 簽章。
* `phys-bits host`：讓 Guest 看到的定址位元數與實體 CPU 完全一致。
* `-kvm_pv_eoi;-kvm_pv_unhalt`：關閉半虛擬化中斷旗標。

**那為什麼 `hiddenvmcpu` 不加 `-hypervisor`？**

這是最容易踩的坑。如果在有掛載 **Intel UHD 770 / Iris Xe SR-IOV iGPU VF** 的虛擬機上加上 `-hypervisor`（移除 CPUID ECX[31] 的 Hypervisor Present 旗標），Windows 內的 Intel 顯示卡驅動程式在開機時會直接噴 **Code 43** 錯誤！

因為 Intel 的 SR-IOV VF 驅動程式必須偵測到微軟 Hyper-V 分割區介面才能正常初始化虛擬 GPU 資源。因此：
* **掛載 Intel SR-IOV VF**：務必使用 `custom-hiddenvmcpu`（隱藏 KVM 特徵，但保留 Hyper-V 啟發項）。
* **獨立顯卡完整直通 (Full PF Passthrough) 或純 CPU 運算**：才套用 `custom-hiddenvmcpu-strict`，徹底將 Hypervisor 旗標抹零並覆寫 Vendor ID。

---

## 二、Host 核心 MSR 防護

除了 CPUID，反作弊工具最喜歡發起異常 MSR 探針。在 PVE Host 端載入 KVM 模組參數 `ignore_msrs=1`，能讓未實作的 MSR 讀取請求靜默回傳 `0`，而不會向 Guest 拋出 `#GP`：

```bash
# 寫入持久化設定
echo "options kvm ignore_msrs=1 report_ignored_msrs=0" > /etc/modprobe.d/kvm-antivm.conf

# 立即套用
echo 1 > /sys/module/kvm/parameters/ignore_msrs
echo 0 > /sys/module/kvm/parameters/report_ignored_msrs
```

---

## 三、硬體周邊去虛擬化

光搞定 CPU 還不夠，Windows 裝置管理員和 WMI 還能查出一堆「QEMU」和「Red Hat」的尾巴。必須全面偽裝：

| 檢查點 | 原生 QEMU / PVE 特徵 | 反偵測偽裝方案 |
| :--- | :--- | :--- |
| **主機板 (SMBIOS)** | `QEMU`、`Bochs` 字樣 | 偽裝真實市售板卡（如 ASRock B660M、ASUS ROG Z790），注入隨機序號 |
| **ACPI 表頭** | `BOCHS `、`BXPC ` | 覆寫 OEM ID 為主機板 BIOS 原廠標籤（如 `ALASKA`、`A_M_I___`） |
| **ACPI VMGenID** | `QEMUVGID` 虛擬設備 | 建立 VM 時移除 `vmgenid` 參數 |
| **磁碟控制器** | Red Hat VirtIO SCSI (`VEN_1AF4`) | 改用原生 Intel ICH9 AHCI (SATA)，系統免裝額外驅動 |
| **磁碟型號** | `QEMU HARDDISK` | 注入實體 SSD 型號（如 `Samsung SSD 980 PRO 1TB`）與專屬序號 |
| **網卡** | VirtIO 網卡 / Proxmox MAC (`BC:24:11`) | 改用 Intel e1000e，MAC 前三碼採用板廠真實 OUI（如 `A8:A1:59`） |
| **通訊通道** | VirtIO Balloon (`VEN_1AF4`)、Guest Agent | 設為 `balloon: 0` 與 `agent: 0`，移除所有半虛擬化 PCI 裝置 |

---

## 四、一鍵建機與自動化腳本

要把上述所有的 SMBIOS、ACPI、硬體序號與 CPU 模型手動拼成 `qm create` 指令非常繁瑣，因此我寫了 [**pve-antivm**](../script/pve-antivm) 專案：

1. **`pve_antivm_create.sh`**：
   自動檢查 Host 端環境（自動補齊 `cpu-models.conf` 與 MSR 參數），內建四套主流消費級主機板範本，隨機生成合法的 MAC OUI、主機板序號與 SSD 序號，並整合 Intel iGPU VF 直通。
2. **`Verify-AntiVM.ps1`**：
   封裝在虛擬光碟內的 PowerShell 檢測腳本，進入 Windows 後跑一次即可針對 CPUID、SMBIOS、ACPI 表、PCI 裝置 ID、WMI 查詢進行 16 項全方位驗證。

完整腳本與使用指南見 [pve-antivm 專案頁](../script/pve-antivm)。
