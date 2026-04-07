#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Home Server uninstaller for Windows.
    Stops the server, removes the startup task, and cleans up launcher scripts.

.PARAMETER Silent
    Skip interactive prompts (used when called from the GUI installer).
    Files and .env are preserved in silent mode.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "C:\path\to\installer\uninstall.ps1"
    powershell -ExecutionPolicy Bypass -File "...\uninstall.ps1" -Silent
#>
param([switch]$Silent)

Set-StrictMode -Version Latest
$ErrorActionPreference = "SilentlyContinue"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    --  $msg" -ForegroundColor Yellow }

$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "  Home Server Uninstaller" -ForegroundColor White
Write-Host "  Project: $ProjectRoot"
Write-Host ""

# --- Stop the running server -------------------------------------------------

Write-Step "Stopping server"

$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $pid_ = $conn.OwningProcess
    $proc = Get-Process -Id $pid_ -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
        Write-OK "Stopped process $($proc.Name) (PID $pid_)"
    }
} else {
    Write-Warn "No process found on port 3000 (server may already be stopped)"
}

Get-Process wscript -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*start-server.vbs*" } |
    ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }

# --- Remove Task Scheduler task ----------------------------------------------

Write-Step "Removing startup task"

$taskName = "HomeServer"
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-OK "Task '$taskName' removed"
} else {
    Write-Warn "Task '$taskName' not found (already removed?)"
}

# --- Remove launcher scripts -------------------------------------------------

Write-Step "Removing launcher scripts"

foreach ($file in @("start-server.bat", "start-server.vbs")) {
    $filePath = Join-Path $ProjectRoot $file
    if (Test-Path $filePath) {
        Remove-Item $filePath -Force
        Write-OK "Removed $file"
    }
}

# --- Read storage path before potentially removing .env ----------------------

$envPath = Join-Path $ProjectRoot ".env"
$storageDir = "D:\server-storage"   # fallback default

if (Test-Path $envPath) {
    foreach ($line in (Get-Content $envPath -ErrorAction SilentlyContinue)) {
        if ($line -match "^BASE_DIR=(.+)$") { $storageDir = $Matches[1].Trim(); break }
    }
}

# --- Optional: remove .env ---------------------------------------------------

Write-Step "Configuration"

if ((Test-Path $envPath) -and -not $Silent) {
    $removeEnv = Read-Host "    Remove .env (server configuration)? [y/N]"
    if ($removeEnv.Trim().ToLower() -eq "y") {
        Remove-Item $envPath -Force
        Write-OK ".env removed"
    } else {
        Write-Warn ".env kept"
    }
} elseif ($Silent) {
    Write-Warn ".env kept (silent mode - remove manually if needed)"
}

# --- Optional: remove storage data -------------------------------------------

Write-Step "Storage"

if ((Test-Path $storageDir) -and -not $Silent) {
    Write-Host "    Storage: $storageDir" -ForegroundColor Yellow
    Write-Host "    WARNING: This contains all uploaded files." -ForegroundColor Yellow
    $removeStorage = Read-Host "    Delete storage and all files? [y/N]"
    if ($removeStorage.Trim().ToLower() -eq "y") {
        Remove-Item $storageDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-OK "Storage deleted"
    } else {
        Write-Warn "Storage kept at $storageDir"
    }
} elseif ($Silent) {
    Write-Warn "Storage kept at $storageDir (silent mode - remove manually if needed)"
} else {
    Write-Warn "Storage directory not found at $storageDir"
}

# --- Done --------------------------------------------------------------------

Write-Host ""
Write-Host "  Uninstall complete." -ForegroundColor Green
Write-Host ""
Write-Host "  To uninstall the dashboard: Settings > Apps > Home Server Dashboard" -ForegroundColor White
Write-Host ""
