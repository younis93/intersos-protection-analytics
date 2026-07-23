@echo off
setlocal EnableExtensions DisableDelayedExpansion

cd /d "%~dp0"

where git >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git is not installed or is not available in PATH.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo ERROR: This file must be inside the INTERSOS Git repository.
  pause
  exit /b 1
)

for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT_BRANCH=%%B"
if /i not "%CURRENT_BRANCH%"=="main" (
  echo ERROR: The current branch is "%CURRENT_BRANCH%". Switch to main first.
  pause
  exit /b 1
)

for /f "delims=" %%S in ('git status --porcelain') do set "DIRTY=1"
if defined DIRTY (
  echo ERROR: There are uncommitted files.
  echo.
  git status --short
  echo.
  echo Commit your changes before publishing a release.
  pause
  exit /b 1
)

set "VERSION=%~1"
if not defined VERSION set /p "VERSION=Enter the new version, for example 1.0.8: "
if not defined VERSION (
  echo ERROR: A version is required.
  pause
  exit /b 1
)

echo %VERSION%| findstr /r /x "[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*" >nul
if errorlevel 1 (
  echo ERROR: Use a numeric version such as 1.0.8 without the letter v.
  pause
  exit /b 1
)

set "TAG=v%VERSION%"

echo Fetching GitHub information...
git fetch origin --tags
if errorlevel 1 goto :failed

git rev-parse -q --verify "refs/tags/%TAG%" >nul 2>&1
if not errorlevel 1 (
  echo ERROR: Tag %TAG% already exists locally. Choose a newer version.
  pause
  exit /b 1
)

git ls-remote --exit-code --tags origin "refs/tags/%TAG%" >nul 2>&1
if not errorlevel 1 (
  echo ERROR: Tag %TAG% already exists on GitHub. Choose a newer version.
  pause
  exit /b 1
)

echo.
echo This will publish INTERSOS Protection Analytics %TAG% from commit:
git log -1 --oneline
echo.
choice /c YN /n /m "Continue? [Y/N]: "
if errorlevel 2 exit /b 0

echo Updating and pushing main...
git pull --ff-only origin main
if errorlevel 1 goto :failed
git push origin main
if errorlevel 1 goto :failed

echo Creating %TAG%...
git tag -a "%TAG%" -m "INTERSOS Protection Analytics %TAG%"
if errorlevel 1 goto :failed

echo Starting the GitHub release workflow...
git push origin "%TAG%"
if errorlevel 1 goto :failed

echo.
echo SUCCESS: %TAG% was submitted to GitHub Actions.
echo Waiting for the signed installer and update.json...
echo https://github.com/younis93/intersos-protection-analytics/actions
echo.
start "" "https://github.com/younis93/intersos-protection-analytics/actions"

call "%~dp0sync-latest-release.cmd" "%VERSION%" --no-pause
if errorlevel 1 goto :failed

echo.
echo GitHub release %TAG% is published and the local release folder is synchronized.
pause
exit /b 0

:failed
echo.
echo ERROR: Publishing stopped because a Git command failed.
echo Review the message above. No existing release or tag was deleted.
pause
exit /b 1
