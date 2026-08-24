"""Native Windows launcher for Iraq Data Analysis."""
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


APP_TITLE = "Iraq Data Analysis"
APP_USER_MODEL_ID = "INTERSOS.IraqDataAnalysis"
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
    # Keep the existing data location so current Legal Platform settings carry over.
    base = Path(os.getenv("LOCALAPPDATA", Path.home())) / "INTERSOS Legal Platform"
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
    settings["legalSource"] = "folder"
    target.write_text(json.dumps(settings, indent=2), encoding="utf-8")


def load_settings() -> dict[str, Any]:
    try:
        data = json.loads(settings_path().read_text(encoding="utf-8"))
        if isinstance(data, dict): return data
    except (OSError, ValueError, TypeError):
        pass
    return {}


THEME_NAMES = {"glass-light", "glass-dark", "unhcr", "executive", "multicolor"}


def saved_app_theme() -> str:
    theme = str(load_settings().get("appTheme", "glass-light"))
    return theme if theme in THEME_NAMES else "glass-light"


def save_app_theme(theme: str) -> None:
    if theme not in THEME_NAMES:
        return
    target = settings_path(); target.parent.mkdir(parents=True, exist_ok=True)
    settings = load_settings(); settings["appTheme"] = theme
    target.write_text(json.dumps(settings, indent=2), encoding="utf-8")


def theme_background(theme: str) -> str:
    """Return the webview background used while the frontend is loading."""
    return {
        "glass-light": "#eef5fb",
        "glass-dark": "#07131e",
        "unhcr": "#f3f7fa",
        "executive": "#f4f2ed",
        "multicolor": "#f3f5f9",
    }.get(theme, "#eef5fb")


def saved_legal_files() -> list[Path]:
    values = load_settings().get("legalFiles", [])
    if not isinstance(values, list): return []
    return [Path(value) for value in values if isinstance(value, str) and Path(value).is_file() and Path(value).suffix.lower() == ".csv"]


def save_legal_files(paths: list[Path]) -> None:
    target = settings_path(); target.parent.mkdir(parents=True, exist_ok=True)
    settings = load_settings(); settings["legalFiles"] = [str(path) for path in paths]; settings["legalSource"] = "files"
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


