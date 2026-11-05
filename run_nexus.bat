@echo off
chcp 65001 > nul
title NEXUS CORE 2.0 — Enterprise Multi-Agent Engine

echo ============================================================
echo   🚀 NEXUS CORE 2.0 — 生产级主控系统启动器
echo ============================================================
echo.

:: 1. 检查 Python 运行环境
python --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Python 环境，请先安装 Python 3.10 及以上版本并加入 PATH。
    pause
    exit /b 1
)

:: 2. 设置工作目录为脚本所在根目录
cd /d "%~dp0"
echo [就绪] 工作目录: %CD%

:: 3. 检查必要依赖
echo [检查] 正在验证核心运行库依赖...
python -c "import fastapi, sqlalchemy, httpx, pydantic, uvicorn" > nul 2>&1
if %errorlevel% neq 0 (
    echo [提示] 正在自动安装运行依赖 (requirements.txt)...
    pip install -r requirements.txt
)

:: 4. 延迟 2 秒自动唤起 Windows 浏览器控制台
start "" cmd /c "timeout /t 2 /nobreak > nul && start http://127.0.0.1:8000/dashboard/"

echo.
echo ============================================================
echo   ⚡ 服务正在启动，浏览器将自动打开控制台:
echo   👉 http://127.0.0.1:8000/dashboard/
echo   按 Ctrl + C 可随时安全终止服务。
echo ============================================================
echo.

:: 5. 启动主控服务进程
python scripts/start_server.py

pause
