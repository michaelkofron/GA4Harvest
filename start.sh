#!/usr/bin/env bash
set -e

# ── Pre-flight checks ────────────────────────────────────────────────────────
if [ ! -f backend/.venv/bin/activate ]; then
  echo "ERROR: backend/.venv not found. Run ./install.sh first."
  exit 1
fi

if [ ! -d frontend/node_modules ]; then
  echo "ERROR: frontend/node_modules not found. Run ./install.sh first."
  exit 1
fi

if [ ! -f backend/credentials.json ]; then
  echo "ERROR: backend/credentials.json not found."
  echo "       Follow the README to create a service account and place the key file there."
  exit 1
fi

# ── Cleanup handler ──────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── Start backend ────────────────────────────────────────────────────────────
echo "Starting backend  →  http://localhost:8000"
source backend/.venv/bin/activate
(cd backend && uvicorn main:app --reload --port 8000 2>&1 | sed 's/^/[backend] /') &
BACKEND_PID=$!

# ── Start frontend ───────────────────────────────────────────────────────────
echo "Starting frontend →  http://localhost:5173"
(cd frontend && npm run dev 2>&1 | sed 's/^/[frontend] /') &
FRONTEND_PID=$!

echo ""
echo "GA4Harvest is running. Press Ctrl+C to stop."
echo ""

wait "$BACKEND_PID" "$FRONTEND_PID"
