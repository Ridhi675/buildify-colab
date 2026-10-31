@echo off
rem Starts Buildify CoLab on http://localhost:3000 from this folder.
rem Double-click it, or run run-local.bat in a terminal. Ctrl+C stops the server.
cd /d "%~dp0"

rem Without a .env file, use the local SQLite database (prisma\dev.db).
if not exist .env set DATABASE_URL=file:./dev.db

if not exist node_modules (
  echo Installing packages...
  call npm install || goto :fail
)

if not exist prisma\dev.db (
  echo Creating the local database and the CareConnect demo...
  call npm run setup || goto :fail
)

echo.
echo Buildify CoLab is starting on http://localhost:3000
echo The first page load takes a few seconds while it compiles.
echo.
start "" http://localhost:3000
call npm run dev
goto :eof

:fail
echo.
echo Setup failed - see the messages above.
pause
exit /b 1
