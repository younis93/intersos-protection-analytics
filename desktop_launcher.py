"""Native Windows launcher for INTERSOS Protection Analytics."""
from __future__ import annotations

import ctypes
import os
import socket
import sys
import threading
import time
from pathlib import Path
from typing import Any

import uvicorn
import webview


APP_TITLE = "INTERSOS Protection Analytics"
SERVER_START_TIMEOUT = 20.0


def resource_path(*parts: str) -> Path:
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return root.joinpath(*parts)


def available_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def show_error(message: str) -> None:
    ctypes.windll.user32.MessageBoxW(0, message, APP_TITLE, 0x10)


class LocalServer:
    def __init__(self, app: Any, port: int) -> None:
        config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
        self.server = uvicorn.Server(config)
        self.thread = threading.Thread(target=self.server.run, name="intersos-local-api", daemon=True)

    def start(self, timeout: float = SERVER_START_TIMEOUT) -> None:
        self.thread.start()
        deadline = time.monotonic() + timeout
        while not self.server.started and self.thread.is_alive() and time.monotonic() < deadline:
            time.sleep(0.05)
        if not self.server.started:
            self.server.should_exit = True
            self.thread.join(timeout=2)
            raise RuntimeError("The local analytics service could not start.")

    def stop(self) -> None:
        self.server.should_exit = True
        if self.thread.is_alive():
            self.thread.join(timeout=5)


def main() -> None:
    os.environ["UNHCR_UPLOAD_ONLY"] = "1"
    os.environ["UNHCR_STATIC_DIR"] = str(resource_path("frontend", "dist"))
    from backend import main as backend_main
    from backend.version import APP_VERSION

    port = available_port()
    url = f"http://127.0.0.1:{port}"
    local_server = LocalServer(backend_main.app, port)
    try:
        local_server.start()
    except Exception as exc:
        show_error(f"Unable to start {APP_TITLE}.\n\n{exc}")
        return

    webview.settings["ALLOW_DOWNLOADS"] = True
    webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True
    try:
        webview.create_window(
            f"{APP_TITLE} {APP_VERSION}",
            url,
            width=1440,
            height=900,
            min_size=(1100, 700),
            resizable=True,
            maximized=True,
            background_color="#f4f7fb",
        )
        webview.start(gui="edgechromium", debug=False, private_mode=True)
    except Exception as exc:
        show_error(
            "The application window could not start. Ensure Microsoft Edge WebView2 Runtime "
            f"is installed, then try again.\n\n{exc}"
        )
    finally:
        local_server.stop()
        backend_main.store = None


if __name__ == "__main__":
    main()
