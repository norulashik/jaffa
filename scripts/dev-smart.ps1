$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$healthScript = Join-Path $scriptDir "backend-health-check.ps1"
$nodemonCmd = Join-Path $PSScriptRoot "..\\node_modules\\.bin\\nodemon.cmd"

& powershell -ExecutionPolicy Bypass -File $healthScript

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "Reusing the existing backend on port 5000."
  Write-Host "Stop that process first if you want to restart with new code."
  exit 0
}

Write-Host ""
Write-Host "No healthy backend is running on port 5000. Starting a new dev server..."
& $nodemonCmd --exec ts-node src/index.ts
exit $LASTEXITCODE
