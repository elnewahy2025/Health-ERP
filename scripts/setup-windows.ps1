<#
.SYNOPSIS
    One-shot setup for running the Healthcare ERP backend on a Windows PC
    against the production Neon database (frontend stays on Vercel).

.DESCRIPTION
    Checks prerequisites, prepares the .env file, installs dependencies,
    builds shared+backend, runs migrations (and optionally seeds), then
    starts the backend. Optionally opens a public tunnel and updates the
    Vercel rewrites to point at it.

.PARAMETER RepoUrl
    Git URL to clone when this script is run outside the repository.
    Default: https://github.com/elnewahy2025/vision-healthcare-erp.git

.PARAMETER TargetDir
    Directory to clone into when RepoUrl is used. Default: C:\vision-healthcare-erp

.PARAMETER Seed
    Run the demo seed after migrations (destroys existing demo tables).

.PARAMETER SkipInstall
    Skip npm install (for repeat runs).

.PARAMETER SkipMigrate
    Skip database migrations (for repeat runs).

.PARAMETER NoStart
    Prepare everything but do not start the backend.

.PARAMETER StartTunnel
    Launch a public tunnel after starting (requires Tailscale or cloudflared).

.PARAMETER TunnelUrl
    e.g. https://xxxx.trycloudflare.com - when provided together with
    UpdateVercel, the Vercel rewrites are pointed at this backend URL.

.PARAMETER UpdateVercel
    Rewrite vercel.json rewrites to TunnelUrl, commit and push.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1 -Seed -StartTunnel
