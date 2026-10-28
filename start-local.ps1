# Script para iniciar o Second Brain AI localmente SEM Docker (Backend FastAPI + Frontend Vite)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " 🧠 Iniciando Second Brain AI (Modo Local sem Docker)" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Prepara e inicia o Backend em uma nova janela do PowerShell
$BackendDir = Join-Path $ProjectRoot "backend"
if (-not (Test-Path (Join-Path $BackendDir ".venv"))) {
    Write-Host "[1/3] Criando ambiente virtual Python em backend\.venv..." -ForegroundColor Yellow
    python -m venv (Join-Path $BackendDir ".venv")
}

Write-Host "[2/3] Instalando dependencias do Backend e subindo FastAPI (porta 8000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BackendDir'; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt; uvicorn app.main:app --reload --port 8000"

# 2. Prepara e inicia o Frontend em uma nova janela do PowerShell
$FrontendDir = Join-Path $ProjectRoot "frontend"
Write-Host "[3/3] Instalando dependencias do Frontend e subindo Vite PWA (porta 5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$FrontendDir'; npm install; npm run dev"

Write-Host ""
Write-Host "✅ Tudo pronto! Duas janelas foram abertas:" -ForegroundColor Green
Write-Host "   -> Backend API: http://localhost:8000/docs"
Write-Host "   -> App PWA:     http://localhost:5173"
