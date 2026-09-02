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
  # 1. Kill child process trees (e.g. node subprocesses spawned by npm)
  if [ -n "${NEXT_PID}" ]; then
    pkill -P "${NEXT_PID}" 2>/dev/null || true
    kill "${NEXT_PID}" 2>/dev/null || true
  fi
  if [ -n "${WORKER_PID}" ]; then
    pkill -P "${WORKER_PID}" 2>/dev/null || true
    kill "${WORKER_PID}" 2>/dev/null || true
  fi
  if [ -n "${EMB_PID}" ]; then
    pkill -P "${EMB_PID}" 2>/dev/null || true
    kill "${EMB_PID}" 2>/dev/null || true
  fi
  sleep 1

  # 2. Force-kill any stubborn remaining processes
  if [ -n "${NEXT_PID}" ]; then
    pkill -9 -P "${NEXT_PID}" 2>/dev/null || true
    kill -9 "${NEXT_PID}" 2>/dev/null || true
  fi
  if [ -n "${WORKER_PID}" ]; then
    pkill -9 -P "${WORKER_PID}" 2>/dev/null || true
    kill -9 "${WORKER_PID}" 2>/dev/null || true
  fi
  if [ -n "${EMB_PID}" ]; then
    pkill -9 -P "${EMB_PID}" 2>/dev/null || true
    kill -9 "${EMB_PID}" 2>/dev/null || true
  fi

  # 3. Stop PostgreSQL container and Docker daemon if local database was used
  if [ "${LOCAL_DOCKER_USED:-false}" = true ]; then
    if command -v docker >/dev/null 2>&1; then
      echo -e "${YELLOW}Stopping siksha-postgres container...${NC}"
      docker stop siksha-postgres >/dev/null 2>&1 || true

      echo -e "${YELLOW}Stopping Docker daemon (${OS_TYPE})...${NC}"
      if [ "$OS_TYPE" = "mac" ]; then
        osascript -e 'quit app "Docker"' >/dev/null 2>&1 || killall "Docker Desktop" >/dev/null 2>&1 || true
      elif [ "$OS_TYPE" = "linux" ]; then
        systemctl --user stop docker 2>/dev/null || sudo systemctl stop docker 2>/dev/null || true
      elif [ "$OS_TYPE" = "windows" ]; then
        taskkill //F //IM "Docker Desktop.exe" >/dev/null 2>&1 || true
      fi
    fi
  fi

  wait 2>/dev/null || true
  echo -e "${GREEN}All services stopped cleanly.${NC}"
}
trap cleanup EXIT INT TERM HUP

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

# Detect Operating System for OS-specific fallbacks
UNAME_OS="$(uname -s 2>/dev/null || echo 'Unknown')"
case "${UNAME_OS}" in
  Darwin*)              OS_TYPE="mac" ;;
  Linux*)               OS_TYPE="linux" ;;
  MINGW*|MSYS*|CYGWIN*) OS_TYPE="windows" ;;
  *)                    OS_TYPE="generic" ;;
esac

