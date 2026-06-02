@echo off
REM GeoSyntra — portable dev launcher (Windows). Uses repo folder only — no absolute paths.
cd /d "%~dp0"
echo GeoSyntra — setup + dev
call npm run setup
if errorlevel 1 exit /b 1
call npm run dev
