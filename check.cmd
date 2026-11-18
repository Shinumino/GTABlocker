@echo off
rem The gate. There is no CI service behind this project, so this file is the whole of it:
rem no keys in the files, every micro test green, Mozilla's linter clean, no known-vulnerable
rem dependency, every macro test green. The signing command (step 7, not built yet) will run
rem this first and send nothing on a red run. The work is in tools\check.mjs.
setlocal
cd /d "%~dp0"
node tools\check.mjs
