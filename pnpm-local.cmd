@echo off
set "PATH=%~dp0.tools\node-v24.18.0-win-x64;%PATH%"
set "CI=true"
cd /d "%~dp0"
pnpm.cmd --config.confirmModulesPurge=false %*
