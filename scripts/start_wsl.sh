#!/usr/bin/env bash
# ============================================================
# NEXUS CORE 2.0 — WSL2 Ubuntu Startup Script
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "============================================================"
echo "⚡ Starting NEXUS CORE 2.0 in WSL2 Ubuntu..."
echo "📁 Project Root: ${PROJECT_ROOT}"
echo "============================================================"

cd "${PROJECT_ROOT}"

# Check virtual environment or system python
if [ -d "/home/${USER}/nexus_venv" ]; then
    PYTHON_BIN="/home/${USER}/nexus_venv/bin/python"
elif [ -d "${PROJECT_ROOT}/.venv" ]; then
    PYTHON_BIN="${PROJECT_ROOT}/.venv/bin/python"
else
    PYTHON_BIN="python3"
fi

echo "🐍 Using Python: $("${PYTHON_BIN}" --version 2>&1)"

# Start server
"${PYTHON_BIN}" scripts/start_server.py
