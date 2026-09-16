from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .version import APP_VERSION, DEFAULT_GITHUB_REPOSITORY

REPOSITORY = os.getenv("INTERSOS_GITHUB_REPOSITORY", DEFAULT_GITHUB_REPOSITORY).strip()
SIGNING_CERTIFICATE_THUMBPRINT = "C4F1B12A3BCCC73BEF903FA3796304CF0E67670D"
ENABLED = "/" in REPOSITORY and not REPOSITORY.startswith("YOUR_")
_lock = threading.Lock()
_state: dict[str, Any] = {"phase": "idle", "progress": 0, "error": None, "downloadedBytes": 0, "totalBytes": 0}
_available: dict[str, Any] | None = None

UPDATE_RUNNER = r'''param(
    [Parameter(Mandatory=$true)][int]$ApplicationProcessId,
    [Parameter(Mandatory=$true)][string]$ApplicationPath,
    [Parameter(Mandatory=$true)][string]$InstallerPath,
    [Parameter(Mandatory=$true)][string]$ExpectedVersion
)

$ErrorActionPreference = 'Stop'
$UpdateRoot = Split-Path -Parent $InstallerPath
$InstallDirectory = Split-Path -Parent $ApplicationPath
$RunnerLog = Join-Path $UpdateRoot 'update-runner.log'
$InstallerLog = Join-Path $UpdateRoot 'update-installer.log'

function Write-UpdateLog([string]$Message) {
    Add-Content -LiteralPath $RunnerLog -Value "$(Get-Date -Format o) $Message" -Encoding UTF8
}

function Test-ApplicationRunning {
    $ExpectedPath = [IO.Path]::GetFullPath($ApplicationPath)
    $ProcessName = [IO.Path]::GetFileNameWithoutExtension($ApplicationPath)
    foreach ($Process in @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)) {
        try {
            if ($Process.Path -and ([IO.Path]::GetFullPath($Process.Path) -ieq $ExpectedPath)) {
                return $true
            }
        } catch {
            if ($Process.Id -eq $ApplicationProcessId) { return $true }
        }
    }
    return $false
}

function Show-UpdateFailure([string]$Message) {
    if ($env:INTERSOS_UPDATE_NO_DIALOG -eq '1') { return }
    try {
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show(
            "$Message`n`nDiagnostic log:`n$RunnerLog",
            'Iraq Data Analysis update failed',
            'OK',
            'Error'
        ) | Out-Null
    } catch {}
}

try {
    Write-UpdateLog "Runner started for version $ExpectedVersion."
    $Deadline = (Get-Date).AddSeconds(120)
    while (Test-ApplicationRunning) {
        if ((Get-Date) -ge $Deadline) {
            throw 'The running application did not close within 120 seconds.'
        }
        Start-Sleep -Milliseconds 250
    }

    Write-UpdateLog 'Application process closed. Starting the installer.'
    $InstallerArguments = @(
        '/VERYSILENT',
        '/SUPPRESSMSGBOXES',
        '/CLOSEAPPLICATIONS',
        '/NORESTARTAPPLICATIONS',
        '/NORESTART',
        '/INTERSOSUPDATE',
        '/EXTERNALRELAUNCH',
        "/DIR=$InstallDirectory",
        "/LOG=$InstallerLog"
    )
    & $InstallerPath @InstallerArguments
    $InstallerExitCode = $LASTEXITCODE
    Write-UpdateLog "Installer exited with code $InstallerExitCode."
    if ($InstallerExitCode -notin @(0, 3010)) {
        throw "The installer failed with exit code $InstallerExitCode."
    }

    $VersionMarker = Join-Path $InstallDirectory 'app-version.txt'
    if (-not (Test-Path -LiteralPath $VersionMarker)) {
        throw 'The installed version marker was not created.'
    }
    $InstalledVersion = (Get-Content -LiteralPath $VersionMarker -Raw).Trim()
    if ($InstalledVersion -ne $ExpectedVersion) {
        throw "Installed version $InstalledVersion does not match expected version $ExpectedVersion."
    }
    if (-not (Test-Path -LiteralPath $ApplicationPath)) {
        throw 'The updated application executable was not found.'
    }

    Write-UpdateLog "Version $InstalledVersion verified. Relaunching the application."
    Start-Process -FilePath $ApplicationPath -WorkingDirectory $InstallDirectory
    Write-UpdateLog 'Update completed successfully.'
    exit 0
} catch {
    $Failure = $_.Exception.Message
    Write-UpdateLog "ERROR: $Failure"
    Show-UpdateFailure $Failure
    exit 1
}
'''