#>
[CmdletBinding()]
param(
    [string]$RepoUrl = "https://github.com/elnewahy2025/vision-healthcare-erp.git",
    [string]$TargetDir = "C:\vision-healthcare-erp",
    [switch]$Seed,
    [switch]$SkipInstall,
    [switch]$SkipMigrate,
    [switch]$NoStart,
    [switch]$StartTunnel,
    [string]$TunnelUrl = "",
    [switch]$UpdateVercel
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-NodeMajor([string]$VersionText) {
    $v = $VersionText.TrimStart("v")
    return [int]($v -split "\.")[0]
}

# ---------------------------------------------------------------------------
# 1. Prerequisites
# ---------------------------------------------------------------------------
Write-Step "Checking prerequisites"

if (-not (Test-Command node)) { throw "Node.js is not installed or not on PATH. Install Node 20.19+ from https://nodejs.org and re-run." }
if (-not (Test-Command npm)) { throw "npm is not available. Install Node.js 20.19+ (npm is bundled)." }

$nodeVersion = (& node --version).Trim()
$npmVersion = (& npm --version).Trim()
$nodeMajor = Get-NodeMajor $nodeVersion

Write-Host "  Node: $nodeVersion  |  npm: $npmVersion"
if ($nodeMajor -lt 20) { throw "Node.js >= 20.19.0 is required (found $nodeVersion)." }

if (-not (Test-Command git)) { throw "Git is not installed or not on PATH. Install from https://git-scm.com and re-run." }

# ---------------------------------------------------------------------------
# 2. Locate / clone the repository
# ---------------------------------------------------------------------------
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

if (-not (Test-Path (Join-Path $repoRoot "package.json"))) {
    Write-Step "Repository not found at $repoRoot - cloning into $TargetDir"
    if (-not (Test-Path $TargetDir)) { New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null }
    & git clone $RepoUrl $TargetDir
    if ($LASTEXITCODE -ne 0) { throw "git clone failed." }
    $repoRoot = $TargetDir
}

Set-Location $repoRoot
Write-Host "  Repository root: $repoRoot"

# ---------------------------------------------------------------------------
# 3. Environment file
# ---------------------------------------------------------------------------
Write-Step "Preparing .env from .env.production"

$envProd = Join-Path $repoRoot ".env.production"
$envFile = Join-Path $repoRoot ".env"
if (-not (Test-Path $envProd)) { throw ".env.production not found. Put the production environment file in the repo root first." }

if (Test-Path $envFile) {
    Copy-Item $envFile "$envFile.bak" -Force
    Write-Host "  Existing .env backed up to .env.bak"
}
Copy-Item $envProd $envFile -Force

# Make sure production mode is active for the backend process.
$content = Get-Content $envFile
if ($content -match "^NODE_ENV=") {
    $envText = (Get-Content $envFile -Raw) -replace "(?m)^NODE_ENV=.*", "NODE_ENV=production"
    [System.IO.File]::WriteAllText($envFile, $envText, (New-Object System.Text.UTF8Encoding($false)))
} else {
    [System.IO.File]::AppendAllText($envFile, "`nNODE_ENV=production`n", (New-Object System.Text.UTF8Encoding($false)))
}
Write-Host "  .env ready (NODE_ENV=production)"

# ---------------------------------------------------------------------------
# 4. Install dependencies
# ---------------------------------------------------------------------------
if (-not $SkipInstall) {
    Write-Step "Installing dependencies (npm install)"
    & npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
} else {
    Write-Host "  Skipping npm install (-SkipInstall)"
}

# ---------------------------------------------------------------------------
# 5. Build shared + backend (frontend is deployed on Vercel)
# ---------------------------------------------------------------------------
Write-Step "Building shared and backend packages"
& npm run build -w packages/shared
if ($LASTEXITCODE -ne 0) { throw "shared build failed." }
& npm run build -w packages/backend
if ($LASTEXITCODE -ne 0) { throw "backend build failed." }

# ---------------------------------------------------------------------------
# 6. Database migrations
# ---------------------------------------------------------------------------
if (-not $SkipMigrate) {
    Write-Step "Running database migrations"
    & npm run migrate
    if ($LASTEXITCODE -ne 0) { throw "migrations failed. Check .env DB_* values and that the Neon database is reachable." }
} else {
    Write-Host "  Skipping migrations (-SkipMigrate)"
}

# ---------------------------------------------------------------------------
# 7. Seed (optional)
# ---------------------------------------------------------------------------
if ($Seed) {
    Write-Step "Running demo seed (this replaces demo data)"
    & npm run seed
    if ($LASTEXITCODE -ne 0) { throw "seed failed." }
}

# ---------------------------------------------------------------------------
# 8. Update Vercel rewrites (optional)
# ---------------------------------------------------------------------------
if ($UpdateVercel) {
    if (-not $TunnelUrl) { throw "-UpdateVercel requires -TunnelUrl (e.g. https://xxxx.trycloudflare.com)" }
    Write-Step "Updating vercel.json rewrites to backend at $TunnelUrl"
    $vercelJson = Join-Path $repoRoot "vercel.json"
    $raw = Get-Content $vercelJson -Raw
    $raw = $raw -replace 'https://[^"]*\.railway\.app', $TunnelUrl
    [System.IO.File]::WriteAllText($vercelJson, $raw, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "  vercel.json updated. Committing and pushing..."
    & git add vercel.json
    & git commit -m "chore: point Vercel API rewrites at $TunnelUrl"
    & git push
    if ($LASTEXITCODE -ne 0) { Write-Host "  WARNING: git push failed - push manually." -ForegroundColor Yellow }
}

# ---------------------------------------------------------------------------
# 9. Start the backend
# ---------------------------------------------------------------------------
if ($NoStart) {
    Write-Host ""
    Write-Host "Setup complete (backend not started, -NoStart)." -ForegroundColor Green
    Write-Host "Start it later with:" -ForegroundColor Green
    Write-Host "  cd $repoRoot\packages\backend"
    Write-Host "  node dist/index.js"
    exit 0
}

Write-Step "Starting backend (Ctrl+C to stop)"
$backendDir = Join-Path $repoRoot "packages\backend"
Push-Location $backendDir
try {
    if ($StartTunnel) {
        if (Test-Command tailscale) {
            Write-Host "  Starting Tailscale Funnel on port 3000 (requires Tailscale login)" -ForegroundColor Yellow
            Start-Process -NoNewWindow -FilePath "tailscale" -ArgumentList "funnel 3000"
        } elseif (Test-Command cloudflared) {
            Write-Host "  Starting cloudflared tunnel - use the https URL it prints below" -ForegroundColor Yellow
            & cloudflared tunnel --url http://localhost:3000
        } else {
            Write-Host "  Neither tailscale nor cloudflared found. Tunnel skipped." -ForegroundColor Yellow
            & node dist/index.js
        }
    } else {
        & node dist/index.js
    }
} finally {
    Pop-Location
}
