#!/usr/bin/env bash
#
# Start all Move Predictor services for local development.
# Usage: ./start-dev.sh
#
# Starts: ML service (8000), Backend (3000), Frontend (5173)
# Press Ctrl+C to stop all services.
#

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT_DIR/.dev-logs"
mkdir -p "$LOG_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down services...${NC}"
  kill $ML_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  wait $ML_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  echo -e "${GREEN}All services stopped.${NC}"
}
trap cleanup EXIT INT TERM

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Move Predictor — Local Dev Startup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Check dependencies ──────────────────────────────────────

echo -e "${YELLOW}Checking dependencies...${NC}"

# Python
if ! command -v python3 &>/dev/null; then
  echo -e "${RED}python3 not found. Install Python 3.11+${NC}"
  exit 1
fi

# Node
if ! command -v node &>/dev/null; then
  echo -e "${RED}node not found. Install Node.js 20+${NC}"
  exit 1
fi

# Check if uvicorn is available
if ! python3 -c "import uvicorn" 2>/dev/null; then
  echo -e "${YELLOW}Installing ML dependencies...${NC}"
  cd "$ROOT_DIR/ml" && pip install -e "." --quiet
fi

# Check if backend node_modules exist
if [ ! -d "$ROOT_DIR/backend/node_modules" ]; then
  echo -e "${YELLOW}Installing backend dependencies...${NC}"
  cd "$ROOT_DIR/backend" && npm install --silent
fi

# Check if frontend node_modules exist
if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
  echo -e "${YELLOW}Installing frontend dependencies...${NC}"
  cd "$ROOT_DIR/frontend" && npm install --silent
fi

# Stockfish: download if not present
SF_LOCAL="$ROOT_DIR/ml/data/stockfish"
if ! command -v stockfish &>/dev/null && [ ! -d "$SF_LOCAL" ]; then
  echo -e "${YELLOW}Downloading Stockfish...${NC}"
  cd "$ROOT_DIR/ml" && bash scripts/download_stockfish.sh 2>&1 | tail -2
fi

# Find Stockfish path and write to ml/.env
SF_BIN=$(find "$SF_LOCAL" -name "stockfish*" -type f ! -name "*.md" ! -name "*.txt" ! -name "*.cff" 2>/dev/null | head -1)
if [ -z "$SF_BIN" ]; then
  SF_BIN=$(command -v stockfish 2>/dev/null || echo "")
fi

if [ -n "$SF_BIN" ]; then
  chmod +x "$SF_BIN" 2>/dev/null
  echo -e "${GREEN}Stockfish: $SF_BIN${NC}"
  # Write .env for ML service
  cat > "$ROOT_DIR/ml/.env" <<EOL
STOCKFISH_PATH=$SF_BIN
DATABASE_URL=sqlite+aiosqlite:///./move_predictor.db
REDIS_URL=redis://localhost:6379
DEVICE=cpu
EOL
else
  echo -e "${YELLOW}⚠ Stockfish not found. Engine analysis will be unavailable.${NC}"
fi

echo -e "${GREEN}Dependencies OK.${NC}"
echo ""

# ── Start ML service ────────────────────────────────────────

echo -e "${BLUE}Starting ML service on :8000...${NC}"
cd "$ROOT_DIR/ml"
python3 -m uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload \
  > "$LOG_DIR/ml.log" 2>&1 &
ML_PID=$!

# Wait for ML service to be ready
echo -n "  Waiting for ML service"
for i in $(seq 1 30); do
  if curl -s http://localhost:8000/ml/health >/dev/null 2>&1; then
    echo -e " ${GREEN}ready${NC}"
    break
  fi
  echo -n "."
  sleep 1
  if [ $i -eq 30 ]; then
    echo -e " ${RED}timeout${NC}"
    echo -e "${RED}ML service failed to start. Check $LOG_DIR/ml.log${NC}"
    tail -20 "$LOG_DIR/ml.log"
    exit 1
  fi
done

# ── Start backend ───────────────────────────────────────────

echo -e "${BLUE}Starting backend on :3001...${NC}"
cd "$ROOT_DIR/backend"
npx tsx watch src/index.ts > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

echo -n "  Waiting for backend"
for i in $(seq 1 15); do
  if curl -s http://localhost:3001/api/health >/dev/null 2>&1; then
    echo -e " ${GREEN}ready${NC}"
    break
  fi
  echo -n "."
  sleep 1
  if [ $i -eq 15 ]; then
    echo -e " ${RED}timeout${NC}"
    echo -e "${RED}Backend failed to start. Check $LOG_DIR/backend.log${NC}"
    tail -20 "$LOG_DIR/backend.log"
    exit 1
  fi
done

# ── Start frontend ──────────────────────────────────────────

echo -e "${BLUE}Starting frontend on :5173...${NC}"
cd "$ROOT_DIR/frontend"
npx vite --port 5173 > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
sleep 2

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  All services running!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Frontend:  ${BLUE}http://localhost:5173${NC}"
echo -e "  Backend:   ${BLUE}http://localhost:3001${NC}"
echo -e "  ML Service:${BLUE} http://localhost:8000${NC}"
echo ""
echo -e "  Logs: $LOG_DIR/"
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop all services."
echo ""

# Wait for any child to exit
wait
