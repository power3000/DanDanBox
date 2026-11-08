@echo off
setlocal EnableExtensions
title Base64 Server
cd /d "%~dp0"

if not defined PORT set "PORT=5000"
set "URL=http://127.0.0.1:%PORT%"
set "VENV_PY=%~dp0.venv\Scripts\python.exe"

echo ============================================
echo   Base64 Encoder / Decoder
echo   %URL%
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 goto :no_python

if exist "%VENV_PY%" goto :have_venv

echo [Setup] First run: creating virtual environment...
python -m venv .venv
if errorlevel 1 goto :setup_fail

echo [Setup] Installing dependencies...
"%VENV_PY%" -m pip install --upgrade pip --quiet
"%VENV_PY%" -m pip install -r requirements.txt --quiet
if errorlevel 1 goto :setup_fail

:have_venv

rem If the server is already running, only open the browser.
"%VENV_PY%" -c "import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('%URL%/api/health',timeout=1).status==200 else 1)" >nul 2>nul
if errorlevel 1 goto :start_server

echo [Info] Server is already running. Opening browser...
if not defined B64_NO_BROWSER start "" "%URL%"
exit /b 0

:start_server
rem Poll in background, then open the browser once the server is ready.
if defined B64_NO_BROWSER goto :skip_browser
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='%URL%';for($i=0;$i -lt 60;$i++){try{if((Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 1).StatusCode -eq 200){Start-Process $u;break}}catch{};Start-Sleep -Milliseconds 500}"
:skip_browser

echo [Start] Server is running. Close this window to stop it.
echo.
set "FLASK_DEBUG=0"
"%VENV_PY%" app.py

echo.
echo [Stop] Server exited.
pause
exit /b 0

:no_python
echo [Error] Python not found. Install Python 3.9+ and add it to PATH.
pause
exit /b 1

:setup_fail
echo [Error] Setup failed. Check your network or Python installation.
pause
exit /b 1
