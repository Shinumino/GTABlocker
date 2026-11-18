@echo off
rem Run the tests: micro first (a few seconds), then macro (real Firefox, headless, about half a
rem minute), which runs only if micro is green. A run that finds no test is red too.
rem Anything after the command is passed to node --test instead, so the narrow run is cheap:
rem   test.cmd micro
rem   test.cmd tests\micro\check-repo.test.mjs
rem   test.cmd --test-name-pattern="restarted" tests\macro\harness-cleanup.test.mjs
rem The work is in tools\test.mjs. Keep this file to one line: cmd.exe loses the exit code of
rem a red step inside an if-block, which is how this file once said "green" for a red run.
setlocal
cd /d "%~dp0"
node tools\test.mjs %*
