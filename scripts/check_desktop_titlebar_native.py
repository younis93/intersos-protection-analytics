"""Verify real WinForms bounds and JS window controls in an isolated hidden WebView2."""
import json
from pathlib import Path
import sys
import time
import traceback

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import desktop_launcher as launcher
import webview

result = {}
controller = launcher.NativeFullscreenController("Isolated titlebar verification")
api = launcher.DesktopApi(controller)
window = webview.create_window(
    controller.title, html=launcher.startup_html("glass-light", failed=True),
    js_api=api, frameless=True, easy_drag=False, resizable=True, hidden=True,
    maximized="--start-maximized" in sys.argv,
    width=1100, height=700, min_size=(720, 700),
)
controller.attach_window(window, "glass-light")
window.events.closing += launcher.guard_export_close


def geometry():
    def read(native):
        from System.Drawing import Point
        from System.Windows.Forms import Screen
        def rect(value): return [value.X, value.Y, value.Width, value.Height]
        import ctypes
        from ctypes import wintypes
        actual = wintypes.RECT()
        controller._frame._user32.GetWindowRect(native.Handle.ToInt64(), ctypes.byref(actual))
        point = native.PointToScreen(Point(0, 0))
        return {"bounds": rect(native.Bounds), "client_bounds": [point.X, point.Y, native.ClientSize.Width, native.ClientSize.Height], "physical_bounds": [actual.left, actual.top, actual.right-actual.left, actual.bottom-actual.top], "work_area": rect(Screen.FromHandle(native.Handle).WorkingArea), "state": str(native.WindowState)}
    return controller.on_native_ui(read)


def run():
    try:
        window.events.loaded.wait(20)
        # Hidden WinForms do not apply maximized geometry until shown. Use zero
        # opacity to exercise real layout without displaying a helper window.
        controller.on_native_ui(lambda native: setattr(native, "Opacity", 0))
        window.show()
        time.sleep(.5)
        assert api.get_window_state()["nativeDrag"], "WebView2 native dragging was not enabled"
        assert controller.on_native_ui(lambda native: native.webview.CoreWebView2.Settings.IsNonClientRegionSupportEnabled)
        assert window.evaluate_js('getComputedStyle(document.querySelector(".desktop-titlebar-brand")).getPropertyValue("app-region")') == "drag"
        if "--start-maximized" in sys.argv:
            startup = geometry()
            assert startup["client_bounds"] == startup["work_area"], startup
            api.toggle_maximize_window()
            time.sleep(.2)
        baseline = geometry()["bounds"]
        assert controller._frame._user32.GetWindowLongW(controller._frame.hwnd, -16) & controller._frame.STYLE_BITS == controller._frame.STYLE_BITS, hex(controller._frame._user32.GetWindowLongW(controller._frame.hwnd, -16))
        monitor_queries = []
        original_monitor_info = controller._frame.monitor_info
        def counted_monitor_info():
            monitor_queries.append(1)
            return original_monitor_info()
        controller._frame.monitor_info = counted_monitor_info
        def move_on_same_monitor(native):
            from System.Drawing import Point
            origin = native.Location
            for step in range(20): native.Location = Point(origin.X + step, origin.Y)
            native.Location = origin
        controller.on_native_ui(move_on_same_monitor)
        assert not monitor_queries, "Normal movement queried the work area repeatedly"
        controller._frame.monitor_info = original_monitor_info
        window.evaluate_js('window.dragBridgeCalls=0;window.pywebview.api.begin_window_drag=async()=>{window.dragBridgeCalls++};document.querySelector(".desktop-titlebar-brand").dispatchEvent(new MouseEvent("mousedown",{button:0,screenX:30,screenY:15}));window.dispatchEvent(new MouseEvent("mousemove",{screenX:120,screenY:15}));window.dispatchEvent(new MouseEvent("mouseup"))')
        assert window.evaluate_js('window.dragBridgeCalls') == 0
        for _ in range(3):
            # Exercise the actual JS handlers, not just Python's bridge methods.
            window.evaluate_js('document.querySelector("[data-action=maximize]").click()')
            time.sleep(.3)
            maximized = geometry()
            assert maximized["state"] == "Maximized", maximized
            assert maximized["client_bounds"] == maximized["work_area"], maximized
            assert not api.get_window_state()["fullscreen"]
            assert window.evaluate_js('document.querySelector(".desktop-titlebar").getBoundingClientRect().height') == 32
            # Native draggable regions handle double clicks in Windows, without
            # dispatching a JavaScript maximize action through the bridge.
            def native_double_click(native):
                send = controller._frame._user32.SendMessageW
                import ctypes
                send.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_size_t, ctypes.c_ssize_t]
                send.restype = ctypes.c_ssize_t
                send(native.Handle.ToInt64(), 0x00A3, 2, 0)  # WM_NCLBUTTONDBLCLK, HTCAPTION.
            controller.on_native_ui(native_double_click)
            time.sleep(.3)
            restored = geometry()
            assert restored["state"] == "Normal", restored
            assert restored["bounds"] == baseline, (baseline, restored)
            assert not api.get_window_state()["fullscreen"]
        # Simulate an OS-driven state change to catch stale bridge caches.
        window.maximize()
        controller._maximized = False
        assert api.get_window_state()["maximized"]
        api.toggle_maximize_window()
        assert geometry()["bounds"] == baseline
        api.toggle_fullscreen()
        assert api.get_window_state()["fullscreen"]
        time.sleep(.1)  # Header notifications are coalesced outside the native UI thread.
        assert window.evaluate_js('getComputedStyle(document.querySelector(".desktop-titlebar")).display') == "none"
        api.toggle_fullscreen()
        time.sleep(.3)
        assert not api.get_window_state()["fullscreen"]
        assert window.evaluate_js('document.querySelector(".desktop-titlebar").getBoundingClientRect().height') == 32
        assert geometry()["bounds"] == baseline
        api.toggle_maximize_window()
        api.toggle_fullscreen()
        api.toggle_fullscreen()
        assert api.get_window_state()["maximized"]
        assert geometry()["client_bounds"] == maximized["work_area"], geometry()
        api.toggle_maximize_window()
        assert geometry()["bounds"] == baseline
        api.minimize_window()
        window.restore()
        window.evaluate_js('window.intersosRequestExportClose=()=>false')
        api.close_window()
        time.sleep(.4)
        assert window.evaluate_js('1+1') == 2
        window.resize(720, 700)
        time.sleep(.2)
        assert window.evaluate_js('innerWidth') == 720
        result.update(status="passed", restored_bounds=baseline, maximized_bounds=maximized["client_bounds"], work_area=maximized["work_area"], native_drag=True, movement_work_area_queries=len(monitor_queries), native_drag_bridge_calls=0, minimum_css_width=720)
    except Exception:
        result["error"] = traceback.format_exc()
    finally:
        window._export_close_allowed = True
        window.destroy()


webview.start(run, gui="edgechromium", private_mode=True)
result["native_hooks_released"] = bool(controller._frame and controller._frame.disposed)
if not result["native_hooks_released"]:
    result.setdefault("error", "Native hooks were not released when the window closed")
output = Path(__file__).resolve().parents[1] / "output/desktop-titlebar"
output.mkdir(parents=True, exist_ok=True)
(output / "native-result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps(result, indent=2))
if "error" in result:
    sys.exit(1)
