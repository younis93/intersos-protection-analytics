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
GWL_STYLE = -16
WS_OVERLAPPEDWINDOW = 0x00CF0000
MONITOR_DEFAULTTONEAREST = 2
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_NOZORDER = 0x0004
SWP_NOOWNERZORDER = 0x0200
SWP_FRAMECHANGED = 0x0020


class Point(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


class Rect(ctypes.Structure):
    _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long), ("right", ctypes.c_long), ("bottom", ctypes.c_long)]


class WindowPlacement(ctypes.Structure):
    _fields_ = [
        ("length", ctypes.c_uint),
        ("flags", ctypes.c_uint),
        ("show_cmd", ctypes.c_uint),
        ("min_position", Point),
        ("max_position", Point),
        ("normal_position", Rect),
    ]


class MonitorInfo(ctypes.Structure):
    _fields_ = [("size", ctypes.c_uint), ("monitor", Rect), ("work", Rect), ("flags", ctypes.c_uint)]


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


class NativeFullscreenController:
    def __init__(self, title: str) -> None:
        self.title = title
        self.fullscreen = False
        self.style = 0
        self.placement: WindowPlacement | None = None

    def toggle(self) -> bool:
        user32 = ctypes.windll.user32
        user32.FindWindowW.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p]
        user32.FindWindowW.restype = ctypes.c_void_p
        user32.GetWindowPlacement.argtypes = [ctypes.c_void_p, ctypes.POINTER(WindowPlacement)]
        user32.MonitorFromWindow.argtypes = [ctypes.c_void_p, ctypes.c_uint]
        user32.MonitorFromWindow.restype = ctypes.c_void_p
        user32.GetMonitorInfoW.argtypes = [ctypes.c_void_p, ctypes.POINTER(MonitorInfo)]
        user32.GetWindowLongW.argtypes = [ctypes.c_void_p, ctypes.c_int]
        user32.SetWindowLongW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_long]
        user32.SetWindowPlacement.argtypes = [ctypes.c_void_p, ctypes.POINTER(WindowPlacement)]
        user32.SetWindowPos.argtypes = [
            ctypes.c_void_p, ctypes.c_void_p,
            ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint,
        ]
        hwnd = user32.FindWindowW(None, self.title)
        if not hwnd:
            raise RuntimeError("The application window is not ready.")
        if not self.fullscreen:
            placement = WindowPlacement()
            placement.length = ctypes.sizeof(WindowPlacement)
            if not user32.GetWindowPlacement(hwnd, ctypes.byref(placement)):
                raise RuntimeError("Unable to read the application window state.")
            monitor = user32.MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST)
            info = MonitorInfo()
            info.size = ctypes.sizeof(MonitorInfo)
            if not monitor or not user32.GetMonitorInfoW(monitor, ctypes.byref(info)):
                raise RuntimeError("Unable to identify the application display.")
            self.style = user32.GetWindowLongW(hwnd, GWL_STYLE)
            self.placement = placement
            user32.SetWindowLongW(hwnd, GWL_STYLE, self.style & ~WS_OVERLAPPEDWINDOW)
            user32.SetWindowPos(
                hwnd, 0, info.monitor.left, info.monitor.top,
                info.monitor.right - info.monitor.left,
                info.monitor.bottom - info.monitor.top,
                SWP_NOOWNERZORDER | SWP_FRAMECHANGED,
            )
        else:
            user32.SetWindowLongW(hwnd, GWL_STYLE, self.style)
            if self.placement is not None:
                user32.SetWindowPlacement(hwnd, ctypes.byref(self.placement))
            user32.SetWindowPos(
                hwnd, 0, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_FRAMECHANGED,
            )
        self.fullscreen = not self.fullscreen
        return self.fullscreen


class DesktopApi:
    def __init__(self, fullscreen: Any) -> None:
        self.fullscreen = fullscreen

    def toggle_fullscreen(self) -> bool:
        return bool(self.fullscreen.toggle())


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
        window_title = f"{APP_TITLE} {APP_VERSION}"
        desktop_api = DesktopApi(NativeFullscreenController(window_title))
        webview.create_window(
            window_title,
            url,
            width=1440,
            height=900,
            min_size=(1100, 700),
            resizable=True,
            maximized=True,
            background_color="#f4f7fb",
            js_api=desktop_api,
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
