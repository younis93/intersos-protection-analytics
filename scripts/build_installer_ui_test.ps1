param(
    [string]$Version = '0.0.0-ui-test'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$OutputRoot = Join-Path $ProjectRoot 'output-test'
$InstallerScript = Join-Path $ProjectRoot 'installer\INTERSOS Protection Analytics.iss'

$InnoCompiler = @(
    (Get-Command iscc.exe -ErrorAction SilentlyContinue).Source
    (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe')
    (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

if (-not $InnoCompiler) {
    throw 'Inno Setup 6 was not found.'
}

[IO.Directory]::CreateDirectory($OutputRoot) | Out-Null
& $InnoCompiler "/DUiTestBuild" "/DMyAppVersion=$Version" "/DMyOutputDir=$OutputRoot" $InstallerScript
if ($LASTEXITCODE -ne 0) {
    throw 'Installer UI test build failed.'
}

Write-Host "UI test installer created in $OutputRoot"
