@echo off
chcp 65001 > nul
title NEXUS CORE 2.0 — Push to GitHub

echo ============================================================
echo   🚀 NEXUS CORE 2.0 — GitHub 远程仓库推送助手
echo ============================================================
echo.

set /p REPO_URL="请输入您的 GitHub 仓库 URL (例如 https://github.com/username/nexus-core-2.0.git): "

if "%REPO_URL%"=="" (
    echo [错误] 仓库 URL 不能为空！
    pause
    exit /b 1
)

cd /d "%~dp0\.."

echo [执行] 正在配置远程仓库 origin...
git remote remove origin > nul 2>&1
git remote add origin %REPO_URL%

echo [执行] 正在推送到 main 分支...
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ============================================================
    echo   ✅ 上传成功！NEXUS CORE 2.0 已成功推送到 GitHub！
    echo ============================================================
) else (
    echo.
    echo [提示] 推送未完成，请检查您的 GitHub 认证（Personal Access Token 或 SSH 密钥配置）。
)

pause
