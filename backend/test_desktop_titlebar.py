import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock, patch

import desktop_launcher as launcher
from backend.version import APP_VERSION


class DesktopTitlebarTests(unittest.TestCase):
    def test_native_context_menu_only_opens_on_editable_targets(self):
        from windows_window_frame import WindowsWindowFrame

        for editable in (True, False):
            with self.subTest(editable=editable):
                args = SimpleNamespace(ContextMenuTarget=SimpleNamespace(IsEditable=editable), Handled=False)
                WindowsWindowFrame._on_context_menu_requested(None, args)
                self.assertEqual(args.Handled, not editable)

    def test_native_context_menu_registers_once_and_detaches_on_dispose(self):
        from windows_window_frame import WindowsWindowFrame

        event = MagicMock()
        event.__iadd__.return_value = event
        event.__isub__.return_value = event
        settings = SimpleNamespace(AreDefaultContextMenusEnabled=False)
        core = SimpleNamespace(Settings=settings, ContextMenuRequested=event)
        frame = WindowsWindowFrame.__new__(WindowsWindowFrame)
        frame.native = MagicMock()
        frame._handle_created_handler = frame._handle_destroyed_handler = Mock()
        frame._webview = MagicMock(CoreWebView2=None)
        frame._context_menu_handler = frame._on_context_menu_requested
        frame._context_menu_core = None
        frame._initialized_handler = Mock()
        frame._comctl = Mock()
        frame._callback = Mock()
        frame._subclass_id = frame.hwnd = 1
        frame.disposed = False
        frame._enable_native_drag = Mock()

        frame._enable_editing_context_menu()
        frame._webview.CoreWebView2 = core
        frame._webview_initialized(None, SimpleNamespace(IsSuccess=True))
        frame._enable_editing_context_menu()
        event.__iadd__.assert_called_once_with(frame._context_menu_handler)
        self.assertTrue(settings.AreDefaultContextMenusEnabled)

        frame.dispose()
        frame.dispose()
        event.__isub__.assert_called_once_with(frame._context_menu_handler)
        frame._comctl.RemoveWindowSubclass.assert_called_once()

    def controller(self):
        controller = launcher.NativeFullscreenController("Test")
        controller.window = SimpleNamespace(minimize=Mock(), maximize=Mock(), restore=Mock(), destroy=Mock(), evaluate_js=Mock())
        return controller, launcher.DesktopApi(controller)

    def test_maximize_restore_and_fullscreen_state(self):
        controller, api = self.controller()
        self.assertTrue(api.toggle_maximize_window()["maximized"])
        controller.window.maximize.assert_called_once()
        self.assertFalse(api.toggle_maximize_window()["maximized"])
        controller.window.restore.assert_called_once()
        controller.fullscreen = True
        self.assertTrue(api.toggle_maximize_window()["fullscreen"])
        controller.window.maximize.assert_called_once()
        self.assertEqual(api.get_window_state()["version"], APP_VERSION)

    def test_close_uses_normal_native_close_without_bypassing_export_guard(self):
        controller, api = self.controller()
        api.close_window()
        controller.window.destroy.assert_called_once()
        self.assertFalse(hasattr(controller.window, "_export_close_allowed"))
        api.minimize_window()
        controller.window.minimize.assert_called_once()

    def test_native_state_overrides_stale_cached_maximize_flag(self):
        controller, api = self.controller()
        controller.window.native = SimpleNamespace(InvokeRequired=False, WindowState="Maximized")
        controller._maximized = False
        self.assertTrue(api.get_window_state()["maximized"])
        controller.window.native.WindowState = "Normal"
        controller._maximized = True
        self.assertFalse(api.get_window_state()["maximized"])

    def test_state_notifications_are_coalesced_and_unchanged_states_are_skipped(self):
        controller, _api = self.controller()
        with patch.object(launcher.threading, "Timer") as timer:
            for _ in range(20): controller.publish_state()
            timer.assert_called_once()
            controller.window.evaluate_js.assert_not_called()
            controller._flush_state()
            self.assertEqual(controller.window.evaluate_js.call_count, 1)
            controller.publish_state()
            controller._flush_state()
            self.assertEqual(controller.window.evaluate_js.call_count, 1)
            controller.publish_state(force=True)
            controller._flush_state()
            self.assertEqual(controller.window.evaluate_js.call_count, 2)
            controller.publish_state()
            controller.cancel_state_updates()
            timer.return_value.cancel.assert_called_once()

    def test_snap_styles_survive_winforms_updates_but_allow_fullscreen(self):
        import ctypes
        from windows_window_frame import WindowsWindowFrame, StyleInfo
        frame = WindowsWindowFrame.__new__(WindowsWindowFrame)
        frame.controller = SimpleNamespace(fullscreen=False)
        frame._comctl = SimpleNamespace(DefSubclassProc=lambda *_args: 0)
        style = StyleInfo(0, 0)
        frame._window_proc(None, 0x007C, 0xFFFFFFF0, ctypes.addressof(style), 0, 0)
        self.assertEqual(style.new & frame.STYLE_BITS, frame.STYLE_BITS)
        frame.controller.fullscreen = True
        style.new = 0
        frame._window_proc(None, 0x007C, 0xFFFFFFF0, ctypes.addressof(style), 0, 0)
        self.assertEqual(style.new, 0)

    def test_drag_restore_ignores_winforms_saved_bounds_only_during_restore(self):
        import ctypes
        from windows_window_frame import WindowsWindowFrame, WindowPos

        frame = WindowsWindowFrame.__new__(WindowsWindowFrame)
        frame.controller = SimpleNamespace(fullscreen=False)
        frame._dragging_from_maximized = False
        frame._handling_drag_restore = False
        frame._user32 = SimpleNamespace(IsZoomed=Mock(return_value=True))
        saved_position = WindowPos(flags=0x0015)
        address = ctypes.addressof(saved_position)

        def default_proc(hwnd, message, _wparam, _lparam):
            if message == 0x0047:  # WM_WINDOWPOSCHANGED
                frame._window_proc(hwnd, 0x0046, 0, address, 0, 0)
            return 0

        frame._comctl = SimpleNamespace(DefSubclassProc=default_proc)
        frame._window_proc(None, 0x0231, 0, 0, 0, 0)  # WM_ENTERSIZEMOVE
        frame._user32.IsZoomed.return_value = False
        frame._window_proc(None, 0x0046, 0, address, 0, 0)
        self.assertEqual(saved_position.flags, 0x0015)  # Native restore positioning proceeds.
        frame._window_proc(None, 0x0047, 0, address, 0, 0)
        self.assertEqual(saved_position.flags, 0x0017)  # Nested WinForms move is ignored.
        saved_position.flags = 0x0015
        frame._window_proc(None, 0x0047, 0, address, 0, 0)
        self.assertEqual(saved_position.flags, 0x0015)

    def test_titlebar_logo_has_transparency(self):
        from PIL import Image
        logo = Image.open(launcher.resource_path("frontend", "public", "intersos-symbol-transparent.png"))
        self.assertEqual(logo.convert("RGBA").getpixel((0, 0))[3], 0)
        # Check the white panel inside the logo frame, not just outer corners.
        self.assertEqual(logo.convert("RGBA").getpixel((logo.width // 10, logo.height // 5))[3], 0)

    def test_work_area_bounds_are_relative_to_monitor_origin(self):
        controller, _api = self.controller()
        native = SimpleNamespace(InvokeRequired=False, Handle=object(), MaximizedBounds=None, WindowState="Normal")
        controller.window.native = native
        screen = SimpleNamespace(Bounds=SimpleNamespace(X=-1920, Y=-200), WorkingArea=SimpleNamespace(X=-1880, Y=-170, Width=1880, Height=1050))
        forms = SimpleNamespace(Screen=SimpleNamespace(FromHandle=lambda _handle: screen), FormWindowState=SimpleNamespace(Maximized="Maximized", Normal="Normal"))
        with patch.dict("sys.modules", {"System.Drawing": SimpleNamespace(Rectangle=lambda *args: args), "System.Windows.Forms": forms}):
            controller.refresh_work_area()
        self.assertEqual(native.MaximizedBounds, (40, 30, 1880, 1050))

    def test_resize_validates_edges_and_maximized_state(self):
        controller, api = self.controller()
        controller.begin_native_move = Mock(return_value=True)
        self.assertFalse(api.begin_window_resize("invalid"))
        self.assertTrue(api.begin_window_resize("bottom-right"))
        controller.begin_native_move.assert_called_once_with(17)
        controller._maximized = True
        self.assertFalse(api.begin_window_resize("left"))
        self.assertTrue(api.begin_window_drag())
        controller.begin_native_move.assert_called_with(2)

    def test_startup_and_failure_embed_shared_offline_shell_for_all_themes(self):
        for theme in launcher.THEME_NAMES:
            for failed in (False, True):
                with self.subTest(theme=theme, failed=failed):
                    html = launcher.startup_html(theme, failed=failed)
                    self.assertIn('window.__desktopShell=true', html)
                    self.assertIn('data:image/png;base64,', html)
                    self.assertIn('class="desktop-titlebar-brand"', html)
                    self.assertIn('id="root"', html)
                    self.assertIn('"version": "' + APP_VERSION + '"', html)
                    self.assertIn('close_window()', html)

    def test_vice_city_is_only_a_home_theme(self):
        _, api = self.controller()
        with patch.object(launcher, "save_app_theme") as save_theme:
            self.assertFalse(api.set_title_bar_theme("vice-city"))
        save_theme.assert_not_called()

        with patch.object(launcher, "load_settings", return_value={"appTheme": "vice-city"}):
            self.assertEqual(launcher.saved_app_theme(), "glass-light")


if __name__ == '__main__':
    unittest.main()
