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
_state: dict[str, Any] = {"phase": "idle", "progress": 0, "error": None}
_available: dict[str, Any] | None = None


def _version(value: str) -> tuple[int, ...]:
    clean = value.strip().lstrip("v").split("-", 1)[0]
    return tuple(int(part) for part in clean.split("."))


def _json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "INTERSOS-Protection-Analytics"})
    with urllib.request.urlopen(request, timeout=12) as response:
        return json.load(response)


def check() -> dict[str, Any]:
    global _available
    base = {"enabled": ENABLED, "currentVersion": APP_VERSION, "available": False}
    if not ENABLED:
        return {**base, "message": "Update repository is not configured."}
    try:
        release = _json(f"https://api.github.com/repos/{REPOSITORY}/releases/latest")
        asset = next((item for item in release.get("assets", []) if item.get("name") == "update.json"), None)
        if not asset:
            return {**base, "message": "The latest release has no update manifest."}
        manifest = _json(asset["browser_download_url"])
        required = {"version", "installerUrl", "sha256", "publishedAt"}
        if not required.issubset(manifest) or len(str(manifest["sha256"])) != 64:
            raise ValueError("Invalid update manifest")
        available = _version(str(manifest["version"])) > _version(APP_VERSION)
        _available = manifest if available else None
        return {**base, "available": available, "latestVersion": manifest["version"], "notes": manifest.get("notes", ""), "publishedAt": manifest["publishedAt"]}
    except (OSError, ValueError, KeyError, urllib.error.URLError) as exc:
        return {**base, "message": f"Unable to check for updates: {exc}"}


def status() -> dict[str, Any]:
    with _lock:
        return {**_state, "currentVersion": APP_VERSION}


def _set(**values: Any) -> None:
    with _lock:
        _state.update(values)


def _installer_command(target: Path) -> list[str]:
    return [
        str(target),
        "/VERYSILENT",
        "/SUPPRESSMSGBOXES",
        "/CLOSEAPPLICATIONS",
        "/NORESTART",
        "/INTERSOSUPDATE",
    ]


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
        target = Path(tempfile.mkdtemp(prefix="intersos-update-")) / "INTERSOS-Protection-Analytics-Setup.exe"
        request = urllib.request.Request(url, headers={"User-Agent": "INTERSOS-Protection-Analytics"})
        _set(phase="downloading", progress=1, error=None)
        with urllib.request.urlopen(request, timeout=60) as response, target.open("wb") as output:
            total = int(response.headers.get("Content-Length") or 0)
            downloaded = 0
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
                downloaded += len(chunk)
                _set(progress=min(90, int(downloaded / total * 90)) if total else min(90, status()["progress"] + 1))
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
        creation_flags = 0
        if os.name == "nt":
            creation_flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        subprocess.Popen(
            _installer_command(target),
            close_fds=True,
            creationflags=creation_flags,
        )
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
    _set(phase="downloading", progress=0, error=None)
    threading.Thread(target=_download_and_install, args=(_available.copy(),), daemon=True).start()
    return status()
