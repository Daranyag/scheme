@echo off
echo =======================================================
echo     Smart Welfare Scheme Finder - Startup Script
echo =======================================================

echo [1/2] Starting Node.js Backend...
start "Backend Server" cmd /k "cd backend && node server.js"

timeout /t 3 /nobreak > nul

echo [2/2] Starting Flutter Frontend...
start "Flutter App" cmd /k "cd frontend && flutter run"

echo.
echo Both services are starting up in separate windows!
echo You can close this window now.
pause
