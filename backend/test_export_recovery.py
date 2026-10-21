import os
import subprocess
import sys
import threading
import time
import uuid
from types import SimpleNamespace
from unittest.mock import Mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.export_temp import cleanup_export_folders, lock_owner
from backend.kobo import ProjectStore
from backend.kobo_api import make_router
from backend.kobo_excel import ExportJobs
from desktop_launcher import guard_export_close


def test_recovery_requests_survive_restart_and_delete_independently(tmp_path):
    def app():
        result = FastAPI()
        result.include_router(make_router(ProjectStore(tmp_path / 'projects.sqlite3')))
        return result

    key, other = str(uuid.uuid4()), str(uuid.uuid4())
    body = {'filename': 'Report.pdf', 'input': {'projectId': 'p', 'projectName': 'Project', 'settings': {}, 'format': 'pdf', 'question': 'q', 'snapshot': {'private': 'responses'}}, 'job': 'old-job'}
    with TestClient(app()) as client:
        assert client.put(f'/api/kobo/export-recovery/{key}', json=body).status_code == 200
        assert client.put(f'/api/kobo/export-recovery/{other}', json=body).status_code == 200
        assert client.put(f'/api/kobo/export-recovery/{key}', json={**body, 'input': {**body['input'], 'format': 'bad'}}).status_code == 422
    with TestClient(app()) as client:
        records = client.get('/api/kobo/export-recovery').json()
        assert {row['id'] for row in records} == {key, other}
        assert records[0]['job'] == 'old-job'
        assert records[0]['input']['question'] == 'q'
        assert 'snapshot' not in records[0]['input']
        assert client.delete(f'/api/kobo/export-recovery/{key}').status_code == 200
        assert [row['id'] for row in client.get('/api/kobo/export-recovery').json()] == [other]


def test_cleanup_preserves_locked_exports_recent_legacy_and_unrelated_files(tmp_path):
    active = tmp_path / 'intersos-kobo-active'; active.mkdir()
    owner = lock_owner(active)
    abandoned = tmp_path / 'intersos-kobo-abandoned'; abandoned.mkdir()
    lock_owner(abandoned).close()
    recent = tmp_path / 'intersos-kobo-recent'; recent.mkdir()
    old = tmp_path / 'intersos-kobo-old'; old.mkdir()
    (old / 'partial.xlsx').write_bytes(b'partial')
    os.utime(old, (time.time()-10800, time.time()-10800))
    unrelated = tmp_path / 'saved-project'; unrelated.mkdir()
    (unrelated / 'download.xlsx').write_bytes(b'keep')
    try:
        cleanup_export_folders(tmp_path)
        assert active.exists() and recent.exists() and unrelated.exists()
        assert not abandoned.exists() and not old.exists()
        owner.close()
        cleanup_export_folders(tmp_path)
        assert not active.exists()
        assert (unrelated / 'download.xlsx').read_bytes() == b'keep'
    finally:
        owner.close()


def test_completed_export_expires_after_one_hour_but_live_worker_stays(tmp_path, monkeypatch):
    import backend.kobo_excel as native
    jobs = ExportJobs()
    complete = tmp_path / 'completed'; complete.mkdir()
    live = tmp_path / 'live'; live.mkdir()
    jobs.jobs = {
        'complete': {'state': 'complete', 'completed': 1, 'created': 1, 'folder': complete, 'owner': lock_owner(complete)},
        'live': {'state': 'running', 'completed': None, 'created': 1, 'folder': live, 'owner': lock_owner(live)},
    }
    monkeypatch.setattr(native.time, 'monotonic', lambda: 3600)
    jobs._expire(); assert complete.exists()
    monkeypatch.setattr(native.time, 'monotonic', lambda: 3602)
    jobs._expire(); assert not complete.exists() and live.exists()
    jobs.jobs['live']['owner'].close(); jobs.jobs.clear()


def test_abrupt_process_exit_releases_export_ownership(tmp_path):
    folder = tmp_path / 'intersos-kobo-process'; folder.mkdir()
    script = 'import sys; from pathlib import Path; from backend.export_temp import lock_owner; owner=lock_owner(Path(sys.argv[1])); print("locked", flush=True); sys.stdin.read()'
    process = subprocess.Popen([sys.executable, '-c', script, str(folder)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    try:
        assert process.stdout.readline().strip() == 'locked'
        cleanup_export_folders(tmp_path); assert folder.exists()
        process.terminate(); process.wait(timeout=5)
        cleanup_export_folders(tmp_path); assert not folder.exists()
    finally:
        if process.poll() is None:
            process.kill(); process.wait(timeout=5)
        process.stdin.close(); process.stdout.close()


def test_native_close_guard_never_evaluates_script_on_the_ui_thread():
    done = threading.Event()
    caller = threading.get_ident()
    def evaluate(_script):
        assert threading.get_ident() != caller
        done.set()
        return False
    window = SimpleNamespace(evaluate_js=evaluate, destroy=Mock())
    assert guard_export_close(window) is False
    assert done.wait(2)
    window.destroy.assert_not_called()


def test_native_close_guard_closes_when_frontend_has_no_exports():
    done = threading.Event()
    window = SimpleNamespace(evaluate_js=Mock(return_value=True), destroy=done.set)
    assert guard_export_close(window) is False
    assert done.wait(2)
    assert guard_export_close(window) is True
