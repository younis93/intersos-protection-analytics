import threading
import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

import desktop_launcher


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
        class FakeFullscreen:
            calls = 0
            state = False

            def toggle(self):
                self.calls += 1
                self.state = not self.state
                return self.state

        fullscreen = FakeFullscreen()
        api = desktop_launcher.DesktopApi(fullscreen)
        self.assertTrue(api.toggle_fullscreen())
        self.assertFalse(api.toggle_fullscreen())
        self.assertEqual(fullscreen.calls, 2)

    def test_local_server_starts_and_stops(self):
        with patch.object(desktop_launcher.uvicorn, "Config", return_value=object()), patch.object(
            desktop_launcher.uvicorn, "Server", side_effect=lambda config: FakeServer(config)
        ):
            server = desktop_launcher.LocalServer(object(), 54321)
            server.start(timeout=1)
            self.assertTrue(server.server.started)
            server.stop()
            self.assertFalse(server.thread.is_alive())

    def test_local_server_reports_early_failure(self):
        failed = FakeServer(object(), starts=False)
        with patch.object(desktop_launcher.uvicorn, "Config", return_value=object()), patch.object(
            desktop_launcher.uvicorn, "Server", return_value=failed
        ):
            server = desktop_launcher.LocalServer(object(), 54321)
            with self.assertRaisesRegex(RuntimeError, "could not start"):
                server.start(timeout=0.05)

    def test_available_port_is_local_and_bindable(self):
        port = desktop_launcher.available_port()
        self.assertGreater(port, 0)
        self.assertLessEqual(port, 65535)

    def test_last_legal_folder_is_saved_and_reloaded(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            settings = root / "settings.json"
            legal_folder = root / "legal-data"
            legal_folder.mkdir()
            with patch.object(desktop_launcher, "settings_path", return_value=settings):
                desktop_launcher.save_legal_folder(legal_folder)
                self.assertEqual(desktop_launcher.saved_legal_folder(), legal_folder)

    def test_cancelled_folder_picker_returns_without_processing(self):
        window = SimpleNamespace(create_file_dialog=lambda *_: None)
        with patch.object(desktop_launcher.webview, "windows", [window]):
            api = desktop_launcher.DesktopApi(SimpleNamespace(toggle=lambda: False))
            self.assertIsNone(api.choose_legal_folder())

    def test_folder_is_saved_only_after_successful_processing(self):
        with TemporaryDirectory() as temporary:
            folder = Path(temporary)
            candidate = SimpleNamespace(metadata=lambda: {"ready": True})
            api = desktop_launcher.DesktopApi(SimpleNamespace(toggle=lambda: False))
            with patch("backend.legal_platform.LegalStore.from_folder", return_value=candidate), patch.object(
                desktop_launcher, "save_legal_folder"
            ) as save:
                result = api.process_legal_folder(str(folder))
                self.assertTrue(result["ready"])
                save.assert_called_once_with(folder.resolve())

    def test_failed_folder_processing_does_not_save_folder(self):
        with TemporaryDirectory() as temporary:
            folder = Path(temporary)
            api = desktop_launcher.DesktopApi(SimpleNamespace(toggle=lambda: False))
            with patch("backend.legal_platform.LegalStore.from_folder", side_effect=ValueError("invalid")), patch.object(
                desktop_launcher, "save_legal_folder"
            ) as save:
                with self.assertRaisesRegex(ValueError, "invalid"):
                    api.process_legal_folder(str(folder))
                save.assert_not_called()


if __name__ == "__main__":
    unittest.main()
