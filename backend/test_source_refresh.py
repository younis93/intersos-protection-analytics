import os
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import desktop_launcher as launcher
from backend import main, legal_processing_cache as cache
from backend.import_progress import ImportTracker, ImportOperation, ImportCancelled
from backend.test_legal_platform import csv, required_payload


@pytest.fixture
def source(monkeypatch, tmp_path):
    folder = tmp_path / "selected"
    folder.mkdir()
    paths = []
    for name, raw in required_payload().items():
        path = folder / (name + ".csv")
        path.write_bytes(raw)
        paths.append(path)
    monkeypatch.setattr(launcher, "settings_path", lambda: tmp_path / "settings.json")
    monkeypatch.setattr(main, "legal_store", None)
    monkeypatch.setattr(main, "prepare_import_exclusions", lambda store: None)
    tracker = ImportTracker()
    monkeypatch.setattr("backend.import_progress.legal_import_tracker", tracker)
    api = launcher.DesktopApi(None)
    return folder, paths, api


@pytest.mark.parametrize("kind", ["folder", "files"])
def test_refresh_rereads_remembered_source_without_processing_or_page_cache(source, kind):
    folder, paths, api = source
    if kind == "folder": api.process_legal_folder(str(folder))
    else: api.process_legal_files([str(path) for path in paths])
    assert TestClient(main.app).post("/api/legal/overview", json={}).status_code == 200
    previous = main.legal_store
    refresh = api.refresh_legal_folder if kind == "folder" else api.refresh_legal_files
    # Even identical files must be reprocessed on an explicit Refresh.
    with patch.object(cache, "load", side_effect=AssertionError("Refresh read cached processing")):
        refresh()
    assert main.legal_store is not previous
    assert main.legal_store.import_timings["cache_miss"] == 1
    assert "validation" in main.legal_store.import_timings
    connection = sqlite3.connect(cache.cache_directory() / "pages.sqlite3")
    try:
        assert connection.execute("SELECT count(*) FROM pages").fetchone()[0] == 0
    finally:
        connection.close()
    changed = paths[0].read_bytes().replace(b"B1", b"C1")
    paths[0].write_bytes(changed)
    refresh()
    assert main.legal_store.source_files["beneficiaries"] == changed
    if kind == "folder":
        assert launcher.saved_legal_folder() == folder
    else:
        assert launcher.saved_legal_files() == paths


@pytest.mark.parametrize("kind", ["folder", "files"])
def test_missing_remembered_source_does_not_fall_back_to_cache(source, kind):
    folder, paths, api = source
    if kind == "folder": api.process_legal_folder(str(folder))
    else: api.process_legal_files([str(path) for path in paths])
    previous = main.legal_store
    saved = launcher.settings_path().read_bytes()
    snapshot = (cache.cache_directory() / "snapshot.bin").read_bytes()
    for path in paths: path.unlink()
    if kind == "folder": folder.rmdir()
    with pytest.raises(ValueError):
        (api.refresh_legal_folder if kind == "folder" else api.refresh_legal_files)()
    assert main.legal_store is previous
    assert launcher.settings_path().read_bytes() == saved
    assert (cache.cache_directory() / "snapshot.bin").read_bytes() == snapshot


@pytest.mark.parametrize("kind", ["folder", "files"])
def test_home_entry_checks_csv_content_and_keeps_unchanged_revision(source, kind):
    folder, paths, api = source
    if kind == "folder":
        api.process_legal_folder(str(folder))
    else:
        api.process_legal_files([str(path) for path in paths])
    original = main.legal_store
    api.check_legal_source_on_entry()
    assert main.legal_store is original

    path = paths[0]
    details = path.stat()
    raw = path.read_bytes()
    changed = raw.replace(b"B1", b"C1")
    assert changed != raw
    path.write_bytes(changed)
    os.utime(path, ns=(details.st_atime_ns, details.st_mtime_ns))
    api.check_legal_source_on_entry()
    current = main.legal_store
    assert current.revision != original.revision
    assert current.source_files["beneficiaries"] == changed

    path.unlink()
    with pytest.raises(ValueError):
        api.check_legal_source_on_entry()
    assert main.legal_store is current
    path.write_bytes(raw)
    api.check_legal_source_on_entry()
    assert main.legal_store.source_files["beneficiaries"] == raw


