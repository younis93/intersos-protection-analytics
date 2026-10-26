import json
from unittest.mock import patch

import pytest

import desktop_launcher as launcher


@pytest.mark.parametrize("page", ["home", "legal", "kobo", "custom"])
def test_startup_preference_survives_restart_and_keeps_other_settings(tmp_path, page):
    target = tmp_path / "settings.json"
    target.write_text(json.dumps({"appTheme": "glass-dark", "legalFolder": "sample"}), encoding="utf-8")
    with patch.object(launcher, "settings_path", return_value=target):
        api = launcher.DesktopApi(None)
        assert api.save_startup_page(page) is True
        restarted_api = launcher.DesktopApi(None)
        assert restarted_api.get_saved_startup_page() == page
        assert launcher.saved_app_theme() == "glass-dark"
        assert launcher.load_settings()["legalFolder"] == "sample"


@pytest.mark.parametrize("stored", [None, "unknown", [], {"invalid": True}])
def test_missing_or_invalid_preference_defaults_to_home(tmp_path, stored):
    target = tmp_path / "settings.json"
    with patch.object(launcher, "settings_path", return_value=target):
        assert launcher.saved_startup_page() == "home"
        target.write_text(json.dumps({"startupPage": stored}), encoding="utf-8")
        assert launcher.saved_startup_page() == "home"


def test_rejected_preference_preserves_saved_choice(tmp_path):
    target = tmp_path / "settings.json"
    with patch.object(launcher, "settings_path", return_value=target):
        launcher.save_startup_page("kobo")
        with pytest.raises(ValueError):
            launcher.DesktopApi(None).save_startup_page("unknown")
        assert launcher.saved_startup_page() == "kobo"


@pytest.mark.parametrize("settings,configured,source,folder,files", [
    ({}, "0", "folder", "", []),
    ({"legalFolder": "C:/Legal Platform"}, "1", "folder", "C:/Legal Platform", []),
    ({"legalSource": "folder", "legalFolder": "C:/unavailable"}, "1", "folder", "C:/unavailable", []),
    ({"legalSource": "folder"}, "1", "folder", "", []),
    ({"legalSource": "files", "legalFiles": []}, "1", "files", "", []),
    ({"legalSource": "files", "legalFiles": ["C:/selected.csv"]}, "1", "files", "", ["C:/selected.csv"]),
])
def test_startup_passes_saved_source_and_clears_stale_environment(monkeypatch, settings, configured, source, folder, files):
    import os
    monkeypatch.setattr(launcher, "load_settings", lambda: settings)
    for name in ("SOURCE_CONFIGURED", "SOURCE", "FOLDER", "FILES"):
        monkeypatch.setenv("INTERSOS_LEGAL_" + name, "stale")
    launcher.configure_legal_source_environment()
    assert os.environ["INTERSOS_LEGAL_SOURCE_CONFIGURED"] == configured
    assert os.environ["INTERSOS_LEGAL_SOURCE"] == source
    assert os.environ["INTERSOS_LEGAL_FOLDER"] == folder
    assert json.loads(os.environ["INTERSOS_LEGAL_FILES"]) == files


def test_missing_folder_preference_does_not_select_current_directory(tmp_path):
    target = tmp_path / "settings.json"
    target.write_text('{}', encoding='utf-8')
    with patch.object(launcher, "settings_path", return_value=target):
        assert launcher.saved_legal_folder() is None


@pytest.mark.parametrize('raw', ['{', '[]', '{"legalSource":"unexpected"}',
    '{"legalSource":"folder","legalFolder":null}', '{"legalSource":"files","legalFiles":[]}'])
def test_invalid_saved_source_is_explicit_error(tmp_path, raw):
    target = tmp_path / 'settings.json'
    target.write_text(raw, encoding='utf-8')
    with patch.object(launcher, 'settings_path', return_value=target):
        assert launcher.saved_legal_source_selection()['error']


def test_source_selection_reads_current_settings_each_time(tmp_path):
    target = tmp_path / 'settings.json'
    with patch.object(launcher, 'settings_path', return_value=target):
        assert launcher.saved_legal_source_selection()['error']
        launcher.save_legal_folder(tmp_path)
        selection = launcher.saved_legal_source_selection()
        assert selection == {'kind': 'folder', 'folder': str(tmp_path), 'files': [], 'error': ''}
        target.write_text(json.dumps({'legalSource': 'files', 'legalFiles': ['changed.csv']}))
        assert launcher.saved_legal_source_selection()['files'] == ['changed.csv']
