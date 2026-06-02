# Post-rename verification — run from repo root (GeoSyntra folder)
# Usage: powershell -File scripts/verify-project-after-folder-rename.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $root 'package.json'))) {
  Write-Error "Run from repo root (expected package.json next to scripts/)."
}
Set-Location $root

Write-Host "Repo root: $root"
Write-Host "Folder name: $(Split-Path $root -Leaf)"

$bad = Select-String -Path (Get-ChildItem -Recurse -File -Include *.json,*.md,*.cmd,*.ps1,*.mjs,*.yml,*.yaml,*.env*,*.ts,*.tsx -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch 'node_modules|\.git|dist|assets\\index-' }) -Pattern 'Geo-Intelligence' -SimpleMatch -ErrorAction SilentlyContinue
if ($bad) {
  Write-Warning "Found legacy folder name references:"
  $bad | ForEach-Object { Write-Host "  $($_.Path):$($_.LineNumber)" }
} else {
  Write-Host "OK: no Geo-Intelligence path strings in project sources."
}

Write-Host "`n--- npm install ---"
& "$env:ProgramFiles\nodejs\npm.cmd" install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n--- npm run typecheck ---"
& "$env:ProgramFiles\nodejs\npm.cmd" run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n--- npm run build ---"
& "$env:ProgramFiles\nodejs\npm.cmd" run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$gitDir = Join-Path $root '.git'
if (Test-Path $gitDir) {
  Write-Host "`n--- git status ---"
  git -c "safe.directory=$root" -C $root status -sb
  git -c "safe.directory=$root" -C $root remote -v
}

Write-Host "`nDone. Re-open Cursor/VS Code on: $root"
