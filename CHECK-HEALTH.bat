@echo off
echo ================================================
echo  PromptAI Work+ Health Check - Employee PC
echo ================================================
echo.

REM Check node agent count
for /f %%a in ('powershell -command "(Get-WmiObject Win32_Process | Where-Object {$_.Name -eq 'node.exe' -and $_.CommandLine -match 'agent\.js'}).Count" 2^>nul') do set AGENTS=%%a
echo Node agents running: %AGENTS% (should be 1)
if "%AGENTS%"=="1" (echo   STATUS: OK) else (echo   STATUS: WARNING - run STOP-APP.bat then START-APP.bat)

REM Check port 4000
netstat -ano 2>nul | findstr ":4000 " | findstr "LISTENING" >nul
if %errorlevel%==0 (echo Port 4000: LISTENING OK) else (echo Port 4000: NOT LISTENING - agent may have crashed)

REM Check role
echo.
echo Role file:
type "%USERPROFILE%\.promptai-workplus\role.json" 2>nul

REM Check boss connection
echo.
echo Boss connection:
curl http://localhost:4000/api/ping -UseBasicParsing 2>nul | findstr "ok"

echo.
echo My dashboard: http://localhost:4000
echo ================================================
pause
