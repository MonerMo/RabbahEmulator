@echo off
rem Every test of the project: 29 Kotlin + 113 Jest. Nothing needs a device.
setlocal
call "%~dp0env.cmd"
echo === [1/3] Kotlin library: core, testing, transport-mdb ===
cd /d "%ROOT%\device-lib"
call .\gradlew.bat :core:test :testing:test :transport-mdb:testDebugUnitTest --offline
if errorlevel 1 exit /b 1
echo === [2/3] Kotlin Turbo Module (built through the app) ===
cd /d "%ROOT%\rn-app\android"
call .\gradlew.bat :rabbah_mdb-device:testDebugUnitTest --offline
if errorlevel 1 exit /b 1
echo === [3/3] TypeScript: types, then Jest ===
cd /d "%ROOT%\rn-app"
call npx tsc --noEmit
if errorlevel 1 exit /b 1
call npx jest
if errorlevel 1 exit /b 1
echo.
echo ALL GREEN: 3 + 8 + 11 + 7 Kotlin tests, 113 Jest tests.
endlocal
