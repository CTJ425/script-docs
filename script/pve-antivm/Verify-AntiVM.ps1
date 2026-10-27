<#
.SYNOPSIS
    Proxmox VE / QEMU-KVM Windows Anti-VM Sandbox Verification Script (v1.0)
.DESCRIPTION
    Performs 22+ read-only Anti-VM detection checks across CPU/CPUID/RDTSC, SMBIOS/DMI,
    ACPI tables, Storage/Disk/CD-ROM, Network/MAC OUI, GPU/PCI bus, Drivers/Services,
    and Sandbox Heuristics. Outputs a colorized table and exports JSON + TXT reports.
#>

[CmdletBinding()]
param(
    [string]$ReportDir = "$PSScriptRoot\Reports"
)

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Results = [System.Collections.Generic.List[PSObject]]::new()

function Add-CheckResult {
    param(
        [string]$Category,
        [string]$CheckName,
        [ValidateSet("PASS", "WARN", "FAIL")]
        [string]$Status,
        [string]$CurrentValue,
        [string]$Recommendation
    )
    $Results.Add([PSCustomObject]@{
        Category       = $Category
        CheckName      = $CheckName
        Status         = $Status
        CurrentValue   = $CurrentValue
        Recommendation = $Recommendation
    })
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   Proxmox VE Anti-VM / Sandbox Verification Suite (Windows Guest)    " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------------------------
# 1. CPU & Hypervisor Checks (WMI + Registry + Raw CPUID/RDTSC if available)
# ------------------------------------------------------------------------------
$cs = Get-CimInstance -ClassName Win32_ComputerSystem
$proc = Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1

# 1.1 HypervisorPresent (CPUID.1:ECX[31])
if ($cs.HypervisorPresent -eq $false) {
    Add-CheckResult "1. CPU & Hypervisor" "WMI HypervisorPresent (CPUID.1:ECX[31])" "PASS" "False (Hidden)" "OK"
} else {
    Add-CheckResult "1. CPU & Hypervisor" "WMI HypervisorPresent (CPUID.1:ECX[31])" "FAIL" "True (Exposed)" "Add -hypervisor to CPU flags (custom-hiddenvmcpu) and ensure guest VBS/Hyper-V is off"
}

# 1.2 Processor Name & Manufacturer
$cpuName = "$($proc.Name)".Trim()
$cpuMfr  = "$($proc.Manufacturer)".Trim()
if ($cpuName -match "QEMU|KVM|Virtual|Common" -or $cpuMfr -match "QEMU|KVM|Bochs") {
    Add-CheckResult "1. CPU & Hypervisor" "CPU Name & Manufacturer" "FAIL" "$cpuMfr / $cpuName" "Use reported-model=host and -smbios type=4,manufacturer=Intel(R) Corporation"
} else {
    Add-CheckResult "1. CPU & Hypervisor" "CPU Name & Manufacturer" "PASS" "$cpuMfr / $cpuName" "OK"
}

# 1.3 Raw CPUID (0x1, 0x40000000) & RDTSC Timing Check via C# Native Stub (64-bit)
$cpuidCode = @"
using System;
using System.Runtime.InteropServices;

public class CpuProbe {
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr VirtualAlloc(IntPtr lpAddress, UIntPtr dwSize, uint flAllocationType, uint flProtect);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool VirtualFree(IntPtr lpAddress, UIntPtr dwSize, uint dwFreeType);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate void CpuidDelegate(uint leaf, byte[] buffer);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate ulong RdtscDeltaDelegate();

    public static string GetCpuidVendor(uint leaf, out uint maxLeaf, out uint ecxVal) {
        maxLeaf = 0; ecxVal = 0;
        if (IntPtr.Size != 8) return "SKIP_32BIT";
        // x64 stub: rcx = leaf, rdx = buffer (16 bytes: eax, ebx, ecx, edx)
        byte[] asm = new byte[] {
            0x53,                         // push rbx
            0x49, 0x89, 0xD0,             // mov r8, rdx
            0x89, 0xC8,                   // mov eax, ecx
            0x31, 0xC9,                   // xor ecx, ecx
            0x0F, 0xA2,                   // cpuid
            0x41, 0x89, 0x00,             // mov [r8], eax
            0x41, 0x89, 0x58, 0x04,       // mov [r8+4], ebx
            0x41, 0x89, 0x48, 0x08,       // mov [r8+8], ecx
            0x41, 0x89, 0x50, 0x0C,       // mov [r8+12], edx
            0x5B,                         // pop rbx
            0xC3                          // ret
        };
        IntPtr mem = VirtualAlloc(IntPtr.Zero, (UIntPtr)asm.Length, 0x3000, 0x40);
        if (mem == IntPtr.Zero) return "ALLOC_FAIL";
        try {
            Marshal.Copy(asm, 0, mem, asm.Length);
            CpuidDelegate fn = (CpuidDelegate)Marshal.GetDelegateForFunctionPointer(mem, typeof(CpuidDelegate));
            byte[] buf = new byte[16];
            fn(leaf, buf);
            maxLeaf = BitConverter.ToUInt32(buf, 0);
            ecxVal  = BitConverter.ToUInt32(buf, 8);
            byte[] vendorBytes = new byte[12];
            Array.Copy(buf, 4, vendorBytes, 0, 12);
            return System.Text.Encoding.ASCII.GetString(vendorBytes).Trim(0);
        } finally {
            VirtualFree(mem, UIntPtr.Zero, 0x8000);
        }
    }

    public static ulong MeasureRdtscCpuidAvg() {
        if (IntPtr.Size != 8) return 0;
        // x64 stub: rdtsc -> shl rdx,32 -> or rax,rdx -> mov r9,rax -> xor eax,eax -> cpuid -> rdtsc -> shl rdx,32 -> or rax,rdx -> sub rax,r9 -> ret
        byte[] asm = new byte[] {
            0x53,                         // push rbx
            0x0F, 0x31,                   // rdtsc
            0x48, 0xC1, 0xE2, 0x20,       // shl rdx, 32
            0x48, 0x09, 0xD0,             // or rax, rdx
            0x49, 0x89, 0xC1,             // mov r9, rax
            0x31, 0xC0,                   // xor eax, eax
            0x0F, 0xA2,                   // cpuid
            0x0F, 0x31,                   // rdtsc
            0x48, 0xC1, 0xE2, 0x20,       // shl rdx, 32
            0x48, 0x09, 0xD0,             // or rax, rdx
            0x4C, 0x29, 0xC8,             // sub rax, r9
            0x5B,                         // pop rbx
            0xC3                          // ret
        };
        IntPtr mem = VirtualAlloc(IntPtr.Zero, (UIntPtr)asm.Length, 0x3000, 0x40);
        if (mem == IntPtr.Zero) return 0;
        try {
            Marshal.Copy(asm, 0, mem, asm.Length);
            RdtscDeltaDelegate fn = (RdtscDeltaDelegate)Marshal.GetDelegateForFunctionPointer(mem, typeof(RdtscDeltaDelegate));
            ulong total = 0;
            fn(); // warmup
            for (int i = 0; i < 100; i++) {
                total += fn();
            }
            return total / 100;
        } finally {
            VirtualFree(mem, UIntPtr.Zero, 0x8000);
        }
    }
}
"@

try {
    Add-Type -TypeDefinition $cpuidCode -ErrorAction Stop
    $maxLeaf = [uint32]0
    $ecx1    = [uint32]0
    $null    = [CpuProbe]::GetCpuidVendor(1, [ref]$maxLeaf, [ref]$ecx1)
    $hvBit   = ($ecx1 -band 0x80000000) -ne 0

    $hvMax   = [uint32]0
    $hvEcx   = [uint32]0
    $hvSign  = [CpuProbe]::GetCpuidVendor(0x40000000, [ref]$hvMax, [ref]$hvEcx)

    if ($hvSign -match "KVMKVMKVM|proxmox|TCG|VMware|VBoxVBox|XenVMM") {
        Add-CheckResult "1. CPU & Hypervisor" "CPUID 0x40000000 Hypervisor Signature" "FAIL" "Signature= (MaxLeaf=0x$($hvMax.ToString(X)))" "Set hidden=1 and hv-vendor-id=GenuineIntel"
    } elseif ($hvSign -eq "Microsoft Hv") {
        Add-CheckResult "1. CPU & Hypervisor" "CPUID 0x40000000 Hypervisor Signature" "WARN" "Signature=Microsoft Hv (MaxLeaf=0x$($hvMax.ToString(X)))" "Set hv-vendor-id=GenuineIntel or STRICT_NO_HV=1"
    } else {
        Add-CheckResult "1. CPU & Hypervisor" "CPUID 0x40000000 Hypervisor Signature" "PASS" "Signature= (Bit31=$hvBit)" "OK"
    }

    $rdtscAvg = [CpuProbe]::MeasureRdtscCpuidAvg()
    if ($rdtscAvg -lt 1000) {
        Add-CheckResult "1. CPU & Hypervisor" "RDTSC + CPUID Avg Cycles" "PASS" "$rdtscAvg cycles (<1000)" "OK"
    } elseif ($rdtscAvg -lt 2500) {
        Add-CheckResult "1. CPU & Hypervisor" "RDTSC + CPUID Avg Cycles" "WARN" "$rdtscAvg cycles (1000~2500, typical KVM VM-Exit)" "Normal for unpatched KVM; kernel RDTSC scaling needed only for strict timing anti-cheat"
    } else {
        Add-CheckResult "1. CPU & Hypervisor" "RDTSC + CPUID Avg Cycles" "FAIL" "$rdtscAvg cycles (>2500, high VM-Exit overhead)" "Check host CPU frequency governor & pinning"
    }
} catch {
    Add-CheckResult "1. CPU & Hypervisor" "Native CPUID / RDTSC Probe" "WARN" "Skipped ($($_.Exception.Message))" "Run in 64-bit PowerShell without ConstrainedLanguageMode"
}

# ------------------------------------------------------------------------------
# 2. SMBIOS / DMI Checks (Type 0, 1, 2, 3, 17)
# ------------------------------------------------------------------------------
$bios  = Get-CimInstance -ClassName Win32_BIOS
$csp   = Get-CimInstance -ClassName Win32_ComputerSystemProduct
$board = Get-CimInstance -ClassName Win32_BaseBoard
$chass = Get-CimInstance -ClassName Win32_SystemEnclosure
$mems  = @(Get-CimInstance -ClassName Win32_PhysicalMemory)

# 2.1 BIOS (Type 0)
$biosStr = "$($bios.Manufacturer) | $($bios.SMBIOSBIOSVersion) | $($bios.Version)"
if ($biosStr -match "EFI Development Kit|OVMF|QEMU|Bochs|SeaBIOS|Proxmox") {
    Add-CheckResult "2. SMBIOS / DMI" "Type 0 (BIOS Information)" "FAIL" $biosStr "Add -smbios type=0,vendor=...,version=...,date=...,uefi=on in args"
} else {
    Add-CheckResult "2. SMBIOS / DMI" "Type 0 (BIOS Information)" "PASS" $biosStr "OK"
}

# 2.2 System (Type 1)
$sysStr = "$($cs.Manufacturer) | $($cs.Model) | SN:$($bios.SerialNumber)"
if ($sysStr -match "QEMU|Standard PC|Bochs|Proxmox|KVM|Virtual") {
    Add-CheckResult "2. SMBIOS / DMI" "Type 1 (System Information)" "FAIL" $sysStr "Configure --smbios1 with realistic manufacturer/product/serial"
} else {
    Add-CheckResult "2. SMBIOS / DMI" "Type 1 (System Information)" "PASS" $sysStr "OK"
}

# 2.3 BaseBoard (Type 2)
$boardStr = "$($board.Manufacturer) | $($board.Product) | SN:$($board.SerialNumber)"
if ([string]::IsNullOrWhiteSpace($board.Manufacturer) -or $boardStr -match "QEMU|Bochs|Proxmox") {
    Add-CheckResult "2. SMBIOS / DMI" "Type 2 (Baseboard Information)" "FAIL" $boardStr "Add -smbios type=2,manufacturer=...,product=...,serial=... in args"
} else {
    Add-CheckResult "2. SMBIOS / DMI" "Type 2 (Baseboard Information)" "PASS" $boardStr "OK"
}

# 2.4 Chassis (Type 3)
$chassStr = "$($chass.Manufacturer) | Types:$($chass.ChassisTypes -join ,) | SN:$($chass.SerialNumber)"
if ($chassStr -match "QEMU|Bochs|Proxmox" -or ($chass.ChassisTypes -contains 1)) {
    Add-CheckResult "2. SMBIOS / DMI" "Type 3 (Chassis Information)" "FAIL" $chassStr "Add -smbios type=3,manufacturer=...,type=3 in args"
} else {
    Add-CheckResult "2. SMBIOS / DMI" "Type 3 (Chassis Information)" "PASS" $chassStr "OK"
}

# 2.5 Physical Memory (Type 17)
$memStr = ($mems | ForEach-Object { "$($_.Manufacturer) $($_.PartNumber) ($($_.SerialNumber))" }) -join "; "
if ([string]::IsNullOrWhiteSpace($memStr) -or $memStr -match "QEMU|Bochs|00000000") {
    Add-CheckResult "2. SMBIOS / DMI" "Type 17 (Memory Device)" "FAIL" $memStr "Add -smbios type=17,manufacturer=Kingston,part=...,serial=... in args"
} else {
    Add-CheckResult "2. SMBIOS / DMI" "Type 17 (Memory Device)" "PASS" $memStr "OK"
}

# ------------------------------------------------------------------------------
# 3. ACPI Tables & VM Generation ID
# ------------------------------------------------------------------------------
$acpiKeys = Get-ChildItem -Path "HKLM:\HARDWARE\ACPI" -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
$acpiBad  = @($acpiKeys | Where-Object { $_ -match "BOCHS|BXPC|QEMU" })
if ($acpiBad.Count -gt 0) {
    $sample = ($acpiBad | Select-Object -First 3) -join " ; "
    Add-CheckResult "3. ACPI & Firmware" "Registry HKLM:\HARDWARE\ACPI OEM IDs" "FAIL" "Found $($acpiBad.Count) keys ($sample)" "Add -machine x-oem-id=ALASKA,x-oem-table-id=A_M_I___ in args (Note: DSDT inside OVMF still has BXPC unless OVMF is patched)"
} else {
    Add-CheckResult "3. ACPI & Firmware" "Registry HKLM:\HARDWARE\ACPI OEM IDs" "PASS" "Clean (No BOCHS/BXPC/QEMU keys)" "OK"
}

$vmGenIdDev = Get-CimInstance -ClassName Win32_PnPEntity | Where-Object { $_.DeviceID -match "QEMUVGID|VEN_QEMU" -or $_.Name -match "Generation" }
if ($vmGenIdDev) {
    Add-CheckResult "3. ACPI & Firmware" "ACPI VM Generation ID (QEMUVGID)" "FAIL" "$($vmGenIdDev.DeviceID)" "Run: qm set <VMID> --delete vmgenid"
} else {
    Add-CheckResult "3. ACPI & Firmware" "ACPI VM Generation ID (QEMUVGID)" "PASS" "Not Present" "OK"
}

# ------------------------------------------------------------------------------
# 4. Storage Controllers, Disks & CD-ROM
# ------------------------------------------------------------------------------
$disks = @(Get-CimInstance -ClassName Win32_DiskDrive)
$diskStr = ($disks | ForEach-Object { "$($_.Model) [SN:$($_.SerialNumber)]" }) -join "; "
if ($diskStr -match "QEMU|VirtIO|Red Hat|BOCHS") {
    Add-CheckResult "4. Storage" "Disk Drive Model & Serial" "FAIL" $diskStr "Use --sata0 with serial=... and -global ide-hd.model=Samsung SSD 980 PRO 1TB"
} else {
    Add-CheckResult "4. Storage" "Disk Drive Model & Serial" "PASS" $diskStr "OK"
}

$cdroms = @(Get-CimInstance -ClassName Win32_CDROMDrive)
$cdStr  = ($cdroms | ForEach-Object { "$($_.Name) ($($_.DeviceID))" }) -join "; "
if ($cdStr -match "QEMU|VirtIO|BOCHS") {
    Add-CheckResult "4. Storage" "CD-ROM Drive Model" "FAIL" $cdStr "Add -global ide-cd.model=ASUS DRW-24D5MT in args or unmount ISO"
} else {
    Add-CheckResult "4. Storage" "CD-ROM Drive Model" "PASS" "$(if ($cdStr) { $cdStr } else { No CD-ROM mounted })" "OK"
}

# ------------------------------------------------------------------------------
# 5. Network Adapter & MAC OUI
# ------------------------------------------------------------------------------
$nics = @(Get-CimInstance -ClassName Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -eq $true -or $_.MACAddress })
$nicStr = ($nics | ForEach-Object { "$($_.Description) [$($_.MACAddress)]" }) -join "; "
$vmMacPattern = "^(BC:24:11|52:54:00|00:15:5D|00:05:69|00:0C:29|00:50:56|08:00:27)"
$badMac = $nics | Where-Object { $_.MACAddress -match $vmMacPattern }
$badNic = $nics | Where-Object { $_.Description -match "VirtIO|Red Hat|QEMU" }

