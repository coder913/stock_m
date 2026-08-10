[CmdletBinding()]
param(
  [string]$ComposeFile = "docker-compose.yml",
  [string]$DatabaseName = "stock_m",
  [string]$DatabaseUser = "stock_m",
  [string]$OutputDirectory = "backups"
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$outputCandidate = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) { $OutputDirectory } else { Join-Path $workspace $OutputDirectory }
$resolvedOutput = [System.IO.Path]::GetFullPath($outputCandidate)
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$baseName = "stock-m-$stamp"
$dumpPath = Join-Path $resolvedOutput "$baseName.dump"
$manifestPath = Join-Path $resolvedOutput "$baseName.manifest.json"
$containerDump = "/tmp/$baseName.dump"

Push-Location $workspace
try {
  & docker compose -f $ComposeFile exec -T postgres pg_dump --username $DatabaseUser --dbname $DatabaseName --format custom --file $containerDump
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }
  & docker compose -f $ComposeFile cp "postgres:$containerDump" $dumpPath
  if ($LASTEXITCODE -ne 0) { throw "docker compose cp failed with exit code $LASTEXITCODE" }
  $migrationVersion = (& docker compose -f $ComposeFile exec -T postgres psql --username $DatabaseUser --dbname $DatabaseName --tuples-only --no-align --command "select name from platform.schema_migration order by name desc limit 1").Trim()
  if ($LASTEXITCODE -ne 0 -or -not $migrationVersion) { throw "Could not read the database migration version" }
  $appVersion = (Get-Content -Raw (Join-Path $workspace "package.json") | ConvertFrom-Json).version
  $sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $dumpPath).Hash.ToLowerInvariant()
  [ordered]@{ appVersion = $appVersion; migrationVersion = $migrationVersion; createdAt = (Get-Date).ToUniversalTime().ToString("o"); sha256 = $sha256; databaseName = $DatabaseName; dumpFile = (Split-Path -Leaf $dumpPath) } |
    ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath $manifestPath
  [pscustomobject]@{ Dump = $dumpPath; Manifest = $manifestPath; Sha256 = $sha256 }
} finally {
  & docker compose -f $ComposeFile exec -T postgres rm -f $containerDump 2>$null | Out-Null
  Pop-Location
}
