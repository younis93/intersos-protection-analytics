#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif
#define MyAppName "INTERSOS Protection Analytics"
#define MyAppExeName "INTERSOS Protection Analytics.exe"
#define SigningCertificateName "INTERSOS-Code-Signing.cer"
#define SigningCertificateThumbprint "C4F1B12A3BCCC73BEF903FA3796304CF0E67670D"
#define WebView2BootstrapperName "MicrosoftEdgeWebview2Setup.exe"

[Setup]
AppId={{D8924146-2D10-43B4-8B98-686B8F208699}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=INTERSOS
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
PrivilegesRequired=lowest
OutputDir=..\release
OutputBaseFilename=INTERSOS-Protection-Analytics-Setup-{#MyAppVersion}
SetupIconFile=..\intersos-protection-analytics.ico
Compression=lzma2/max
SolidCompression=yes
CloseApplications=yes
RestartApplications=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
WizardStyle=modern
WizardSizePercent=110
DisableWelcomePage=yes
DisableDirPage=no
DisableReadyPage=yes
DisableProgramGroupPage=yes
SetupLogging=yes

[Files]
Source: "..\packaging-temp\dist\INTERSOS Protection Analytics\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "INTERSOS-Code-Signing.cer"; Flags: dontcopy
Source: "MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Flags: nowait; Check: ShouldLaunchAfterInstall
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -NonInteractive -WindowStyle Hidden -Command ""$deadline = (Get-Date).AddSeconds(30); do {{ $running = Get-Process -Name '{#MyAppName}' -ErrorAction SilentlyContinue; if (-not $running) {{ break }}; Start-Sleep -Seconds 1 }} while ((Get-Date) -lt $deadline); if (-not (Get-Process -Name '{#MyAppName}' -ErrorAction SilentlyContinue)) {{ Start-Process -FilePath '{app}\{#MyAppExeName}' }}"""; Flags: nowait runhidden; Check: ShouldRestartAfterUpdate

[Code]

function HasCommandLineSwitch(const SwitchName: String): Boolean;
var
  Index: Integer;
begin
  Result := False;
  for Index := 1 to ParamCount do
    if CompareText(ParamStr(Index), SwitchName) = 0 then
    begin
      Result := True;
      exit;
    end;
end;

function IsUpdateInstall: Boolean;
begin
  Result := HasCommandLineSwitch('/INTERSOSUPDATE');
end;

function ShouldRestartAfterUpdate: Boolean;
begin
  Result := (WizardSilent or IsUpdateInstall) and
    (not HasCommandLineSwitch('/EXTERNALRELAUNCH'));
end;

function ShouldLaunchAfterInstall: Boolean;
begin
  Result := (not WizardSilent) and (not IsUpdateInstall);
end;

function CertificateInstalled(const StoreName: String): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec(
    ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -NonInteractive -Command "if (Test-Path -LiteralPath ''Cert:\CurrentUser\' +
      StoreName + '\{#SigningCertificateThumbprint}'') { exit 0 } else { exit 1 }"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

function UpdateTrustReady: Boolean;
begin
  Result := CertificateInstalled('Root') and CertificateInstalled('TrustedPublisher');
end;

function WebView2VersionAvailable(const RootKey: Integer): Boolean;
var
  Version: String;
begin
  Result := RegQueryStringValue(RootKey,
    'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'pv', Version) and (Version <> '') and (CompareText(Version, '0.0.0.0') <> 0);
end;

function WebView2Installed: Boolean;
begin
  Result := WebView2VersionAvailable(HKLM32) or WebView2VersionAvailable(HKCU32);
end;

function EnsureWebView2Runtime: String;
var
  BootstrapperPath: String;
  ResultCode: Integer;
  Attempt: Integer;
begin
  Result := '';
  if WebView2Installed then
    exit;

  WizardForm.StatusLabel.Caption := 'Installing Microsoft Edge WebView2 Runtime...';
  ExtractTemporaryFile('{#WebView2BootstrapperName}');
  BootstrapperPath := ExpandConstant('{tmp}\{#WebView2BootstrapperName}');
  if not Exec(BootstrapperPath, '/silent /install', '', SW_HIDE,
    ewWaitUntilTerminated, ResultCode) or ((ResultCode <> 0) and (ResultCode <> 3010)) then
  begin
    Result := 'Microsoft Edge WebView2 Runtime could not be installed. Check the internet connection and run setup again.';
    exit;
  end;

  for Attempt := 1 to 20 do
  begin
    if WebView2Installed then
      exit;
    Sleep(500);
  end;
  Result := 'Microsoft Edge WebView2 Runtime installation did not complete. Restart Windows and run setup again.';
end;

function WaitForPreviousApplicationExit: Boolean;
var
  ResultCode: Integer;
  Parameters: String;
begin
  Parameters :=
    '-NoProfile -NonInteractive -WindowStyle Hidden -Command "' +
    '$deadline=(Get-Date).AddSeconds(60); while (Get-Process -Name ''' +
    '{#MyAppName}' + ''' -ErrorAction SilentlyContinue) { ' +
    'if ((Get-Date) -ge $deadline) { exit 1 }; Start-Sleep -Milliseconds 250 }; exit 0"';
  Result := Exec(
    ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    Parameters, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and
    (ResultCode = 0);
end;

function ChangeCertificateStore(const Operation, StoreName, CertificatePath: String): Boolean;
var
  Parameters: String;
  ResultCode: Integer;
begin
  if Operation = 'add' then
  begin
    Result := Exec(ExpandConstant('{sys}\certutil.exe'),
      '-user -addstore -f "' + StoreName + '" "' + CertificatePath + '"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
    exit;
  end
  else
    Parameters := '-NoProfile -NonInteractive -Command "Remove-Item -LiteralPath ' +
      '''Cert:\CurrentUser\' + StoreName + '\{#SigningCertificateThumbprint}'' ' +
      '-Force -ErrorAction SilentlyContinue"';
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    Parameters, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

procedure InitializeWizard;
begin
  WizardForm.Caption := '{#MyAppName} Setup';
  WizardForm.Font.Name := 'Segoe UI';
  WizardForm.Font.Size := 9;
  WizardForm.Color := clWhite;
  WizardForm.MainPanel.Color := clWhite;
  WizardForm.PageNameLabel.Font.Name := 'Segoe UI Semibold';
  WizardForm.PageNameLabel.Font.Size := 13;
  WizardForm.PageNameLabel.Font.Color := $00783F16;
  WizardForm.PageDescriptionLabel.Font.Name := 'Segoe UI';
  WizardForm.PageDescriptionLabel.Font.Color := $007D6549;
  WizardForm.WizardSmallBitmapImage.Visible := False;
  WizardForm.PageNameLabel.Width := WizardForm.MainPanel.Width - WizardForm.PageNameLabel.Left - ScaleX(20);
  WizardForm.PageDescriptionLabel.Width := WizardForm.PageNameLabel.Width;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo,
  MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
var
  FreeBytes: Int64;
  TotalBytes: Int64;
  DiskStatus: String;
begin
  if GetSpaceOnDisk64(WizardDirValue, FreeBytes, TotalBytes) then
    DiskStatus := Format('Available disk space: %d MB', [FreeBytes div 1048576])
  else
    DiskStatus := 'Available disk space: Windows will verify before installation';

  Result :=
    'INTERSOS PROTECTION ANALYTICS  {#MyAppVersion}' + NewLine + NewLine +
    'A secure desktop workspace for protection analysis, interactive charts, data exploration, and presentation-ready reporting.' + NewLine + NewLine +
    'Setup will automatically:' + NewLine +
    Space + '- Install the application for your Windows account' + NewLine +
    Space + '- Enable verified, signed automatic updates' + NewLine +
    Space + '- Create Start menu and desktop shortcuts' + NewLine +
    Space + '- Install Microsoft WebView2 if required' + NewLine +
    Space + '- Launch the application when setup is complete' + NewLine + NewLine +
    'Installation folder' + NewLine + Space + WizardDirValue + NewLine + NewLine +
    DiskStatus + NewLine + NewLine +
    'Select Install to begin.';
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpSelectDir then
  begin
    WizardForm.PageNameLabel.Caption := 'Install {#MyAppName}';
    WizardForm.PageDescriptionLabel.Caption := 'Choose where the application will be installed';
    WizardForm.SelectDirLabel.Caption :=
      'Select the installation folder below. Setup will configure secure updates and create the required shortcuts automatically.';
    WizardForm.NextButton.Caption := '&Install'
  end;
  if CurPageID = wpFinished then
  begin
    WizardForm.FinishedHeadingLabel.Caption := 'Installation complete';
    WizardForm.FinishedLabel.Caption :=
      '{#MyAppName} is ready to use. Your secure update settings and shortcuts have been configured.';
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    if IsUpdateInstall then
      WizardForm.StatusLabel.Caption := 'Updating {#MyAppName} safely...'
    else
      WizardForm.StatusLabel.Caption := 'Installing {#MyAppName}...';
  end;
  if CurStep = ssPostInstall then
    WizardForm.StatusLabel.Caption := 'Finalizing shortcuts and secure update settings...';
  if CurStep = ssDone then
    WizardForm.StatusLabel.Caption := 'Installation complete.';
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  CertificatePath: String;
  RootAdded: Boolean;
  PublisherAdded: Boolean;
begin
  Result := '';
  if IsUpdateInstall and (not WaitForPreviousApplicationExit) then
  begin
    Result := 'The running application did not close in time. Close it and run the update again.';
    exit;
  end;

  if not UpdateTrustReady then
  begin
    ExtractTemporaryFile('{#SigningCertificateName}');
    CertificatePath := ExpandConstant('{tmp}\{#SigningCertificateName}');
    RootAdded := False;
    PublisherAdded := False;

    if not CertificateInstalled('Root') then
    begin
      RootAdded := ChangeCertificateStore('add', 'Root', CertificatePath);
      if not RootAdded then
      begin
        Result := 'Unable to trust the INTERSOS signing certificate in the current user Root store.';
        exit;
      end;
    end;

    if not CertificateInstalled('TrustedPublisher') then
    begin
      PublisherAdded := ChangeCertificateStore('add', 'TrustedPublisher', CertificatePath);
      if not PublisherAdded then
      begin
        if RootAdded then
          ChangeCertificateStore('delete', 'Root', '');
        Result := 'Unable to trust the INTERSOS signing certificate in the current user Trusted Publishers store.';
        exit;
      end;
    end;

    if not UpdateTrustReady then
    begin
      if PublisherAdded then
        ChangeCertificateStore('delete', 'TrustedPublisher', '');
      if RootAdded then
        ChangeCertificateStore('delete', 'Root', '');
      Result := 'Windows could not verify the installed INTERSOS signing certificate.';
      exit;
    end;
  end;

  Result := EnsureWebView2Runtime;
end;
