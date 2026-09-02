#!/usr/bin/env bash
#
# Siksha Saathi — Local Development Orchestration
#
# Starts all three processes for the local architecture:
#   1. Embedding service (localhost:8100) — loads multilingual-e5-small ONCE
#   2. Next.js dev server (localhost:3000)
#   3. Python ingestion worker (background job polling)
#
# Startup order ensures the embedding service is ready before Next.js and worker start.
#
# Usage:
#   ./dev-local.sh                 # Start all 3 services
#   ./dev-local.sh --skip-nextjs   # Start embedding service + worker only
#   ./dev-local.sh --skip-worker   # Start embedding service + Next.js only
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

EMBEDDING_PORT="${EMBEDDING_PORT:-8100}"
EMBEDDING_HOST="${EMBEDDING_HOST:-127.0.0.1}"
SKIP_NEXTJS=false
SKIP_WORKER=false

for arg in "$@"; do
  case $arg in
    --skip-nextjs) SKIP_NEXTJS=true ;;
    --skip-worker) SKIP_WORKER=true ;;
    -h|--help)
      echo "Usage: ./dev-local.sh [--skip-nextjs] [--skip-worker]"
      exit 0
      ;;
  esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

EMB_PID=""
NEXT_PID=""
WORKER_PID=""

cleanup() {
  echo -e "\n${YELLOW}Stopping all services...${NC}"
  if [ -n "${WORKER_PID}" ] && kill -0 "${WORKER_PID}" 2>/dev/null; then
    kill "${WORKER_PID}" 2>/dev/null || true
  fi
  if [ -n "${NEXT_PID}" ] && kill -0 "${NEXT_PID}" 2>/dev/null; then
    kill "${NEXT_PID}" 2>/dev/null || true
  fi
  if [ -n "${EMB_PID}" ] && kill -0 "${EMB_PID}" 2>/dev/null; then
    kill "${EMB_PID}" 2>/dev/null || true
  fi
  sleep 1
  # Force kill any lingering processes
  if [ -n "${WORKER_PID}" ]; then kill -9 "${WORKER_PID}" 2>/dev/null || true; fi
  if [ -n "${NEXT_PID}" ]; then kill -9 "${NEXT_PID}" 2>/dev/null || true; fi
  if [ -n "${EMB_PID}" ]; then kill -9 "${EMB_PID}" 2>/dev/null || true; fi
  wait 2>/dev/null || true
  echo -e "${GREEN}All services stopped cleanly.${NC}"
}
trap cleanup EXIT INT TERM

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          Siksha Saathi — Local Development Stack           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

# ── Check Prerequisites ──────────────────────────────────────────────────
if [ ! -f ".env.local" ]; then
  if [ -f ".env.example" ]; then
    echo -e "${YELLOW}⚠️  .env.local not found. Creating from .env.example...${NC}"
    cp .env.example .env.local
    echo -e "${YELLOW}   Please update .env.local with your real credentials (DATABASE_URL, etc.).${NC}"
  else
    echo -e "${RED}❌ Missing .env.local file.${NC}"
    exit 1
  fi
fi

# Ensure Python virtual environment exists
if [ ! -f "optimized-worker/.venv/bin/activate" ]; then
  echo -e "${CYAN}🔧 Creating Python virtual environment in optimized-worker/.venv...${NC}"
  python3 -m venv optimized-worker/.venv
  source optimized-worker/.venv/bin/activate
  echo -e "${CYAN}   Installing worker dependencies...${NC}"
  pip install -q -r optimized-worker/requirements.txt
  echo -e "${CYAN}   Installing embedding service dependencies...${NC}"
  pip install -q -r embedding-service/requirements.txt
else
  source optimized-worker/.venv/bin/activate
fi

# Ensure embedding-service has .venv symlink
if [ ! -L "embedding-service/.venv" ] && [ ! -d "embedding-service/.venv" ]; then
  ln -sf ../optimized-worker/.venv embedding-service/.venv
fi

# Ensure node_modules exist
if [ ! -d "node_modules" ]; then
  echo -e "${CYAN}🔧 Installing Node.js dependencies...${NC}"
  npm install
