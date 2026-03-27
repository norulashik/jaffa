$ErrorActionPreference = "Stop"

$healthUrl = "http://localhost:5000/api/health"

try {
  $response = Invoke-WebRequest -UseBasicParsing $healthUrl
  $payload = $response.Content | ConvertFrom-Json

  if ($response.StatusCode -eq 200 -and $payload.status -eq "ok") {
    Write-Host "JAFFA backend is already healthy on port 5000."
    Write-Host "Health URL: $healthUrl"
    if ($payload.timestamp) {
      Write-Host "Timestamp: $($payload.timestamp)"
    }
    exit 0
  }

  Write-Host "Port 5000 responded, but it did not look like a healthy JAFFA backend."
  exit 1
} catch {
  Write-Host "No healthy JAFFA backend detected on port 5000."
  exit 1
}
