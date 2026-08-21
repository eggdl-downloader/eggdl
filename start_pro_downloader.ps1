# Pro Downloader Launcher (PowerShell)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path "$ScriptDir\backend"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "             PRO DOWNLOADER - PRO MAX EDITION           " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$PythonPath = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
if (-not (Test-Path $PythonPath)) {
    $PythonPath = "python"
}

Write-Host "[1/2] Opening browser at http://localhost:8000 ..." -ForegroundColor Yellow
Start-Process "http://localhost:8000"

Write-Host "[2/2] Starting server at http://localhost:8000 ..." -ForegroundColor Green
& $PythonPath -m uvicorn app:app --host 0.0.0.0 --port 8000
