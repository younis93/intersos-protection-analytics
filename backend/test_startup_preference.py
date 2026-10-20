import json
from unittest.mock import patch

import pytest

import desktop_launcher as launcher


@pytest.mark.parametrize("page", ["home", "legal", "kobo"])
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