# ── 0. Check & Initialize PostgreSQL (Docker or Cloud) ───────────────────
LOCAL_DOCKER_USED=false
CURRENT_DB_URL=$(grep "^DATABASE_URL=" .env.local 2>/dev/null | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" || echo "")
if [[ "$CURRENT_DB_URL" == *"localhost"* ]] || [[ "$CURRENT_DB_URL" == *"127.0.0.1"* ]]; then
  LOCAL_DOCKER_USED=true
  echo -e "\n${YELLOW}[0/4] Checking Local PostgreSQL (Docker)...${NC}"
  if command -v docker >/dev/null 2>&1; then
    if ! docker info >/dev/null 2>&1; then
      echo -e "${CYAN}   Attempting to start Docker daemon (${OS_TYPE})...${NC}"
      if [ "$OS_TYPE" = "mac" ]; then
        open -a Docker 2>/dev/null || true
      elif [ "$OS_TYPE" = "linux" ]; then
        systemctl --user start docker 2>/dev/null || sudo systemctl start docker 2>/dev/null || sudo service docker start 2>/dev/null || true
      elif [ "$OS_TYPE" = "windows" ]; then
        cmd.exe /c start "" "Docker Desktop" 2>/dev/null || true
      fi
      echo -e "   Waiting for Docker daemon to initialize..."
      DOCKER_RETRIES=20
      until docker info >/dev/null 2>&1 || [ $DOCKER_RETRIES -eq 0 ]; do
        sleep 2
        DOCKER_RETRIES=$((DOCKER_RETRIES - 1))
      done
    fi

    if docker info >/dev/null 2>&1; then
      if ! docker ps --format '{{.Names}}' | grep -q "^siksha-postgres$"; then
        if docker ps -a --format '{{.Names}}' | grep -q "^siksha-postgres$"; then
          echo -e "${CYAN}   Starting existing siksha-postgres container...${NC}"
          docker start siksha-postgres >/dev/null
        else
          echo -e "${CYAN}   Starting new siksha-postgres container via docker compose...${NC}"
          docker compose up -d postgres >/dev/null
        fi
      else
        echo -e "${GREEN}   ✅ siksha-postgres container is already running.${NC}"
      fi

      echo -e "      Waiting for PostgreSQL on port 5432 to be ready..."
      RETRIES=15
      # Universal Python socket check (works on macOS, Linux, and Windows without nc/netcat)
      until python3 -c "import socket; s=socket.socket(); s.settimeout(1); s.connect(('127.0.0.1', 5432)); s.close()" 2>/dev/null || [ $RETRIES -eq 0 ]; do
        sleep 1
        RETRIES=$((RETRIES - 1))
      done

      if [ $RETRIES -gt 0 ]; then
        echo -e "${GREEN}   ✅ Local PostgreSQL is accepting connections on localhost:5432.${NC}"
      else
        echo -e "${RED}   ⚠️ Timed out waiting for PostgreSQL port 5432.${NC}"
      fi
    else
      echo -e "${RED}❌ Docker daemon is not running!${NC}"
      echo -e "   Please start Docker Desktop/daemon to use local PostgreSQL, or switch DATABASE_URL in .env.local to NeonDB."
      exit 1
    fi
  else
    echo -e "${RED}❌ Docker is not installed on this system.${NC}"
    exit 1
  fi
else
  echo -e "\n${CYAN}[0/4] Using Cloud Database:${NC} ${CURRENT_DB_URL%%@*}@... (NeonDB)"
fi

# Ensure Python virtual environment exists (handle macOS/Linux vs Windows path conventions)
VENV_ACTIVATE=""
if [ -f "optimized-worker/.venv/bin/activate" ]; then
  VENV_ACTIVATE="optimized-worker/.venv/bin/activate"
elif [ -f "optimized-worker/.venv/Scripts/activate" ]; then
  VENV_ACTIVATE="optimized-worker/.venv/Scripts/activate"
fi

if [ -z "$VENV_ACTIVATE" ]; then
  echo -e "${CYAN}🔧 Creating Python virtual environment in optimized-worker/.venv...${NC}"
  python3 -m venv optimized-worker/.venv || {
    echo -e "${RED}❌ Failed to create virtualenv. On Ubuntu/Debian, install with: sudo apt install python3-venv python3-pip${NC}"
    exit 1
  }
  if [ -f "optimized-worker/.venv/bin/activate" ]; then
    VENV_ACTIVATE="optimized-worker/.venv/bin/activate"
  else
    VENV_ACTIVATE="optimized-worker/.venv/Scripts/activate"
  fi
  source "$VENV_ACTIVATE"
  echo -e "${CYAN}   Installing worker dependencies...${NC}"
  pip install -q -r optimized-worker/requirements.txt
  echo -e "${CYAN}   Installing embedding service dependencies...${NC}"
  pip install -q -r embedding-service/requirements.txt
else
  source "$VENV_ACTIVATE"
fi

# Ensure embedding-service has .venv symlink or folder reference
if [ ! -L "embedding-service/.venv" ] && [ ! -d "embedding-service/.venv" ]; then
  ln -sf ../optimized-worker/.venv embedding-service/.venv 2>/dev/null || true
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
export RERANKER_MODEL="cross-encoder/ms-marco-MiniLM-L-6-v2"

# Universal port check via Python socket (replaces macOS-only lsof with zero external dependencies)
PORT_IN_USE=false
if python3 -c "import socket; s=socket.socket(); s.settimeout(1); s.connect(('${EMBEDDING_HOST}', ${EMBEDDING_PORT})); s.close()" 2>/dev/null; then
  PORT_IN_USE=true
fi

if [ "$PORT_IN_USE" = true ]; then
  ALREADY_RUNNING=$(curl -s "${LOCAL_EMBEDDING_URL}/health" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
  if [ "$ALREADY_RUNNING" = "ready" ]; then
    echo -e "${GREEN}ℹ️  Embedding & Reranker service already running & ready on ${LOCAL_EMBEDDING_URL}.${NC}"
  else
    echo -e "${RED}❌ Port ${EMBEDDING_PORT} is in use by another process. Please free it first.${NC}"
    exit 1
  fi
else
  # ── 1. Start Embedding Service ──────────────────────────────────────────
  echo -e "\n${YELLOW}[1/4] Starting Embedding & Reranker Service on ${LOCAL_EMBEDDING_URL}...${NC}"
  echo -e "      Embedding Model: intfloat/multilingual-e5-small (384-dim)"
  echo -e "      Reranker Model:  cross-encoder/ms-marco-MiniLM-L-6-v2"
  echo -e "      Initializing models (takes ~6-8 seconds on M-series)..."

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
  echo -e "\n${YELLOW}[2/4] Starting Next.js Dev Server on http://localhost:3000...${NC}"
  npm run dev &
  NEXT_PID=$!
  sleep 2
  echo -e "      ${GREEN}✅ Next.js started (PID: ${NEXT_PID})${NC}"
else
  echo -e "\n${CYAN}[2/4] Skipping Next.js (--skip-nextjs)${NC}"
fi

# ── 3. Start Ingestion Worker ───────────────────────────────────────────
if [ "$SKIP_WORKER" = false ]; then
  echo -e "\n${YELLOW}[3/4] Starting Python Ingestion Worker...${NC}"
  cd "$SCRIPT_DIR/optimized-worker"
  python -m worker.main &
  WORKER_PID=$!
  cd "$SCRIPT_DIR"
  echo -e "      ${GREEN}✅ Ingestion Worker started (PID: ${WORKER_PID})${NC}"
else
  echo -e "\n${CYAN}[3/4] Skipping Ingestion Worker (--skip-worker)${NC}"
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