def _version(value: str) -> tuple[int, ...]:
    clean = value.strip().lstrip("v").split("-", 1)[0]
    return tuple(int(part) for part in clean.split("."))


def _json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "INTERSOS-Legal-Platform"})
    with urllib.request.urlopen(request, timeout=12) as response:
        return json.load(response)


def check() -> dict[str, Any]:
    global _available
    base = {"enabled": ENABLED, "currentVersion": APP_VERSION, "available": False}
    if not ENABLED:
        return {**base, "message": "Update repository is not configured."}
    try:
        manifest = _json(f"https://github.com/{REPOSITORY}/releases/latest/download/update.json")
        required = {"version", "installerUrl", "sha256", "publishedAt", "sizeBytes"}
        size_bytes = manifest.get("sizeBytes")
        if not required.issubset(manifest) or len(str(manifest["sha256"])) != 64 or isinstance(size_bytes, bool) or not isinstance(size_bytes, int) or size_bytes <= 0:
            raise ValueError("Invalid update manifest")
        available = _version(str(manifest["version"])) > _version(APP_VERSION)
        _available = manifest if available else None
        return {**base, "available": available, "latestVersion": manifest["version"], "notes": manifest.get("notes", ""), "publishedAt": manifest["publishedAt"], "sizeBytes": size_bytes}
    except (OSError, ValueError, KeyError, urllib.error.URLError) as exc:
        return {**base, "message": f"Unable to check for updates: {exc}"}


def status() -> dict[str, Any]:
    with _lock:
        return {**_state, "currentVersion": APP_VERSION}


def _set(**values: Any) -> None:
    with _lock:
        _state.update(values)


def _installer_command(target: Path, install_directory: Path | None = None, log_path: Path | None = None) -> list[str]:
    command = [
        str(target),
        "/VERYSILENT",
        "/SUPPRESSMSGBOXES",
        "/CLOSEAPPLICATIONS",
        "/NORESTARTAPPLICATIONS",
        "/NORESTART",
        "/INTERSOSUPDATE",
        "/EXTERNALRELAUNCH",
    ]
    if install_directory is not None:
        command.append(f"/DIR={install_directory}")
    if log_path is not None:
        command.append(f"/LOG={log_path}")
    return command


def _write_update_runner(target: Path) -> Path:
    runner = target.with_name("run-update.ps1")
    runner.write_text(UPDATE_RUNNER, encoding="utf-8-sig")
    return runner


def _relaunch_command(
    target: Path,
    application: Path,
    expected_version: str,
    process_id: int | None = None,
) -> list[str]:
    runner = _write_update_runner(target)
    return [
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-File",
        str(runner),
        "-ApplicationProcessId",
        str(process_id if process_id is not None else os.getpid()),
        "-ApplicationPath",
        str(application),
        "-InstallerPath",
        str(target),
        "-ExpectedVersion",
        expected_version,
    ]


