@echo off
cd /d "%~dp0.."
echo Starting YouVi Download Server...
echo Working directory: %CD%
echo.
node download/download-server.js
pause
