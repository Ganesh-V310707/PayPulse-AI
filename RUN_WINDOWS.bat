@echo off
cd /d "%~dp0"
echo PayPulse AI 2.1 - Run from the top-level project folder.
if not exist "server\.env" (
  echo IMPORTANT: copy server\.env.example to server\.env and add your keys first.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 (
  echo npm install failed - review the error above.
  pause
  exit /b 1
)
call npm run dev
pause