def apply_windows_branding(window_title: str, theme: str = "glass-light") -> None:
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
        # Apply the saved app theme before the web UI is ready.
        dwm = ctypes.windll.dwmapi.DwmSetWindowAttribute
        colors = {
            "glass-light": (0x00FBF5EE, 0x00342212),
            "glass-dark": (0x001E1307, 0x00FFF7ED),
            "unhcr": (0x00BC7200, 0x00FFFFFF),
            "multicolor": (0x00F9F5F3, 0x00372818),
            "executive": (0x00EDF2F4, 0x00302A20),
        }
        caption_color, text_color = colors.get(theme, colors["glass-light"])
        caption, text = ctypes.c_uint(caption_color), ctypes.c_uint(text_color)
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
            if theme not in THEME_NAMES:
                return False
            save_app_theme(theme)
            hwnd = ctypes.windll.user32.FindWindowW(None, self.title)
            if not hwnd:
                return False
            colors = {
                "glass-light": (0x00FBF5EE, 0x00342212, False),  # #EEF5FB / #122234
                "glass-dark": (0x001E1307, 0x00FFF7ED, True),    # #07131E / #EDF7FF
                "unhcr": (0x00BC7200, 0x00FFFFFF, False),       # #0072BC / white
                "multicolor": (0x00F9F5F3, 0x00372818, False),  # #F3F5F9 / #182837
                "executive": (0x00EDF2F4, 0x00302A20, False),   # #F4F2ED / #202A30
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
        self._legal_import_progress = 0

    def get_legal_import_progress(self) -> int:
        return self._legal_import_progress

    def toggle_fullscreen(self) -> bool:
        return bool(self.fullscreen.toggle())

    def set_title_bar_theme(self, theme: str) -> bool:
        return bool(self.fullscreen.set_title_bar_theme(theme))

    def get_saved_app_theme(self) -> str:
        return saved_app_theme()

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
        self._legal_import_progress = 0
        candidate = LegalStore.from_folder(folder, lambda percent: setattr(self, "_legal_import_progress", percent))
        candidate.set_review_exclusions(backend_main.duplicate_exclusions.exclusion_rows())
        backend_main.legal_store = candidate
        save_legal_folder(folder)
        self._legal_import_progress = 97
        metadata = candidate.metadata()
        self._legal_import_progress = 100
        return metadata

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
            if current is None or version > current[0] or (version == current[0] and path.stat().st_mtime > current[1].stat().st_mtime): selected[name] = (version, path)
        self._legal_import_progress = 0
        payload = {name: path.read_bytes() for name, (_, path) in selected.items()}
        self._legal_import_progress = 15
        candidate = LegalStore.from_files(payload, "Selected Legal Platform CSV files", lambda percent: setattr(self, "_legal_import_progress", percent))
        candidate.set_review_exclusions(backend_main.duplicate_exclusions.exclusion_rows())
        backend_main.legal_store = candidate
        save_legal_files(paths)
        self._legal_import_progress = 97
        metadata = candidate.metadata()
        self._legal_import_progress = 100
        return metadata

    def refresh_legal_files(self) -> dict[str, Any]:
        paths = saved_legal_files()
        if not paths:
            raise ValueError("No previously selected Legal Platform CSV files are available.")
        return self.process_legal_files([str(path) for path in paths])

def main() -> None:
    os.environ["UNHCR_UPLOAD_ONLY"] = "1"
    os.environ["UNHCR_STATIC_DIR"] = str(resource_path("frontend", "dist"))
    os.environ["INTERSOS_LOCAL_SESSION_TOKEN"] = secrets.token_urlsafe(32)
    legal_settings = load_settings()
    remembered_source = str(legal_settings.get("legalSource", "folder"))
    has_remembered_source = bool(
        legal_settings.get("legalFiles") if remembered_source == "files" else legal_settings.get("legalFolder")
    )
    os.environ["INTERSOS_LEGAL_SOURCE_CONFIGURED"] = "1" if has_remembered_source else "0"
    remembered_folder = saved_legal_folder()
    if remembered_folder:
        os.environ["INTERSOS_LEGAL_FOLDER"] = str(remembered_folder)
    remembered_legal_files = legal_settings.get("legalFiles", [])
    if isinstance(remembered_legal_files, list):
        remembered_legal_files = [path for path in remembered_legal_files if isinstance(path, str)]
    else:
        remembered_legal_files = []
    if remembered_legal_files:
        os.environ["INTERSOS_LEGAL_FILES"] = json.dumps(remembered_legal_files)
    os.environ["INTERSOS_LEGAL_SOURCE"] = remembered_source
    # Show the native window immediately. Legal CSV restoration is expensive
    # and continues in the background once the local server is available.
    os.environ.setdefault("INTERSOS_DEFER_LEGAL_LOAD", "1")
    from backend import main as backend_main
    from backend.version import APP_VERSION
    if sys.platform == "win32":
        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_USER_MODEL_ID)
        except Exception:
            pass

    port = available_port()
    startup_theme = saved_app_theme()
    # Private WebView profiles intentionally do not retain localStorage. Put the
    # native persisted theme in the initial URL so React cannot reset it to light
    # while the bridge is still starting.
    url = f"http://127.0.0.1:{port}/?appTheme={startup_theme}#/legal/overview"
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
            background_color=theme_background(startup_theme),
            js_api=desktop_api,
        )
        threading.Thread(target=backend_main.load_initial_legal_store, name="restore-legal-data", daemon=True).start()
        webview.start(
            apply_windows_branding,
            (window_title, startup_theme),
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
