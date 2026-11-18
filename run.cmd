@echo off
rem Open a separate Firefox with the extension loaded, to try it by hand. It uses a fresh,
rem empty profile (no logins, no history) and deletes it when that Firefox closes; your own
rem Firefox and its profile are not touched. Edits to extension\ reload it on the fly.
rem Close it with Ctrl+C here (closing the window works too).
rem Extra arguments go to web-ext run, for example:  run.cmd --start-url https://www.youtube.com
setlocal
cd /d "%~dp0"
if not exist node_modules\web-ext\bin\web-ext.js (
  echo web-ext is missing. Run setup.cmd first.
  exit /b 1
)
node node_modules\web-ext\bin\web-ext.js run --source-dir extension %*