fi

# Export shared embedding URL so Next.js and Worker are dynamically linked
export LOCAL_EMBEDDING_URL="http://${EMBEDDING_HOST}:${EMBEDDING_PORT}"
export LOCAL_EMBEDDING_DIM="384"
export LOCAL_EMBEDDING_MODEL="intfloat/multilingual-e5-small"

# Check if port is already bound
if lsof -Pi :${EMBEDDING_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
  ALREADY_RUNNING=$(curl -s "${LOCAL_EMBEDDING_URL}/health" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
  if [ "$ALREADY_RUNNING" = "ready" ]; then
    echo -e "${GREEN}ℹ️  Embedding service already running & ready on ${LOCAL_EMBEDDING_URL}.${NC}"
  else
    echo -e "${RED}❌ Port ${EMBEDDING_PORT} is in use by another process. Please free it first:${NC}"
    echo -e "   lsof -i :${EMBEDDING_PORT}"
    exit 1
  fi
else
  # ── 1. Start Embedding Service ──────────────────────────────────────────
  echo -e "\n${YELLOW}[1/3] Starting Embedding Service on ${LOCAL_EMBEDDING_URL}...${NC}"
  echo -e "      Model: intfloat/multilingual-e5-small (384-dim)"
  echo -e "      Initializing model (takes ~6 seconds on M-series)..."

  cd embedding-service
  uvicorn app.main:app \
    --host "$EMBEDDING_HOST" \
    --port "$EMBEDDING_PORT" \
    --log-level warning \
    --no-access-log &
  EMB_PID=$!
  cd "$SCRIPT_DIR"

  # Wait for /health == ready
  MAX_WAIT=120
  WAITED=0
  READY=false
  while [ $WAITED -lt $MAX_WAIT ]; do
    STATUS=$(curl -s "${LOCAL_EMBEDDING_URL}/health" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
    if [ "$STATUS" = "ready" ]; then
      READY=true
      echo -e "      ${GREEN}✅ Embedding Service is READY${NC}"
      break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    echo -e "      ⏳ Loading model... (${WAITED}s)"
  done

  if [ "$READY" != true ]; then
    echo -e "      ${RED}❌ Embedding service failed to become ready in ${MAX_WAIT}s${NC}"
    exit 1
  fi
fi

# ── 2. Start Next.js App ────────────────────────────────────────────────
if [ "$SKIP_NEXTJS" = false ]; then
  echo -e "\n${YELLOW}[2/3] Starting Next.js Dev Server on http://localhost:3000...${NC}"
  npm run dev &
  NEXT_PID=$!
  sleep 2
  echo -e "      ${GREEN}✅ Next.js started (PID: ${NEXT_PID})${NC}"
else
  echo -e "\n${CYAN}[2/3] Skipping Next.js (--skip-nextjs)${NC}"
fi

# ── 3. Start Ingestion Worker ───────────────────────────────────────────
if [ "$SKIP_WORKER" = false ]; then
  echo -e "\n${YELLOW}[3/3] Starting Python Ingestion Worker...${NC}"
  cd "$SCRIPT_DIR/optimized-worker"
  python -m worker.main &
  WORKER_PID=$!
  cd "$SCRIPT_DIR"
  echo -e "      ${GREEN}✅ Ingestion Worker started (PID: ${WORKER_PID})${NC}"
else
  echo -e "\n${CYAN}[3/3] Skipping Ingestion Worker (--skip-worker)${NC}"
fi

# ── Ready Summary ───────────────────────────────────────────────────────
echo -e "\n${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║               All requested services are running!          ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  • Embedding Service: ${LOCAL_EMBEDDING_URL}/health        ║${NC}"
if [ "$SKIP_NEXTJS" = false ]; then
echo -e "${GREEN}║  • Web Application:   http://localhost:3000               ║${NC}"
fi
if [ "$SKIP_WORKER" = false ]; then
echo -e "${GREEN}║  • Ingestion Worker:  Active (polling queue)               ║${NC}"
fi
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Press [Ctrl+C] to stop all services simultaneously.       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}\n"

# Wait for background processes
wait
