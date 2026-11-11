# Verify that PostgreSQL and Redis from backend/infra/docker-compose.yml are reachable.
# Exit code 0 when both are ready; non-zero naming the failing component otherwise.
# Requires Docker Compose v2.
$ErrorActionPreference = 'Stop'

Push-Location (Join-Path $PSScriptRoot '..')
try {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[fail] Docker - the daemon is not running.' -ForegroundColor Red
        exit 1
    }

    $failed = $false

    docker compose exec -T postgres pg_isready -U pulse -d pulse 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[fail] PostgreSQL - not ready on localhost:5432.' -ForegroundColor Red
        $failed = $true
    }
    else {
        Write-Host '[ok] PostgreSQL is ready.' -ForegroundColor Green
    }

    $redisReply = docker compose exec -T redis redis-cli ping 2>&1
    if ($LASTEXITCODE -ne 0 -or ($redisReply -join ' ') -notmatch 'PONG') {
        Write-Host '[fail] Redis - not ready on localhost:6379.' -ForegroundColor Red
        $failed = $true
    }
    else {
        Write-Host '[ok] Redis is ready.' -ForegroundColor Green
    }

    if ($failed) {
        exit 1
    }
    exit 0
}
finally {
    Pop-Location
}
