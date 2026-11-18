@echo off
rem One-time (and after package-lock.json changes): install the development tools into
rem node_modules, exactly as the lock file pins them. Nothing is installed outside this folder.
setlocal
cd /d "%~dp0"
call npm ci --no-fund || exit /b 1
echo Ready. Next: check.cmd
