<#
.SYNOPSIS
  Installs or upgrades Oh My Posh, PowerShell 7, Coreutils and a Nerd Font, then
  wires them into the PowerShell profiles and applies windows-terminal.json
  (default profile, font, colour scheme, key bindings) to Windows Terminal.
  Safe to re-run.
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
Step 'Configuring Windows Terminal (windows-terminal.json)'
# The settings to apply live in windows-terminal.json next to this script, so
# they are written down once. Read it from a clone, else download it.
$RawBase = 'https://raw.githubusercontent.com/CTJ425/script-docs/main/script/setup-windows-terminal'
$wanted = $null
$localWanted = if ($PSScriptRoot) { Join-Path $PSScriptRoot 'windows-terminal.json' }
try {
    if ($localWanted -and (Test-Path $localWanted)) {
        $wanted = [IO.File]::ReadAllText($localWanted) | ConvertFrom-Json
    } else {
        $wanted = Invoke-RestMethod "$RawBase/windows-terminal.json"
    }
} catch {
    Write-Warning "Could not load windows-terminal.json ($($_.Exception.Message)); Windows Terminal skipped."
}
$manualHint = "merge $RawBase/windows-terminal.json into it by hand"

# Store, Store Preview, and the unpackaged (winget / zip) build.
$wtSettingsFiles = @(
    'Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json'
    'Packages\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\LocalState\settings.json'
    'Microsoft\Windows Terminal\settings.json'
) | ForEach-Object { Join-Path $env:LOCALAPPDATA $_ } | Where-Object { Test-Path $_ }

if ($wanted -and -not $wtSettingsFiles) {
    Write-Warning 'Windows Terminal settings.json not found (launch Windows Terminal once first); skipped.'
}

# Windows PowerShell 5.1 serialises some arrays as {"value": [...], "Count": n}
# because of an extra type definition on System.Array; drop it for this run.
if ($PSVersionTable.PSVersion.Major -lt 6) { Remove-TypeData System.Array -ErrorAction SilentlyContinue }

# Assigns in place when the key exists, so the file keeps its key order.
function Set-JsonProperty($Object, $Name, $Value) {
    if ($Object.PSObject.Properties[$Name]) { $Object.$Name = $Value }
    else { $Object | Add-Member $Name $Value }
}

# Copies every key of $From onto $To, descending into nested objects so that
# keys $From does not mention (a font size, say) are kept.
function Merge-JsonObject($To, $From) {
    foreach ($p in $From.PSObject.Properties) {
        $here = $To.PSObject.Properties[$p.Name]
        if ($here -and $here.Value -is [pscustomobject] -and $p.Value -is [pscustomobject]) {
            Merge-JsonObject $here.Value $p.Value
        } else {
            Set-JsonProperty $To $p.Name $p.Value
        }
    }
}

# Merges two lists of objects matched by $KeyOf: an existing item whose key one
# of $Wanted's has is replaced in place (later duplicates are dropped), the
# rest of $Existing is kept in order, and wanted items not yet placed go last.
# Replacing in place keeps a second run from reordering an unchanged file.
function Merge-JsonList($Existing, $Wanted, $KeyOf) {
    $byKey = @{}
    foreach ($w in @($Wanted)) { $byKey[(& $KeyOf $w)] = $w }
    $placed = @{}
    $out = foreach ($item in @($Existing)) {
        if ($null -eq $item) { continue }
        $k = & $KeyOf $item
        if ($null -ne $k -and $byKey.ContainsKey($k)) {
            if (-not $placed[$k]) { $placed[$k] = $true; $byKey[$k] }
        } else { $item }
    }
    $rest = foreach ($w in @($Wanted)) { if (-not $placed[(& $KeyOf $w)]) { $w } }
    @($out) + @($rest)
}

$keyOf = { param($a) if ($a.keys) { ([string]$a.keys).ToLowerInvariant() -replace '\s', '' } }

foreach ($wtSettings in $(if ($wanted) { $wtSettingsFiles })) {
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
    $before = $json | ConvertTo-Json -Depth 32 -Compress

    # Top-level settings, and profiles.defaults key by key. The profile list
    # is generated per machine, so it is never touched.
    foreach ($p in $wanted.PSObject.Properties) {
        if ($p.Name -in '$schema', 'profiles', 'schemes', 'actions') { continue }
        Set-JsonProperty $json $p.Name $p.Value
    }
    if (-not $json.profiles.defaults) { Set-JsonProperty $json.profiles defaults ([pscustomobject]@{}) }
    Merge-JsonObject $json.profiles.defaults $wanted.profiles.defaults

    # Colour schemes: replace one with the same name where it stands, else add it.
    Set-JsonProperty $json schemes @(Merge-JsonList $json.schemes $wanted.schemes { param($x) $x.name })

    # Key bindings: whatever is bound to the same keys gives way to ours, in the
    # legacy "actions" form and in the newer "keybindings" list.
    Set-JsonProperty $json actions @(Merge-JsonList $json.actions $wanted.actions $keyOf)
    if ($json.PSObject.Properties['keybindings']) {
        $ourKeys = @($wanted.actions | ForEach-Object { & $keyOf $_ })
        $json.keybindings = @($json.keybindings | Where-Object { $_ -and (& $keyOf $_) -notin $ourKeys })
    }

    $after = $json | ConvertTo-Json -Depth 32 -Compress
    if ($after -eq $before) {
        Write-Host '    already configured'
        continue
    }

    # Keep the first backup: a later run must not overwrite the original.
    if (-not (Test-Path "$wtSettings.bak")) { Copy-Item $wtSettings "$wtSettings.bak" }
    # UTF-8 without BOM, same as Windows Terminal writes it.
    [IO.File]::WriteAllText($wtSettings, ($json | ConvertTo-Json -Depth 32), [Text.UTF8Encoding]::new($false))
}

Step 'Done. Close all terminal windows and reopen Windows Terminal.'
