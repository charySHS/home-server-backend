#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Home Server updater - reinstalls dependencies, rebuilds TypeScript,
    updates the startup task, and restarts the server.
    Configuration (.env) and stored files are untouched.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "C:\path\to\installer\update.ps1"
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step { param($msg) Write-Host ("`n==> " + $msg) -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host ('    OK  ' + $msg) -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host ('    --  ' + $msg) -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host ('    ERR ' + $msg) -ForegroundColor Red; exit 1 }

$ProjectRoot = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
    Write-Fail 'Cannot find package.json. Run this from inside the home-server project.'
}

Write-Host ''
Write-Host '  Home Server Updater' -ForegroundColor White
Write-Host ('  Project: ' + $ProjectRoot)
Write-Host ''

# ── Stop the running server ───────────────────────────────────────────────────

Write-Step 'Stopping server'

$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $pid_ = $conn.OwningProcess
    Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
    Write-OK "Stopped process on port 3000 (PID $pid_)"
} else {
    Write-Warn 'No process found on port 3000 - server may already be stopped.'
}

# Kill any lingering wscript launcher
Get-Process wscript -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*start-server.vbs*' } |
    ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }

# ── Install dependencies ──────────────────────────────────────────────────────

Write-Step 'Installing dependencies'

Push-Location $ProjectRoot
try {
    npm install --prefer-offline 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail 'npm install failed.' }
    Write-OK 'Dependencies updated'
} finally { Pop-Location }

# ── Build TypeScript ──────────────────────────────────────────────────────────

Write-Step 'Building TypeScript'

Push-Location $ProjectRoot
try {
    npm run build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail 'TypeScript build failed. Run npm run build manually to see errors.' }
    Write-OK 'Build complete'
} finally { Pop-Location }

# ── Rebuild launcher scripts ──────────────────────────────────────────────────

Write-Step 'Refreshing launcher scripts'

# Read storage path from existing .env
$envPath = Join-Path $ProjectRoot '.env'
$StorageDir = 'D:\server-storage'   # fallback default

if (Test-Path $envPath) {
    foreach ($line in (Get-Content $envPath -ErrorAction SilentlyContinue)) {
        if ($line -match '^BASE_DIR=(.+)$') { $StorageDir = $Matches[1].Trim(); break }
    }
}

$entryPoint    = Join-Path $ProjectRoot 'dist\index.js'
$logFile       = Join-Path $ProjectRoot 'server.log'
$batScriptPath = Join-Path $ProjectRoot 'start-server.bat'
$vbsScriptPath = Join-Path $ProjectRoot 'start-server.vbs'

$batContent = @(
    '@echo off',
    ('cd /d "' + $ProjectRoot + '"'),
    ('set BASE_DIR=' + $StorageDir),
    'set JWT_EXPIRATION=7d',
    'set ADMIN_DEBUG_LOGS=false',
    ('node "' + $entryPoint + '" >> "' + $logFile + '" 2>&1')
)
Set-Content -Path $batScriptPath -Encoding ASCII -Value $batContent

$vbsContent = @(
    'Dim sh',
    'Set sh = WScript.CreateObject("WScript.Shell")',
    ('sh.Run "cmd.exe /c """ & "' + $batScriptPath + '" & """", 0, False'),
    'Set sh = Nothing'
)
Set-Content -Path $vbsScriptPath -Encoding ASCII -Value $vbsContent

Write-OK 'Launcher scripts refreshed'

# ── Update scheduled task ─────────────────────────────────────────────────────

Write-Step 'Updating startup task'

$taskName = 'HomeServer'

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action    = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + $vbsScriptPath + '"') -WorkingDirectory $ProjectRoot
$trigger   = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT10S'
$principal = New-ScheduledTaskPrincipal `
    -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable -Hidden

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description 'Home Server backend - starts at login, runs hidden' | Out-Null

Write-OK "Task '$taskName' updated"

# ── Start the server ──────────────────────────────────────────────────────────

Write-Step 'Starting server'

Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + $vbsScriptPath + '"') -WorkingDirectory $ProjectRoot

$attempts = 0
$up = $false
while (-not $up -and $attempts -lt 12) {
    Start-Sleep -Seconds 2
    try {
        Invoke-RestMethod -Uri 'http://localhost:3000/health' -TimeoutSec 5 -ErrorAction Stop | Out-Null
        $up = $true
    } catch { $attempts++ }
}

if (-not $up) { Write-Fail 'Server did not respond on port 3000 after update. Check server.log for details.' }

Write-OK 'Server is up on port 3000'

# ── Done ──────────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '  Update complete!' -ForegroundColor Green
Write-Host ''
Write-Host '  Server:  http://localhost:3000/health' -ForegroundColor White
Write-Host ('  Logs:    ' + $logFile) -ForegroundColor White
Write-Host ''
