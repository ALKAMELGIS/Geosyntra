@echo off
REM GeoSyntra — validate, test, commit, push with live status messages.
cd /d "%~dp0"
echo.
echo  GeoSyntra Push
echo  ------------
node scripts/push.mjs %*
set EXIT=%ERRORLEVEL%
if %EXIT% neq 0 (
  echo.
  echo  Push failed with exit code %EXIT%
  exit /b %EXIT%
)
echo.
echo  Done.
exit /b 0
