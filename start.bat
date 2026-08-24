@echo off
setlocal

rem LifeLoop one-click start script (Windows)
rem This installs everything LifeLoop needs and runs it on your machine at
rem http://localhost:3000. Double-click this file any time you want to start the app.

cd /d "%~dp0backend"

echo LifeLoop -- setting things up...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on this computer. Attempting to install it...
  where winget >nul 2>nul
  if not errorlevel 1 (
    winget install OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
  ) else (
    echo.
    echo Could not auto-install Node.js on this system.
    echo Please install it from https://nodejs.org ^(LTS version^), then run this script again.
    pause
    exit /b 1
  )
)

echo Node.js found:
call node --version

if not exist ".env" (
  copy /y ".env.example" ".env" >nul
  echo Created backend\.env with default settings ^(edit this file any time^).
)

echo Installing dependencies ^(first run may take a minute^)...
call npm install --no-fund --no-audit
if errorlevel 1 (
  echo.
  echo ============================================================
  echo  Dependency installation failed.
  echo ============================================================
  echo This is almost always one of these Windows-specific causes:
  echo.
  echo  1. This folder is inside OneDrive ^(Desktop and Documents often
  echo     are, by default^). OneDrive can lock files mid-install and
  echo     cause EPERM errors. Fix: move the whole LifeLoop folder to a
  echo     location OneDrive does not sync, e.g. C:\LifeLoop, then run
  echo     this script again from there.
  echo.
  echo  2. Windows Defender or another antivirus is scanning/blocking
  echo     npm while it writes files. Fix: add an exclusion for this
  echo     folder in Windows Security, or temporarily pause real-time
  echo     protection, then run this script again.
  echo.
  echo  3. A network hiccup interrupted the download ^(ECONNRESET^).
  echo     Fix: just run this script again - npm usually recovers.
  echo.
  echo If retrying still fails, delete the "backend\node_modules" folder
  echo completely first, then run this script again.
  echo ============================================================
  pause
  exit /b 1
)

start "" http://localhost:3000

echo.
echo Starting LifeLoop... ^(close this window to stop the server^)
call npm start

pause
