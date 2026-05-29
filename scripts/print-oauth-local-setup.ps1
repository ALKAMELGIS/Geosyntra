# Prints local OAuth URLs to register in Google Cloud + LinkedIn Developer
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root "backend\.env"
$redirect = "http://localhost:5173/Geosyntra/oauth-return.html"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*GOOGLE_OAUTH_REDIRECT_URI=(.+)$') { $redirect = $matches[1].Trim() }
  }
}
Write-Host ""
Write-Host "=== Geosyntra local OAuth setup ===" -ForegroundColor Cyan
Write-Host "Redirect URI (Google + LinkedIn + GitHub popup):" -ForegroundColor Yellow
Write-Host "  $redirect"
Write-Host ""
Write-Host "Google Cloud -> Credentials -> OAuth 2.0 Client ID:" -ForegroundColor Green
Write-Host "  Authorized redirect URIs: $redirect"
Write-Host "  Authorized JavaScript origins: http://localhost:5173"
Write-Host ""
Write-Host "LinkedIn Developer -> Auth -> Authorized redirect URLs:" -ForegroundColor Green
Write-Host "  $redirect"
Write-Host "  Enable product: Sign In with LinkedIn using OpenID Connect"
Write-Host ""
Write-Host "Verify API: http://localhost:3001/api/auth/oauth/config" -ForegroundColor Green
Write-Host ""
