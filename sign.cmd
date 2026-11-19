@echo off
rem Signs the extension with Mozilla for self-distribution (unlisted: never published, only
rem signed) and writes the signed .xpi to web-ext-artifacts\. It sends nothing without both
rem keys in .env, for a version not higher than one signed already, for an extension folder not
rem exactly as committed, or when the full check (check.cmd) fails. "sign.cmd --keys" only says
rem whether .env holds the keys as it should. The keys: docs\secrets.md. The work is in
rem tools\sign_rules.mjs.
setlocal
cd /d "%~dp0"
node tools\sign.mjs %*
set CODE=%ERRORLEVEL%
rem Started by a double-click, the window would close before the result could be read.
echo %cmdcmdline% | find /i "%~nx0" >nul && pause
exit /b %CODE%
