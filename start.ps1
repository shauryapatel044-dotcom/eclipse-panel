Set-Location $PSScriptRoot
Write-Host "=======================================================" -ForegroundColor Red
Write-Host "  🌑 Starting Eclipse Panel on http://localhost:8090" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Red
node src/index.js
