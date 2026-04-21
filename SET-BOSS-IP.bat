@echo off
cd /d "%~dp0"
echo ================================================
echo  Prompt AI Work+ - Set Boss PC IP
echo ================================================
echo.
echo Run this only if the app shows no data after launch.
echo (Ask your manager for their PC IP address)
echo.

:ASK_IP
set /p BOSS_IP="Enter Boss PC IP address (e.g. 192.168.1.105): "
if "%BOSS_IP%"=="" (
    echo IP address cannot be empty. Please try again.
    goto ASK_IP
)

if not exist "%USERPROFILE%\.promptai-workplus" mkdir "%USERPROFILE%\.promptai-workplus"

echo {"role":"child","dept":"sales","parentIp":"%BOSS_IP%"} > "%USERPROFILE%\.promptai-workplus\role.json"

echo.
echo Boss PC IP saved: %BOSS_IP%
echo Please restart the app using START-APP.bat
echo.
pause
