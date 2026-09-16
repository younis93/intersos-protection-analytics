import os
import pickle
import sys
import threading
import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import Mock, patch

import desktop_launcher as launcher
from backend.legal_platform import LegalStore
from backend.test_legal_platform import required_payload


class FakeKernel32:
    def __init__(self, already_exists=False, waits=None):
        self.already_exists = already_exists
        self.waits = list(waits or [])
        self.signals = 0
        self.closed = []

    def CreateEventW(self, *_args): return 101
    def CreateMutexW(self, *_args): return 202
    def GetLastError(self): return launcher.ERROR_ALREADY_EXISTS if self.already_exists else 0
    def SetEvent(self, _handle): self.signals += 1; return True
    def ResetEvent(self, _handle): return True
    def CloseHandle(self, handle): self.closed.append(handle); return True
    def WaitForSingleObject(self, _handle, _timeout):
        if self.waits:
            return self.waits.pop(0)
        time.sleep(0.01)
        return launcher.WAIT_TIMEOUT


class FakeWindow:
    def __init__(self):
        self.loaded_url = ""
        self.loaded_html = ""

    def load_url(self, url): self.loaded_url = url
    def load_html(self, html): self.loaded_html = html


class FakeServer:
    def __init__(self, _config, starts=True):
        self.started = False
        self.should_exit = False
        self.starts = starts

    def run(self):
        if self.starts:
            self.started = True
            while not self.should_exit:
                time.sleep(0.001)


