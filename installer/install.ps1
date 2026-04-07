#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Home Server installer for Windows.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "C:\path\to\installer\install.ps1"
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step { param($msg) Write-Host ("`n==> " + $msg) -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host ('    OK  ' + $msg) -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host ('    --  ' + $msg) -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host ('    ERR ' + $msg) -ForegroundColor Red; exit 1 }

# --- Locate project root ---

$ProjectRoot = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
    Write-Fail 'Cannot find package.json. Run this from inside the home-server project.'
}

Write-Host ''
Write-Host '  Home Server Installer' -ForegroundColor White
Write-Host ('  Project: ' + $ProjectRoot)
Write-Host ''

# --- Check Node.js ---

Write-Step 'Checking Node.js'

try { $nodeVersion = node --version 2>&1 } catch {
    Write-Fail 'Node.js not found. Install from https://nodejs.org and re-run.'
}

$nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
if ($nodeMajor -lt 18) { Write-Fail ('Node.js v18+ required. Found ' + $nodeVersion) }

Write-OK ('Node.js ' + $nodeVersion)

# --- Install dependencies ---

Write-Step 'Installing dependencies'

Push-Location $ProjectRoot
try {
    npm install --prefer-offline 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail 'npm install failed.' }
    Write-OK 'Dependencies installed'
} finally { Pop-Location }

# --- Build TypeScript ---

Write-Step 'Building TypeScript'

Push-Location $ProjectRoot
try {
    npm run build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail 'TypeScript build failed. Run npm run build manually to see errors.' }
    Write-OK 'Build complete'
} finally { Pop-Location }

# --- Storage location ---

Write-Step 'Storage location'

$defaultStorage = 'D:\server-storage'
Write-Host '    Where should your files be stored?' -ForegroundColor Yellow
Write-Host ('    Press Enter to use the default: ' + $defaultStorage)
$storageInput = Read-Host '    Storage path'

$StorageDir = if ($storageInput.Trim() -eq '') { $defaultStorage } else { $storageInput.Trim() }

foreach ($dir in @($StorageDir, ($StorageDir + '\data'), ($StorageDir + '\uploads'))) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

Write-OK ('Storage: ' + $StorageDir)

# --- Write .env ---

Write-Step 'Writing .env'

$envPath    = Join-Path $ProjectRoot '.env'
$envContent = @(
    ('BASE_DIR=' + $StorageDir),
    'JWT_EXPIRATION=7d',
    'ADMIN_DEBUG_LOGS=false'
)
Set-Content -Path $envPath -Encoding UTF8 -Value $envContent
Write-OK '.env written'

# --- Create launcher scripts ---

Write-Step 'Creating launcher scripts'

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

Write-OK 'Launcher scripts created'

# --- Register startup task ---

Write-Step 'Registering startup task'

$taskName = 'HomeServer'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host '    Removed existing task' -ForegroundColor DarkGray
}

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

Write-OK ("Task '" + $taskName + "' registered")

# --- Install dashboard ---

Write-Step 'Installing dashboard GUI'

$DashboardDir  = Join-Path $ProjectRoot 'dashboard'
$DashboardDist = Join-Path $DashboardDir 'dist'
$ReleaseUrl    = 'https://github.com/charySHS/home-server/releases/latest/download/HomeServerDashboard-Setup.exe'
$TempInstaller = Join-Path $env:TEMP 'HomeServerDashboard-Setup.exe'
$DownloadOK    = $false

Write-Host '    Checking for pre-built installer...' -ForegroundColor DarkGray
try {
    Invoke-WebRequest -Uri $ReleaseUrl -OutFile $TempInstaller -TimeoutSec 20 -ErrorAction Stop
    $DownloadOK = $true
    Write-OK 'Downloaded pre-built installer'
} catch {
    Write-Host '    No release available -- building from source' -ForegroundColor DarkGray
}

if ($DownloadOK) {
    $InstallerExe = $TempInstaller
} else {
    if (-not (Test-Path $DashboardDir)) { Write-Fail ('Dashboard source not found at ' + $DashboardDir) }
    Push-Location $DashboardDir
    try {
        npm install 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Fail 'Dashboard npm install failed.' }
        npm run build 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Fail 'Dashboard build failed.' }
    } finally { Pop-Location }
    $SetupExe = Get-ChildItem -Path $DashboardDist -Filter '*Setup*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $SetupExe) { Write-Fail ('Dashboard installer not found in ' + $DashboardDist) }
    $InstallerExe = $SetupExe.FullName
}

Write-Host '    Running dashboard installer...' -ForegroundColor DarkGray
Start-Process -FilePath $InstallerExe -ArgumentList '/S' -Wait
Write-OK 'Dashboard installed'

# --- Start the server ---

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

if (-not $up) { Write-Fail 'Server did not respond on port 3000. Check server.log in the project folder.' }
Write-OK 'Server is up on port 3000'

# --- Create admin account ---

Write-Step 'Creating admin account'

try {
    Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/setup' `
        -Method POST -ContentType 'application/json' `
        -Body '{"username":"__probe__","password":"__probe__"}' `
        -ErrorAction Stop | Out-Null
    $setupStatus = 200
} catch {
    $setupStatus = $_.Exception.Response.StatusCode.value__
}

if ($setupStatus -eq 403) {
    Write-Warn 'Admin account already exists -- skipping.'
} else {
    Write-Host '    Choose a username and password for your admin account.' -ForegroundColor Yellow
    $AdminUser       = Read-Host '    Username'
    $AdminPassSecure = Read-Host '    Password' -AsSecureString
    $AdminPass       = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
                           [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($AdminPassSecure))

    if (-not $AdminUser -or -not $AdminPass) {
        Write-Warn 'No credentials entered. Visit http://localhost:3000/setup to finish.'
    } else {
        $setupBody = [PSCustomObject]@{ username = $AdminUser; password = $AdminPass } | ConvertTo-Json -Compress
        try {
            Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/auth/setup' `
                -Method POST -ContentType 'application/json' `
                -Body $setupBody -ErrorAction Stop | Out-Null
            Write-OK ('Admin account created: ' + $AdminUser)
        } catch {
            Write-Warn 'Could not create admin automatically.'
            Write-Warn 'Visit http://localhost:3000/setup in your browser to finish.'
        }
    }
}

# --- Done ---

Write-Host ''
Write-Host '  Installation complete!' -ForegroundColor Green
Write-Host ''
Write-Host '  Server:    http://localhost:3000/health' -ForegroundColor White
Write-Host '  Setup:     http://localhost:3000/setup' -ForegroundColor White
Write-Host ('  Storage:   ' + $StorageDir) -ForegroundColor White
Write-Host ('  Logs:      ' + $logFile) -ForegroundColor White
Write-Host '  Dashboard: Start Menu, search Home Server Dashboard' -ForegroundColor White
Write-Host ''
Write-Host '  The server starts automatically at next login.' -ForegroundColor DarkGray
Write-Host '  To stop: open Task Scheduler, find HomeServer, click End' -ForegroundColor DarkGray
Write-Host ''
