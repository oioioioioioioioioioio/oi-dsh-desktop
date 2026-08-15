@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22.19.0 or newer first.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with npm enabled.
  exit /b 1
)

if not exist "node_modules\.package-lock.json" (
  echo Installing dependencies for the first run...
  call npm install
  if errorlevel 1 exit /b %errorlevel%
)

call npm start -- %*
exit /b %errorlevel%
