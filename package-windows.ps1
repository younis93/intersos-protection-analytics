param(
    [string]$AppVersion,
    [switch]$Clean,
    [switch]$NoLaunch,
    [switch]$LaunchOnly
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPython = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
$ReleaseRoot = Join-Path $ProjectRoot 'release\INTERSOS-Protection-Analytics-Windows'
$StagingReleaseRoot = Join-Path $ProjectRoot 'release\INTERSOS-Protection-Analytics-Windows-staging'
$PackageTemp = Join-Path $ProjectRoot 'packaging-temp'
$BuildDist = Join-Path $PackageTemp 'dist'
$BuildWork = Join-Path $PackageTemp 'work'
$BuildSpec = Join-Path $PackageTemp 'spec'
$PackagedApp = Join-Path $StagingReleaseRoot 'INTERSOS Protection Analytics.exe'

function Start-PackagedApplication {
    if (-not (Test-Path -LiteralPath $PackagedApp)) {
        throw "The packaged application was not found at $PackagedApp. Run package-windows.ps1 first."
    }
    Write-Host 'Starting INTERSOS Protection Analytics...'
    Start-Process -FilePath $PackagedApp -WorkingDirectory $StagingReleaseRoot | Out-Null
    $Deadline = (Get-Date).AddSeconds(30)
    $WindowProcess = $null
    do {
        Start-Sleep -Milliseconds 250
        $WindowProcess = Get-Process -Name 'INTERSOS Protection Analytics' -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowHandle -ne 0 } |
            Select-Object -First 1
    } while (-not $WindowProcess -and (Get-Date) -lt $Deadline)
    if (-not $WindowProcess) {
        throw 'The application started but no window appeared within 30 seconds.'
    }
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class InterSOSWindow {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle, int command);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
}
'@ -ErrorAction SilentlyContinue
    [InterSOSWindow]::ShowWindow($WindowProcess.MainWindowHandle, 9) | Out-Null
    [InterSOSWindow]::SetForegroundWindow($WindowProcess.MainWindowHandle) | Out-Null
    Write-Host 'Application window opened successfully.' -ForegroundColor Green
}

