@echo off
echo ========================================
echo   IPQC OCR - Start Both Frontend + Backend
echo ========================================
echo.
echo Starting Backend Server (Port 5001)...
start "IPQC OCR Backend" cmd /c "cd /d "%~dp0server" && set IPQC_DB_USER=ipqc_app && set IPQC_DB_PASSWORD=ipqc_app_123 && node server.js"
echo.
echo Waiting 3 seconds for backend to start...
timeout /t 3 /nobreak >nul
echo.
echo Starting Frontend (Port 3000)...
start "IPQC OCR Frontend" cmd /c "cd /d "%~dp0frontend" && npm start"
echo.
echo ========================================
echo   Both servers starting!
echo ========================================
echo.
echo   Backend: http://localhost:5001
echo   Frontend: http://localhost:3000
echo.
echo Press any key to close this window...
pause >nul
