<#
.SYNOPSIS
    Downloads and executes external open-source Anti-VM detection suites (Pafish & VMAware)
    for cross-validating the Windows sandbox environment.
#>
[CmdletBinding()]
param(
    [string]$WorkDir = "C:\AntiVM_Test"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not (Test-Path $WorkDir)) {
    New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
}
Set-Location $WorkDir

Write-Host "[*] Preparing external Anti-VM tools in $WorkDir ..." -ForegroundColor Cyan

# 1. Download Pafish (pafish64.exe)
$pafishUrl = "https://github.com/a0rtega/pafish/releases/download/v0.6/pafish64.exe"
$pafishExe = Join-Path $WorkDir "pafish64.exe"
if (-not (Test-Path $pafishExe)) {
    try {
        Write-Host "[+] Downloading Pafish v0.6 (pafish64.exe)..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri $pafishUrl -OutFile $pafishExe -UseBasicParsing
    } catch {
        Write-Host "[!] Could not download Pafish: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 2. Download VMAware CLI (latest release)
$vmawareExe = Join-Path $WorkDir "vmaware.exe"
if (-not (Test-Path $vmawareExe)) {
    try {
        Write-Host "[+] Querying latest VMAware release from GitHub..." -ForegroundColor Yellow
        $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/kernelwernel/VMAware/releases/latest" -UseBasicParsing
        $asset = $rel.assets | Where-Object { $_.name -match "vmaware.*\.exe$" } | Select-Object -First 1
        if ($asset) {
            Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $vmawareExe -UseBasicParsing
        }
    } catch {
        Write-Host "[!] Could not download VMAware: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
if (Test-Path $vmawareExe) {
    Write-Host "=== Running VMAware CLI ===" -ForegroundColor Green
    & $vmawareExe | Tee-Object -FilePath (Join-Path $WorkDir "vmaware_result.txt")
}

Write-Host ""
if (Test-Path $pafishExe) {
    Write-Host "=== Launching Pafish64 (Check pafish.log in $WorkDir) ===" -ForegroundColor Green
    & $pafishExe
}
