#!/usr/bin/env bash
set -e

echo "==> GA4Harvest install"

# ── Python backend ──────────────────────────────────────────────────────────
echo ""
echo "[1/2] Setting up Python backend..."

if ! command -v python3 &>/dev/null; then
  echo "ERROR: python3 not found. Install Python 3.11+ and try again."
  exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "      Using Python $PYTHON_VERSION"

python3 -m venv backend/.venv
backend/.venv/bin/pip install --upgrade pip --quiet
backend/.venv/bin/pip install -r backend/requirements.txt --quiet

echo "      Backend dependencies installed."

# ── Node frontend ────────────────────────────────────────────────────────────
echo ""
echo "[2/2] Setting up Node frontend..."

if ! command -v node &>/dev/null; then
  echo "ERROR: node not found. Install Node 18+ and try again."
  exit 1
fi

NODE_VERSION=$(node --version)
echo "      Using Node $NODE_VERSION"

(cd frontend && npm install --silent)

echo "      Frontend dependencies installed."

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "==> Done!"
echo ""
echo "Next steps:"
echo "  1. Drop your credentials.json into backend/"
echo "  2. Run ./start.sh"
echo ""
