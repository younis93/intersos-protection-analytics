"""Native frame and WebView2 drag support for the desktop launcher.

All installation, callbacks and removal run on the owning WinForms UI thread.
The subclass keeps normal Windows sizing/Snap styles without drawing a caption.
"""
import ctypes
from ctypes import wintypes


class MinMaxInfo(ctypes.Structure):
    _fields_ = [(name, wintypes.POINT) for name in ("reserved", "max_size", "max_position", "min_track", "max_track")]


class MonitorInfo(ctypes.Structure):
    _fields_ = [("size", wintypes.DWORD), ("monitor", wintypes.RECT), ("work", wintypes.RECT), ("flags", wintypes.DWORD)]


class StyleInfo(ctypes.Structure):
    _fields_ = [("old", wintypes.DWORD), ("new", wintypes.DWORD)]


class WindowsWindowFrame:
    STYLE_BITS = 0x00CF0000  # Caption, sizing frame, system menu, min/max boxes.

    def __init__(self, native, controller):
        self.native = native
        self.controller = controller
        self.hwnd = native.Handle.ToInt64()
        self.native_drag = False
        self.disposed = False
        self._webview = native.webview
        self._subclass_id = id(self)
        self._user32 = ctypes.WinDLL("user32", use_last_error=True)
        self._comctl = ctypes.WinDLL("comctl32", use_last_error=True)
        pointer = ctypes.c_void_p
        result = ctypes.c_ssize_t
        self._callback_type = ctypes.WINFUNCTYPE(result, pointer, wintypes.UINT, ctypes.c_size_t, ctypes.c_ssize_t, ctypes.c_size_t, ctypes.c_size_t)
        self._callback = self._callback_type(self._window_proc)
        self._comctl.SetWindowSubclass.argtypes = [pointer, self._callback_type, ctypes.c_size_t, ctypes.c_size_t]
        self._comctl.SetWindowSubclass.restype = wintypes.BOOL
        self._comctl.RemoveWindowSubclass.argtypes = [pointer, self._callback_type, ctypes.c_size_t]
        self._comctl.DefSubclassProc.argtypes = [pointer, wintypes.UINT, ctypes.c_size_t, ctypes.c_ssize_t]
        self._comctl.DefSubclassProc.restype = result
        self._user32.GetWindowLongW.argtypes = [pointer, ctypes.c_int]
        self._user32.SetWindowLongW.argtypes = [pointer, ctypes.c_int, ctypes.c_long]
        self._user32.SetWindowPos.argtypes = [pointer, pointer, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
        self._user32.GetWindowRect.argtypes = [pointer, ctypes.POINTER(wintypes.RECT)]
        self._user32.IsZoomed.argtypes = [pointer]
        self._user32.MonitorFromWindow.argtypes = [pointer, wintypes.DWORD]
        self._user32.MonitorFromWindow.restype = pointer
        self._user32.GetMonitorInfoW.argtypes = [pointer, ctypes.POINTER(MonitorInfo)]
        if not self._comctl.SetWindowSubclass(self.hwnd, self._callback, self._subclass_id, 0):
            raise ctypes.WinError(ctypes.get_last_error())
        self._initialized_handler = self._webview_initialized
        self._webview.CoreWebView2InitializationCompleted += self._initialized_handler
        self._enable_native_drag()
        self.apply_style()
        self.refresh_work_area()

    def apply_style(self):
        if self.disposed: return
        # WinForms can replace its window-procedure chain while changing frame
        # styles for fullscreen. Reattach before requesting non-client layout.
        self._comctl.SetWindowSubclass(self.hwnd, self._callback, self._subclass_id, 0)
        self._set_maximized_bounds()
        style = self._user32.GetWindowLongW(self.hwnd, -16)
        self._user32.SetWindowLongW(self.hwnd, -16, style | self.STYLE_BITS)
        self._user32.SetWindowPos(self.hwnd, None, 0, 0, 0, 0, 0x0037)  # FRAMECHANGED, no move/size/z-order/activation.

    def _set_maximized_bounds(self):
        from System.Drawing import Rectangle
        info = self.monitor_info()
        work, monitor = info.work, info.monitor
        bounds = Rectangle(work.left-monitor.left, work.top-monitor.top, work.right-work.left, work.bottom-work.top)
        if self.native.MaximizedBounds != bounds:
            self.native.MaximizedBounds = bounds

    def _enable_native_drag(self):
        core = self._webview.CoreWebView2
        if core is None: return
        try:
            core.Settings.IsNonClientRegionSupportEnabled = True
            self.native_drag = bool(core.Settings.IsNonClientRegionSupportEnabled)
        except Exception:
            self.native_drag = False  # Older runtimes retain the bridge fallback.
        self.controller.publish_state(force=True)

    def _webview_initialized(self, _sender, args):
        if args.IsSuccess and not self.disposed:
            self._enable_native_drag()

    def monitor_info(self):
        info = MonitorInfo()
        info.size = ctypes.sizeof(info)
        monitor = self._user32.MonitorFromWindow(self.hwnd, 2)
        if not self._user32.GetMonitorInfoW(monitor, ctypes.byref(info)):
            raise ctypes.WinError(ctypes.get_last_error())
        return info

    def refresh_work_area(self):
        if self.disposed or self.controller.fullscreen or not self._user32.IsZoomed(self.hwnd): return
        self._set_maximized_bounds()
        work = self.monitor_info().work
        bounds = wintypes.RECT()
        self._user32.GetWindowRect(self.hwnd, ctypes.byref(bounds))
        if (bounds.left, bounds.top, bounds.right, bounds.bottom) != (work.left, work.top, work.right, work.bottom):
            self._user32.SetWindowPos(self.hwnd, None, work.left, work.top, work.right-work.left, work.bottom-work.top, 0x0014)

    def _window_proc(self, hwnd, message, wparam, lparam, _subclass_id, _data):
        try:
            if message == 0x007C and wparam & 0xFFFFFFFF == 0xFFFFFFF0 and not self.controller.fullscreen:
                # WinForms reapplies FormBorderStyle.None when showing/restoring
                # the form. Preserve Snap styles in that incoming style change.
                style = ctypes.cast(lparam, ctypes.POINTER(StyleInfo)).contents
                style.new |= self.STYLE_BITS
            if message == 0x0083:  # WM_NCCALCSIZE: keep the whole window as client area.
                if wparam and not self.controller.fullscreen and self._user32.IsZoomed(hwnd):
                    # Windows may retain invisible sizing margins around a
                    # maximized frame. Keep web content inside the work area.
                    client = ctypes.cast(lparam, ctypes.POINTER(wintypes.RECT)).contents
                    work = self.monitor_info().work
                    client.left, client.top = max(client.left, work.left), max(client.top, work.top)
                    client.right, client.bottom = min(client.right, work.right), min(client.bottom, work.bottom)
                return 0
            if message == 0x0024 and not self.controller.fullscreen:  # WM_GETMINMAXINFO
                value = self._comctl.DefSubclassProc(hwnd, message, wparam, lparam)
                info = self.monitor_info()
                limits = ctypes.cast(lparam, ctypes.POINTER(MinMaxInfo)).contents
                limits.max_position.x = info.work.left - info.monitor.left
                limits.max_position.y = info.work.top - info.monitor.top
                limits.max_size.x = info.work.right - info.work.left
                limits.max_size.y = info.work.bottom - info.work.top
                return value
            if message in (0x007E, 0x001A, 0x02E0):  # Display/work-area/DPI changes, never WM_MOVE.
                value = self._comctl.DefSubclassProc(hwnd, message, wparam, lparam)
                self.refresh_work_area()
                return value
            if message == 0x0082:  # WM_NCDESTROY
                self.dispose()
        except Exception:
            # Never unwind a Python exception across the Win32 callback boundary.
            pass
        return self._comctl.DefSubclassProc(hwnd, message, wparam, lparam)

    def dispose(self):
        if self.disposed: return
        self.disposed = True
        try:
            self._webview.CoreWebView2InitializationCompleted -= self._initialized_handler
        finally:
            self._comctl.RemoveWindowSubclass(self.hwnd, self._callback, self._subclass_id)
