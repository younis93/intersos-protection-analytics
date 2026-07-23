param(
    [string]$Version,
    [int]$MaxAttempts = 90
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ReleaseRoot = Join-Path $ProjectRoot 'release'
$ExpectedThumbprint = 'C4F1B12A3BCCC73BEF903FA3796304CF0E67670D'

if (-not $Version) {
    $LatestUrl = & curl.exe -L --silent --show-error -o NUL -w '%{url_effective}' 'https://github.com/younis93/intersos-protection-analytics/releases/latest'
    if ($LASTEXITCODE -ne 0 -or -not $LatestUrl) { throw 'Unable to resolve the latest GitHub release.' }
    $Version = ([Uri]$LatestUrl).Segments[-1].Trim('/').TrimStart('v')
}

if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid release version: $Version" }

$Tag = "v$Version"
$BaseUrl = "https://github.com/younis93/intersos-protection-analytics/releases/download/$Tag"
$InstallerName = "INTERSOS-Protection-Analytics-Setup-$Version.exe"
$TempRoot = Join-Path ([IO.Path]::GetTempPath()) "intersos-release-sync-$Version"
$ManifestPath = Join-Path $TempRoot 'update.json'
$InstallerPath = Join-Path $TempRoot $InstallerName
[IO.Directory]::CreateDirectory($TempRoot) | Out-Null

$Downloaded = $false
for ($Attempt = 1; $Attempt -le $MaxAttempts; $Attempt++) {
    & curl.exe -L --fail --silent --show-error "$BaseUrl/update.json" -o $ManifestPath
    if ($LASTEXITCODE -eq 0) {
        $Downloaded = $true
        break
    }
    if ($Attempt -lt $MaxAttempts) {
        Write-Host "Release $Tag is still building. Checking again in 10 seconds..."
        Start-Sleep -Seconds 10
    }
}
if (-not $Downloaded) { throw "Release $Tag was not published before the wait limit expired." }

$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($Manifest.version -ne $Version) { throw 'The update manifest version does not match the requested release.' }
if ($Manifest.installerUrl -ne "$BaseUrl/$InstallerName") { throw 'The update manifest contains an unexpected installer URL.' }

& curl.exe -L --fail --silent --show-error $Manifest.installerUrl -o $InstallerPath
if ($LASTEXITCODE -ne 0) { throw "Unable to download $InstallerName." }

$ActualHash = (Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ActualHash -ne ([string]$Manifest.sha256).ToLowerInvariant()) { throw 'The downloaded installer SHA-256 does not match update.json.' }

$Signature = Get-AuthenticodeSignature -LiteralPath $InstallerPath
if ($Signature.Status -ne 'Valid') { throw 'The downloaded installer signature is not valid.' }
if ($Signature.SignerCertificate.Thumbprint -ne $ExpectedThumbprint) { throw 'The downloaded installer certificate thumbprint is not approved.' }

$ResolvedProject = [IO.Path]::GetFullPath($ProjectRoot)
$ResolvedRelease = [IO.Path]::GetFullPath($ReleaseRoot)
if (-not $ResolvedRelease.StartsWith($ResolvedProject + [IO.Path]::DirectorySeparatorChar)) {
    throw 'The release directory resolved outside the project.'
}

if ([IO.Directory]::Exists($ResolvedRelease)) {
    Get-ChildItem -LiteralPath $ResolvedRelease -Force | Remove-Item -Recurse -Force
} else {
    [IO.Directory]::CreateDirectory($ResolvedRelease) | Out-Null
}

Copy-Item -LiteralPath $InstallerPath -Destination (Join-Path $ResolvedRelease $InstallerName)
Copy-Item -LiteralPath $ManifestPath -Destination (Join-Path $ResolvedRelease 'update.json')

Write-Host "Local release folder synchronized to $Tag."
Write-Host "Installer: $InstallerName"
Write-Host "SHA-256: $ActualHash"
Write-Host "Signature: Valid ($ExpectedThumbprint)"
