# ============================================================
# Vision Healthcare ERP - one-command local Docker setup
# ------------------------------------------------------------
# Runs the whole stack (Postgres + Redis + MinIO + backend +
# frontend) with Docker Desktop and makes it reachable from
# your phone on the same Wi-Fi network.
#
# Usage (from the repository root):
#   powershell -ExecutionPolicy Bypass -File scripts/setup-docker-local.ps1
#
# What it does:
#   1. Verifies Docker is running
#   2. Detects your PC's LAN IP (for phone access)
#   3. Generates strong random secrets (DB/Redis/JWT/CSRF/MinIO)
#   4. Picks free host ports (avoids conflicts with local
#      Postgres/Redis/IIS services)
#   5. Writes a complete .env (single source of truth; an
#      existing .env is backed up first)
#   6. Builds and starts the stack
#   7. Waits for health, seeds demo data, prints URLs + logins
#
# Nothing is hardcoded: every value is generated or configurable.
# ============================================================

param(
    [switch]$SkipBuild,   # reuse existing images instead of rebuilding
    [switch]$NoSeed,      # skip seeding demo data
    [switch]$ResetDb,     # wipe ALL data volumes first (fresh database; one-time)
    [string]$LanIp = ''   # optional: force the LAN IP (e.g. -LanIp 192.168.1.20)
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  OK: $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  WARN: $msg" -ForegroundColor Yellow }

# --- 1. Docker check ---------------------------------------------------
Write-Step "Checking Docker..."
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Docker is not running. Start Docker Desktop and wait until the whale icon is stable, then re-run this script."
}
Write-Ok "Docker is running"

docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose v2 is not available. Update Docker Desktop to a recent version."
}

# --- 2. LAN IP ----------------------------------------------------------
Write-Step "Detecting LAN IP for phone access..."
function Test-PrivateIp([string]$addr) {
    if ($addr -notlike '127.*' -and
        ($addr -like '192.168.*' -or
         $addr -like '10.*' -or
         ($addr -like '172.*' -and [int]($addr.Split('.')[1]) -ge 16 -and [int]($addr.Split('.')[1]) -le 31))) {
        return $true
    }
    return $false
}

$ip = $null
if ($LanIp) {
    $ip = [pscustomobject]@{ IPAddress = $LanIp; InterfaceAlias = 'manual' }
    Write-Ok "Using forced LAN IP: $LanIp"
} else {
    # Prefer real (physical) adapters - Wi-Fi/Ethernet - over WSL/Hyper-V vEthernet
    $virtualMatch = 'vEthernet|WSL|Hyper-V|Default Switch|Loopback|Bluetooth|Tailscale|ZeroTier|WireGuard|TAP|TUN'
    $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.AddressState -eq 'Preferred' -and (Test-PrivateIp $_.IPAddress) } |
        ForEach-Object {
            $adapter = Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue
            [pscustomobject]@{
                IPAddress = $_.IPAddress
                InterfaceAlias = $_.InterfaceAlias
                InterfaceDescription = if ($adapter) { $adapter.InterfaceDescription } else { '' }
                Physical = if ($adapter) { $adapter.Physical } else { $false }
            }
        }
    $ip = $candidates | Where-Object {
        $_.Physical -and $_.InterfaceAlias -notmatch $virtualMatch -and $_.InterfaceDescription -notmatch $virtualMatch
    } | Select-Object -First 1
    if (-not $ip) {
        $ip = $candidates | Where-Object {
            $_.InterfaceAlias -notmatch $virtualMatch -and $_.InterfaceDescription -notmatch $virtualMatch
        } | Select-Object -First 1
    }
    if (-not $ip) { $ip = $candidates | Select-Object -First 1 }
    if (-not $ip) {
        throw "No private LAN IPv4 address found. Connect your PC to Wi-Fi or Ethernet, then re-run. (Or pass -LanIp 192.168.x.x)"
    }
    if ($ip.InterfaceAlias -match $virtualMatch -or $ip.InterfaceDescription -match $virtualMatch) {
        Write-Warn "Only virtual adapters found ($($ip.InterfaceAlias)). The phone needs your real Wi-Fi IP."
        Write-Warn "Run 'ipconfig' and re-run with: -LanIp <your-Wi-Fi-IPv4>"
    }
}

$LAN_IP = $ip.IPAddress
Write-Ok "PC LAN IP: $LAN_IP  ($($ip.InterfaceAlias)) - phone must be on the same network"

