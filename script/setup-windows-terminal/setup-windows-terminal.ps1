<#
.SYNOPSIS
  Installs or upgrades Oh My Posh, PowerShell 7, Coreutils and a Nerd Font, then
  wires them into the PowerShell profiles and Windows Terminal. Safe to re-run.
.NOTES
  Run from Windows PowerShell (not pwsh, so PowerShell 7 can be upgraded in place):
    powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-windows-terminal.ps1
  Installing or upgrading PowerShell 7 and Coreutils shows a UAC prompt.
#>
$ErrorActionPreference = 'Stop'

function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }

function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
}

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'winget not found. Install "App Installer" from the Microsoft Store, then re-run.'
}

# winget's "no applicable upgrade" result, 0x8A15002B.
$UPDATE_NOT_APPLICABLE = -1978335189

# Installs the package, or upgrades it when it is already there. stdout only:
# under Windows PowerShell 5.1, '2>&1' plus 'Stop' turns any stderr line into a
# terminating error.
function Install-WingetPackage($Id) {
    $common = @('--id', $Id, '--exact', '--source', 'winget', '--accept-source-agreements')
    winget list @common | Out-Null
    if ($LASTEXITCODE -ne 0) {
        winget install @common --accept-package-agreements
        if ($LASTEXITCODE -ne 0) { throw "winget failed to install $Id (exit code $LASTEXITCODE)" }
        return
    }
    winget upgrade @common --accept-package-agreements
    if ($LASTEXITCODE -eq 0) { return }
    if ($LASTEXITCODE -eq $UPDATE_NOT_APPLICABLE) { Write-Host "    $Id is up to date"; return }
    # Installed by something winget cannot upgrade (e.g. the Store build); keep going.
    Write-Warning "winget could not upgrade $Id (exit code $LASTEXITCODE); left as is."
}

# --- 1. Packages -----------------------------------------------------------
Step 'Installing or upgrading packages'
Install-WingetPackage 'JanDeDobbeleer.OhMyPosh'
Install-WingetPackage 'Microsoft.PowerShell'
Install-WingetPackage 'Microsoft.Coreutils'
Refresh-Path
if (-not (Get-Command oh-my-posh -ErrorAction SilentlyContinue)) {
    throw 'oh-my-posh is not on PATH after installing it. Open a new terminal and re-run.'
}

# --- 2. Nerd Font ----------------------------------------------------------
Step 'Installing MesloLGS Nerd Font'
oh-my-posh font install meslo
if ($LASTEXITCODE -ne 0) {
    Write-Warning "oh-my-posh font install failed (exit code $LASTEXITCODE); prompt icons may not render."
}

