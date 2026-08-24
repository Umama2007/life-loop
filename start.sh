#!/usr/bin/env bash
# LifeLoop one-click start script (macOS / Linux)
#
# This installs everything LifeLoop needs and runs it on your machine at
# http://localhost:3000. It's safe to run every time you want to start the app.

set -e
cd "$(dirname "$0")/backend"

echo "LifeLoop — setting things up..."
echo ""

# 1. Make sure Node.js is available. Node.js is the only piece of software
#    this app needs that we can't install for you from inside this script
#    on every system, so if it's missing we try the most common package
#    manager for your OS, and otherwise point you to the installer.
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found on this computer. Attempting to install it..."
  if command -v brew >/dev/null 2>&1; then
    brew install node
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y nodejs npm
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nodejs npm
  else
    echo ""
    echo "Could not auto-install Node.js on this system."
    echo "Please install it from https://nodejs.org (LTS version), then run this script again."
    exit 1
  fi
fi

echo "Node.js found: $(node --version)"

# 2. Create a local config file on first run.
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "Created backend/.env with default settings (edit this file any time)."
fi

# 3. Install backend dependencies (only re-downloads if something changed).
echo "Installing dependencies (first run may take a minute)..."
if ! npm install --no-fund --no-audit; then
  echo ""
  echo "============================================================"
  echo " Dependency installation failed."
  echo "============================================================"
  echo "Common causes:"
  echo "  1. A network hiccup interrupted the download — just run this"
  echo "     script again, npm usually recovers on retry."
  echo "  2. Leftover files from a previous failed install. Fix: delete"
  echo "     the 'backend/node_modules' folder completely, then run"
  echo "     this script again."
  echo "  3. Permission issues if a previous run used sudo. Fix: delete"
  echo "     'backend/node_modules' and re-run this script WITHOUT sudo."
  echo "============================================================"
  exit 1
fi

# 4. Open the app in your browser shortly after the server starts.
( sleep 2
  URL="http://localhost:$(grep -m1 '^PORT=' .env | cut -d '=' -f2 || echo 3000)"
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  fi
) &

# 5. Start the server (stays running in this terminal — press Ctrl+C to stop).
echo ""
echo "Starting LifeLoop..."
npm start
