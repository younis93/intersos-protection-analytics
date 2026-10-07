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
    Write-Output 'Preparing approved signing certificate in the disposable runner.'
    Import-Certificate -FilePath $CertificatePath -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
    $MachineKey = "HKLM:\SOFTWARE\Microsoft\SystemCertificates\Root\Certificates\$($Certificate.Thumbprint)"
    foreach ($Store in @('Root','TrustedPublisher')) {
        $UserStore = "HKCU:\SOFTWARE\Microsoft\SystemCertificates\$Store\Certificates"
        New-Item -Path $UserStore -Force | Out-Null
        # Copy the already vetted serialized certificate into the test user's
        # stores without an interactive certificate-import dialog.
        $UserCertificateKey = "$UserStore\$($Certificate.Thumbprint)"
        New-Item -Path $UserCertificateKey -Force | Out-Null
        $CertificateBlob = Get-ItemPropertyValue -LiteralPath $MachineKey -Name Blob
        New-ItemProperty -LiteralPath $UserCertificateKey -Name Blob -Value $CertificateBlob -PropertyType Binary -Force | Out-Null
        if (-not (Test-Path -LiteralPath "Cert:\CurrentUser\$Store\$($Certificate.Thumbprint)")) {throw "Test certificate is missing from $Store."}
        $Registry32 = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry32)
        $CertificateKey32 = $Registry32.CreateSubKey("Software\Microsoft\SystemCertificates\$Store\Certificates\$($Certificate.Thumbprint)")
        $CertificateKey32.SetValue("Blob", $CertificateBlob, [Microsoft.Win32.RegistryValueKind]::Binary)
        $CertificateKey32.Dispose()
        $Registry32.Dispose()
        Write-Output "Approved test certificate ready in both registry views for $Store."
    }
    function Install-Release([string]$Name) {
        Write-Output "Installing $Name in the disposable runner."
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
        Write-Output "Waiting for application API version $Version."
        $Deadline = (Get-Date).AddSeconds(90)
        $ApiReady = $false
        do {
            Start-Sleep -Seconds 2
            $ApplicationPids = @(Get-Process -Name 'Iraq Data Analysis' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
            foreach ($Connection in @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.OwningProcess -in $ApplicationPids})) {
                try {
                    Invoke-WebRequest "http://127.0.0.1:$($Connection.LocalPort)/" -SessionVariable ApplicationSession -TimeoutSec 3 | Out-Null
                    $Health = Invoke-RestMethod "http://127.0.0.1:$($Connection.LocalPort)/api/health" -WebSession $ApplicationSession -TimeoutSec 3
                    $Status = Invoke-RestMethod "http://127.0.0.1:$($Connection.LocalPort)/api/update/status" -WebSession $ApplicationSession -TimeoutSec 3
                    if ($Health.status -and $Status.currentVersion -eq $Version) {$ApiReady=$true;break}
                } catch {}
            }
        } while (-not $ApiReady -and (Get-Date) -lt $Deadline)
        if (-not $ApiReady) {
            Get-Content -LiteralPath "$DataRoot/startup.log" -Tail 30 -ErrorAction SilentlyContinue
            throw "Application $Version API did not respond."
        }
        Get-Process -Name 'Iraq Data Analysis' -ErrorAction SilentlyContinue | Stop-Process
        Start-Sleep -Seconds 3
    }
    $Results.phase='installing-old'
    Install-Release $PreviousVersion
    Check-Application $PreviousVersion
    New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null
    New-Item -ItemType Directory -Path "$SmokeRoot/source" -Force | Out-Null
    $Settings = @{appTheme='executive';legalSource='folder';legalFiles=@();legalFolder="$SmokeRoot/source";upgradeSmokeMarker='retain-settings'} | ConvertTo-Json -Compress
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



