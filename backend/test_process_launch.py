import ctypes
import json
import os
import subprocess
import sys
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from backend import process_launch
import desktop_launcher as launcher


def test_fresh_environment_discards_old_runtime_and_keeps_user_settings(tmp_path):
    bundle = tmp_path / "old" / "_internal"
    sibling = tmp_path / "old" / "_internal-other"
    original = {
        "PATH": os.pathsep.join([str(bundle), str(bundle / "pythonwin"), str(sibling), "C:\\Windows"]),
        "_PYI_APPLICATION_HOME_DIR": str(bundle),
        "_PYI_PARENT_PROCESS_LEVEL": "1",
        "_MEIPASS2": str(bundle),
        "PYTHONNET_PYDLL": str(bundle / "python312.dll"),
        "LOCALAPPDATA": "preserved-profile",
    }
    with patch.dict(os.environ, original, clear=True), patch.object(sys, "_MEIPASS", str(bundle), create=True):
        result = process_launch.independent_environment()
        assert dict(os.environ) == original
    assert result["PATH"].split(os.pathsep) == [str(sibling), "C:\\Windows"]
    assert result["LOCALAPPDATA"] == "preserved-profile"
    assert result["PYINSTALLER_RESET_ENVIRONMENT"] == "1"
    assert not any(name.startswith("_PYI_") for name in result)
    assert "PYTHONNET_PYDLL" not in result
    assert "_MEIPASS2" not in result


@pytest.mark.skipif(sys.platform != "win32", reason="Windows DLL inheritance")
def test_real_child_has_clean_dll_directory_and_parent_is_restored(tmp_path):
    kernel = ctypes.windll.kernel32
    previous = ctypes.create_unicode_buffer(32768)
    kernel.GetDllDirectoryW(len(previous), previous)
    try:
        assert kernel.SetDllDirectoryW(str(tmp_path))
        with patch.object(sys, "frozen", True, create=True), patch.dict(os.environ, {"PYTHONNET_PYDLL": "old-runtime.dll"}):
            child = process_launch.launch_independent_process(
                [sys.executable, "-c", "import ctypes,json,os; b=ctypes.create_unicode_buffer(32768); ctypes.windll.kernel32.GetDllDirectoryW(len(b),b); import pythonnet; pythonnet.load(); print(json.dumps([b.value,os.getenv('PYTHONNET_PYDLL'),os.getenv('PYINSTALLER_RESET_ENVIRONMENT')]))"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            )
            restored = ctypes.create_unicode_buffer(32768)
            kernel.GetDllDirectoryW(len(restored), restored)
            assert restored.value == str(tmp_path)
        output, errors = child.communicate(timeout=20)
        assert child.returncode == 0, errors
        assert json.loads(output) == ["", None, "1"]
    finally:
        kernel.SetDllDirectoryW(previous.value or None)


def test_only_specific_runtime_failure_gets_one_recovery():
    error = RuntimeError("Failed to resolve Python.Runtime.Loader.Initialize from installed/Python.Runtime.dll")
    with patch.object(sys, "platform", "win32"), patch.object(sys, "frozen", True, create=True), patch.object(sys, "argv", ["app.exe"]):
        assert launcher.should_recover_native_runtime(error)
        assert not launcher.should_recover_native_runtime(RuntimeError("Missing WebView2"))
        with patch.object(sys, "argv", ["app.exe", "--native-runtime-recovery"]):
            assert not launcher.should_recover_native_runtime(error)
    with patch.object(sys, "frozen", False, create=True):
        assert not launcher.should_recover_native_runtime(error)


def test_recovery_closes_runtime_and_instance_before_relaunch():
    events = []
    instance = MagicMock()
    instance.acquire.return_value = True
    instance.close.side_effect = lambda: events.append("closed")
    runtime = MagicMock()
    runtime.backend_main = None
    runtime.stop.side_effect = lambda: events.append("stopped")
    webview = SimpleNamespace(settings={}, create_window=MagicMock(), start=MagicMock(
        side_effect=RuntimeError("Failed to resolve Python.Runtime.Loader.Initialize from test.dll")))
    with ExitStack() as stack:
        stack.enter_context(patch.dict(sys.modules, {"webview": webview}))
        stack.enter_context(patch.object(sys, "frozen", True, create=True))
        stack.enter_context(patch.object(sys, "platform", "win32"))
        stack.enter_context(patch.object(sys, "argv", ["app.exe", "--home"]))
        for name, value in {
            "SingleInstance": instance, "StartupRuntime": runtime,
            "StartupMetrics": MagicMock(), "NativeFullscreenController": MagicMock(),
            "DesktopApi": MagicMock(), "configure_legal_source_environment": None,
            "configured_indicator_master": None, "saved_app_theme": "glass-light",
            "workspace_startup_options": (54321, {}), "saved_startup_page": "home",
            "startup_html": "<html></html>",
        }.items():
            stack.enter_context(patch.object(launcher, name, return_value=value))
        show_error = stack.enter_context(patch.object(launcher, "show_error"))
        launch = stack.enter_context(patch.object(launcher, "launch_independent_process",
                                                side_effect=lambda *a, **k: events.append("launched")))
        launcher.main()
    assert events == ["stopped", "closed", "launched"]
    assert launch.call_args.args[0] == [sys.executable, "--home", "--native-runtime-recovery"]
    show_error.assert_not_called()
