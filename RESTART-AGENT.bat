@echo off
cd /d "%~dp0"
taskkill /f /im node.exe >nul 2>&1
timeout /t 2 >nul
node agent.js
