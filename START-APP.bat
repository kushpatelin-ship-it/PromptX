@echo off
cd /d "%~dp0"
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im electron.exe >nul 2>&1
rmdir "%~dp0promptai.lock.dir" >nul 2>&1
timeout /t 2 /nobreak >nul
mkdir "%~dp0promptai.lock.dir" >nul 2>&1
set ROLE=parent
if exist "%USERPROFILE%\.promptai-workplus\role.json" (
  for /f "tokens=*" %%i in ('type "%USERPROFILE%\.promptai-workplus\role.json"') do set JSON=%%i
  echo %JSON% | findstr /i "child" >nul && set ROLE=child
)
if /i "%ROLE%"=="child" goto EMPLOYEE
:BOSS
echo {"role":"parent"} > "%USERPROFILE%\.promptai-workplus\role.json"
netsh advfirewall firewall delete rule name="PromptAI-BlockBoss" >nul 2>&1
echo PromptAI Work+ - Boss PC
echo Starting agent...
start /min "PromptAI-Agent" cmd /c "cd /d ""%~dp0"" && node agent.js"
set COUNT=0
:WAITB
set /a COUNT+=1
if %COUNT% gtr 25 goto FAIL
netstat -ano 2>nul | findstr ":4000 " | findstr "LISTENING" >nul
if %errorlevel%==1 (echo Waiting %COUNT%/25 & timeout /t 1 /nobreak >nul & goto WAITB)
echo Agent ready!
timeout /t 2 /nobreak >nul
explorer "http://localhost:4000"
goto END
:EMPLOYEE
echo PromptAI Work+ - Employee PC
echo Starting agent silently...
start /min "PromptAI-Agent" cmd /c "cd /d ""%~dp0"" && node agent.js"
set COUNT=0
:WAITE
set /a COUNT+=1
if %COUNT% gtr 25 goto FAIL
netstat -ano 2>nul | findstr ":4000 " | findstr "LISTENING" >nul
if %errorlevel%==1 (echo Waiting %COUNT%/25 & timeout /t 1 /nobreak >nul & goto WAITE)
echo Agent ready! Running silently.
echo Dashboard: http://localhost:4000
goto END
:FAIL
echo ERROR: Agent failed to start
rmdir "%~dp0promptai.lock.dir" >nul 2>&1
pause
exit /b 1
:END
exit /b 0
