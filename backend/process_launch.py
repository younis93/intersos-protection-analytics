"""Launch a fresh application without inheriting a frozen Python runtime."""
from __future__ import annotations

import ctypes
import os
import subprocess
import sys


def independent_environment() -> dict[str, str]:
    environment = dict(os.environ)
    for name in list(environment):
        if name.upper().startswith("_PYI_") or name.upper() in {"_MEIPASS2", "PYTHONNET_PYDLL"}:
            environment.pop(name)
    bundle = getattr(sys, "_MEIPASS", None)
    if bundle:
        root = os.path.normcase(os.path.abspath(bundle))
        environment["PATH"] = os.pathsep.join(
            entry for entry in environment.get("PATH", "").split(os.pathsep)
            if not (os.path.normcase(os.path.abspath(entry.strip('"'))) == root
                    or os.path.normcase(os.path.abspath(entry.strip('"'))).startswith(root + os.sep))
        )
    environment["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    return environment


def launch_independent_process(command: list[str], **arguments) -> subprocess.Popen:
    arguments["env"] = independent_environment()
    # Windows also inherits the DLL directory independently of environment variables.
    kernel = ctypes.windll.kernel32 if sys.platform == "win32" and getattr(sys, "frozen", False) else None
    previous = ctypes.create_unicode_buffer(32768)
    if kernel is not None:
        kernel.GetDllDirectoryW(len(previous), previous)
        if not kernel.SetDllDirectoryW(None):
            raise ctypes.WinError()
    try:
        return subprocess.Popen(command, **arguments)
    finally:
        if kernel is not None:
            kernel.SetDllDirectoryW(previous.value or None)
