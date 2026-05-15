@echo off
setlocal
cd /d "%~dp0"
echo Starting TrackVault...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener = Get-NetTCPConnection -LocalPort 8096 -State Listen -ErrorAction SilentlyContinue; if (-not $listener) { Start-Process -FilePath 'cmd.exe' -ArgumentList '/k','npm start' -WorkingDirectory (Get-Location).Path; Start-Sleep -Seconds 2 }; Start-Process 'http://localhost:8096/app'"
endlocal
