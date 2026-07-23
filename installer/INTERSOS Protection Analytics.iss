#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif
#define MyAppName "INTERSOS Protection Analytics"
#define MyAppExeName "INTERSOS Protection Analytics.exe"
#define SigningCertificateName "INTERSOS-Code-Signing.cer"
#define SigningCertificateThumbprint "C4F1B12A3BCCC73BEF903FA3796304CF0E67670D"

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

[Files]
Source: "..\packaging-temp\dist\INTERSOS Protection Analytics\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "INTERSOS-Code-Signing.cer"; Flags: dontcopy

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
Filename: "{app}\{#MyAppExeName}"; Flags: nowait; Check: WizardSilent

[Code]
var
  CertificatePage: TWizardPage;
  CertificateConsent: TNewCheckBox;

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
var
  Details: TNewStaticText;
begin
  CertificatePage := CreateCustomPage(wpSelectTasks,
    'Enable trusted application updates',
    'Confirm the INTERSOS code-signing certificate');

  Details := TNewStaticText.Create(CertificatePage);
  Details.Parent := CertificatePage.Surface;
  Details.Left := 0;
  Details.Top := 0;
  Details.Width := CertificatePage.SurfaceWidth;
  Details.Height := ScaleY(150);
  Details.AutoSize := False;
  Details.WordWrap := True;
  Details.Caption :=
    'This setup will trust the public certificate used to verify future INTERSOS Protection Analytics updates for your Windows account.' + #13#10#13#10 +
    'Publisher: INTERSOS Protection Analytics' + #13#10 +
    'Certificate thumbprint:' + #13#10 +
    '{#SigningCertificateThumbprint}' + #13#10#13#10 +
    'The private signing key is not included in this installer.';

  CertificateConsent := TNewCheckBox.Create(CertificatePage);
  CertificateConsent.Parent := CertificatePage.Surface;
  CertificateConsent.Left := 0;
  CertificateConsent.Top := Details.Top + Details.Height + ScaleY(12);
  CertificateConsent.Width := CertificatePage.SurfaceWidth;
  CertificateConsent.Height := ScaleY(24);
  CertificateConsent.Caption :=
    'I confirm the publisher and allow trusted automatic updates.';
  CertificateConsent.Checked := False;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = CertificatePage.ID) and (not UpdateTrustReady) and
     (not CertificateConsent.Checked) then
  begin
    MsgBox('You must confirm the INTERSOS signing certificate to install the application and enable secure updates.',
      mbError, MB_OK);
    Result := False;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  CertificatePath: String;
  RootAdded: Boolean;
  PublisherAdded: Boolean;
begin
  Result := '';
  if UpdateTrustReady then
    exit;

  if WizardSilent then
  begin
    Result := 'The first installation must be run interactively so the INTERSOS signing certificate can be confirmed.';
    exit;
  end;

  if not CertificateConsent.Checked then
  begin
    Result := 'The INTERSOS signing certificate was not confirmed.';
    exit;
  end;

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
  end;
end;
