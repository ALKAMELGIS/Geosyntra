# Rename repo folder: Geo-Intelligence -> GeoSyntra
# Close Cursor/VS Code and stop dev servers before running.
# Usage (from anywhere):
#   powershell -ExecutionPolicy Bypass -File "...\Geo-Intelligence\scripts\rename-to-geosyntra.ps1"

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$parent = Split-Path $repo -Parent
$leaf = Split-Path $repo -Leaf
if ($leaf -eq 'GeoSyntra') {
  Write-Host "Already named GeoSyntra: $repo"
  exit 0
}
$old = $repo
$new = Join-Path $parent "GeoSyntra"

if (Test-Path $new) {
  Write-Host "Already renamed: $new"
  exit 0
}
if (-not (Test-Path $old)) {
  Write-Error "Source folder not found: $old"
}

Write-Host "Renaming:"
Write-Host "  FROM: $old"
Write-Host "  TO:   $new"
try {
  Rename-Item -LiteralPath $old -NewName "GeoSyntra"
} catch {
  Write-Error @"
Rename failed (folder in use). Steps:
  1. Close Cursor / VS Code windows opened on this project
  2. Stop npm dev servers (Ctrl+C in terminals)
  3. Pause OneDrive sync briefly if needed
  4. Re-run: powershell -ExecutionPolicy Bypass -File "$($MyInvocation.MyCommand.Path)"
Or rename manually in File Explorer: Geo-Intelligence -> GeoSyntra
"@
}

Write-Host "Success. Open workspace: $new"
Write-Host "Then run: powershell -File `"$new\scripts\verify-project-after-folder-rename.ps1`""
