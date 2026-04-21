@echo off
echo Removing PromptAI Work+ from Windows startup...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "PromptAIWorkPlus" /f >nul 2>&1
if %errorlevel% == 0 (
    echo Done. App will no longer start automatically with Windows.
) else (
    echo Startup entry not found or already removed.
)
pause
