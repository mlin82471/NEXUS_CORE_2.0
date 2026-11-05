@echo off
chcp 65001 >nul
title NEXUS CORE 2.0 Engine
echo ============================================================
echo   ⚡ Starting NEXUS CORE 2.0 Engine (FastAPI + B1 Engine)
echo ============================================================
cd /d "%~dp0"
python scripts\start_server.py
pause