def test_home_entry_reselects_folder_versions(source):
    folder, paths, api = source
    api.process_legal_folder(str(folder))
    raw = paths[0].read_bytes()
    changed = raw.replace(b"B1", b"C1")
    newer = folder / "beneficiaries (2).csv"
    newer.write_bytes(changed)
    optional = folder / "awareness.csv"
    optional.write_bytes(csv(**{"Awareness ID": ["AW1"]}))
    api.check_legal_source_on_entry()
    assert main.legal_store.source_files["beneficiaries"] == changed
    assert main.legal_store.metadata()["availability"]["awareness"]
    newer.unlink()
    optional.unlink()
    api.check_legal_source_on_entry()
    assert main.legal_store.source_files["beneficiaries"] == raw
    assert not main.legal_store.metadata()["availability"]["awareness"]


def test_home_entry_waits_for_startup_restore(source, monkeypatch):
    folder, paths, api = source
    api.process_legal_folder(str(folder))
    restored = Event()
    finish_startup = Event()
    load = main.load_initial_legal_store

    def pause_after_startup_reads_source(**kwargs):
        load(**kwargs)
        restored.set()
        finish_startup.wait(10)

    monkeypatch.setattr(main, "load_initial_legal_store", pause_after_startup_reads_source)
    monkeypatch.setattr(main, "legal_import_tracker", ImportTracker())
    for name in ("legal_store_loading", "legal_store_restore_error", "REMEMBERED_LEGAL_SOURCE",
                 "REMEMBERED_LEGAL_FOLDER", "REMEMBERED_LEGAL_SOURCE_CONFIGURED", "REMEMBERED_LEGAL_FILES"):
        monkeypatch.setattr(main, name, getattr(main, name))
    worker = launcher.start_legal_restore(main)
    try:
        assert restored.wait(10)
        old_store = main.legal_store
        changed = paths[0].read_bytes().replace(b"B1", b"C1")
        paths[0].write_bytes(changed)
        with ThreadPoolExecutor(max_workers=1) as executor:
            check = executor.submit(api.check_legal_source_on_entry)
            assert main.legal_store is old_store
            finish_startup.set()
            check.result(timeout=10)
        assert main.legal_store.source_files["beneficiaries"] == changed
    finally:
        finish_startup.set()
        worker.join(10)


def test_home_entry_preserves_current_session_upload(source, monkeypatch):
    folder, paths, api = source
    api.process_legal_folder(str(folder))
    monkeypatch.setattr(main, "legal_import_tracker", ImportTracker())
    response = TestClient(main.app).post(
        "/api/legal/upload",
        files=[("files", (path.name, path.read_bytes(), "text/csv")) for path in paths],
    )
    assert response.status_code == 200
    uploaded = main.legal_store
    paths[0].unlink()
    api.check_legal_source_on_entry()
    assert main.legal_store is uploaded


def test_startup_restores_saved_folder_from_cache(source, monkeypatch):
    folder, _, api = source
    api.process_legal_folder(str(folder))
    previous_case = main.legal_store.case('B1')
    monkeypatch.setattr(main, "REMEMBERED_LEGAL_SOURCE_CONFIGURED", True)
    monkeypatch.setattr(main, "REMEMBERED_LEGAL_SOURCE", "folder")
    monkeypatch.setattr(main, "REMEMBERED_LEGAL_FOLDER", launcher.saved_legal_folder())
    monkeypatch.setattr(main, "legal_import_tracker", ImportTracker())
    main.load_initial_legal_store()
    assert main.legal_store.source == str(folder.resolve())
    assert main.legal_store.import_timings['cache_hit'] == 1
    assert main.legal_store.case('B1') == previous_case


def test_startup_missing_saved_folder_never_opens_bundled_data(source, monkeypatch):
    folder, _, _ = source
    monkeypatch.setattr(main, "REMEMBERED_LEGAL_SOURCE_CONFIGURED", True)
    monkeypatch.setattr(main, "REMEMBERED_LEGAL_SOURCE", "folder")
    monkeypatch.setattr(main, "REMEMBERED_LEGAL_FOLDER", folder / 'missing')
    monkeypatch.setattr(main, "legal_import_tracker", ImportTracker())
    with patch.object(main.LegalStore, 'from_folder', side_effect=AssertionError('Unexpected fallback')):
        main.load_initial_legal_store()
    assert main.legal_store is None
    assert 'unavailable' in main.legal_store_restore_error
    assert not main.legal_store_loading


