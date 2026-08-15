@echo off
setlocal
set "DESKTOP_ROOT=%~dp0"
set "HARNESS_ROOT=%DESKTOP_ROOT%.."
set "DESKTOP_EXE=%HARNESS_ROOT%\dist\oi-dsh-desktop-win32-x64\oi-dsh-desktop.exe"

if not exist "%DESKTOP_EXE%" (
  echo Desktop executable has not been built.
  echo Run install.cmd once, then launch:
  echo %DESKTOP_EXE%
  exit /b 1
)

start "DeepSeek Harness Desktop" "%DESKTOP_EXE%"
exit /b 0
