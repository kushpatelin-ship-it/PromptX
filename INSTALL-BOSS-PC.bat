@echo off
cd /d "%~dp0"
echo ================================================
echo  Prompt AI Work+ v14 - Boss PC Setup
echo ================================================
echo.

REM ── Disable watchdog tasks ───────────────────────────────────────────────
schtasks /change /tn "PromptAIWatchdog" /disable >nul 2>&1
schtasks /change /tn "PromptAIBoot" /disable >nul 2>&1
schtasks /end /tn "PromptAIWatchdog" >nul 2>&1
schtasks /end /tn "PromptAIBoot" >nul 2>&1

REM ── Kill everything ───────────────────────────────────────────────────────
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im electron.exe >nul 2>&1
rmdir "%~dp0promptai.lock.dir" >nul 2>&1

REM ── Remove any BlockBoss firewall rules left from child mode ──────────────
netsh advfirewall firewall delete rule name="PromptAI-BlockBoss" >nul 2>&1

timeout /t 2 /nobreak >nul

REM ── LOCK role to parent - boss PC always stays as parent ─────────────────
if not exist "%USERPROFILE%\.promptai-workplus" mkdir "%USERPROFILE%\.promptai-workplus"
echo {"role":"parent"} > "%USERPROFILE%\.promptai-workplus\role.json"
echo {"dept":"engineering"} > "%USERPROFILE%\.promptai-workplus\dept.json"
echo Role locked to: Boss (parent)

REM ── Install dependencies ─────────────────────────────────────────────────
echo Installing dependencies...
npm install

REM ── Add to Windows startup ───────────────────────────────────────────────
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "PromptAIWorkPlus" /t REG_SZ /d "\"%~dp0START-APP.bat\"" /f >nul 2>&1

echo.
echo ================================================
echo  Boss PC setup complete!
echo  Role      : Boss (parent) - LOCKED
echo  Dashboard : http://localhost:4000
echo  Auto-start: Enabled
echo ================================================
echo.
echo Starting now...
call "%~dp0START-APP.bat"
