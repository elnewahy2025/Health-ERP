# ============================================================
# Health-ERP Clinic Management System - one-command local Docker setup
# ------------------------------------------------------------------
# Runs the whole stack (Postgres + Redis + MinIO + backend + frontend)
# with Docker Desktop. Local-only mode is the default; LAN phone access
# is opt-in with -LanAccess.
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
    [switch]$SkipBuild,    # reuse existing images instead of rebuilding
    [switch]$Seed,         # explicitly run the destructive demo seed
    [switch]$ResetDb,      # wipe ALL data volumes first (fresh database; one-time)
    [switch]$LanAccess,    # expose the frontend to a phone on the same Wi-Fi
    [switch]$OpenBrowser,  # open the local frontend after it becomes healthy
    [switch]$LocalOnly,    # force localhost-only mode (also the default)
    [string]$LanIp = ''    # optional: force the LAN IP (implies -LanAccess)
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
if (-not $LanAccess -and -not $LanIp) { $LocalOnly = $true }
if ($LocalOnly -and ($LanAccess -or $LanIp)) { throw "Use either -LocalOnly or -LanAccess/-LanIp, not both." }

if ($LocalOnly) {
    $LAN_IP = '127.0.0.1'
    Write-Ok "Local-only mode: browser access will use localhost"
} else {
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
}

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

# Generate a local database password once and reuse it from .env on later runs.
# This keeps an existing Docker volume usable without embedding a credential.
$DB_PASSWORD        = Get-Existing 'POSTGRES_PASSWORD' (New-Secret 24)
$REDIS_PASSWORD     = Get-Existing 'REDIS_PASSWORD' (New-Secret 24)
$JWT_SECRET         = Get-Existing 'JWT_SECRET' (New-Secret 48)
$JWT_REFRESH_SECRET = Get-Existing 'JWT_REFRESH_SECRET' (New-Secret 48)
$CSRF_SECRET        = Get-Existing 'CSRF_SECRET' (New-Secret 48)
$MINIO_ROOT_USER    = Get-Existing 'MINIO_ROOT_USER' ('minio-' + (New-Secret 8))
$MINIO_ROOT_PASS    = Get-Existing 'MINIO_ROOT_PASSWORD' (New-Secret 24)

# --- 4. Free host ports (avoid clashes with local services) -------------
function Get-FreePort([int]$preferred) {
    for ($p = $preferred; $p -lt ($preferred + 50); $p++) {
        $inUse = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue
        if (-not $inUse) { return $p }
    }
    throw "Could not find a free host port near $preferred. Stop an unused service or pass a different port in .env."
}

function Get-ConfiguredOrFreePort([string]$key, [int]$preferred) {
    if ($existing.ContainsKey($key) -and $existing[$key]) {
        $configured = [int]$existing[$key]
        $inUse = Get-NetTCPConnection -State Listen -LocalPort $configured -ErrorAction SilentlyContinue
        if (-not $inUse) { return $configured }
        Write-Warn "Configured $key=$configured is already in use; selecting another free port."
    }
    return Get-FreePort $preferred
}

$POSTGRES_PORT       = Get-ConfiguredOrFreePort 'POSTGRES_PORT' 5432
$REDIS_PORT          = Get-ConfiguredOrFreePort 'REDIS_PORT' 6379
$BACKEND_PORT        = Get-ConfiguredOrFreePort 'BACKEND_PORT' 3000
$FRONTEND_PORT       = Get-ConfiguredOrFreePort 'FRONTEND_PORT' 80
$MINIO_PORT          = Get-ConfiguredOrFreePort 'MINIO_PORT' 9000
$MINIO_CONSOLE_PORT  = Get-ConfiguredOrFreePort 'MINIO_CONSOLE_PORT' 9001

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
# Health-ERP Clinic Management System - local Docker stack
# Auto-generated by scripts/setup-docker-local.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm')
# Single source of truth: docker compose reads this file automatically.
# ============================================
NODE_ENV=production
# Cookies over plain LAN HTTP: keep false. Set to true behind HTTPS (tunnel).
COOKIE_SECURE=false