class DesktopLauncherTests(unittest.TestCase):
    def test_native_fullscreen_api_toggles_window(self):
        fullscreen = SimpleNamespace(state=False)
        def toggle():
            fullscreen.state = not fullscreen.state
            return fullscreen.state
        fullscreen.toggle = toggle
        api = launcher.DesktopApi(fullscreen)
        self.assertTrue(api.toggle_fullscreen())
        self.assertFalse(api.toggle_fullscreen())

    def test_native_fullscreen_controller_uses_attached_window(self):
        window = SimpleNamespace(calls=0)
        def toggle(): window.calls += 1
        window.toggle_fullscreen = toggle
        fullscreen = launcher.NativeFullscreenController("Test window")
        fullscreen.attach_window(window)
        self.assertTrue(fullscreen.toggle())
        self.assertFalse(fullscreen.toggle())
        self.assertEqual(window.calls, 2)

    def test_local_server_starts_and_stops(self):
        uvicorn = SimpleNamespace(Config=Mock(return_value=object()), Server=lambda config: FakeServer(config))
        with patch.dict(sys.modules, {"uvicorn": uvicorn}):
            server = launcher.LocalServer(object(), 54321)
        server.start(timeout=1)
        self.assertTrue(server.server.started)
        server.stop()
        self.assertFalse(server.thread.is_alive())

    def test_local_server_reports_early_failure(self):
        failed = FakeServer(object(), starts=False)
        uvicorn = SimpleNamespace(Config=Mock(return_value=object()), Server=Mock(return_value=failed))
        with patch.dict(sys.modules, {"uvicorn": uvicorn}):
            server = launcher.LocalServer(object(), 54321)
        with self.assertRaisesRegex(RuntimeError, "could not start"):
            server.start(timeout=0.05)

    def test_available_port_is_local_and_bindable(self):
        self.assertLessEqual(launcher.available_port(), 65535)

    def test_desktop_initialization_only_applies_branding(self):
        with patch.object(launcher, "apply_windows_branding") as branding:
            launcher.initialize_desktop("Iraq Data Analysis", "glass-light")
        branding.assert_called_once_with("Iraq Data Analysis", "glass-light")

    def test_deferred_legal_restore_starts_background_loader(self):
        called = threading.Event()
        backend_main = SimpleNamespace(legal_store_loading=False, load_initial_legal_store=called.set)
        thread = launcher.start_legal_restore(backend_main)
        thread.join(timeout=1)
        self.assertTrue(backend_main.legal_store_loading)
        self.assertTrue(called.is_set())

    def test_legal_store_can_cross_the_restore_process_boundary(self):
        store = LegalStore.from_files(required_payload(), "test")
        restored = pickle.loads(pickle.dumps(store))
        self.assertEqual(restored.metadata()["overview"]["beneficiaries"], 2)
        self.assertIsNotNone(restored._cache_lock)

    def test_last_legal_folder_is_saved_and_reloaded(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary); settings = root / "settings.json"; legal_folder = root / "legal-data"; legal_folder.mkdir()
            with patch.object(launcher, "settings_path", return_value=settings):
                launcher.save_legal_folder(legal_folder)
                self.assertEqual(launcher.saved_legal_folder(), legal_folder)

    def test_cancelled_folder_picker_returns_without_processing(self):
        webview = SimpleNamespace(windows=[SimpleNamespace(create_file_dialog=lambda *_: None)], FileDialog=SimpleNamespace(FOLDER="folder"))
        with patch.dict(sys.modules, {"webview": webview}):
            api = launcher.DesktopApi(SimpleNamespace(toggle=lambda: False))
            self.assertIsNone(api.choose_legal_folder())

    def test_folder_is_saved_only_after_successful_processing(self):
        with TemporaryDirectory() as temporary:
            folder = Path(temporary)
            candidate = SimpleNamespace(metadata=lambda: {"ready": True})
            api = launcher.DesktopApi(SimpleNamespace(toggle=lambda: False))
            with patch("backend.legal_platform.LegalStore.from_folder", return_value=candidate), patch.object(launcher, "save_legal_folder") as save:
                result = api.process_legal_folder(str(folder))
            self.assertTrue(result["ready"]); save.assert_called_once_with(folder.resolve())

    def test_failed_folder_processing_does_not_save_folder(self):
        with TemporaryDirectory() as temporary:
            folder = Path(temporary); api = launcher.DesktopApi(SimpleNamespace(toggle=lambda: False))
            with patch("backend.legal_platform.LegalStore.from_folder", side_effect=ValueError("invalid")), patch.object(launcher, "save_legal_folder") as save:
                with self.assertRaisesRegex(ValueError, "invalid"): api.process_legal_folder(str(folder))
            save.assert_not_called()

    def test_secondary_instance_signals_and_exits(self):
        kernel = FakeKernel32(already_exists=True)
        instance = launcher.SingleInstance(kernel32=kernel, user32=object())
        with patch.object(sys, "platform", "win32"), patch.object(launcher, "_focus_existing_window", return_value=True) as focus:
            self.assertFalse(instance.acquire())
        focus.assert_called_once()
        self.assertGreaterEqual(kernel.signals, 1)
        self.assertEqual(kernel.closed, [101, 202])

    def test_pending_activation_is_retried_until_window_exists(self):
        kernel = FakeKernel32(waits=[launcher.WAIT_OBJECT_0, launcher.WAIT_TIMEOUT])
        instance = launcher.SingleInstance(kernel32=kernel, user32=object())
        instance.primary = True
        instance.activation_event = 101
        with patch.object(launcher, "_focus_existing_window", side_effect=[False, True]) as focus:
            instance.watch()
            deadline = time.monotonic() + 1
            while focus.call_count < 2 and time.monotonic() < deadline:
                time.sleep(0.01)
            instance.close()
        self.assertGreaterEqual(focus.call_count, 2)

    def test_loading_view_uses_saved_theme_and_failure_message(self):
        expected_backgrounds = {
            "glass-light": "#eef5fb",
            "glass-dark": "#07131e",
            "unhcr": "#f3f7fa",
            "executive": "#f4f2ed",
            "multicolor": "#f3f5f9",
        }
        for theme, background in expected_backgrounds.items():
            with self.subTest(theme=theme):
                html = launcher.startup_html(theme, startup_epoch_ms=1_000)
                self.assertIn(f'data-theme="{theme}"', html)
                self.assertIn(background, html)
                self.assertIn("Preparing your workspace", html)
                self.assertIn("Starting the secure local application.", html)
                self.assertIn('class="startup"', html)
                self.assertIn("data:image/png;base64,", html)
                self.assertIn("@keyframes orbit", html)
        self.assertIn("Unable to start Iraq Data Analysis", launcher.startup_html("glass-light", failed=True))

    def test_runtime_failure_replaces_loading_view_and_stops_cleanly(self):
        window = FakeWindow()
        runtime = launcher.StartupRuntime("glass-light")
        with TemporaryDirectory() as temporary:
            metrics = launcher.StartupMetrics(); metrics.path = Path(temporary) / "startup.log"
            with patch.dict(os.environ, {"INTERSOS_DEFER_LEGAL_LOAD": "1"}), patch.object(launcher.LocalServer, "start", side_effect=RuntimeError("test startup failure")):
                runtime.initialize(window, "http://127.0.0.1:45678/", metrics)
        self.assertIn("Unable to start Iraq Data Analysis", window.loaded_html)
        runtime.stop()

    @unittest.skipUnless(sys.platform == "win32", "Windows named-object integration test")
    def test_windows_mutex_allows_only_one_instance_and_releases_after_close(self):
        first = launcher.SingleInstance()
        second = launcher.SingleInstance()
        third = launcher.SingleInstance()
        try:
            self.assertTrue(first.acquire())
            with patch.object(launcher, "_focus_existing_window", return_value=True):
                self.assertFalse(second.acquire())
            first.close()
            self.assertTrue(third.acquire())
        finally:
            first.close(); second.close(); third.close()


if __name__ == "__main__":
    unittest.main()
