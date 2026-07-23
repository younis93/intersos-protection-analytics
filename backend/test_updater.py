import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import updater


class UpdaterTests(unittest.TestCase):
    def setUp(self):
        updater._available = None

    def test_semantic_version_comparison(self):
        self.assertGreater(updater._version("v1.10.0"), updater._version("1.9.9"))

    def test_unconfigured_repository_is_safe(self):
        with patch.object(updater, "ENABLED", False):
            result = updater.check()
        self.assertFalse(result["available"])
        self.assertFalse(result["enabled"])

    def test_valid_manifest_reports_update(self):
        release = {"assets": [{"name": "update.json", "browser_download_url": "https://github.com/example/update.json"}]}
        manifest = {"version": "1.1.0", "installerUrl": "https://github.com/example/setup.exe", "sha256": "a" * 64, "publishedAt": "2026-07-23T00:00:00Z"}
        with patch.object(updater, "ENABLED", True), patch.object(updater, "REPOSITORY", "example/repo"), patch.object(updater, "_json", side_effect=[release, manifest]):
            result = updater.check()
        self.assertTrue(result["available"])
        self.assertEqual(result["latestVersion"], "1.1.0")

    def test_network_failure_never_raises(self):
        with patch.object(updater, "ENABLED", True), patch.object(updater, "_json", side_effect=OSError("offline")):
            result = updater.check()
        self.assertFalse(result["available"])
        self.assertIn("Unable to check", result["message"])

    def test_update_installer_gets_explicit_relaunch_marker(self):
        command = updater._installer_command(Path("setup.exe"))
        self.assertIn("/INTERSOSUPDATE", command)
        self.assertIn("/NORESTART", command)
        self.assertNotIn("/RESTARTAPPLICATIONS", command)

    def test_expected_signing_certificate_is_pinned(self):
        self.assertEqual(
            updater.SIGNING_CERTIFICATE_THUMBPRINT,
            "C4F1B12A3BCCC73BEF903FA3796304CF0E67670D",
        )
        self.assertTrue(updater._has_expected_signature(f"Valid\n{updater.SIGNING_CERTIFICATE_THUMBPRINT}\n"))
        self.assertFalse(updater._has_expected_signature("Valid\n0000000000000000000000000000000000000000\n"))

    def test_installer_url_requires_a_real_github_hostname(self):
        self.assertTrue(updater._trusted_installer_url("https://objects.githubusercontent.com/setup.exe"))
        self.assertFalse(updater._trusted_installer_url("https://attacker-githubusercontent.com/setup.exe"))
        self.assertFalse(updater._trusted_installer_url("http://github.com/setup.exe"))

    def test_stale_update_downloads_are_removed(self):
        with tempfile.TemporaryDirectory() as temp_root:
            stale = Path(temp_root) / "intersos-update-old"
            stale.mkdir()
            (stale / "setup.exe").write_bytes(b"old")
            old_time = time.time() - 25 * 60 * 60
            os.utime(stale, (old_time, old_time))
            with patch.object(updater.tempfile, "gettempdir", return_value=temp_root):
                updater._cleanup_stale_downloads()
            self.assertFalse(stale.exists())


if __name__ == "__main__":
    unittest.main()