@pytest.mark.parametrize('kind', ['folder', 'files'])
def test_desktop_restart_uses_saved_source_even_with_stale_import_globals(source, monkeypatch, kind):
    folder, paths, api = source
    monkeypatch.setattr(launcher, 'app_data_dir', lambda: folder.parent / 'app-data')
    if kind == 'folder':
        api.process_legal_folder(str(folder))
    else:
        api.process_legal_files([str(path) for path in paths])
    original = main.legal_store
    for name, stale in [('REMEMBERED_LEGAL_FOLDER', None), ('REMEMBERED_LEGAL_FILES', []),
                        ('REMEMBERED_LEGAL_SOURCE', 'folder'), ('REMEMBERED_LEGAL_SOURCE_CONFIGURED', False)]:
        monkeypatch.setattr(main, name, stale)
    monkeypatch.setattr(main, 'legal_import_tracker', ImportTracker())
    monkeypatch.setattr(main, 'legal_store_restore_error', '')
    metrics = launcher.StartupMetrics()
    for _ in range(2):
        thread = launcher.start_legal_restore(main, metrics)
        thread.join(10)
        assert not thread.is_alive()
        assert main.legal_store.import_timings['cache_hit'] == 1
        assert main.legal_store.source_files == original.source_files
        assert main.legal_store.case('B1') == original.case('B1')


@pytest.mark.parametrize('selection', [
    {'kind': 'folder', 'folder': '', 'files': [], 'error': 'Invalid saved settings'},
    {'kind': 'folder', 'folder': 'C:/not-an-existing-legal-source', 'files': [], 'error': ''},
])
def test_explicit_desktop_source_failure_clears_sample_and_preserves_snapshot(source, monkeypatch, selection):
    folder, _, api = source
    api.process_legal_folder(str(folder))
    snapshot = (cache.cache_directory() / 'snapshot.bin').read_bytes()
    monkeypatch.setattr(main, 'legal_import_tracker', ImportTracker())
    monkeypatch.setattr(main, 'legal_store_restore_error', '')
    for name in ['REMEMBERED_LEGAL_FOLDER', 'REMEMBERED_LEGAL_FILES', 'REMEMBERED_LEGAL_SOURCE', 'REMEMBERED_LEGAL_SOURCE_CONFIGURED']:
        monkeypatch.setattr(main, name, getattr(main, name))
    with patch.object(main.LegalStore, 'from_folder', side_effect=AssertionError('Sample fallback')):
        main.load_initial_legal_store(source_selection=selection)
    assert main.legal_store is None
    assert main.legal_store_restore_error
    assert (cache.cache_directory() / 'snapshot.bin').read_bytes() == snapshot


def test_desktop_without_saved_source_never_loads_sample(source, monkeypatch):
    monkeypatch.setattr(main, 'REMEMBERED_LEGAL_SOURCE_CONFIGURED', False)
    monkeypatch.setattr(main, 'UPLOAD_ONLY', True)
    monkeypatch.setattr(main, 'legal_import_tracker', ImportTracker())
    with patch.object(main.LegalStore, 'from_folder', side_effect=AssertionError('Sample fallback')):
        main.load_initial_legal_store()
    assert main.legal_store is None
    assert 'Choose a Legal Platform source' in main.legal_store_restore_error


def test_cancelled_refresh_preserves_source_and_caches(source, monkeypatch):
    folder, _, api = source
    api.process_legal_folder(str(folder))
    previous = main.legal_store
    saved = launcher.settings_path().read_bytes()
    snapshot = (cache.cache_directory() / "snapshot.bin").read_bytes()
    start = ImportOperation.start
    def cancel(operation, name):
        if name == "Finalizing metadata": operation.cancel()
        start(operation, name)
    monkeypatch.setattr(ImportOperation, "start", cancel)
    with pytest.raises(ImportCancelled): api.refresh_legal_folder()
    assert main.legal_store is previous
    assert launcher.settings_path().read_bytes() == saved
    assert (cache.cache_directory() / "snapshot.bin").read_bytes() == snapshot
