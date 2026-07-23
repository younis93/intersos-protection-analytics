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

Start-Process -WindowStyle Hidden -FilePath $VenvPython -ArgumentList @('-m','uvicorn','backend.main:app','--host','127.0.0.1','--port','8000') -WorkingDirectory $ProjectRoot
Start-Process -WindowStyle Hidden -FilePath 'npm.cmd' -ArgumentList @('run','dev','--prefix',(Join-Path $ProjectRoot 'frontend'),'--','--host','127.0.0.1') -WorkingDirectory $ProjectRoot
Start-Process 'http://127.0.0.1:5173'
