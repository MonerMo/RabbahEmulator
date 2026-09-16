@echo off
rem Hardware day: installs the CM30 APK on the connected terminal, opens it and shows its log.
setlocal
call "%~dp0env.cmd"
set "APK=%ROOT%\dist\cm30-mdb-bridge-armeabi-v7a-debug.apk"
if not exist "%APK%" (
  echo Build it first:  scripts\build-apk.cmd
  exit /b 1
)
echo Connected devices (the CM30 must be listed as "device"; enable USB debugging on it):
adb devices
adb install -r "%APK%"
if errorlevel 1 exit /b 1
adb shell am start -n com.rnapp/.MainActivity
echo.
echo On the screen: choose "real (CM30)", press Connect. The link chip must turn "connected".
echo Log follows (Ctrl+C to stop):
adb logcat -s ReactNativeJS:V AndroidRuntime:E MdbSlave:V MdbSlaveNative:V
endlocal
