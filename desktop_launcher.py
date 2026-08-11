"""Native Windows launcher for INTERSOS Protection Analytics."""
from __future__ import annotations

import ctypes
import json
import os
import secrets
import socket
import sys
import threading
import time
from pathlib import Path
from typing import Any

import uvicorn
import webview


APP_TITLE = "INTERSOS Protection Analytics"
APP_USER_MODEL_ID = "INTERSOS.ProtectionAnalytics"
SERVER_START_TIMEOUT = 20.0
GWL_STYLE = -16
WS_OVERLAPPEDWINDOW = 0x00CF0000
MONITOR_DEFAULTTONEAREST = 2
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_NOZORDER = 0x0004
SWP_NOOWNERZORDER = 0x0200
SWP_FRAMECHANGED = 0x0020


def settings_path() -> Path:
    base = Path(os.getenv("LOCALAPPDATA", Path.home())) / "INTERSOS Protection Analytics"
    return base / "settings.json"


def saved_legal_folder() -> Path | None:
    try:
        value = json.loads(settings_path().read_text(encoding="utf-8")).get("legalFolder", "")
        path = Path(value)
        return path if path.is_dir() else None
    except (OSError, ValueError, TypeError):
        return None


def save_legal_folder(path: Path) -> None:
    target = settings_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    settings = load_settings()
    settings["legalFolder"] = str(path)
    target.write_text(json.dumps(settings, indent=2), encoding="utf-8")


def load_settings() -> dict[str, Any]:
    try:
        data = json.loads(settings_path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def saved_analytics_workbook() -> Path | None:
    value = load_settings().get("analyticsWorkbook", "")
    path = Path(value)
    return path if path.is_file() and path.suffix.lower() == ".xlsx" else None


def save_analytics_workbook(path: Path) -> None:
    target = settings_path(); target.parent.mkdir(parents=True, exist_ok=True)
    settings = load_settings(); settings["analyticsWorkbook"] = str(path)
    target.write_text(json.dumps(settings, indent=2), encoding="utf-8")


def saved_legal_files() -> list[Path]:
    values = load_settings().get("legalFiles", [])
    if not isinstance(values, list): return []
    return [Path(value) for value in values if isinstance(value, str) and Path(value).is_file() and Path(value).suffix.lower() == ".csv"]


def save_legal_files(paths: list[Path]) -> None:
    target = settings_path(); target.parent.mkdir(parents=True, exist_ok=True)
    settings = load_settings(); settings["legalFiles"] = [str(path) for path in paths]
    target.write_text(json.dumps(settings, indent=2), encoding="utf-8")


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


def apply_windows_branding(window_title: str) -> None:
    """Apply the application identity to local Python and packaged windows."""
    if sys.platform != "win32":
        return
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_USER_MODEL_ID)
        icon_path = resource_path("intersos-protection-analytics.ico")
        if not icon_path.is_file():
            return
        user32 = ctypes.windll.user32
        hwnd = user32.FindWindowW(None, window_title)
        if not hwnd:
            return
        image_icon, load_from_file, wm_seticon = 1, 0x0010, 0x0080
        small = user32.LoadImageW(None, str(icon_path), image_icon, 16, 16, load_from_file)
        large = user32.LoadImageW(None, str(icon_path), image_icon, 32, 32, load_from_file)
        if small:
            user32.SendMessageW(hwnd, wm_seticon, 0, small)
        if large:
            user32.SendMessageW(hwnd, wm_seticon, 1, large)
        # Use a polished light caption until the web UI applies its saved theme.
        dwm = ctypes.windll.dwmapi.DwmSetWindowAttribute
        caption, text = ctypes.c_uint(0x00FCF4EA), ctypes.c_uint(0x00452B0E)
        dwm(hwnd, 35, ctypes.byref(caption), ctypes.sizeof(caption))
        dwm(hwnd, 36, ctypes.byref(text), ctypes.sizeof(text))
    except Exception:
        return


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

    def set_title_bar_theme(self, theme: str) -> bool:
        """Synchronize the native Windows caption with the active app theme.

        Caption-color support is Windows-version dependent, so a failed DWM call
        intentionally leaves the standard native title bar in place.
        """
        try:
            hwnd = ctypes.windll.user32.FindWindowW(None, self.title)
            if not hwnd:
                return False
            colors = {
                "glass-light": (0x00FCF4EA, 0x00452B0E, False),  # #EAF4FC / #0E2B45
                "glass-dark": (0x00331F0B, 0x00FFF9F5, True),   # #0B1F33 / #F5F9FF
                "unhcr": (0x00BC7200, 0x00FFFFFF, False),       # #0072BC / white
                "multicolor": (0x00FAF3F7, 0x00412C32, False),  # #F7F3FA / #322C41
                "executive": (0x00F2F1EE, 0x00302A20, False),   # #EEF1F2 / #202A30
            }
            caption, text, dark_mode = colors.get(theme, colors["glass-light"])
            dwm = ctypes.windll.dwmapi.DwmSetWindowAttribute
            caption_value, text_value = ctypes.c_uint(caption), ctypes.c_uint(text)
            dark_value = ctypes.c_int(int(dark_mode))
            caption_result = dwm(hwnd, 35, ctypes.byref(caption_value), ctypes.sizeof(caption_value))
            text_result = dwm(hwnd, 36, ctypes.byref(text_value), ctypes.sizeof(text_value))
            dwm(hwnd, 20, ctypes.byref(dark_value), ctypes.sizeof(dark_value))
            return caption_result == 0 and text_result == 0
        except Exception:
            return False


