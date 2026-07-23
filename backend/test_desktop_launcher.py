import threading
import time
import unittest
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


if __name__ == "__main__":
    unittest.main()