# --- 3. PowerShell profiles ------------------------------------------------
# Same init block as microsoft/WindowsDeveloperConfig (only in Windows Terminal
# or non-elevated sessions). The pipe is on one line so Windows PowerShell 5.1
# can parse it too.
$begin = '# >>> oh-my-posh (managed) >>>'
$end   = '# <<< oh-my-posh (managed) <<<'
$ohMyPoshBlock = @"
$begin
`$usePosh = [bool]`$env:WT_SESSION
if (-not `$usePosh) {
    `$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    try {
        `$principal = [Security.Principal.WindowsPrincipal]::new(`$identity)
        `$usePosh = -not `$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } finally {
        `$identity.Dispose()
    }
}
if (`$usePosh) {
    `$(if (Get-Command 'oh-my-posh' -ErrorAction SilentlyContinue) {
        oh-my-posh init pwsh
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        [Console]::InputEncoding = [System.Text.Encoding]::UTF8
    }) | Invoke-Expression
}
$end
"@

# PowerShell 7 only: let `ls` resolve to Coreutils' ls.exe instead of Get-ChildItem.
$lsBegin = '# >>> coreutils ls (managed) >>>'
$lsEnd   = '# <<< coreutils ls (managed) <<<'
$lsBlock = @"
$lsBegin
Remove-Alias -Name ls -Force -ErrorAction SilentlyContinue
$lsEnd
"@

function Set-ManagedBlock($Path, $Begin, $End, $Block) {
    New-Item -ItemType Directory -Force (Split-Path $Path) | Out-Null
    # [string] because an empty file reads back as $null.
    $content = if (Test-Path $Path) { [string](Get-Content $Path -Raw) } else { '' }
    $pattern = '(?s)' + [regex]::Escape($Begin) + '.*?' + [regex]::Escape($End) + '\r?\n?'
    $content = [regex]::Replace($content, $pattern, '').TrimEnd()
    $new = if ($content) { "$content`r`n`r`n$Block`r`n" } else { "$Block`r`n" }
    Set-Content -Path $Path -Value $new -Encoding utf8
}

Step 'Configuring PowerShell profiles'
$docs = [Environment]::GetFolderPath('MyDocuments')
$ps5Profile = Join-Path $docs 'WindowsPowerShell\Microsoft.PowerShell_profile.ps1'
$ps7Profile = Join-Path $docs 'PowerShell\Microsoft.PowerShell_profile.ps1'
Set-ManagedBlock $ps5Profile $begin $end $ohMyPoshBlock
Set-ManagedBlock $ps7Profile $begin $end $ohMyPoshBlock
Set-ManagedBlock $ps7Profile $lsBegin $lsEnd $lsBlock

# --- 4. Execution policy ---------------------------------------------------
Step 'Setting CurrentUser execution policy to RemoteSigned'
try { Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force } catch { Write-Warning $_.Exception.Message }

# --- 5. Windows Terminal ---------------------------------------------------
Step 'Configuring Windows Terminal (default profile + font)'
$pwshProfileGuid = '{574e775e-4f2a-5b96-ac1e-a2962a402336}'   # PowerShell 7
$fontFace = 'MesloLGS Nerd Font'
$manualHint = "set `"defaultProfile`": `"$pwshProfileGuid`" and `"profiles.defaults.font.face`": `"$fontFace`" by hand"

# Store, Store Preview, and the unpackaged (winget / zip) build.
$wtSettingsFiles = @(
    'Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json'
    'Packages\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\LocalState\settings.json'
    'Microsoft\Windows Terminal\settings.json'
) | ForEach-Object { Join-Path $env:LOCALAPPDATA $_ } | Where-Object { Test-Path $_ }

if (-not $wtSettingsFiles) {
    Write-Warning 'Windows Terminal settings.json not found (launch Windows Terminal once first); skipped.'
}

# Assigns in place when the key exists, so the file keeps its key order.
function Set-JsonProperty($Object, $Name, $Value) {
    if ($Object.PSObject.Properties[$Name]) { $Object.$Name = $Value }
    else { $Object | Add-Member $Name $Value }
}

foreach ($wtSettings in $wtSettingsFiles) {
    Write-Host "    $wtSettings"
    $raw = [IO.File]::ReadAllText($wtSettings)

    # Rewriting the file would drop comments (and Windows PowerShell cannot parse
    # them at all), so a commented file is left for the user to edit.
    $withoutStrings = [regex]::Replace($raw, '"(?:\\.|[^"\\])*"', '""')
    if ($withoutStrings -match '//|/\*') {
        Write-Warning "settings.json has comments; left untouched. Please $manualHint."
        continue
    }
    try { $json = $raw | ConvertFrom-Json } catch {
        Write-Warning "settings.json could not be parsed ($($_.Exception.Message)); left untouched."
        continue
    }
    if (-not $json.profiles -or $json.profiles -is [array]) {
        Write-Warning "settings.json uses the legacy profiles list; left untouched. Please $manualHint."
        continue
    }

    if (-not $json.profiles.defaults) { Set-JsonProperty $json.profiles defaults ([pscustomobject]@{}) }
    $defaults = $json.profiles.defaults
    if ($json.defaultProfile -eq $pwshProfileGuid -and $defaults.font.face -eq $fontFace) {
        Write-Host '    already configured'
        continue
    }

    # Keep the first backup: a later run must not overwrite the original.
    if (-not (Test-Path "$wtSettings.bak")) { Copy-Item $wtSettings "$wtSettings.bak" }

    Set-JsonProperty $json defaultProfile $pwshProfileGuid
    if ($defaults.font) { Set-JsonProperty $defaults.font face $fontFace }
    else { Set-JsonProperty $defaults font ([pscustomobject]@{ face = $fontFace }) }
    # UTF-8 without BOM, same as Windows Terminal writes it.
    [IO.File]::WriteAllText($wtSettings, ($json | ConvertTo-Json -Depth 32), [Text.UTF8Encoding]::new($false))
}

Step 'Done. Close all terminal windows and reopen Windows Terminal.'
