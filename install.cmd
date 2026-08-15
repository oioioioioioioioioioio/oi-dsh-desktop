@echo off
setlocal
cd /d "%~dp0"
set "HARNESS_ROOT=%~dp0.."

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

if not exist "%HARNESS_ROOT%\package.json" (
  echo oi-dsh-desktop must be cloned directly inside the deepseek-harness source root.
  echo Expected: %HARNESS_ROOT%\package.json
  exit /b 1
)

call npm install
if errorlevel 1 exit /b %errorlevel%

call npm run setup -- --harness-root "%HARNESS_ROOT%"
if errorlevel 1 exit /b %errorlevel%

echo.
echo Installation complete.
echo Launch: %HARNESS_ROOT%\dist\oi-dsh-desktop-win32-x64\oi-dsh-desktop.exe
exit /b 0
