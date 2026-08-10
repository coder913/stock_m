[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$DumpPath,
  [string]$ManifestPath
)

$ErrorActionPreference = "Stop"
$resolvedDump = (Resolve-Path -LiteralPath $DumpPath).Path
if (-not $ManifestPath) { $ManifestPath = [System.IO.Path]::ChangeExtension($resolvedDump, ".manifest.json") }
$resolvedManifest = (Resolve-Path -LiteralPath $ManifestPath).Path
$manifest = Get-Content -Raw -LiteralPath $resolvedManifest | ConvertFrom-Json
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedDump).Hash.ToLowerInvariant()
if ($actual -ne [string]$manifest.sha256) { throw "Backup SHA-256 mismatch: expected $($manifest.sha256), got $actual" }
if (-not $manifest.appVersion -or -not $manifest.migrationVersion -or -not $manifest.createdAt) { throw "Backup manifest is incomplete" }
[pscustomobject]@{ Valid = $true; Dump = $resolvedDump; Manifest = $resolvedManifest; Sha256 = $actual; MigrationVersion = $manifest.migrationVersion }
