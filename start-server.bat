@echo off
echo ========================================
echo    IPQC OCR Standalone Server
echo ========================================
echo.

cd /d "%~dp0server"

echo Installing dependencies...
call npm install

echo.
echo Setting MySQL credentials...
set IPQC_DB_USER=ipqc_app
set IPQC_DB_PASSWORD=ipqc_app_123

echo.
echo Starting server on port 5001...
echo.
node server.js

pause