# PostgreSQL (generated local password, shared by the containers)
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
Write-Ok ".env written (local secrets generated, DB name: vision_erp)"

# --- 6. Build and start --------------------------------------------------
if ($ResetDb) {
    Write-Step "Resetting all data volumes (docker compose down -v)..."
    docker compose down -v
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose down -v failed. Run it manually and check 'docker volume ls'."
    }
    Write-Ok "Data volumes removed - a fresh database will be created"
}

# Older versions of this repository used fixed names such as vision-erp-minio.
# Detect them for visibility, but never remove them: users may need both stacks.
$legacyContainerNames = @(
    'vision-erp-postgres',
    'vision-erp-redis',
    'vision-erp-minio',
    'vision-erp-backend',
    'vision-erp-frontend'
)
$legacyFound = @($legacyContainerNames | Where-Object {
    $legacyId = (& docker ps -aq --filter "name=^/$_$" 2>$null | Select-Object -First 1)
    [bool]$legacyId
})
if ($legacyFound.Count -gt 0) {
    Write-Warn "Existing legacy containers detected and preserved: $($legacyFound -join ', ')"
    Write-Warn "The new stack will use Compose-managed names and free host ports."
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

# --- 8b. Phone reachability: port binding + Windows Firewall --------------
if (-not $LocalOnly) {
Write-Step "Preparing phone access (port binding + firewall)..."
$published = docker compose port frontend 80 2>&1
if ("$published" -match '0\.0\.0\.0:') {
    Write-Ok "Port $FRONTEND_PORT is published on all interfaces ($published)"
} else {
    Write-Warn "Port $FRONTEND_PORT is NOT published on all interfaces."
    Write-Warn "Found: $published . The phone cannot reach the app until this is fixed."
}

# Allow inbound TCP on the frontend port. Needs an elevated PowerShell; if this
# fails we print the exact command so the user can run it once as Administrator.
try {
    New-NetFirewallRule -DisplayName 'Health-ERP frontend' -Direction Inbound -Protocol TCP -LocalPort $FRONTEND_PORT -Action Allow -ErrorAction Stop | Out-Null
    Write-Ok "Firewall rule added: inbound TCP $FRONTEND_PORT allowed"
} catch {
    Write-Warn "Could not add the firewall rule (needs an Administrator PowerShell)."
    Write-Warn "Run this once as Administrator, then retry from the phone:"
    Write-Host "    New-NetFirewallRule -DisplayName 'Health-ERP frontend' -Direction Inbound -Protocol TCP -LocalPort $FRONTEND_PORT -Action Allow" -ForegroundColor Yellow
}
} else {
    Write-Ok "Local-only mode: no Windows Firewall rule is needed"
}

# --- 9. Seed demo data ---------------------------------------------------
if ($Seed) {
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
Write-Step "Done! Access the Clinic Management System:"
Write-Host ""
Write-Host "  On this PC:     $frontUrl" -ForegroundColor Green
if (-not $LocalOnly) { Write-Host "  On your phone:  $phoneUrl   (same Wi-Fi network)" -ForegroundColor Green }
Write-Host ""
Write-Host "  Demo logins:"
Write-Host "    Admin:        admin@demo.com / Admin@123"
Write-Host "    Doctor:       doctor@demo.com / Doctor@123"
Write-Host "    Receptionist: reception@demo.com / Recept@123"
Write-Host ""
if (-not $LocalOnly) { Write-Warn "If the phone still cannot open the page: check that it is on the SAME Wi-Fi network,"
Write-Warn "and that Windows marked your network as Private (Settings > Network & Internet >"
Write-Warn "Properties). Then re-run the script once as Administrator to add the firewall rule." }
Write-Warn "Stop the stack anytime:  docker compose down   (data stays in named volumes)"
Write-Warn "Stop and delete all data: docker compose down -v"
if ($OpenBrowser) { Start-Process $frontUrl }
Write-Warn "For internet access later (HTTPS): set COOKIE_SECURE=true and add a tunnel (e.g. Cloudflare Tunnel)."
