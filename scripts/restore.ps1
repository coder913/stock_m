[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$DumpPath,
  [string]$ManifestPath,
  [string]$ComposeFile = "docker-compose.yml",
  [string]$DatabaseName = "stock_m",
  [string]$DatabaseUser = "stock_m",
  [Parameter(Mandatory)][string]$ConfirmDatabaseName
)

$ErrorActionPreference = "Stop"
if ($DatabaseName -notmatch '^[A-Za-z0-9_]+$' -or $DatabaseUser -notmatch '^[A-Za-z0-9_]+$') { throw "Database name and user must contain only letters, digits and underscores" }
if ($ConfirmDatabaseName -ne $DatabaseName) { throw "Confirmation does not match target database '$DatabaseName'" }
$workspace = Split-Path -Parent $PSScriptRoot
$verify = & (Join-Path $PSScriptRoot "verify-backup.ps1") -DumpPath $DumpPath -ManifestPath $ManifestPath
$manifest = Get-Content -Raw -LiteralPath $verify.Manifest | ConvertFrom-Json
if ($manifest.databaseName -and $manifest.databaseName -ne $DatabaseName) { throw "Backup targets '$($manifest.databaseName)', not '$DatabaseName'" }
$suffix = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
$temporaryDatabase = "${DatabaseName}_restore_$suffix"
$archiveDatabase = "${DatabaseName}_before_$suffix"
$containerDump = "/tmp/stock-m-restore-$suffix.dump"
$protectedServices = @("web-api", "monitor-worker", "notification-worker", "trading-worker")
$temporaryCreated = $false
$swapped = $false

Push-Location $workspace
try {
  $running = @(& docker compose -f $ComposeFile ps --services --filter status=running)
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect Compose services" }
  $unsafe = @($running | Where-Object { $protectedServices -contains $_ })
  if ($unsafe.Count) { throw "Stop application and worker services before restore: $($unsafe -join ', ')" }

  & docker compose -f $ComposeFile cp $verify.Dump "postgres:$containerDump"
  if ($LASTEXITCODE -ne 0) { throw "Could not copy the backup into PostgreSQL" }
  & docker compose -f $ComposeFile exec -T postgres createdb --username $DatabaseUser $temporaryDatabase
  if ($LASTEXITCODE -ne 0) { throw "Could not create temporary restore database" }
  $temporaryCreated = $true
  & docker compose -f $ComposeFile exec -T postgres pg_restore --username $DatabaseUser --dbname $temporaryDatabase --no-owner --no-privileges $containerDump
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE" }

  $restoredVersion = (& docker compose -f $ComposeFile exec -T postgres psql --username $DatabaseUser --dbname $temporaryDatabase --tuples-only --no-align --command "select name from platform.schema_migration order by name desc limit 1").Trim()
  if ($restoredVersion -ne [string]$manifest.migrationVersion) { throw "Restored migration version '$restoredVersion' does not match manifest '$($manifest.migrationVersion)'" }
  $databasePassword = (& docker compose -f $ComposeFile exec -T postgres printenv POSTGRES_PASSWORD).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $databasePassword) { throw "Could not read the PostgreSQL service password" }
  $encodedPassword = [System.Uri]::EscapeDataString($databasePassword)
  $temporaryDatabaseUrl = "postgresql://${DatabaseUser}:$encodedPassword@postgres:5432/${temporaryDatabase}"
  & docker compose -f $ComposeFile run --rm --no-deps -e "DATABASE_URL=$temporaryDatabaseUrl" web-api npm run db:migrate -- --check | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Application migration check failed for temporary database" }
  $integrity = (& docker compose -f $ComposeFile exec -T postgres psql --username $DatabaseUser --dbname $temporaryDatabase --tuples-only --no-align --command "select (select count(*) from platform.schema_migration) > 0 and (select count(*) from platform.installation) = 1").Trim()
  if ($LASTEXITCODE -ne 0 -or $integrity -ne "t") { throw "Restored database integrity checks failed" }

  $swapSql = "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$DatabaseName' and pid <> pg_backend_pid(); alter database `"$DatabaseName`" rename to `"$archiveDatabase`"; alter database `"$temporaryDatabase`" rename to `"$DatabaseName`";"
  & docker compose -f $ComposeFile exec -T postgres psql --username $DatabaseUser --dbname postgres --set ON_ERROR_STOP=1 --command $swapSql | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Database swap failed; the active database was not replaced" }
  $swapped = $true
  [pscustomobject]@{ Restored = $true; Database = $DatabaseName; PreviousDatabase = $archiveDatabase; MigrationVersion = $restoredVersion }
} finally {
  if ($temporaryCreated -and -not $swapped) { & docker compose -f $ComposeFile exec -T postgres dropdb --username $DatabaseUser --if-exists $temporaryDatabase 2>$null | Out-Null }
  & docker compose -f $ComposeFile exec -T postgres rm -f $containerDump 2>$null | Out-Null
  Pop-Location
}