if ($badMac -or $badNic) {
    Add-CheckResult "5. Network" "NIC Model & MAC OUI" "FAIL" $nicStr "Use e1000e and replace Proxmox BC:24:11 MAC with real vendor OUI"
} else {
    Add-CheckResult "5. Network" "NIC Model & MAC OUI" "PASS" $nicStr "OK"
}

# ------------------------------------------------------------------------------
# 6. GPU & PCI Bus Devices
# ------------------------------------------------------------------------------
$gpus = @(Get-CimInstance -ClassName Win32_VideoController)
$gpuStr = ($gpus | ForEach-Object { "$($_.Name) [$($_.PNPDeviceID)]" }) -join "; "
if ($gpuStr -match "QXL|VirtIO|Red Hat|VEN_1234|VEN_1AF4|VEN_1B36|Microsoft Basic Display") {
    Add-CheckResult "6. GPU & PCI" "Video Controller (GPU)" "WARN" $gpuStr "Attach VFIO GPU or Intel SR-IOV VF (--hostpci0) and set vga: none if full stealth needed"
} else {
    Add-CheckResult "6. GPU & PCI" "Video Controller (GPU)" "PASS" $gpuStr "OK"
}

$pnpAll = @(Get-CimInstance -ClassName Win32_PnPEntity)
$virtioDevs = @($pnpAll | Where-Object { $_.DeviceID -match "VEN_1AF4|VEN_1B36" -or $_.Name -match "VirtIO|QEMU" })
if ($virtioDevs.Count -gt 0) {
    $vList = ($virtioDevs | Select-Object -ExpandProperty Name -Unique) -join ", "
    Add-CheckResult "6. GPU & PCI" "PCI VirtIO / QEMU Primary Devices" "FAIL" "Found $($virtioDevs.Count): $vList" "Set --balloon 0 --agent 0 and avoid virtio-scsi/virtio-net"
} else {
    Add-CheckResult "6. GPU & PCI" "PCI VirtIO / QEMU Primary Devices" "PASS" "0 VirtIO/QEMU primary PCI devices" "OK"
}

