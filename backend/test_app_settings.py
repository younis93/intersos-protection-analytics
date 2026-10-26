import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event, Thread
from unittest.mock import patch

import pytest

import desktop_launcher as launcher
from backend.app_settings import update_settings


def test_concurrent_theme_updates_preserve_saved_source_and_other_preferences(tmp_path, monkeypatch):
    path = tmp_path / 'settings.json'
    monkeypatch.setattr(launcher, 'settings_path', lambda: path)
    launcher.save_legal_folder(tmp_path / 'Legal Platform')
    stopped = Event()
    errors = []

    def read_preferences():
        while not stopped.is_set():
            try:
                settings = launcher.load_settings()
                assert settings['legalFolder'] == str(tmp_path / 'Legal Platform')
                assert settings['legalSource'] == 'folder'
            except Exception as exc:
                errors.append(exc)

    observer = Thread(target=read_preferences)
    observer.start()
    try:
        with ThreadPoolExecutor(max_workers=8) as workers:
            tasks = []
            for _ in range(12):
                tasks.extend([workers.submit(launcher.save_app_theme, 'glass-light'),
                              workers.submit(launcher.save_startup_page, 'legal'),
                              workers.submit(launcher.save_indicator_master, tmp_path / 'master.xlsx')])
            for task in tasks:
                task.result()
    finally:
        stopped.set()
        observer.join(5)
    assert not errors
    settings = launcher.load_settings()
    assert settings['legalFolder'] == str(tmp_path / 'Legal Platform')
    assert settings['startupPage'] == 'legal'
    assert settings['indicatorMasterWorkbook'] == str(tmp_path / 'master.xlsx')


@pytest.mark.parametrize('raw', ['{broken', '[]'])
def test_invalid_preferences_are_never_replaced_with_theme_only(tmp_path, raw):
    path = tmp_path / 'settings.json'
    path.write_text(raw, encoding='utf-8')
    with pytest.raises(ValueError):
        update_settings(path, {'appTheme': 'glass-light'})
    assert path.read_text(encoding='utf-8') == raw


def test_failed_atomic_publish_preserves_preferences(tmp_path):
    path = tmp_path / 'settings.json'
    update_settings(path, {'legalFolder': 'C:/Legal Platform', 'legalSource': 'folder'})
    original = path.read_bytes()
    with patch.object(Path, 'replace', side_effect=OSError('Disk failure')):
        with pytest.raises(OSError):
            update_settings(path, {'appTheme': 'glass-light'})
    assert path.read_bytes() == original
    assert not list(tmp_path.glob('*.tmp'))


def test_windows_reader_lock_retries_without_losing_source(tmp_path):
    path = tmp_path / 'settings.json'
    update_settings(path, {'legalFolder': 'C:/Legal Platform'})
    replace = Path.replace
    calls = 0

    def briefly_locked(source, target):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise PermissionError('Reader still holds the file')
        return replace(source, target)

    with patch.object(Path, 'replace', briefly_locked):
        update_settings(path, {'appTheme': 'glass-light'})
    assert calls == 2
    assert json.loads(path.read_text()) == {'legalFolder': 'C:/Legal Platform', 'appTheme': 'glass-light'}
