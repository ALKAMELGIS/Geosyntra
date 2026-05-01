# Publish this repo to GitHub using HTTPS (avoids SSH publickey errors on Windows).
# Usage: from repo root, run:  powershell -ExecutionPolicy Bypass -File .\publish-to-github.ps1

$ErrorActionPreference = 'Stop'
$HttpsOrigin = 'https://github.com/ALKAMELGIS/AgroCloud.git'

Write-Host "Setting origin to HTTPS (recommended if SSH push fails)..." -ForegroundColor Cyan
git remote set-url origin $HttpsOrigin

$rewrite = git config --global --get-regexp 'insteadOf' 2>$null
if ($rewrite) {
  Write-Host "Warning: global Git url.insteadOf rules found (can force SSH over HTTPS):" -ForegroundColor Yellow
  $rewrite | ForEach-Object { Write-Host "  $_" }
  Write-Host "If push still uses SSH, run: git config --global --edit  and remove those url.* lines." -ForegroundColor Yellow
}

Write-Host "origin is now:" -ForegroundColor Green
git remote -v

# Avoid HTTP 408 / "RPC failed" / unexpected disconnect on slow or large HTTPS pushes (Windows/curl).
Write-Host "`nTuning HTTP for reliable push (postBuffer + HTTP/1.1 + schannel)..." -ForegroundColor Cyan
git config --local http.postBuffer 524288000
git config --local http.version HTTP/1.1
git config --local http.sslBackend schannel

Write-Host "`nPushing main to origin (browser login may open for GitHub)..." -ForegroundColor Cyan
git push -u origin main
