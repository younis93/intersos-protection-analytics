#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif
#define MyAppName "INTERSOS Legal Platform"
#define MyAppExeName "INTERSOS Legal Platform.exe"
#define SigningCertificateName "INTERSOS-Code-Signing.cer"
#define SigningCertificateThumbprint "C4F1B12A3BCCC73BEF903FA3796304CF0E67670D"
#define WebView2BootstrapperName "MicrosoftEdgeWebview2Setup.exe"
#ifndef MyOutputDir
  #define MyOutputDir "..\release"
#endif

[Setup]
#ifdef UiTestBuild
AppId={{C8D92D64-8962-452B-BDF1-064DD32EF45F}
DefaultDirName={tmp}\INTERSOS Legal Platform UI Test
Uninstallable=no
CreateUninstallRegKey=no
#else
AppId={{D8924146-2D10-43B4-8B98-686B8F208699}
DefaultDirName={localappdata}\Programs\{#MyAppName}
#endif
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=INTERSOS
DefaultGroupName={#MyAppName}
PrivilegesRequired=lowest
OutputDir={#MyOutputDir}
OutputBaseFilename=INTERSOS-Legal-Platform-Setup-{#MyAppVersion}
SetupIconFile=..\intersos-protection-analytics.ico
Compression=lzma2/fast
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
Source: "..\packaging-temp\dist\INTERSOS Legal Platform\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "INTERSOS-Code-Signing.cer"; Flags: dontcopy
Source: "MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Flags: nowait; Check: ShouldLaunchAfterInstall
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -NonInteractive -WindowStyle Hidden -Command ""$deadline = (Get-Date).AddSeconds(30); do {{ $running = Get-Process -Name '{#MyAppName}' -ErrorAction SilentlyContinue; if (-not $running) {{ break }}; Start-Sleep -Seconds 1 }} while ((Get-Date) -lt $deadline); if (-not (Get-Process -Name '{#MyAppName}' -ErrorAction SilentlyContinue)) {{ Start-Process -FilePath '{app}\{#MyAppExeName}' }}"""; Flags: nowait runhidden; Check: ShouldRestartAfterUpdate

[Code]

var
  AppSummaryHeading: TNewStaticText;
  AppSummaryText: TNewStaticText;

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
#ifdef UiTestBuild
  Result := False;
#else
  Result := (not WizardSilent) and (not IsUpdateInstall);
#endif
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
  WizardForm.PageNameLabel.Font.Size := 11;
  WizardForm.PageNameLabel.Font.Color := $00784016;
  WizardForm.PageDescriptionLabel.Font.Name := 'Segoe UI';
  WizardForm.PageDescriptionLabel.Font.Color := $00806F60;
  WizardForm.WizardSmallBitmapImage.Visible := False;
  WizardForm.PageNameLabel.Width := WizardForm.MainPanel.Width -
    WizardForm.PageNameLabel.Left - ScaleX(12);
  WizardForm.PageNameLabel.Height := ScaleY(26);
  WizardForm.PageDescriptionLabel.Top := WizardForm.PageNameLabel.Top + ScaleY(25);
  WizardForm.PageDescriptionLabel.Height := ScaleY(20);
  WizardForm.PageDescriptionLabel.Width := WizardForm.PageNameLabel.Width;
  WizardForm.PageDescriptionLabel.Font.Size := 9;
  WizardForm.BackButton.Caption := 'Back';
  WizardForm.CancelButton.Caption := 'Cancel';
  WizardForm.NextButton.Default := True;
  WizardForm.ReadyMemo.WordWrap := True;
  WizardForm.ReadyMemo.ScrollBars := ssNone;
  WizardForm.DiskSpaceLabel.Visible := True;

  AppSummaryHeading := TNewStaticText.Create(WizardForm);
  AppSummaryHeading.Parent := WizardForm.SelectDirPage;
  AppSummaryHeading.Left := WizardForm.DirEdit.Left;
  AppSummaryHeading.Top := WizardForm.DirEdit.Top + WizardForm.DirEdit.Height + ScaleY(34);
  AppSummaryHeading.Width := WizardForm.DirEdit.Width;
  AppSummaryHeading.Height := ScaleY(22);
  AppSummaryHeading.Caption := 'About INTERSOS Legal Platform';
  AppSummaryHeading.Font.Name := 'Segoe UI Semibold';
  AppSummaryHeading.Font.Size := 10;
  AppSummaryHeading.Font.Color := $00784016;

  AppSummaryText := TNewStaticText.Create(WizardForm);
  AppSummaryText.Parent := WizardForm.SelectDirPage;
  AppSummaryText.Left := WizardForm.DirEdit.Left;
  AppSummaryText.Top := AppSummaryHeading.Top + ScaleY(28);
  AppSummaryText.Width := WizardForm.DirBrowseButton.Left +
    WizardForm.DirBrowseButton.Width - AppSummaryText.Left;
  AppSummaryText.Height := ScaleY(92);
  AppSummaryText.Caption :=
    'A secure desktop workspace for Legal Platform data review, case analysis,' + #13#10 +
    'data exploration, and reporting.' + #13#10 + #13#10 +
    'Desktop and Start menu shortcuts and secure updates are configured' + #13#10 +
    'automatically.';
  AppSummaryText.Font.Name := 'Segoe UI';
  AppSummaryText.Font.Size := 9;
  AppSummaryText.Font.Color := $00806F60;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo,
  MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result :=
    'INTERSOS Legal Platform' + NewLine + NewLine +
    'A secure desktop workspace for Legal Platform data review, case analysis, ' +
    'data exploration, and reporting.' + NewLine + NewLine +
    'The installer also creates desktop and Start menu shortcuts and enables ' +
    'secure application updates.';
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpSelectDir then
  begin
    WizardForm.PageNameLabel.Caption := 'Install INTERSOS Legal Platform';
    WizardForm.PageDescriptionLabel.Caption := 'Choose a folder and review the application summary';
    WizardForm.SelectDirLabel.Caption :=
      'Install on the Windows C: drive using the recommended folder, or choose another location.';
    WizardForm.SelectDirBrowseLabel.Caption :=
      'Choose a different folder with Browse, then select Install.';
    WizardForm.NextButton.Caption := 'Install';
  end;
  if CurPageID = wpReady then
  begin
    WizardForm.PageNameLabel.Caption := 'Install INTERSOS Legal Platform';
    WizardForm.PageDescriptionLabel.Caption := 'Ready to install for your Windows account';
    WizardForm.ReadyLabel.Caption := 'Review the details below, then select Install.';
    WizardForm.NextButton.Caption := 'Install';
  end;
  if CurPageID = wpInstalling then
  begin
    WizardForm.PageNameLabel.Caption := 'Installing INTERSOS Legal Platform';
    WizardForm.PageDescriptionLabel.Caption := 'This usually takes less than a minute';
  end;
  if CurPageID = wpFinished then
  begin
    WizardForm.FinishedHeadingLabel.Caption := 'Installation complete';
    WizardForm.FinishedLabel.Caption :=
      'INTERSOS Legal Platform was installed successfully.';
    WizardForm.NextButton.Caption := 'Finish';
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
    WizardForm.StatusLabel.Caption := 'Finishing setup...';
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
