$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimePython = 'C:\Users\youni\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$VenvPython = Join-Path $ProjectRoot '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $VenvPython)) {
    & $RuntimePython -m venv (Join-Path $ProjectRoot '.venv')
    & $VenvPython -m pip install -r (Join-Path $ProjectRoot 'backend\requirements.txt')
}

$FrontendModules = Join-Path $ProjectRoot 'frontend\node_modules'
if (-not (Test-Path -LiteralPath $FrontendModules)) {
    & npm ci --prefix (Join-Path $ProjectRoot 'frontend')
}

function Test-LocalUrl([string]$Url) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch {
        return $false
    }
}

if (-not (Test-LocalUrl 'http://127.0.0.1:8000/api/health')) {
    Start-Process -WindowStyle Hidden -FilePath $VenvPython -ArgumentList @('-m','uvicorn','backend.main:app','--host','127.0.0.1','--port','8000') -WorkingDirectory $ProjectRoot
}
if (-not (Test-LocalUrl 'http://127.0.0.1:5173')) {
    Start-Process -WindowStyle Hidden -FilePath 'npm.cmd' -ArgumentList @('run','dev','--','--host','127.0.0.1') -WorkingDirectory (Join-Path $ProjectRoot 'frontend')
}

Write-Host 'Starting INTERSOS Protection Analytics. Initial data loading can take up to one minute...' -ForegroundColor Cyan
$Ready = $false
for ($Attempt = 0; $Attempt -lt 90; $Attempt++) {
    if ((Test-LocalUrl 'http://127.0.0.1:8000/api/health') -and (Test-LocalUrl 'http://127.0.0.1:5173')) {
        $Ready = $true
        break
    }
    Start-Sleep -Seconds 1
}
if (-not $Ready) {
    throw 'The application did not start within 90 seconds. Please keep this window open and share the displayed error.'
}

Write-Host 'Application ready.' -ForegroundColor Green
Start-Process 'http://127.0.0.1:5173'
