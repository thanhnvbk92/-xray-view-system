# Script khởi động Backend an toàn cho Xray View System
$port = 8000

# 1. Tìm và tiêu diệt các tiến trình đang chiếm dụng cổng 8000
$connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($connections) {
    foreach ($c in $connections) {
        $procId = $c.OwningProcess
        Write-Host "Stopping process $procId using port $port..." -ForegroundColor Cyan
        taskkill /F /T /PID $procId 2>$null
    }
    Start-Sleep -Seconds 1
}

# 2. Khởi động server
Write-Host "Starting Xray Backend on port $port..." -ForegroundColor Green

# Đảm bảo đang ở đúng thư mục chứa folder 'backend'
$currentDir = Get-Location
if (-not (Test-Path "$currentDir\backend")) {
    Write-Host "Error: Could not find 'backend' directory in $currentDir" -ForegroundColor Red
} else {
    try {
        # Sử dụng Python 3.12 từ môi trường ảo (.venv)
        # Thêm PYTHONPATH để Python tìm thấy package 'app'
        $env:PYTHONPATH = "$currentDir\backend"
        .\backend\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port $port --reload
    } catch {
        Write-Host "PowerShell Error: $_" -ForegroundColor Red
    }
}

if ($LastExitCode -ne 0 -and $LastExitCode -ne $null) {
    Write-Host "Server exited with code: $LastExitCode" -ForegroundColor Yellow
}

Write-Host "`n----------------------------------------"
Read-Host "Press Enter to close this window..."