def _start_update_runner(command: list[str], target: Path) -> subprocess.Popen:
    # PowerShell silently exits without executing -File under DETACHED_PROCESS.
    # Give it a hidden console and valid standard handles instead.
    process = subprocess.Popen(
        command,
        close_fds=True,
        creationflags=(subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
                       | getattr(subprocess, "CREATE_BREAKAWAY_FROM_JOB", 0x01000000)),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    log = target.with_name("update-runner.log")
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if log.exists() and log.stat().st_size:
            return process
        if process.poll() is not None:
            raise RuntimeError(f"Update runner exited before starting (code {process.returncode}). The application has not been closed.")
        time.sleep(0.1)
    process.terminate()
    process.wait(timeout=5)
    raise RuntimeError("Update runner did not confirm startup. The application has not been closed.")


def _cleanup_stale_downloads() -> None:
    cutoff = time.time() - 24 * 60 * 60
    for directory in Path(tempfile.gettempdir()).glob("intersos-update-*"):
        try:
            if directory.is_dir() and directory.stat().st_mtime < cutoff:
                shutil.rmtree(directory)
        except OSError:
            continue


def _trusted_installer_url(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    trusted_host = host == "github.com" or host == "githubusercontent.com" or host.endswith(".githubusercontent.com")
    return parsed.scheme == "https" and trusted_host


def _has_expected_signature(output: str) -> bool:
    details = [line.strip() for line in output.splitlines() if line.strip()]
    return (
        len(details) >= 2
        and details[0] == "Valid"
        and details[1].replace(" ", "").upper() == SIGNING_CERTIFICATE_THUMBPRINT
    )


def _download_and_install(manifest: dict[str, Any]) -> None:
    try:
        _cleanup_stale_downloads()
        url = str(manifest["installerUrl"])
        if not _trusted_installer_url(url):
            raise ValueError("Untrusted installer URL")
        target = Path(tempfile.mkdtemp(prefix="intersos-update-")) / "INTERSOS-Legal-Platform-Setup.exe"
        request = urllib.request.Request(url, headers={"User-Agent": "INTERSOS-Legal-Platform"})
        total = int(manifest["sizeBytes"])
        _set(phase="downloading", progress=1, error=None, downloadedBytes=0, totalBytes=total)
        with urllib.request.urlopen(request, timeout=60) as response, target.open("wb") as output:
            downloaded = 0
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
                downloaded += len(chunk)
                _set(progress=min(90, int(downloaded / total * 90)), downloadedBytes=min(downloaded, total), totalBytes=total)
        if downloaded != total:
            raise ValueError("Downloaded installer size does not match the release manifest")
        _set(phase="verifying", progress=94)
        hasher = hashlib.sha256()
        with target.open("rb") as downloaded_file:
            while chunk := downloaded_file.read(1024 * 1024):
                hasher.update(chunk)
        digest = hasher.hexdigest()
        if digest.lower() != str(manifest["sha256"]).lower():
            target.unlink(missing_ok=True)
            raise ValueError("Downloaded installer checksum does not match the release manifest")
        if os.name == "nt" and (getattr(sys, "frozen", False) or os.getenv("INTERSOS_REQUIRE_SIGNED_UPDATES") == "1"):
            escaped_target = str(target).replace("'", "''")
            signature = subprocess.run(
                ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", f"$s=Get-AuthenticodeSignature -LiteralPath '{escaped_target}'; Write-Output $s.Status; Write-Output $s.SignerCertificate.Thumbprint"],
                capture_output=True, text=True, timeout=20, check=False,
            )
            if not _has_expected_signature(signature.stdout):
                target.unlink(missing_ok=True)
                raise ValueError("The update installer is not signed by the expected INTERSOS certificate")
        _set(phase="installing", progress=98)
        if os.name == "nt" and getattr(sys, "frozen", False):
            command = _relaunch_command(target, Path(sys.executable), str(manifest["version"]), os.getpid())
            _start_update_runner(command, target)
        else:
            subprocess.Popen(_installer_command(target), close_fds=True)
        _set(phase="restarting", progress=100)
        if getattr(sys, "frozen", False):
            time.sleep(3)
            os._exit(0)
    except Exception as exc:
        _set(phase="error", error=str(exc))


def install() -> dict[str, Any]:
    if not _available:
        result = check()
        if not result.get("available") or not _available:
            raise ValueError(result.get("message") or "No update is available")
    if status()["phase"] in {"downloading", "verifying", "installing", "restarting"}:
        return status()
    _set(phase="downloading", progress=0, error=None, downloadedBytes=0, totalBytes=int(_available["sizeBytes"]))
    threading.Thread(target=_download_and_install, args=(_available.copy(),), daemon=True).start()
    return status()
