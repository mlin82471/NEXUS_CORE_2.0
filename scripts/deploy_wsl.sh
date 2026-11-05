#!/usr/bin/env bash
# ==============================================================================
# NEXUS CORE 2.0 — WSL2 Ubuntu & Linux Production Deployment Script
# Automatically provisions Python environment, installs dependencies, verifies
# database integrity, executes full regression tests, and launches the server.
# ==============================================================================
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
NC="\033[0m"

echo -e "${BOLD}${BLUE}============================================================${NC}"
echo -e "${BOLD}${BLUE}  🚀 NEXUS CORE 2.0 — WSL2 / Linux Automated Deployment    ${NC}"
echo -e "${BOLD}${BLUE}============================================================${NC}"

# 1. Check WSL / Linux OS environment
OS_INFO=$(uname -s)
if [[ "${OS_INFO}" != "Linux" ]]; then
    echo -e "${RED}[ERROR] This deployment script is designed for Linux / WSL2 Ubuntu.${NC}"
    exit 1
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_DIR}"
echo -e "${GREEN}✓ Project directory:${NC} ${PROJECT_DIR}"

# 2. Check and provision Python 3
if ! command -v python3 &>/dev/null; then
    echo -e "${YELLOW}Installing python3 and python3-venv...${NC}"
    sudo apt-get update -y && sudo apt-get install -y python3 python3-pip python3-venv curl libpq-dev
fi

PY_VER=$(python3 --version)
echo -e "${GREEN}✓ Python runtime:${NC} ${PY_VER}"

# 3. Create or activate isolated virtual environment
VENV_PATH="${PROJECT_DIR}/.venv"
if [[ ! -d "${VENV_PATH}" ]]; then
    echo -e "${YELLOW}Creating python virtual environment at .venv...${NC}"
    python3 -m venv "${VENV_PATH}"
fi

source "${VENV_PATH}/bin/activate"
echo -e "${GREEN}✓ Virtual environment activated.${NC}"

# 4. Install requirements
echo -e "${YELLOW}Installing / upgrading Python dependencies...${NC}"
pip install --upgrade pip -q
pip install -r requirements.txt -q
echo -e "${GREEN}✓ Dependencies installed successfully.${NC}"

# 5. Initialize environment variables
if [[ ! -f ".env" ]]; then
    echo -e "${YELLOW}Generating .env from .env.example...${NC}"
    cp .env.example .env
fi

# 6. Database schema check and migration
echo -e "${YELLOW}Verifying SQLite WAL schema and integrity...${NC}"
python3 -c "from app.database import engine, Base, ensure_sqlite_schema; ensure_sqlite_schema(engine, Base)"
echo -e "${GREEN}✓ Database initialized and ready.${NC}"

# 7. Run integrity verification suite
echo -e "${YELLOW}Running B0 v7 contract tests (26 assertions)...${NC}"
python3 docs/test_b0_v7.py
echo -e "${GREEN}✓ All B0 v7 contract tests passed!${NC}"

echo -e "${YELLOW}Running core Pytest regression suite...${NC}"
python3 -m pytest tests/test_infrastructure.py tests/test_evolution_sweeper.py -q
echo -e "${GREEN}✓ Pytest regression suite verified!${NC}"

# 8. Launch Service
echo -e "${BOLD}${BLUE}============================================================${NC}"
echo -e "${BOLD}${GREEN}  ✅ NEXUS CORE 2.0 Deployment Ready!                      ${NC}"
echo -e "  🌐 Windows Browser UI : ${BOLD}http://localhost:8000/dashboard/${NC}"
echo -e "  📚 API Documentation  : ${BOLD}http://localhost:8000/docs${NC}"
echo -e "  🧬 Autonomous Sweeper : ${BOLD}ACTIVE (300s interval)${NC}"
echo -e "${BOLD}${BLUE}============================================================${NC}"

# Launch FastAPI server
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
