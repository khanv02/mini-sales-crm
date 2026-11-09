# Create a PostgreSQL custom-format backup of the local database.
# Runs pg_dump inside the Compose container and copies the file out, so the
# dump never passes through PowerShell text redirection (binary-safe on
# Windows PowerShell 5.1 and PowerShell 7+).
# Requires Docker Compose v2.
param(
    [string]$Database = 'pulse',
    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'

Push-Location (Join-Path $PSScriptRoot '..')
$containerPath = $null
try {
    if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
        $OutputDirectory = Join-Path (Get-Location) 'backups'
    }
    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
    $OutputDirectory = (Resolve-Path $OutputDirectory).Path

    $user = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'pulse' }
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $target = Join-Path $OutputDirectory "pulse-$timestamp.dump"
    $containerPath = "/tmp/pulse-$timestamp.dump"

    docker compose exec -T postgres pg_dump -U $user -d $Database --format=custom --no-owner --file=$containerPath
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed with exit code $LASTEXITCODE."
    }

    docker compose cp "postgres:$containerPath" $target
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose cp failed with exit code $LASTEXITCODE."
    }

    $size = (Get-Item $target).Length
    Write-Host "[ok] Backup written to $target ($size bytes)." -ForegroundColor Green
}
finally {
    if ($containerPath) {
        docker compose exec -T postgres rm -f $containerPath 2>&1 | Out-Null
    }
    Pop-Location
}