$subsysDevs = @($pnpAll | Where-Object { $_.DeviceID -match "SUBSYS_11001AF4" })
if ($subsysDevs.Count -gt 0) {
    Add-CheckResult "6. GPU & PCI" "PCI Subsystem ID (SUBSYS_11001AF4)" "WARN" "Found $($subsysDevs.Count) chipset devices with Red Hat Subsys ID" "QEMU Q35 chipset hardcodes 1af4:1100 in C source; requires patched QEMU binary to remove"
} else {
    Add-CheckResult "6. GPU & PCI" "PCI Subsystem ID (SUBSYS_11001AF4)" "PASS" "Clean" "OK"
}

# ------------------------------------------------------------------------------
# 7. Guest Drivers, Services & Processes
# ------------------------------------------------------------------------------
$vmDrivers = @(Get-CimInstance -ClassName Win32_SystemDriver | Where-Object { $_.Name -match "^(vioscsi|viostor|netkvm|balloon|vioser|vioinput|qxldod|pvpanic|qemu)" })
if ($vmDrivers.Count -gt 0) {
    $dList = ($vmDrivers | Select-Object -ExpandProperty Name) -join ", "
    Add-CheckResult "7. Drivers & Procs" "VirtIO / QEMU Kernel Drivers" "FAIL" "Installed: $dList" "Do not install VirtIO guest tools on stealth sandbox images"
} else {
    Add-CheckResult "7. Drivers & Procs" "VirtIO / QEMU Kernel Drivers" "PASS" "No VirtIO/QEMU drivers present" "OK"
}