if ($LaunchOnly) {
    if (-not (Test-Path -LiteralPath $VenvPython)) {
        throw 'Run start-dashboard.ps1 once before using quick launch so the Python environment exists.'
    }
    $FrontendDist = Join-Path $ProjectRoot 'frontend\dist\index.html'
    $NewestFrontendSource = Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'frontend\src') -File -Recurse |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    $BuiltFrontend = Get-Item -LiteralPath $FrontendDist -ErrorAction SilentlyContinue
    if (-not $BuiltFrontend -or ($NewestFrontendSource -and $NewestFrontendSource.LastWriteTimeUtc -gt $BuiltFrontend.LastWriteTimeUtc)) {
        Write-Host 'Building only the changed frontend...' -ForegroundColor Cyan
        & npm.cmd run build --prefix (Join-Path $ProjectRoot 'frontend')
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    } else {
        Write-Host 'Frontend is already current; no build is needed.' -ForegroundColor DarkGray
    }
    Write-Host 'Starting the current local application...' -ForegroundColor Green
    $LauncherPath = Join-Path $ProjectRoot 'desktop_launcher.py'
    $LaunchProcess = Start-Process -WindowStyle Hidden -FilePath $VenvPython -ArgumentList "`"$LauncherPath`"" -WorkingDirectory $ProjectRoot -PassThru
    $LaunchDeadline = (Get-Date).AddSeconds(30)
    $ApplicationWindow = $null
    do {
        Start-Sleep -Milliseconds 250
        if ($LaunchProcess.HasExited) {
            throw "The local application launcher exited before opening a window (exit code $($LaunchProcess.ExitCode))."
        }
        $ApplicationWindow = Get-Process -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowTitle -like 'INTERSOS Protection Analytics*' } |
            Select-Object -First 1
    } while (-not $ApplicationWindow -and (Get-Date) -lt $LaunchDeadline)
    if (-not $ApplicationWindow) {
        Stop-Process -Id $LaunchProcess.Id -Force -ErrorAction SilentlyContinue
        throw 'The local application started but no window appeared within 30 seconds.'
    }
    Write-Host 'Application window opened successfully.' -ForegroundColor Green
    exit 0
}
if (-not $AppVersion) {
    $VersionSource = Get-Content -LiteralPath (Join-Path $ProjectRoot 'backend\version.py') -Raw
    $AppVersionMatch = [regex]::Match($VersionSource, 'APP_VERSION\s*=\s*["''](?<version>[^"'']+)["'']')
    if (-not $AppVersionMatch.Success) { throw 'Unable to read APP_VERSION from backend/version.py.' }
    $AppVersion = $AppVersionMatch.Groups['version'].Value
}

if (-not (Test-Path -LiteralPath $VenvPython)) {
    throw 'Run start-dashboard.ps1 once before packaging so the Python environment exists.'
}

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'frontend\node_modules'))) {
    & npm.cmd ci --prefix (Join-Path $ProjectRoot 'frontend')
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
}

& npm.cmd run build --prefix (Join-Path $ProjectRoot 'frontend')
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
$InstalledPyInstaller = & $VenvPython -c "import PyInstaller; print(PyInstaller.__version__)" 2>$null
if ($LASTEXITCODE -ne 0 -or $InstalledPyInstaller -ne '6.21.0') {
    & $VenvPython -m pip install --disable-pip-version-check pyinstaller==6.21.0
    if ($LASTEXITCODE -ne 0) { throw 'PyInstaller installation failed.' }
}
$PyInstallerArgs = @('--noconfirm', '--windowed', '--onedir', '--name', 'INTERSOS Protection Analytics', '--icon', (Join-Path $ProjectRoot 'intersos-protection-analytics.ico'), '--distpath', $BuildDist, '--workpath', $BuildWork, '--specpath', $BuildSpec, '--add-data', "$ProjectRoot\frontend\dist;frontend\dist", '--add-data', "$ProjectRoot\intersos-protection-analytics.ico;.")
if ($Clean) { $PyInstallerArgs += '--clean' }
$PyInstallerArgs += (Join-Path $ProjectRoot 'desktop_launcher.py')
& $VenvPython -m PyInstaller @PyInstallerArgs
if ($LASTEXITCODE -ne 0) { throw 'Portable application build failed.' }

if (Test-Path -LiteralPath $StagingReleaseRoot) { Remove-Item -LiteralPath $StagingReleaseRoot -Recurse -Force }
New-Item -ItemType Directory -Force $StagingReleaseRoot | Out-Null
Copy-Item -Recurse -Force (Join-Path $BuildDist 'INTERSOS Protection Analytics\*') $StagingReleaseRoot
Copy-Item -Force (Join-Path $ProjectRoot 'PORTABLE-README.txt') $StagingReleaseRoot
Compress-Archive -Path (Join-Path $StagingReleaseRoot '*') -DestinationPath (Join-Path $ProjectRoot 'release\INTERSOS-Protection-Analytics-Windows.zip') -CompressionLevel Fastest -Force
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
    $WebViewBootstrapper = Join-Path $ProjectRoot 'installer\MicrosoftEdgeWebview2Setup.exe'
    if (-not (Test-Path -LiteralPath $WebViewBootstrapper)) {
        Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $WebViewBootstrapper
    }
    $WebViewSignature = Get-AuthenticodeSignature -LiteralPath $WebViewBootstrapper
    if ($WebViewSignature.Status -ne 'Valid' -or $WebViewSignature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
        throw 'The Microsoft WebView2 bootstrapper signature is invalid.'
    }
    & $InnoCompiler "/DMyAppVersion=$AppVersion" (Join-Path $ProjectRoot 'installer\INTERSOS Protection Analytics.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Windows installer build failed.' }
    Write-Host "Per-user installer created in $ProjectRoot\release"
} else {
    Write-Host 'Inno Setup not found; portable package created, installer skipped.'
}

if (-not $NoLaunch) {
    Start-PackagedApplication
}
