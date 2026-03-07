@echo off
echo ========================================
echo    IPQC OCR Standalone Server
echo ========================================
echo.

cd /d "%~dp0server"

echo Installing dependencies...
call npm install

echo.
echo Starting server on port 5001...
echo.
node server.js

pause