$vmProcs = @(Get-Process | Where-Object { $_.Name -match "^(qemu-ga|vdagent|vdservice| spice)" })
if ($vmProcs.Count -gt 0) {
    $pList = ($vmProcs | Select-Object -ExpandProperty Name) -join ", "
    Add-CheckResult "7. Drivers & Procs" "Guest Agent / Spice Processes" "FAIL" "Running: $pList" "Uninstall QEMU Guest Agent / Spice Agent"
} else {
    Add-CheckResult "7. Drivers & Procs" "Guest Agent / Spice Processes" "PASS" "No VM agent processes" "OK"
}

# ------------------------------------------------------------------------------
# 8. Sandbox Hardware Heuristics (Cores, RAM, Disk Size)
# ------------------------------------------------------------------------------
$logicalProcs = $cs.NumberOfLogicalProcessors
$ramGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1)
$sysDiskGB = [math]::Round(($disks | Measure-Object -Property Size -Sum).Sum / 1GB, 1)

if ($logicalProcs -ge 4 -and $ramGB -ge 8 -and $sysDiskGB -ge 60) {
    Add-CheckResult "8. Heuristics" "Hardware Specs (CPU/RAM/Disk)" "PASS" "${logicalProcs} vCPUs | ${ramGB} GB RAM | ${sysDiskGB} GB Disk" "OK"
} else {
    Add-CheckResult "8. Heuristics" "Hardware Specs (CPU/RAM/Disk)" "WARN" "${logicalProcs} vCPUs | ${ramGB} GB RAM | ${sysDiskGB} GB Disk" "Ensure >= 4 Cores, >= 8GB RAM, >= 60GB Disk"
}

