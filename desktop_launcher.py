"""Native Windows launcher for Iraq Data Analysis."""
from __future__ import annotations

import ctypes
import json
import multiprocessing
import os
import secrets
import socket
import sys
import threading
import time
import traceback
from pathlib import Path
from typing import Any


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
ERROR_ALREADY_EXISTS = 183
WAIT_OBJECT_0 = 0
WAIT_TIMEOUT = 258
SW_RESTORE = 9
MUTEX_NAME = r"Local\INTERSOS.IraqDataAnalysis.SingleInstance"
ACTIVATION_EVENT_NAME = r"Local\INTERSOS.IraqDataAnalysis.Activate"


def app_data_dir() -> Path:
    return Path(os.getenv("LOCALAPPDATA", Path.home())) / "INTERSOS Legal Platform"


class StartupMetrics:
    def __init__(self) -> None:
        self.started = time.perf_counter()
        self.path = app_data_dir() / "startup.log"
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            if self.path.exists() and self.path.stat().st_size > 256 * 1024:
                self.path.replace(self.path.with_suffix(".previous.log"))
        except OSError:
            pass

    def mark(self, stage: str, detail: str = "") -> None:
        elapsed = (time.perf_counter() - self.started) * 1000
        line = f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {elapsed:.0f}ms {stage}"
        if detail:
            line += f" {detail}"
        try:
            with self.path.open("a", encoding="utf-8") as output:
                output.write(line + "\n")
        except OSError:
            pass


def _focus_existing_window(user32: Any | None = None) -> bool:
    if sys.platform != "win32":
        return False
    user32 = user32 or ctypes.windll.user32
    found: list[int] = []
    callback_type = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

    @callback_type
    def visit(hwnd, _parameter):
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return True
        title = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, title, length + 1)
        suffix = title.value.removeprefix(f"{APP_TITLE} ")
        if title.value == APP_TITLE or (suffix != title.value and suffix[:1].isdigit()):
            found.append(hwnd)
            return False
        return True

    try:
        user32.EnumWindows(visit, 0)
        if not found:
            return False
        hwnd = found[0]
        user32.ShowWindow(hwnd, SW_RESTORE)
        user32.BringWindowToTop(hwnd)
        user32.SetForegroundWindow(hwnd)
        return True
    except Exception:
        return False


class SingleInstance:
    """Own the per-session application mutex and relay subsequent launches."""

    def __init__(self, kernel32: Any | None = None, user32: Any | None = None) -> None:
        self.kernel32 = kernel32
        self.user32 = user32
        self.mutex: Any | None = None
        self.activation_event: Any | None = None
        self.primary = True
        self._stopping = threading.Event()
        self._watcher: threading.Thread | None = None

    def acquire(self) -> bool:
        if sys.platform != "win32":
            return True
        self.kernel32 = self.kernel32 or ctypes.windll.kernel32
        self.user32 = self.user32 or ctypes.windll.user32
        self.activation_event = self.kernel32.CreateEventW(None, True, False, ACTIVATION_EVENT_NAME)
        self.mutex = self.kernel32.CreateMutexW(None, False, MUTEX_NAME)
        self.primary = self.kernel32.GetLastError() != ERROR_ALREADY_EXISTS
        if not self.primary:
            _focus_existing_window(self.user32)
            if self.activation_event:
                self.kernel32.SetEvent(self.activation_event)
            self.close()
        return self.primary

    def watch(self) -> None:
        if not self.primary or not self.activation_event or self._watcher:
            return

        def wait_for_activation() -> None:
            pending = False
            while not self._stopping.is_set():
                result = self.kernel32.WaitForSingleObject(self.activation_event, 250)
                if self._stopping.is_set():
                    return
                if result == WAIT_OBJECT_0:
                    self.kernel32.ResetEvent(self.activation_event)
                    pending = True
                elif result != WAIT_TIMEOUT:
                    return
                if pending and _focus_existing_window(self.user32):
                    pending = False

        self._watcher = threading.Thread(target=wait_for_activation, name="single-instance-activation", daemon=True)
        self._watcher.start()

    def close(self) -> None:
        self._stopping.set()
        if self.activation_event and self.kernel32:
            try:
                self.kernel32.SetEvent(self.activation_event)
            except Exception:
                pass
        if self._watcher and self._watcher.is_alive():
            self._watcher.join(timeout=1)
        if self.kernel32:
            for handle in (self.activation_event, self.mutex):
                if handle:
                    try:
                        self.kernel32.CloseHandle(handle)
                    except Exception:
                        pass
        self.activation_event = None
        self.mutex = None


