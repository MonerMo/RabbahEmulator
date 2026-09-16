@echo off
rem Starts the emulator (cm30_emu), builds the x86_64 app, installs it, starts Metro and opens the app.
rem   scripts\run-emulator.cmd              with Metro: edit TypeScript, press r in Metro's window to reload
rem   scripts\run-emulator.cmd standalone   the bundled form, exactly what the CM30 gets (no Metro)
setlocal
call "%~dp0env.cmd"
adb get-state >nul 2>&1
if errorlevel 1 (
  echo Starting the emulator...
  start "" "%ANDROID_HOME%\emulator\emulator.exe" -avd cm30_emu -no-boot-anim -gpu auto
)
echo Waiting for Android to boot...
adb wait-for-device
:boot
adb shell getprop sys.boot_completed 2>nul | findstr /b "1" >nul
if errorlevel 1 (timeout /t 3 /nobreak >nul & goto boot)

cd /d "%ROOT%\rn-app\android"
if /i "%~1"=="standalone" (
  call .\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64 -PbundleJs --offline
) else (
  call .\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=x86_64 --offline
)
if errorlevel 1 exit /b 1
adb install -r app\build\outputs\apk\debug\app-debug.apk
if errorlevel 1 exit /b 1

if /i not "%~1"=="standalone" (
  adb reverse tcp:8081 tcp:8081
  start "Metro" /d "%ROOT%\rn-app" cmd /k npx react-native start
  timeout /t 8 /nobreak >nul
)
adb shell am start -n com.rnapp/.MainActivity
echo.
echo The app is open on the emulator. Demo order: Connect - RESET - SETUP - ENABLE - Begin session - VEND REQUEST - VEND SUCCESS - SESSION COMPLETE.
endlocal
