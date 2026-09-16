@echo off
rem One command -> the CM30's APK, JavaScript bundled inside (no Metro, no laptop needed on the machine).
rem   scripts\build-apk.cmd            armeabi-v7a (the CM30)
rem   scripts\build-apk.cmd x86_64     the emulator, same standalone form
setlocal
call "%~dp0env.cmd"
set "ABI=%~1"
if "%ABI%"=="" set "ABI=armeabi-v7a"
echo === Building the standalone debug APK for %ABI% ===
cd /d "%ROOT%\rn-app\android"
call .\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=%ABI% -PbundleJs --offline
if errorlevel 1 (
  echo.
  echo BUILD FAILED. If the message says "No cached version ... offline mode", run once without --offline:
  echo   .\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=%ABI% -PbundleJs
  exit /b 1
)
if not exist "%ROOT%\dist" mkdir "%ROOT%\dist"
copy /y "app\build\outputs\apk\debug\app-debug.apk" "%ROOT%\dist\cm30-mdb-bridge-%ABI%-debug.apk" >nul
echo.
echo APK ready: %ROOT%\dist\cm30-mdb-bridge-%ABI%-debug.apk
endlocal
