<#
.SYNOPSIS
    Prepare and launch a safe local Health-ERP trial on Windows.

.DESCRIPTION
    This is the recommended Windows entrypoint for trying the application locally.
    It uses Docker Desktop for PostgreSQL, Redis, MinIO, the backend, and the
    frontend. It never connects to a production database. By default it keeps
    the app local to this PC and does not seed demo data unless -Seed is passed.

.PARAMETER RepoUrl
    Git URL used when the script is run outside an existing repository.

.PARAMETER TargetDir
    Directory used when cloning the repository.

.PARAMETER InstallPrerequisites
    Install missing Git, Node.js LTS, and Docker Desktop using winget. Docker
    Desktop may require a restart and must be started before continuing.

.PARAMETER Seed
    Run the demo seed after the stack is healthy. This replaces the local demo
    database contents; it never touches a production database.

.PARAMETER ResetDb
    Delete the local Docker data volumes before starting. Use only when a fresh
    local database is required.

.PARAMETER LanAccess
    Make the frontend reachable from a phone on the same Wi-Fi network and add
    a Windows Firewall rule when permissions allow.

.PARAMETER LanIp
    Force the LAN IPv4 address used for phone access. This implies -LanAccess.

.PARAMETER OpenBrowser
    Open the local frontend automatically after it becomes healthy.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\try-windows.ps1 -Seed -OpenBrowser

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\try-windows.ps1 -InstallPrerequisites -Seed -OpenBrowser

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\try-windows.ps1 -LanAccess -Seed -OpenBrowser
#>
[CmdletBinding()]
param(
    [string]$RepoUrl = 'https://github.com/elnewahy2025/Health-ERP.git',
    [string]$TargetDir = 'C:\Health-ERP',
    [switch]$InstallPrerequisites,
    [switch]$Seed,
    [switch]$ResetDb,
    [switch]$LanAccess,
    [string]$LanIp = '',
    [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "  OK: $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "  WARN: $Message" -ForegroundColor Yellow }
function Test-Command([string]$Name) { return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
}

function Install-WingetPackage([string]$Command, [string]$Id, [string]$DisplayName) {
    if (Test-Command $Command) { return }
    if (-not (Test-Command 'winget')) {
        throw "$DisplayName is missing and winget is unavailable. Install it manually, then re-run this script."
    }
    Write-Step "Installing $DisplayName with winget"
    & winget install --id $Id --exact --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "Could not install $DisplayName with winget." }
    Refresh-Path
}

Write-Step 'Checking or installing Windows prerequisites'
if ($InstallPrerequisites) {
    Install-WingetPackage 'git' 'Git.Git' 'Git'
    Install-WingetPackage 'node' 'OpenJS.NodeJS.LTS' 'Node.js LTS'
    Install-WingetPackage 'docker' 'Docker.DockerDesktop' 'Docker Desktop'
} else {
    if (-not (Test-Command 'git')) { throw "Git is missing. Re-run with -InstallPrerequisites or install Git from https://git-scm.com." }
    if (-not (Test-Command 'node')) { throw "Node.js is missing. Re-run with -InstallPrerequisites or install Node.js LTS from https://nodejs.org." }
    if (-not (Test-Command 'docker')) { throw "Docker Desktop is missing. Re-run with -InstallPrerequisites or install Docker Desktop." }
}

$nodeMajor = [int]((& node --version).Trim().TrimStart('v') -split '\.')[0]
if ($nodeMajor -lt 20) { throw "Node.js 20 or newer is required. Found $(& node --version)." }
Write-Ok "Node.js $(& node --version) and Git are available"

if (-not (Test-Command 'docker')) { throw 'Docker is still unavailable after installation. Close and reopen PowerShell, then re-run.' }
Write-Step 'Checking Docker Desktop'
$dockerReady = $true
try { docker info *> $null } catch { $dockerReady = $false }
if ($LASTEXITCODE -ne 0) { $dockerReady = $false }
if (-not $dockerReady) {
    $dockerDesktop = Join-Path ${env:ProgramFiles} 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path $dockerDesktop) {
        Write-Host '  Docker Desktop is installed but not running; starting it...'
        Start-Process $dockerDesktop
    }
    Write-Host '  Waiting for Docker Desktop to become ready (up to 3 minutes)...'
    for ($i = 0; $i -lt 36; $i++) {
        Start-Sleep -Seconds 5
        docker info *> $null
        if ($LASTEXITCODE -eq 0) { $dockerReady = $true; break }
    }
}
if (-not $dockerReady) {
    throw 'Docker Desktop is not ready. Start Docker Desktop manually, wait for the whale icon to stabilize, and re-run.'
}
Write-Ok 'Docker Desktop is ready'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
if (-not (Test-Path (Join-Path $repoRoot 'package.json'))) {
    Write-Step "Cloning Health-ERP into $TargetDir"
    if (Test-Path (Join-Path $TargetDir 'package.json')) {
        $repoRoot = $TargetDir
        Write-Ok "Using existing repository at $repoRoot"
    } else {
        if (Test-Path $TargetDir) {
            $children = Get-ChildItem -Force $TargetDir
            if ($children.Count -gt 0) { throw "$TargetDir exists and is not an empty Health-ERP repository directory." }
        } else {
            New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
        }
        & git clone $RepoUrl $TargetDir
        if ($LASTEXITCODE -ne 0) { throw 'Git clone failed.' }
        $repoRoot = $TargetDir
    }
}

$localSetup = Join-Path $repoRoot 'scripts\setup-docker-local.ps1'
if (-not (Test-Path $localSetup)) { throw "Local setup script not found: $localSetup" }
Set-Location $repoRoot
Write-Ok "Repository ready at $repoRoot"

$childArgs = @()
if ($Seed) { $childArgs += '-Seed' }
if ($ResetDb) { $childArgs += '-ResetDb' }
if ($LanAccess) { $childArgs += '-LanAccess' }
if ($LanIp) { $childArgs += @('-LanIp', $LanIp) }
if ($OpenBrowser) { $childArgs += '-OpenBrowser' }

Write-Step 'Launching the local Health-ERP stack'
& powershell -NoProfile -ExecutionPolicy Bypass -File $localSetup @childArgs
if ($LASTEXITCODE -ne 0) { throw 'The local Docker setup did not complete successfully.' }
