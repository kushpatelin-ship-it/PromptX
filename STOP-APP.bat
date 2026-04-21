@echo off
cd /d "%~dp0"
echo Stopping PromptAI Work+...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im electron.exe >nul 2>&1
taskkill /fi "WINDOWTITLE eq PromptAI-Agent" >nul 2>&1
rmdir "%~dp0promptai.lock.dir" >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":4000 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
echo Stopped.
timeout /t 1 /nobreak >nul
exit /b 0