# ------------------------------------------------------------------------------
# Output Results & Save Reports
# ------------------------------------------------------------------------------
foreach ($r in $Results) {
    $color = switch ($r.Status) {
        "PASS" { "Green" }
        "WARN" { "Yellow" }
        "FAIL" { "Red" }
    }
    Write-Host ("[{0}] " -f $r.Status) -ForegroundColor $color -NoNewline
    Write-Host ("{0,-20} | {1,-38} -> {2}" -f $r.Category, $r.CheckName, $r.CurrentValue)
    if ($r.Status -ne "PASS") {
        Write-Host ("       └─ Fix: {0}" -f $r.Recommendation) -ForegroundColor DarkGray
    }
}

$passCount = @($Results | Where-Object { $_.Status -eq "PASS" }).Count
$warnCount = @($Results | Where-Object { $_.Status -eq "WARN" }).Count
$failCount = @($Results | Where-Object { $_.Status -eq "FAIL" }).Count
$total     = $Results.Count

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host (" SUMMARY: PASS={0} | WARN={1} | FAIL={2} (Total={3})" -f $passCount, $warnCount, $failCount, $total) -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

try {
    if (-not (Test-Path $ReportDir)) {
        New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
    }
} catch {
    $ReportDir = "$env:TEMP\AntiVM_Reports"
    New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
}

$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$jsonFile = Join-Path $ReportDir "AntiVM_Report_${env:COMPUTERNAME}_${ts}.json"
$txtFile  = Join-Path $ReportDir "AntiVM_Report_${env:COMPUTERNAME}_${ts}.txt"

$Results | ConvertTo-Json -Depth 4 | Set-Content -Path $jsonFile -Encoding UTF8
$Results | Format-Table -AutoSize -Wrap | Out-String -Width 160 | Set-Content -Path $txtFile -Encoding UTF8

Write-Host "Reports saved to:" -ForegroundColor Gray
Write-Host "  - $txtFile" -ForegroundColor Gray
Write-Host "  - $jsonFile" -ForegroundColor Gray
