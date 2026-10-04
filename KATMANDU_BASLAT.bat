@echo off
setlocal
chcp 65001 >nul
title KATMANDU

cd /d "%~dp0"

where node.exe >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: Node.js was not found.
  echo Install Node.js LTS from https://nodejs.org first.
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: npm was not found. Check your Node.js installation.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo.
  echo ERROR: package.json was not found.
  echo Run this file from inside the KATMANDU project folder.
  echo.
  pause
  exit /b 1
)

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)"
if errorlevel 1 (
  echo ERROR: Node.js 22.13 or newer is required.
  pause
  exit /b 1
)

if not exist "node_modules\.package-lock.json" (
  echo Installing dependencies for the first launch. This may take a few minutes...
  call npm.cmd ci --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo ERROR: Could not install project dependencies.
    echo Check your internet connection and the error above.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Starting KATMANDU...
echo The browser will open automatically.
echo Press Ctrl+C in this window to stop the application.
echo.

call npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort --open

if errorlevel 1 (
  echo.
  echo KATMANDU stopped unexpectedly.
  pause
)

endlocal
