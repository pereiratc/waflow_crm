# Run the FastAPI app on http://localhost:8000 using Postgres + Redis from Docker.
# Requires Python 3.11+ on PATH. From repo root:  .\scripts\dev-backend-local.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "Starting Postgres and Redis (docker compose)..."
docker compose up -d db redis

Write-Host "Waiting for Postgres to accept connections..."
Start-Sleep -Seconds 4

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "postgresql+psycopg2://waflow:waflow@127.0.0.1:5432/waflow"
}
if (-not $env:REDIS_URL) {
  $env:REDIS_URL = "redis://127.0.0.1:6379/0"
}
if (-not $env:JWT_SECRET) {
  $env:JWT_SECRET = "local-dev-jwt-secret-change-me-32chars-min"
}

Set-Location (Join-Path $repoRoot "apps\backend")

$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) {
  Write-Error "Python not found on PATH. Install Python 3.11+ or use: docker compose up backend"
  exit 1
}

Write-Host "Installing dependencies (if needed)..."
& python -m pip install -q -r requirements.txt

Write-Host "API: http://127.0.0.1:8000  |  Docs: http://127.0.0.1:8000/docs"
& python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