def settings_path() -> Path:
    # Keep the existing data location so current Legal Platform settings carry over.
    return app_data_dir() / "settings.json"


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


def configured_indicator_master() -> Path | None:
    try:
        value = load_settings().get("indicatorMasterWorkbook", "")
        return Path(value) if value else None
    except (OSError, ValueError, TypeError):
        return None


def saved_indicator_master() -> Path | None:
    path = configured_indicator_master()
    return path if path and path.is_file() and path.suffix.lower() == ".xlsx" else None


def save_indicator_master(path: Path) -> None:
    target = settings_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    settings = load_settings()
    settings["indicatorMasterWorkbook"] = str(path)
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


def startup_html(theme: str, failed: bool = False) -> str:
    dark = theme == "glass-dark"
    background = theme_background(theme)
    ink = "#edf7ff" if dark else "#122234"
    muted = "#9db0c2" if dark else "#667b8f"
    blue = "#38a7ef" if dark else "#1687d9"
    heading = "Unable to start Iraq Data Analysis" if failed else "Iraq Data Analysis"
    detail = (
        "Startup failed. Close the app and review startup.log in the INTERSOS Legal Platform data folder."
        if failed else "Preparing your legal analysis workspace"
    )
    spinner = "" if failed else '<div class="spinner" aria-hidden="true"></div>'
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:grid;place-items:center;background:{background};color:{ink};font-family:'Segoe UI',sans-serif}}main{{display:grid;justify-items:center;gap:16px;padding:36px;text-align:center}}.mark{{display:grid;place-items:center;width:68px;height:68px;border:2px solid {blue};border-radius:18px;background:color-mix(in srgb,{blue} 9%,transparent);color:{blue};font-size:34px}}h1{{margin:0;font-size:25px}}p{{margin:0;color:{muted};font-size:13px}}.spinner{{width:30px;height:30px;margin-top:8px;border:3px solid color-mix(in srgb,{blue} 22%,transparent);border-top-color:{blue};border-radius:50%;animation:spin .75s linear infinite}}@keyframes spin{{to{{transform:rotate(360deg)}}}}@media(prefers-reduced-motion:reduce){{.spinner{{animation-duration:2s}}}}</style></head>
<body><main><div class="mark">◈</div><h1>{heading}</h1><p>{detail}</p>{spinner}</main></body></html>"""


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


def initialize_desktop(window_title: str, theme: str) -> None:
    """Finish native setup without blocking the WebView event loop."""
    apply_windows_branding(window_title, theme)


def start_legal_restore(backend_main: Any, metrics: StartupMetrics | None = None) -> threading.Thread:
    """Load the remembered Legal source without delaying the desktop window."""
    backend_main.legal_store_loading = True
    def restore() -> None:
        backend_main.load_initial_legal_store()
        if metrics:
            metrics.mark("legal-data-ready")
    thread = threading.Thread(
        target=restore,
        name="restore-legal-data",
        daemon=True,
    )
    thread.start()
    return thread


def start_indicator_restore(backend_main: Any, metrics: StartupMetrics | None = None) -> threading.Thread:
    def restore() -> None:
        backend_main.load_initial_indicator_master()
        if metrics:
            metrics.mark("indicator-master-ready")
    thread = threading.Thread(target=restore, name="restore-indicator-master", daemon=True)
    thread.start()
    return thread


def start_remembered_restores(backend_main: Any, metrics: StartupMetrics) -> None:
    workers = (start_legal_restore(backend_main, metrics), start_indicator_restore(backend_main, metrics))
    def wait_for_restores() -> None:
        for worker in workers:
            worker.join()
        metrics.mark("remembered-data-ready")
    threading.Thread(target=wait_for_restores, name="restore-readiness", daemon=True).start()


class LocalServer:
    def __init__(self, app: Any, port: int) -> None:
        import uvicorn
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


class StartupRuntime:
    def __init__(self, theme: str) -> None:
        self.theme = theme
        self.local_server: LocalServer | None = None
        self.backend_main: Any | None = None
        self._lock = threading.Lock()
        self._stop_requested = False

    def initialize(self, window: Any, url: str, metrics: StartupMetrics) -> None:
        try:
            metrics.mark("backend-import-started")
            from backend import main as backend_main
            self.backend_main = backend_main
            metrics.mark("backend-imported")
            port = int(url.split(":", 2)[2].split("/", 1)[0])
            server = LocalServer(backend_main.app, port)
            with self._lock:
                self.local_server = server
                stop_requested = self._stop_requested
            if stop_requested:
                return
            server.start()
            with self._lock:
                stop_requested = self._stop_requested
            if stop_requested:
                server.stop()
                return
            metrics.mark("local-server-ready")
            start_remembered_restores(backend_main, metrics)
            window.load_url(url)
            metrics.mark("dashboard-requested")
        except Exception as exc:
            metrics.mark("startup-failed", str(exc).replace("\n", " "))
            try:
                with metrics.path.open("a", encoding="utf-8") as output:
                    output.write(traceback.format_exc() + "\n")
            except OSError:
                pass
            try:
                window.load_html(startup_html(self.theme, failed=True))
            except Exception:
                show_error(f"Unable to start {APP_TITLE}.\n\n{exc}\n\nDiagnostic log:\n{metrics.path}")

    def stop(self) -> None:
        with self._lock:
            self._stop_requested = True
            server = self.local_server
        if server:
            server.stop()


class NativeFullscreenController:
    def __init__(self, title: str) -> None:
        self.title = title
        self.fullscreen = False
        self.style = 0
        self.placement: WindowPlacement | None = None
        self.window: Any | None = None

    def attach_window(self, window: Any) -> None:
        self.window = window

    def toggle(self) -> bool:
        if self.window is not None:
            self.window.toggle_fullscreen()
            self.fullscreen = not self.fullscreen
            return self.fullscreen

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
        # pywebview recursively exposes public attributes to JavaScript. Keeping
        # the controller public makes it walk the native WinForms accessibility
        # graph forever after a window is attached.
        self._fullscreen = fullscreen
        self._legal_import_progress = 0

    def get_legal_import_progress(self) -> int:
        return self._legal_import_progress

    def toggle_fullscreen(self) -> bool:
        return bool(self._fullscreen.toggle())

    def set_title_bar_theme(self, theme: str) -> bool:
        return bool(self._fullscreen.set_title_bar_theme(theme))

    def get_saved_app_theme(self) -> str:
        return saved_app_theme()

    def choose_indicator_master_workbook(self) -> str | None:
        import webview
        previous = configured_indicator_master()
        initial_folder = previous.parent if previous and previous.parent.is_dir() else ""
        selection = webview.windows[0].create_file_dialog(webview.FileDialog.OPEN, str(initial_folder), False, "", ("Excel workbooks (*.xlsx)",))
        return str(Path(selection[0]).resolve()) if selection else None

    def process_indicator_master_workbook(self, selected_path: str) -> dict[str, Any]:
        path = Path(selected_path).resolve()
        if not path.is_file() or path.suffix.lower() != ".xlsx":
            raise ValueError("The selected master workbook is no longer available.")
        from backend import main as backend_main
        metadata = backend_main.load_indicator_master_path(path)
        save_indicator_master(path)
        return metadata

    def refresh_indicator_master_workbook(self) -> dict[str, Any]:
        path = saved_indicator_master()
        if not path:
            raise ValueError("The previously selected master workbook is unavailable. Choose it again.")
        return self.process_indicator_master_workbook(str(path))

    def choose_legal_folder(self) -> str | None:
        import webview
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
        candidate = LegalStore.from_folder(folder, lambda percent: setattr(self, "_legal_import_progress", percent), exclusions=backend_main.duplicate_exclusions.exclusion_rows())
        metadata = candidate.metadata()
        backend_main.legal_store = candidate
        save_legal_folder(folder)
        self._legal_import_progress = 97
        self._legal_import_progress = 100
        return metadata

    def refresh_legal_folder(self) -> dict[str, Any]:
        folder = saved_legal_folder()
        if not folder:
            raise ValueError("No previously selected Legal Platform folder is available.")
        return self.process_legal_folder(str(folder))

    def choose_legal_files(self) -> list[str] | None:
        import webview
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
        candidate = LegalStore.from_files(payload, "Selected Legal Platform CSV files", lambda percent: setattr(self, "_legal_import_progress", percent), exclusions=backend_main.duplicate_exclusions.exclusion_rows())
        metadata = candidate.metadata()
        backend_main.legal_store = candidate
        save_legal_files(paths)
        self._legal_import_progress = 97
        self._legal_import_progress = 100
        return metadata

    def refresh_legal_files(self) -> dict[str, Any]:
        paths = saved_legal_files()
        if not paths:
            raise ValueError("No previously selected Legal Platform CSV files are available.")
        return self.process_legal_files([str(path) for path in paths])

def main() -> None:
    metrics = StartupMetrics()
    metrics.mark("process-started")
    single_instance = SingleInstance()
    if not single_instance.acquire():
        metrics.mark("secondary-launch-forwarded")
        return
    metrics.mark("single-instance-acquired")
    # A local source launch is already running the current checkout. Published
    # installer release versions are intentionally not compared here, because
    # a release can have a newer version number while using the same commit.
    if not getattr(sys, "frozen", False):
        os.environ["INTERSOS_GITHUB_REPOSITORY"] = ""
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
    indicator_master_path = configured_indicator_master()
    if indicator_master_path:
        os.environ["INTERSOS_INDICATOR_MASTER"] = str(indicator_master_path)
    remembered_legal_files = legal_settings.get("legalFiles", [])
    if isinstance(remembered_legal_files, list):
        remembered_legal_files = [path for path in remembered_legal_files if isinstance(path, str)]
    else:
        remembered_legal_files = []
    if remembered_legal_files:
        os.environ["INTERSOS_LEGAL_FILES"] = json.dumps(remembered_legal_files)
    os.environ["INTERSOS_LEGAL_SOURCE"] = remembered_source
    # Show the native window before importing the analytics backend. Legal CSV
    # and indicator workbook restoration continue after the local API is ready.
    os.environ.setdefault("INTERSOS_DEFER_LEGAL_LOAD", "1")
    from backend.version import APP_VERSION
    import webview
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
    runtime = StartupRuntime(startup_theme)

    webview.settings["ALLOW_DOWNLOADS"] = True
    webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True
    try:
        window_title = f"{APP_TITLE} {APP_VERSION}"
        fullscreen_controller = NativeFullscreenController(window_title)
        desktop_api = DesktopApi(fullscreen_controller)
        window = webview.create_window(
            window_title,
            html=startup_html(startup_theme),
            width=1440,
            height=900,
            min_size=(1100, 700),
            resizable=True,
            maximized=True,
            background_color=theme_background(startup_theme),
            js_api=desktop_api,
        )
        window.events.shown += lambda: metrics.mark("first-window-shown")
        fullscreen_controller.attach_window(window)
        single_instance.watch()
        webview.start(
            runtime.initialize,
            args=(window, url, metrics),
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
        runtime.stop()
        if runtime.backend_main is not None:
            runtime.backend_main.store = None
        single_instance.close()
        metrics.mark("process-exited")


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
