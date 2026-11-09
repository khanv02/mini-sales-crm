# Restore a custom-format backup into a separate database for verification.
# Copies the dump into the Compose container and runs pg_restore there, so the
# file never passes through PowerShell text redirection (binary-safe on
# Windows PowerShell 5.1 and PowerShell 7+).
# Requires Docker Compose v2.
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,
    [string]$Database = 'pulse_restore'
)

$ErrorActionPreference = 'Stop'

Push-Location (Join-Path $PSScriptRoot '..')
$containerPath = $null
try {
    $resolvedBackup = (Resolve-Path $BackupFile).Path
    $user = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'pulse' }
    $containerPath = "/tmp/pulse-restore-$([guid]::NewGuid().ToString('N')).dump"

    docker compose cp $resolvedBackup "postgres:$containerPath"
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose cp failed with exit code $LASTEXITCODE."
    }

    docker compose exec -T postgres dropdb -U $user --if-exists --force $Database
    if ($LASTEXITCODE -ne 0) {
        throw "dropdb failed with exit code $LASTEXITCODE."
    }

    docker compose exec -T postgres createdb -U $user $Database
    if ($LASTEXITCODE -ne 0) {
        throw "createdb failed with exit code $LASTEXITCODE."
    }

    docker compose exec -T postgres pg_restore -U $user -d $Database --no-owner $containerPath
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore failed with exit code $LASTEXITCODE."
    }

    Write-Host "[ok] Restored $resolvedBackup into database '$Database'." -ForegroundColor Green
}
finally {
    if ($containerPath) {
        docker compose exec -T postgres rm -f $containerPath 2>&1 | Out-Null
    }
    Pop-Location
}