# --- 3. Secrets (reuse existing .env values so the DB volume stays valid) -
Write-Step "Preparing secrets..."
function New-Secret([int]$bytes = 32) {
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $buf = New-Object byte[] $bytes
    $rng.GetBytes($buf)
    $rng.Dispose()
    ($buf | ForEach-Object { $_.ToString('x2') }) -join ''
}

$existing = @{}
if (Test-Path .env) {
    Get-Content .env | Where-Object { $_ -match '^\s*[A-Za-z0-9_]+\s*=' } | ForEach-Object {
        $kv = $_ -split '=', 2
        $key = $kv[0].Trim()
        $val = $kv[1].Trim()
        if ($key -and $val) { $existing[$key] = $val }
    }
    if ($existing.Count -gt 0) {
        Write-Ok "Reusing $($existing.Count) existing value(s) from current .env (keeps the DB volume valid)"
    }
}
function Get-Existing([string]$key, [string]$fallback) {
    if ($existing.ContainsKey($key) -and $existing[$key]) { return $existing[$key] }
    return $fallback
}

# Fixed local DB password - same value everywhere (see .env.docker.example).
# Change it in all three places if you ever want a different one, then -ResetDb.
$DB_PASSWORD        = 'visionhc-local-db-2026'
$REDIS_PASSWORD     = Get-Existing 'REDIS_PASSWORD' (New-Secret 24)
$JWT_SECRET         = Get-Existing 'JWT_SECRET' (New-Secret 48)
$JWT_REFRESH_SECRET = Get-Existing 'JWT_REFRESH_SECRET' (New-Secret 48)
$CSRF_SECRET        = Get-Existing 'CSRF_SECRET' (New-Secret 48)
$MINIO_ROOT_USER    = Get-Existing 'MINIO_ROOT_USER' ('minio-' + (New-Secret 8))
$MINIO_ROOT_PASS    = Get-Existing 'MINIO_ROOT_PASSWORD' (New-Secret 24)

# --- 4. Free host ports (avoid clashes with local services) -------------
function Get-FreePort([int]$preferred) {
    for ($p = $preferred; $p -lt ($preferred + 20); $p++) {
        $inUse = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue
        if (-not $inUse) { return $p }
    }
    return $preferred + 50
}

$POSTGRES_PORT       = [int](Get-Existing 'POSTGRES_PORT' (Get-FreePort 5432))
$REDIS_PORT          = [int](Get-Existing 'REDIS_PORT' (Get-FreePort 6379))
$BACKEND_PORT        = [int](Get-Existing 'BACKEND_PORT' (Get-FreePort 3000))
$FRONTEND_PORT       = [int](Get-Existing 'FRONTEND_PORT' (Get-FreePort 80))
$MINIO_PORT          = [int](Get-Existing 'MINIO_PORT' (Get-FreePort 9000))
$MINIO_CONSOLE_PORT  = [int](Get-Existing 'MINIO_CONSOLE_PORT' (Get-FreePort 9001))

$portSuffix = if ($FRONTEND_PORT -ne 80) { ':' + $FRONTEND_PORT } else { '' }
$APP_URL = "http://${LAN_IP}${portSuffix}"
Write-Ok "Host ports: Postgres=$POSTGRES_PORT Redis=$REDIS_PORT Backend=$BACKEND_PORT Frontend=$FRONTEND_PORT"

# --- 5. Write .env (single source of truth) ------------------------------
Write-Step "Writing .env ..."
if (Test-Path .env) {
    $envBackup = ".env.backup-$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item .env $envBackup
    Write-Warn "Existing .env backed up to $envBackup"
}

$envContent = @"
# ============================================
# Vision Healthcare ERP - local Docker stack
# Auto-generated by scripts/setup-docker-local.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm')
# Single source of truth: docker compose reads this file automatically.
# ============================================
NODE_ENV=production
# Cookies over plain LAN HTTP: keep false. Set to true behind HTTPS (tunnel).
COOKIE_SECURE=false

# PostgreSQL (fixed local password, same in all containers)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$DB_PASSWORD
POSTGRES_DB=vision_erp
POSTGRES_PORT=$POSTGRES_PORT

# Host-side scripts (npm run migrate / seed / dev) read these directly
DB_HOST=localhost
DB_PORT=$POSTGRES_PORT
DB_NAME=vision_erp
DB_USER=postgres
DB_PASSWORD=$DB_PASSWORD
# True only for managed Postgres that requires SSL (e.g. Neon/Railway).
DB_SSL=false

# Redis
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_PORT=$REDIS_PORT

# Auth
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
CSRF_SECRET=$CSRF_SECRET

