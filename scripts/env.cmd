@echo off
rem Shared environment for every script in this folder. The whole toolchain lives on D:\dev (C: has no room).
set "JAVA_HOME=D:\dev\jdk-17\jdk-17.0.20.1+1"
set "ANDROID_HOME=D:\dev\android-sdk"
set "ANDROID_SDK_ROOT=D:\dev\android-sdk"
set "ANDROID_USER_HOME=D:\dev\.android"
set "ANDROID_AVD_HOME=D:\dev\.android\avd"
set "GRADLE_USER_HOME=D:\dev\gradle-cache"
set "npm_config_cache=D:\dev\npm-cache"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\emulator;%PATH%"
for %%i in ("%~dp0..") do set "ROOT=%%~fi"
