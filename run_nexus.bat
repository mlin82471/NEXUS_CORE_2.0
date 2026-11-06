@echo off
setlocal enabledelayedexpansion
title NEXUS CORE 2.0 Launcher

echo ============================================================
echo   NEXUS CORE 2.0 - Enterprise Multi-Agent Engine Launcher
echo ============================================================
echo.

:: 1. Locate Project Root Directory
set "PROJECT_DIR=%~dp0"
if exist "%PROJECT_DIR%scripts\start_server.py" (
    set "PROJECT_ROOT=%PROJECT_DIR%"
) else (
    set "PROJECT_ROOT=C:\Users\linhr\.gemini\antigravity\scratch\nexus_core_2.0\NEXUS_CORE_2.0\"
)

if not exist "%PROJECT_ROOT%scripts\start_server.py" (
    echo [ERROR] Project root not found at: %PROJECT_ROOT%
    echo Please ensure NEXUS CORE 2.0 files are present.
    echo.
    pause
    exit /b 1
)

cd /d "%PROJECT_ROOT%"
echo [OK] Project Directory: %CD%

:: 2. Detect Python Binary
set "PYTHON_BIN="
if exist "C:\Python315\python.exe" (
    set "PYTHON_BIN=C:\Python315\python.exe"
) else (
    where python >nul 2>&1
    if !errorlevel! equ 0 (
        set "PYTHON_BIN=python"
    ) else (
        where py >nul 2>&1
        if !errorlevel! equ 0 (
            set "PYTHON_BIN=py -3"
        )
    )
)

if "%PYTHON_BIN%"=="" (
    echo [ERROR] Python environment not detected!
    echo Please install Python 3.10+ or check system PATH.
    echo.
    pause
    exit /b 1
)

echo [OK] Using Python: %PYTHON_BIN%
"%PYTHON_BIN%" --version

:: 3. Launch the Server
echo.
echo ============================================================
echo   Starting NEXUS CORE 2.0 Server...
echo   Dashboard will automatically open at:
echo   http://127.0.0.1:8000/dashboard/
echo.
echo   Press Ctrl + C to stop the server anytime.
echo ============================================================
echo.

"%PYTHON_BIN%" scripts\start_server.py

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server exited with status code %errorlevel%.
)

echo.
echo ============================================================
echo Server process has stopped. Press any key to close this window.
echo ============================================================
pause