# URLs / CORS (phone uses the same frontend origin via the nginx proxy)
CORS_ORIGIN=$APP_URL
APP_URL=$APP_URL

# MinIO (file storage)
MINIO_ROOT_USER=$MINIO_ROOT_USER
MINIO_ROOT_PASSWORD=$MINIO_ROOT_PASS
MINIO_PORT=$MINIO_PORT
MINIO_CONSOLE_PORT=$MINIO_CONSOLE_PORT

# Host port mapping
BACKEND_PORT=$BACKEND_PORT
FRONTEND_PORT=$FRONTEND_PORT
VITE_API_URL=/api/v1
"@

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $PWD '.env'), $envContent, $utf8NoBom)
Write-Ok ".env written (secrets generated, DB name: vision_erp)"

# --- 6. Build and start --------------------------------------------------
if ($ResetDb) {
    Write-Step "Resetting all data volumes (docker compose down -v)..."
    docker compose down -v
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose down -v failed. Run it manually and check 'docker volume ls'."
    }
    Write-Ok "Data volumes removed - a fresh database will be created"
}

if ($SkipBuild) {
    Write-Step "Starting stack (reusing existing images)..."
    docker compose up -d
} else {
    Write-Step "Building and starting the stack (first run takes several minutes)..."
    docker compose up -d --build
}
if ($LASTEXITCODE -ne 0) { throw "docker compose failed. Scroll up to see the error." }

# --- 7. Verify DB credentials --------------------------------------------
Write-Step "Verifying Postgres credentials..."
$dbCheck = docker compose exec -T -e "PGPASSWORD=$DB_PASSWORD" postgres psql -U postgres -d vision_erp -tAc "select 1" 2>&1
if ($LASTEXITCODE -ne 0 -or "$dbCheck".Trim() -ne '1') {
    Write-Warn "Postgres rejected the .env password (stale data volume)."
    throw "Re-run with -ResetDb to wipe the old Postgres volume: powershell -ExecutionPolicy Bypass -File scripts/setup-docker-local.ps1 -ResetDb"
}
Write-Ok "Database credentials OK"

# --- 8. Wait for health --------------------------------------------------
Write-Step "Waiting for backend to become healthy (up to ~2 minutes)..."
$healthUrl = "http://localhost:${BACKEND_PORT}/api/v1/health"
$healthy = $false
for ($i = 0; $i -lt 24; $i++) {
    Start-Sleep -Seconds 5
    try {
        $r = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
}
if (-not $healthy) {
    Write-Warn "Backend did not return 200 in time. Inspect logs with:"
    Write-Host "    docker compose logs --tail=100 backend"
    throw "Backend is not healthy."
}
Write-Ok "Backend healthy: $healthUrl"

$frontUrl = "http://localhost:${FRONTEND_PORT}"
for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Seconds 5
    try {
        $r = Invoke-WebRequest -Uri $frontUrl -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { break }
    } catch { }
}
Write-Ok "Frontend reachable on this PC: $frontUrl"

# --- 9. Seed demo data ---------------------------------------------------
if (-not $NoSeed) {
    Write-Step "Seeding demo data (admin / doctor / receptionist)..."
    docker compose exec -T backend npx --no-install tsx src/core/seed.ts
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Seeding did not complete (likely already seeded). Safe to ignore."
    } else {
        Write-Ok "Demo data seeded"
    }
}

# --- 10. Summary ----------------------------------------------------------
$phoneUrl = "http://${LAN_IP}${portSuffix}"
Write-Step "Done! Access the ERP:"
Write-Host ""
Write-Host "  On this PC:     $frontUrl" -ForegroundColor Green
Write-Host "  On your phone:  $phoneUrl   (same Wi-Fi network)" -ForegroundColor Green
Write-Host ""
Write-Host "  Demo logins:"
Write-Host "    Admin:        admin@demo.com / Admin@123"
Write-Host "    Doctor:       doctor@demo.com / Doctor@123"
Write-Host "    Receptionist: reception@demo.com / Recept@123"
Write-Host ""
Write-Warn "Firewall: if the phone cannot open the page, run this once (admin PowerShell):"
Write-Host "    New-NetFirewallRule -DisplayName 'Vision ERP' -Direction Inbound -Protocol TCP -LocalPort $FRONTEND_PORT -Action Allow"
Write-Warn "Stop the stack anytime:  docker compose down   (data stays in named volumes)"
Write-Warn "Stop and delete all data: docker compose down -v"
Write-Warn "For internet access later (HTTPS): set COOKIE_SECURE=true and add a tunnel (e.g. Cloudflare Tunnel)."
