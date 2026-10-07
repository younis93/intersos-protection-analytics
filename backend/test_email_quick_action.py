from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import pytest
from desktop_launcher import DesktopApi


@pytest.mark.parametrize("provider,host,subject_key", [
    ("gmail", "mail.google.com", "su"),
    ("outlook", "outlook.office.com", "subject"),
])
def test_chrome_email_action_uses_safe_arguments(provider, host, subject_key):
    api = DesktopApi(None)
    subject = "Review & تصحيح + #1"
    with patch.object(Path, "is_file", return_value=True), patch("desktop_launcher.subprocess.Popen") as launch:
        assert api.open_issue_email_in_chrome(provider, "lawyer@example.org", subject)
    args, kwargs = launch.call_args
    assert len(args[0]) == 3 and args[0][1] == "--new-window"
    assert kwargs == {"shell": False}
    url = urlparse(args[0][2])
    assert url.scheme == "https" and url.hostname == host
    assert parse_qs(url.query)[subject_key] == [subject]
    assert parse_qs(url.query)["to"] == ["lawyer@example.org"]
    assert "body" not in parse_qs(url.query)


@pytest.mark.parametrize("provider,recipient,subject", [
    ("file:///C:/", "lawyer@example.org", "Review"),
    ("gmail", "bad\r\nBcc: other@example.org", "Review"),
    ("outlook", "lawyer@example.org", "Review\r\nBcc: other@example.org"),
    ("gmail", "lawyer@example.org", "x" * 999),
])
def test_chrome_email_action_rejects_invalid_input(provider, recipient, subject):
    with patch("desktop_launcher.subprocess.Popen") as launch:
        with pytest.raises(ValueError):
            DesktopApi(None).open_issue_email_in_chrome(provider, recipient, subject)
    launch.assert_not_called()


def test_chrome_unavailable_reports_recovery():
    with patch.object(Path, "is_file", return_value=False), patch("desktop_launcher.shutil.which", return_value=None):
        with pytest.raises(RuntimeError, match="Google Chrome is unavailable"):
            DesktopApi(None).open_issue_email_in_chrome("gmail", "lawyer@example.org", "Review")
