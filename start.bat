@echo off
title Eclipse Panel
cd /d "%~dp0"
echo =======================================================
echo   🌑 Starting Eclipse Panel on http://localhost:8090
echo =======================================================
node src/index.js
pause
