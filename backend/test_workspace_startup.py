import json
import socket
import threading
import os
import sys
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

import desktop_launcher as launcher
from backend.test_desktop_launcher import FakeWindow


@pytest.fixture
def cache_root(monkeypatch, tmp_path):
    monkeypatch.setattr(launcher, "app_data_dir", lambda: tmp_path)
    return tmp_path / "workspace-cache"


def test_workspace_profile_and_local_origin_are_reused(cache_root):
    first_port, first_options = launcher.workspace_startup_options()
    second_port, second_options = launcher.workspace_startup_options()
    assert first_port == second_port
    assert first_options == second_options == {"private_mode": False, "storage_path": str(cache_root / "webview")}
    assert json.loads((cache_root / "origin.json").read_text()) == {"version": 1, "port": first_port}
    assert not list(cache_root.glob("*.tmp"))


def test_busy_cached_port_uses_a_new_origin_without_contacting_other_service(cache_root):
    port, options = launcher.workspace_startup_options()
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupied:
        occupied.bind(("127.0.0.1", port))
        occupied.listen()
        replacement, new_options = launcher.workspace_startup_options()
    assert replacement != port
    assert new_options == options
    assert json.loads((cache_root / "origin.json").read_text())["port"] == replacement


@pytest.mark.parametrize("saved", ["{", "null", '{"version":99,"port":12345}',
    '{"version":1,"port":true}', '{"version":1,"port":"12345"}', '{"version":1,"port":-1}'])
def test_invalid_workspace_origin_is_rebuilt(cache_root, saved):
    cache_root.mkdir()
    (cache_root / "origin.json").write_text(saved)
    port, options = launcher.workspace_startup_options()
    assert 1024 <= port <= 65535 and not options["private_mode"]
    assert json.loads((cache_root / "origin.json").read_text())["port"] == port


def test_unwritable_workspace_cache_keeps_private_startup_working(monkeypatch, tmp_path):
    blocked = tmp_path / "blocked"
    blocked.write_text("file instead of directory")
    monkeypatch.setattr(launcher, "app_data_dir", lambda: blocked)
    port, options = launcher.workspace_startup_options()
    assert port > 0 and options == {"private_mode": True}


def test_backend_preparation_starts_early_and_is_shared(monkeypatch, cache_root):
    entered, release = threading.Event(), threading.Event()
    backend = SimpleNamespace(app=object())
    def load():
        entered.set()
        assert release.wait(5)
        return backend
    loader = Mock(side_effect=load)
    monkeypatch.setattr(launcher, "load_backend_module", loader)
    runtime = launcher.StartupRuntime("glass-light")
    metrics = launcher.StartupMetrics()
    worker = runtime.preload_backend(metrics)
    try:
        assert entered.wait(2)
        assert not runtime._backend_ready.is_set()
        assert runtime.preload_backend(metrics) is worker
    finally:
        release.set()
        worker.join(5)
    assert runtime._backend_ready.is_set() and runtime.backend_main is backend
    assert loader.call_count == 1
    runtime.stop()


def test_prepared_backend_is_reused_for_server_and_handoff(monkeypatch, cache_root):
    backend = SimpleNamespace(app=object())
    loader = Mock(return_value=backend)
    monkeypatch.setattr(launcher, "load_backend_module", loader)
    server = SimpleNamespace(start=Mock(), stop=Mock())
    server_factory = Mock(return_value=server)
    monkeypatch.setattr(launcher, "LocalServer", server_factory)
    restore = Mock()
    monkeypatch.setattr(launcher, "start_remembered_restores", restore)
    metrics = launcher.StartupMetrics()
    runtime = launcher.StartupRuntime("glass-light")
    runtime.preload_backend(metrics).join(5)
    window = FakeWindow()
    runtime.initialize(window, "http://127.0.0.1:54321/", metrics)
    assert loader.call_count == 1 and server.start.call_count == 1
    assert window.loaded_url == "http://127.0.0.1:54321/"
    restore.assert_called_once_with(backend, metrics)
    runtime.stop()


def test_backend_preparation_failure_uses_existing_startup_error_surface(monkeypatch, cache_root):
    monkeypatch.setattr(launcher, "load_backend_module", Mock(side_effect=RuntimeError("backend unavailable")))
    server_factory = Mock()
    monkeypatch.setattr(launcher, "LocalServer", server_factory)
    runtime = launcher.StartupRuntime("glass-light")
    metrics = launcher.StartupMetrics()
    runtime.preload_backend(metrics).join(5)
    window = FakeWindow()
    runtime.initialize(window, "http://127.0.0.1:54321/", metrics)
    assert "Unable to start Iraq Data Analysis" in window.loaded_html
    assert "backend unavailable" in metrics.path.read_text()
    server_factory.assert_not_called()
    runtime.stop()


def test_desktop_launch_uses_cached_profile_and_prepares_backend_before_window(monkeypatch, cache_root):
    class Event(list):
        def __iadd__(self, callback):
            self.append(callback)
            return self
    window = SimpleNamespace(events=SimpleNamespace(shown=Event(), closing=Event()))
    webview = SimpleNamespace(settings={}, create_window=Mock(return_value=window), start=Mock())
    monkeypatch.setitem(sys.modules, "webview", webview)
    instance = SimpleNamespace(acquire=Mock(return_value=True), watch=Mock(), close=Mock())
    monkeypatch.setattr(launcher, "SingleInstance", lambda: instance)
    runtime = SimpleNamespace(preload_backend=Mock(), initialize=Mock(), stop=Mock(), backend_main=None)
    monkeypatch.setattr(launcher, "StartupRuntime", lambda theme: runtime)
    monkeypatch.setattr(launcher, "NativeFullscreenController", Mock())
    monkeypatch.setattr(launcher.ctypes, "windll", Mock(), raising=False)
    ordering = Mock()
    ordering.attach_mock(runtime.preload_backend, "prepare")
    ordering.attach_mock(webview.create_window, "window")
    with patch.dict(os.environ):
        launcher.main()
    assert ordering.mock_calls[0][0] == "prepare"
    assert ordering.mock_calls[1][0] == "window"
    options = webview.start.call_args.kwargs
    assert options["private_mode"] is False
    assert options["storage_path"] == str(cache_root / "webview")
    assert options["gui"] == "edgechromium"
    assert webview.start.call_args.args[0] == runtime.initialize
    assert runtime.stop.call_count == instance.close.call_count == 1
