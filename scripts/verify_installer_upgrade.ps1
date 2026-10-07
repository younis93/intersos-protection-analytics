param([string]$ArtifactRoot,[string]$PreviousVersion,[string]$Version)
$ErrorActionPreference = 'Stop'
$SmokeRoot = $ArtifactRoot
$InstallRoot = Join-Path $env:LOCALAPPDATA 'Programs\Iraq Data Analysis'
$ApplicationPath = Join-Path $InstallRoot 'Iraq Data Analysis.exe'
$DataRoot = Join-Path $env:LOCALAPPDATA 'INTERSOS Legal Platform'
$Results = @{passed=$false;phase='starting'}
try {
    # Trust only the approved publisher in this disposable test runner.
    $CertificatePath = Join-Path $PSScriptRoot '../installer/INTERSOS-Code-Signing.cer'
    $Certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new((Resolve-Path $CertificatePath).Path)
    if ($Certificate.Thumbprint -ne 'C4F1B12A3BCCC73BEF903FA3796304CF0E67670D') {throw 'Unexpected test certificate.'}
    certutil.exe -addstore -f Root $CertificatePath | Out-Null
    if ($LASTEXITCODE -ne 0) {throw 'Test certificate trust failed.'}
    certutil.exe -user -addstore -f Root $CertificatePath | Out-Null
    if ($LASTEXITCODE -ne 0) {throw 'User certificate trust failed.'}
    certutil.exe -user -addstore -f TrustedPublisher $CertificatePath | Out-Null
    if ($LASTEXITCODE -ne 0) {throw 'Publisher trust failed.'}
    function Install-Release([string]$Name) {
        $InstallerPath = "$SmokeRoot\Iraq-Data-Analysis-Setup-$Name.exe"
        $Signature = Get-AuthenticodeSignature -LiteralPath $InstallerPath
        if ($Signature.SignerCertificate.Thumbprint -ne "C4F1B12A3BCCC73BEF903FA3796304CF0E67670D") {throw "Unexpected installer signing certificate."}
        $Arguments = @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/EXTERNALRELAUNCH',"/DIR=`"$InstallRoot`"","/LOG=`"$SmokeRoot\$Name-install.log`"")
        $InstallerProcess = Start-Process -FilePath "$SmokeRoot\Iraq-Data-Analysis-Setup-$Name.exe" -ArgumentList $Arguments -WindowStyle Hidden -PassThru
        if (-not $InstallerProcess.WaitForExit(180000)) {
            Get-Content -LiteralPath "$SmokeRoot\$Name-install.log" -Tail 30 -ErrorAction SilentlyContinue
            Stop-Process -Id $InstallerProcess.Id -ErrorAction SilentlyContinue
            throw "$Name installer timed out in the clean runner."
        }
        $InstallerProcess.Refresh()
        if ($InstallerProcess.ExitCode -ne 0) { throw "$Name installer failed: $($InstallerProcess.ExitCode)" }
    }
    function Check-Application([string]$Version) {
        $AppProcess = Start-Process -FilePath $ApplicationPath -WindowStyle Hidden -PassThru
        $Deadline = (Get-Date).AddSeconds(90)
        do {
            Start-Sleep -Seconds 2
            $RunningApp = Get-Process -Name 'Iraq Data Analysis' -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle -eq "Iraq Data Analysis $Version"}
        } while (-not $RunningApp -and (Get-Date) -lt $Deadline)
        if (-not $RunningApp) { throw "Application $Version did not open its window." }
        $ApiReady = $false
        $ApplicationPids = @(Get-Process -Name 'Iraq Data Analysis' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
        foreach ($Connection in @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.OwningProcess -in $ApplicationPids})) {
            try {
                $Health = Invoke-RestMethod "http://127.0.0.1:$($Connection.LocalPort)/api/health" -TimeoutSec 10
                if ($Health.status) {
                    $Status = Invoke-RestMethod "http://127.0.0.1:$($Connection.LocalPort)/api/update/status" -TimeoutSec 10
                    if ($Status.currentVersion -ne $Version) {throw "Unexpected application version."}
                    $ApiReady=$true;break
                }
            } catch {}
        }
        if (-not $ApiReady) {throw "Application $Version API did not respond."}
        Get-Process -Name 'Iraq Data Analysis' -ErrorAction SilentlyContinue | Stop-Process
        Start-Sleep -Seconds 3
    }
    $Results.phase='installing-old'
    Install-Release $PreviousVersion
    Check-Application $PreviousVersion
    New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null
    New-Item -ItemType Directory -Path "$SmokeRoot/source" -Force | Out-Null
    $Settings = @{appTheme='executive';legalSourceType='files';legalFiles=@();legalFolder="$SmokeRoot/source";upgradeSmokeMarker='retain-settings'} | ConvertTo-Json -Compress
    $Contacts = '{"Alice":"alice@example.org"}'
    $Numbers = '{"Alice":"9647701234567"}'
    [IO.File]::WriteAllText((Join-Path $DataRoot 'settings.json'),$Settings)
    [IO.File]::WriteAllText((Join-Path $DataRoot 'lawyer-contacts.json'),$Contacts)
    [IO.File]::WriteAllText((Join-Path $DataRoot 'lawyer-contacts.whatsapp.json'),$Numbers)
    $Results.phase='upgrading'
    Install-Release $Version
    foreach ($Pair in @(@('settings.json',$Settings),@('lawyer-contacts.json',$Contacts),@('lawyer-contacts.whatsapp.json',$Numbers))) {
        if ([IO.File]::ReadAllText((Join-Path $DataRoot $Pair[0])) -ne $Pair[1]) {throw "Upgrade changed $($Pair[0])."}
    }
    Check-Application $Version
    $Results.passed=$true
    $Results.phase='complete'
    $Results.settingsPreserved=$true
    $Results.contactsPreserved=$true
    $Results.oldVersion=$PreviousVersion
    $Results.newVersion=$Version
} catch {$Results.error=$_.Exception.Message}
$Results | ConvertTo-Json | Set-Content -LiteralPath "$SmokeRoot\result.json" -Encoding UTF8
if (-not $Results.passed) {throw $Results.error}
Write-Output ($Results | ConvertTo-Json)
