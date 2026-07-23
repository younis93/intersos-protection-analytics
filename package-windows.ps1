$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPython = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
$ReleaseRoot = Join-Path $ProjectRoot 'release\INTERSOS-Protection-Analytics-Windows'
$StagingReleaseRoot = Join-Path $ProjectRoot 'release\INTERSOS-Protection-Analytics-Windows-staging'
$PackageTemp = Join-Path $ProjectRoot 'packaging-temp'
$BuildDist = Join-Path $PackageTemp 'dist'
$BuildWork = Join-Path $PackageTemp 'work'
$BuildSpec = Join-Path $PackageTemp 'spec'

if (-not (Test-Path -LiteralPath $VenvPython)) {
    throw 'Run start-dashboard.ps1 once before packaging so the Python environment exists.'
}

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'frontend\node_modules'))) {
    & npm.cmd ci --prefix (Join-Path $ProjectRoot 'frontend')
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
}

& npm.cmd run build --prefix (Join-Path $ProjectRoot 'frontend')
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
& $VenvPython -m pip install pyinstaller
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller installation failed.' }
& $VenvPython -m PyInstaller --noconfirm --clean --onedir --name 'INTERSOS Protection Analytics' --icon (Join-Path $ProjectRoot 'intersos-protection-analytics.ico') --distpath $BuildDist --workpath $BuildWork --specpath $BuildSpec --add-data "$ProjectRoot\frontend\dist;frontend\dist" --collect-all polars (Join-Path $ProjectRoot 'desktop_launcher.py')
if ($LASTEXITCODE -ne 0) { throw 'Portable application build failed.' }

if (Test-Path -LiteralPath $StagingReleaseRoot) { Remove-Item -LiteralPath $StagingReleaseRoot -Recurse -Force }
New-Item -ItemType Directory -Force $StagingReleaseRoot | Out-Null
Copy-Item -Recurse -Force (Join-Path $BuildDist 'INTERSOS Protection Analytics\*') $StagingReleaseRoot
Copy-Item -Force (Join-Path $ProjectRoot 'PORTABLE-README.txt') $StagingReleaseRoot
Compress-Archive -Path (Join-Path $StagingReleaseRoot '*') -DestinationPath (Join-Path $ProjectRoot 'release\INTERSOS-Protection-Analytics-Windows.zip') -Force
Write-Host "Portable package created in $ProjectRoot\release"

$InnoCompiler = (Get-Command iscc.exe -ErrorAction SilentlyContinue).Source
if (-not $InnoCompiler) {
    $InnoCompiler = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe')
        (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
    ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if ($InnoCompiler) {
    & $InnoCompiler "/DMyAppVersion=1.0.0" (Join-Path $ProjectRoot 'installer\INTERSOS Protection Analytics.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Windows installer build failed.' }
    Write-Host "Per-user installer created in $ProjectRoot\release"
} else {
    Write-Host 'Inno Setup not found; portable package created, installer skipped.'
}
