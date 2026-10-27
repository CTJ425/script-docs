#!/usr/bin/env bash
# ==============================================================================
# Proxmox VE Anti-VM Template / Sandbox VM Generator Script (v4 完整隱蔽版)
# 以實體硬體為範本，建立高隱蔽性 Windows 沙箱 VM（涵蓋 CPUID/MSR/SMBIOS/ACPI/Disk/NIC/PCI）
#
# 用法:
#   ./pve_antivm_create.sh [VMID] [VMNAME] [STORAGE] [WIN_ISO] [DISK_GB] [HOSTPCI_DEV]
#
# 範例:
#   ./pve_antivm_create.sh 9000 Win11-AntiVM local-lvm local:iso/Win11_23H2_x64.iso 64 0000:00:02.1
# ==============================================================================

set -euo pipefail

usage() {
    cat << 'EOF'
用法:
  ./pve_antivm_create.sh [VMID] [VMNAME] [STORAGE] [WIN_ISO] [DISK_GB] [HOSTPCI_DEV]

參數:
  VMID         VM ID (預設: 9000)
  VMNAME       VM 名稱 (預設: Win11-AntiVM)
  STORAGE      儲存區名稱 (預設: 自動偵測支援 images 的可用儲存區或 local-lvm)
  WIN_ISO      Windows 安裝 ISO 路徑 (預設: 空)
  DISK_GB      系統碟大小 GB (預設: 64)
  HOSTPCI_DEV  GPU Passthrough / SR-IOV VF 裝置或 mapping (預設: 空)

環境變數:
  RAM_MB       記憶體大小 MB (預設: 16384)
  CPU_CORES    CPU 核心數 (預設: 8)
  PROFILE_IDX  指定硬體範本 0~3 (預設: 隨機抽樣)
  STRICT_NO_HV 設為 1 時強制附加 -cpu 'host,kvm=off,-hypervisor,phys-bits=host' (預設: 0)
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

# --- 0. 自動偵測預設儲存區 ---
detect_default_storage() {
    local st
    st=$(pvesm status -content images 2>/dev/null | awk 'NR>1 && $3=="active" {print $1; exit}' || true)
    if [[ -n "$st" ]]; then
        echo "$st"
    else
        echo "local-lvm"
    fi
}

# --- 1. 使用者基本設定 ---
VMID=${1:-9000}                                  # VM ID (預設 9000)
VMNAME=${2:-"Win11-AntiVM"}                      # VM 名稱
STORAGE=${3:-"$(detect_default_storage)"}        # 儲存區名稱 (自動偵測可用儲存區或 local-lvm)
ISO=${4:-""}                                     # Windows 安裝 ISO 路徑 (可留空)
DISK_GB=${5:-64}                                 # 系統碟大小 (GB，建議 >= 64GB 以通過沙箱容量檢測)
PCI_DEV=${6:-""}                                 # 選用 GPU Passthrough / SR-IOV VF (例如 0000:00:02.1)
RAM_MB=${RAM_MB:-16384}                          # 預設 16GB RAM
CPU_CORES=${CPU_CORES:-8}                        # 預設 8 核心
PROFILE_IDX=${PROFILE_IDX:-""}                   # 可指定 0~3 固定硬體範本，留空則隨機抽樣
STRICT_NO_HV=${STRICT_NO_HV:-0}                  # 設為 1 時額外移除所有 hv_* 啟發項 (完全清空 0x40000000 leaf)

# --- 2. Host 層級 Anti-VM 環境檢查與自動配置 ---
ensure_host_antivm_env() {
    mkdir -p /etc/pve/virtual-guest
    local cpu_conf="/etc/pve/virtual-guest/cpu-models.conf"
    if ! grep -q "cpu-model: hiddenvmcpu" "$cpu_conf" 2>/dev/null; then
        echo "[*] 建立 $cpu_conf (custom-hiddenvmcpu)..."
        cat << 'CPUEOF' >> "$cpu_conf"

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
CPUEOF
    fi

    # 設定 KVM ignore_msrs=1 避免客體機探測未知 MSR 時觸發 #GP 異常
    if [[ -w /sys/module/kvm/parameters/ignore_msrs ]]; then
        echo 1 > /sys/module/kvm/parameters/ignore_msrs
        echo 0 > /sys/module/kvm/parameters/report_ignored_msrs
    fi
    if [[ ! -f /etc/modprobe.d/kvm-antivm.conf ]]; then
        echo "options kvm ignore_msrs=1 report_ignored_msrs=0" > /etc/modprobe.d/kvm-antivm.conf
    fi
}

# --- 3. 工具函式 ---
gen_random_string() { tr -dc 'A-Z0-9' </dev/urandom | head -c "$1" || true; }
gen_random_digits() { tr -dc '0-9' </dev/urandom | head -c "$1" || true; }

gen_random_mac() {   # $1 = OUI 前三段
    printf "%s:%02X:%02X:%02X" "$1" $((RANDOM%256)) $((RANDOM%256)) $((RANDOM%256))
}

b64()  { printf '%s' "$1" | base64 -w0; }          # smbios1 (Type1) 用：保留空白/逗號
qesc() { printf '%s' "$1" | sed 's/,/,,/g'; }      # QEMU -smbios 用：逗號跳脫為 ,,

# --- 4. 實體硬體範本 (常見消費級市售主機板與機型) ---
# 欄位:
# mfr|product|version|board_mfr|board_product|oui|serial_prefix|chassis_type|bios_vendor|bios_ver|bios_date|acpi_oem|acpi_table|ram_mfr|ram_part|ram_speed|disk_model|cdrom_model
TEMPLATES=(
    "ASRock|B660M Pro RS|1.0|ASRock|B660M Pro RS|A8:A1:59|M80|3|American Megatrends International, LLC.|14.01|10/23/2025|ALASKA|A_M_I___|Kingston|KF432C16BB/16|3200|Samsung SSD 980 PRO 1TB|ASUS DRW-24D5MT"
    "ASUSTeK COMPUTER INC.|ROG STRIX Z790-E GAMING WIFI|Rev 1.xx|ASUSTeK COMPUTER INC.|ROG STRIX Z790-E GAMING WIFI|1C:87:2C|R9M0|3|American Megatrends Inc.|1801|12/08/2025|ALASKA|A_M_I___|Corsair|CMK32GX5M2B5600C36|5600|WD_BLACK SN850X 1000GB|ASUS DRW-24D5MT"
    "Micro-Star International Co., Ltd.|MS-7D25|1.0|Micro-Star International Co., Ltd.|PRO Z690-A WIFI DDR4|E0:D4:E8|7D25|3|American Megatrends International, LLC.|1.G0|09/15/2025|ALASKA|A_M_I___|Kingston|KF436C18BBK2/32|3600|Samsung SSD 870 EVO 1TB|HL-DT-ST DVDRAM GH24NSD5"
    "Intel(R) Client Systems|NUC13RNGi9|M58736-303|Intel Corporation|NUC13SBBi9|00:1B:21|G6RN|35|Intel Corp.|RNRPL579.0064|08/20/2025|INTEL |NUC13RNG|Crucial|CT16G48C40S5|4800|Crucial P5 Plus 1000GB|ASUS SDRW-08D2S-U"
)

if [[ -n "$PROFILE_IDX" && "$PROFILE_IDX" =~ ^[0-3]$ ]]; then
    RAND_IDX=$PROFILE_IDX
else
    RAND_IDX=$((RANDOM % ${#TEMPLATES[@]}))
fi

# shellcheck disable=SC2034
IFS='|' read -r mfr product version board_mfr board_product oui serial_prefix chassis_type \
    bios_vendor bios_ver bios_date acpi_oem acpi_table ram_mfr ram_part ram_speed disk_model cdrom_model \
    <<< "${TEMPLATES[$RAND_IDX]}"

HOST_CPU_MODEL=$(lscpu | awk -F: '/Model name/ {gsub(/^[ \t]+/, "", $2); print $2; exit}')
[[ -z "$HOST_CPU_MODEL" ]] && HOST_CPU_MODEL="13th Gen Intel(R) Core(TM) i7-13700K"

VM_UUID=$(cat /proc/sys/kernel/random/uuid)
RAND_MAC=$(gen_random_mac "$oui")
SYS_SERIAL="${serial_prefix}$(gen_random_string 8)"
BOARD_SERIAL="$(gen_random_string 6)-$(gen_random_digits 3)"
CHASSIS_SERIAL="$(gen_random_string 10)"
DISK_SERIAL="S69ENX0$(gen_random_string 8)"
RAM_SERIAL="$(gen_random_string 8)"

ensure_host_antivm_env

echo "======================================================================"
echo " Creating Stealth Anti-VM ID : $VMID ($VMNAME)"
echo " Selected Hardware Profile   : [$RAND_IDX] $mfr - $product"
echo " Host CPU Model (Type 4)     : $HOST_CPU_MODEL"
echo " Storage / Disk Model        : $STORAGE (${DISK_GB}G) / $disk_model [SN:$DISK_SERIAL]"
echo " UUID / MAC (Vendor OUI)     : $VM_UUID / $RAND_MAC"
echo "======================================================================"

# --- 5. 建立虛擬機與去虛擬化基礎設定 ---
# 關鍵反偵測設計:
#   1. --cpu custom-hiddenvmcpu : 整合 hidden=1 (kvm=off)、-hypervisor、hv-vendor-id=GenuineIntel 與物理位元數
#   2. --balloon 0              : 移除 virtio-balloon-pci (VEN_1AF4)
#   3. --agent 0                : 移除 virtio-serial 與 org.qemu.guest_agent.0 通道
#   4. --sata0 (AHCI)           : 使用原生 Intel ICH9 AHCI 控制器，避免 Red Hat VirtIO SCSI PCI 控制器與驅動
#   5. --net0 e1000e            : 使用原生 Intel 82574L 網卡 + 實體大廠 MAC OUI (避開 Proxmox BC:24:11)
qm create "$VMID" \
    --name "$VMNAME" \
    --memory "$RAM_MB" \
    --balloon 0 \
    --agent 0 \
    --cores "$CPU_CORES" \
    --sockets 1 \
    --cpu custom-hiddenvmcpu \
    --ostype win11 \
    --bios ovmf \
    --machine q35 \
    --numa 0 \
    --efidisk0 "${STORAGE}:0,pre-enrolled-keys=1,efitype=4m,ms-cert=2023k" \
    --tpmstate0 "${STORAGE}:1,version=v2.0" \
    --sata0 "${STORAGE}:${DISK_GB},ssd=1,discard=on,serial=${DISK_SERIAL}" \
    --net0 "e1000e,bridge=vmbr0,firewall=1,macaddr=${RAND_MAC}"

# 移除預設產生的 vmgenid (避免在 Windows ACPI 暴露 QEMUVGID / VEN_QEMU)
qm set "$VMID" --delete vmgenid >/dev/null 2>&1 || true

# 掛載 Windows 安裝 ISO (ide2) 與 Anti-VM 驗證工具 ISO (ide0)
if [[ -f /var/lib/vz/template/iso/antivm-tools.iso ]]; then
    qm set "$VMID" --ide0 "local:iso/antivm-tools.iso,media=cdrom"
fi

if [[ -n "$ISO" ]]; then
    qm set "$VMID" --ide2 "${ISO},media=cdrom"
    qm set "$VMID" --boot order="sata0;ide2"
else
    qm set "$VMID" --boot order="sata0"
    echo "[!] 未提供安裝 ISO，後續可執行：qm set $VMID --ide2 <storage>:iso/<win.iso>,media=cdrom"
fi

# 選用掛載 GPU Passthrough / Intel SR-IOV VF
if [[ -n "$PCI_DEV" ]]; then
    qm set "$VMID" --hostpci0 "${PCI_DEV},pcie=1"
fi

# --- 6. SMBIOS Type 1（系統）：base64 編碼，保留空白與逗號 ---
qm set "$VMID" --smbios1 \
"uuid=${VM_UUID},manufacturer=$(b64 "$mfr"),product=$(b64 "$product"),version=$(b64 "$version"),serial=$(b64 "$SYS_SERIAL"),sku=$(b64 "SKU-${SYS_SERIAL}"),family=$(b64 "$product"),base64=1"

# --- 7. 進階 QEMU Args (ACPI 表頭偽裝 + 磁碟/光碟機型號覆寫 + SMBIOS Type 0/2/3/4/11/17) ---
QEMU_ARGS="-machine 'x-oem-id=${acpi_oem},x-oem-table-id=${acpi_table}'"
QEMU_ARGS="$QEMU_ARGS -global 'ide-hd.model=${disk_model}' -global 'ide-cd.model=${cdrom_model}'"
QEMU_ARGS="$QEMU_ARGS -smbios 'type=0,vendor=$(qesc "$bios_vendor"),version=$(qesc "$bios_ver"),date=$(qesc "$bios_date"),uefi=on'"
QEMU_ARGS="$QEMU_ARGS -smbios 'type=2,manufacturer=$(qesc "$board_mfr"),product=$(qesc "$board_product"),version=$(qesc "$version"),serial=$(qesc "$BOARD_SERIAL"),asset=Default string,location=Default string'"
QEMU_ARGS="$QEMU_ARGS -smbios 'type=3,manufacturer=$(qesc "$mfr"),version=$(qesc "$version"),serial=$(qesc "$CHASSIS_SERIAL"),asset=Default string,sku=Default string'"
QEMU_ARGS="$QEMU_ARGS -smbios 'type=4,sock_pfx=LGA1700,manufacturer=Intel(R) Corporation,version=$(qesc "$HOST_CPU_MODEL"),serial=To Be Filled By O.E.M.,asset=To Be Filled By O.E.M.,part=To Be Filled By O.E.M.,max-speed=5000,current-speed=2600'"
QEMU_ARGS="$QEMU_ARGS -smbios 'type=11,value=Default string'"
QEMU_ARGS="$QEMU_ARGS -smbios 'type=17,loc_pfx=DDR4_A2,bank=BANK 0,manufacturer=$(qesc "$ram_mfr"),serial=$(qesc "$RAM_SERIAL"),asset=9876543210,part=$(qesc "$ram_part"),speed=${ram_speed}'"

if [[ "$STRICT_NO_HV" == "1" ]]; then
    QEMU_ARGS="$QEMU_ARGS -cpu 'host,kvm=off,-hypervisor,phys-bits=host'"
fi

qm set "$VMID" --args "$QEMU_ARGS"

echo "======================================================================"
echo " [OK] VM $VMID ($VMNAME) 建立完成！"
echo "  - 檢視完整設定 : qm config $VMID"
echo "  - 檢視 QEMU 命令: qm showcmd $VMID --pretty"
if [[ -f /var/lib/vz/template/iso/antivm-tools.iso ]]; then
    echo "  - 已自動掛載驗證光碟 (ide0): local:iso/antivm-tools.iso"
    echo "    進入 Windows 後可直接開啟光碟機執行 Run-AntiVM-Check.bat"
fi
echo "======================================================================"