class DesktopApi:
    def __init__(self, fullscreen: Any) -> None:
        self.fullscreen = fullscreen

    def toggle_fullscreen(self) -> bool:
        return bool(self.fullscreen.toggle())

    def set_title_bar_theme(self, theme: str) -> bool:
        return bool(self.fullscreen.set_title_bar_theme(theme))

    def choose_legal_folder(self) -> str | None:
        previous = saved_legal_folder()
        selection = webview.windows[0].create_file_dialog(webview.FileDialog.FOLDER, str(previous or ""))
        if not selection:
            return None
        return str(Path(selection[0]).resolve())

    def process_legal_folder(self, selected_path: str) -> dict[str, Any]:
        folder = Path(selected_path).resolve()
        if not folder.is_dir():
            raise ValueError("The selected Legal Platform folder is no longer available.")
        from backend import main as backend_main
        from backend.legal_platform import LegalStore
        candidate = LegalStore.from_folder(folder)
        backend_main.legal_store = candidate
        save_legal_folder(folder)
        return candidate.metadata()

    def choose_analytics_workbook(self) -> str | None:
        previous = saved_analytics_workbook()
        selection = webview.windows[0].create_file_dialog(webview.FileDialog.OPEN, str((previous.parent if previous else "")), False, "", ("Excel workbook (*.xlsx)",))
        if not selection:
            return None
        return str(Path(selection[0]).resolve())

    def process_analytics_workbook(self, selected_path: str) -> dict[str, Any]:
        workbook = Path(selected_path).resolve()
        if not workbook.is_file() or workbook.suffix.lower() != ".xlsx":
            raise ValueError("The selected Excel workbook is no longer available.")
        from backend import main as backend_main
        from backend.analytics import DataStore
        backend_main.store = DataStore.from_path(workbook)
        save_analytics_workbook(workbook)
        return {"ready": True, **backend_main.store.metadata()}

    def refresh_legal_folder(self) -> dict[str, Any]:
        folder = saved_legal_folder()
        if not folder:
            raise ValueError("No previously selected Legal Platform folder is available.")
        return self.process_legal_folder(str(folder))

    def choose_legal_files(self) -> list[str] | None:
        previous = saved_legal_files()
        initial_folder = previous[0].parent if previous else saved_legal_folder()
        selection = webview.windows[0].create_file_dialog(webview.FileDialog.OPEN, str(initial_folder or ""), True, "", ("CSV files (*.csv)",))
        return [str(Path(path).resolve()) for path in selection] if selection else None

    def process_legal_files(self, selected_paths: list[str]) -> dict[str, Any]:
        paths = [Path(path).resolve() for path in selected_paths]
        if not paths or any(not path.is_file() or path.suffix.lower() != ".csv" for path in paths):
            raise ValueError("The selected CSV files are no longer available.")
        from backend import main as backend_main
        from backend.legal_platform import LegalStore, versioned_dataset_name
        selected: dict[str, tuple[int, Path]] = {}
        for path in paths:
            parsed = versioned_dataset_name(path.name)
            if not parsed: continue
            name, version = parsed
            current = selected.get(name)
            if current is None or version > current[0]: selected[name] = (version, path)
        payload = {name: path.read_bytes() for name, (_, path) in selected.items()}
        candidate = LegalStore.from_files(payload, "Selected Legal Platform CSV files")
        backend_main.legal_store = candidate
        save_legal_files(paths)
        return candidate.metadata()

    def refresh_legal_files(self) -> dict[str, Any]:
        paths = saved_legal_files()
        if not paths:
            raise ValueError("No previously selected Legal Platform CSV files are available.")
        return self.process_legal_files([str(path) for path in paths])

    def refresh_analytics_workbook(self) -> dict[str, Any]:
        workbook = saved_analytics_workbook()
        if not workbook:
            raise ValueError("No previously selected Protection Analytics workbook is available.")
        return self.process_analytics_workbook(str(workbook))


def main() -> None:
    os.environ["UNHCR_UPLOAD_ONLY"] = "1"
    os.environ["UNHCR_STATIC_DIR"] = str(resource_path("frontend", "dist"))
    os.environ["INTERSOS_LOCAL_SESSION_TOKEN"] = secrets.token_urlsafe(32)
    remembered_folder = saved_legal_folder()
    if remembered_folder:
        os.environ["INTERSOS_LEGAL_FOLDER"] = str(remembered_folder)
    remembered_legal_files = saved_legal_files()
    if remembered_legal_files:
        os.environ["INTERSOS_LEGAL_FILES"] = json.dumps([str(path) for path in remembered_legal_files])
    remembered_workbook = saved_analytics_workbook()
    if remembered_workbook:
        os.environ["INTERSOS_ANALYTICS_WORKBOOK"] = str(remembered_workbook)
        os.environ["UNHCR_WORKBOOK"] = str(remembered_workbook)
    from backend import main as backend_main
    from backend.version import APP_VERSION
    if sys.platform == "win32":
        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_USER_MODEL_ID)
        except Exception:
            pass

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
        webview.start(
            apply_windows_branding,
            (window_title,),
            gui="edgechromium",
            debug=False,
            private_mode=True,
            icon=str(resource_path("intersos-protection-analytics.ico")),
        )
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
