@echo off
cd /d C:\PromptX
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im electron.exe >nul 2>&1
timeout /t 2 /nobreak >nul
rmdir /s /q "%USERPROFILE%\.promptai-workplus\electron" >nul 2>&1
mkdir "%USERPROFILE%\.promptai-workplus\electron" >nul 2>&1
echo Starting agent...
start /min "PromptAI-Agent" cmd /c "cd /d C:\PromptX && node agent.js"
timeout /t 6 /nobreak >nul
echo Launching Work+ app...
C:\PromptX\node_modules\electron\dist\electron.exe C:\PromptX
