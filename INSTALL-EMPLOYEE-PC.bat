@echo off
cd /d "%~dp0"
echo ================================================
echo  Prompt AI Work+ v14 - Employee PC Setup
echo ================================================
echo.

REM ── Disable watchdog tasks ───────────────────────────────────────────────
schtasks /change /tn "PromptAIWatchdog" /disable >nul 2>&1
schtasks /change /tn "PromptAIBoot" /disable >nul 2>&1
schtasks /end /tn "PromptAIWatchdog" >nul 2>&1
schtasks /end /tn "PromptAIBoot" >nul 2>&1

REM ── Kill everything cleanly ───────────────────────────────────────────────
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im electron.exe >nul 2>&1
rmdir "%~dp0promptai.lock.dir" >nul 2>&1
timeout /t 2 /nobreak >nul

REM ── Set role to child ─────────────────────────────────────────────────────
if not exist "%USERPROFILE%\.promptai-workplus" mkdir "%USERPROFILE%\.promptai-workplus"
echo {"role":"child","dept":"sales"} > "%USERPROFILE%\.promptai-workplus\role.json"
echo {"dept":"sales"} > "%USERPROFILE%\.promptai-workplus\dept.json"
echo Role set to: Employee (child)

REM ── Install dependencies ─────────────────────────────────────────────────
echo Installing dependencies...
npm install

REM ── Add to Windows startup ───────────────────────────────────────────────
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "PromptAIWorkPlus" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "PromptAIWorkPlus" /t REG_SZ /d "\"%~dp0START-APP.bat\"" /f >nul 2>&1

echo.
echo ================================================
echo  Employee PC setup complete!
echo  Role      : Employee (child)
echo  Dashboard : http://localhost:4000
echo  Auto-start: Enabled
echo ================================================
echo.
echo Starting agent now...
call "%~dp0START-APP.bat"
