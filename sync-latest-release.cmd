@echo off
setlocal EnableExtensions
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync_latest_release.ps1" -Version "%~1"
set "SYNC_RESULT=%ERRORLEVEL%"

if not "%SYNC_RESULT%"=="0" (
  echo.
  echo ERROR: The local release folder was not changed because synchronization failed.
) else (
  echo.
  echo SUCCESS: The local release folder now contains the verified latest release.
)

if /i not "%~2"=="--no-pause" pause
exit /b %SYNC_RESULT%
