import os
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import updater


class UpdaterTests(unittest.TestCase):
    def setUp(self):
        updater._available = None
        updater._set(phase="idle", progress=0, error=None, downloadedBytes=0, totalBytes=0)

    def test_semantic_version_comparison(self):
        self.assertGreater(updater._version("v1.10.0"), updater._version("1.9.9"))

    def test_unconfigured_repository_is_safe(self):
        with patch.object(updater, "ENABLED", False):
            result = updater.check()
        self.assertFalse(result["available"])
        self.assertFalse(result["enabled"])

    def test_valid_manifest_reports_update(self):
        manifest = {"version": "1.1.0", "installerUrl": "https://github.com/example/setup.exe", "sha256": "a" * 64, "publishedAt": "2026-07-23T00:00:00Z", "sizeBytes": 12_345_678}
        with patch.object(updater, "ENABLED", True), patch.object(updater, "REPOSITORY", "example/repo"), patch.object(updater, "_json", return_value=manifest) as fetch_json:
            result = updater.check()
        self.assertTrue(result["available"])
        self.assertEqual(result["latestVersion"], "1.1.0")
        self.assertEqual(result["sizeBytes"], 12_345_678)
        fetch_json.assert_called_once_with("https://github.com/example/repo/releases/latest/download/update.json")

    def test_manifest_without_a_positive_size_is_rejected(self):
        manifest = {"version": "1.1.0", "installerUrl": "https://github.com/example/setup.exe", "sha256": "a" * 64, "publishedAt": "2026-07-23T00:00:00Z"}
        with patch.object(updater, "ENABLED", True), patch.object(updater, "_json", return_value=manifest):
            result = updater.check()
        self.assertFalse(result["available"])
        self.assertIn("Invalid update manifest", result["message"])

    def test_network_failure_never_raises(self):
        with patch.object(updater, "ENABLED", True), patch.object(updater, "_json", side_effect=OSError("offline")):
            result = updater.check()
        self.assertFalse(result["available"])
        self.assertIn("Unable to check", result["message"])

    def test_update_installer_uses_the_installer_relaunch_flow(self):
        command = updater._installer_command(Path("setup.exe"))
        self.assertIn("/INTERSOSUPDATE", command)
        self.assertIn("/NORESTART", command)
        self.assertIn("/NORESTARTAPPLICATIONS", command)
        self.assertIn("/EXTERNALRELAUNCH", command)

    def test_external_relauncher_uses_a_script_file_and_separate_arguments(self):
        with tempfile.TemporaryDirectory() as temp_root:
            target = Path(temp_root) / "Update Folder" / "setup.exe"
            target.parent.mkdir()
            command = updater._relaunch_command(
                target, Path(r"C:\Installed App\app.exe"), "1.0.35", process_id=1234
            )
            runner = target.with_name("run-update.ps1")
            self.assertTrue(runner.exists())
            self.assertEqual(command[command.index("-File") + 1], str(runner))
            self.assertEqual(command[command.index("-ApplicationProcessId") + 1], "1234")
            self.assertEqual(command[command.index("-ApplicationPath") + 1], r"C:\Installed App\app.exe")
            self.assertEqual(command[command.index("-ExpectedVersion") + 1], "1.0.35")

    def test_runner_waits_installs_verifies_and_relaunches(self):
        script = updater.UPDATE_RUNNER
        self.assertIn("while (Test-ApplicationRunning)", script)
        self.assertIn("& $InstallerPath @InstallerArguments", script)
        self.assertIn("$InstallerExitCode -notin @(0, 3010)", script)
        self.assertIn("$InstalledVersion -ne $ExpectedVersion", script)
        self.assertIn("Start-Process -FilePath $ApplicationPath", script)
        self.assertIn("Show-UpdateFailure $Failure", script)
        self.assertIn("update-runner.log", script)
        self.assertIn("update-installer.log", script)

    @unittest.skipUnless(os.name == "nt" and shutil.which("powershell.exe"), "Windows integration test")
    def test_runner_windows_integration_waits_installs_verifies_and_relaunches(self):
        with tempfile.TemporaryDirectory() as temp_root:
            root = Path(temp_root)
            application = root / "installed" / "test-update-app.exe"
            application.parent.mkdir()
            shutil.copy2(Path(os.environ["SystemRoot"]) / "System32" / "ping.exe", application)
            installer = root / "download" / "fake-installer.cmd"
            installer.parent.mkdir()
            installer.write_text(
                "@echo off\n"
                ">\"%INTERSOS_TEST_INSTALL_DIR%\\app-version.txt\" echo %INTERSOS_TEST_VERSION%\n"
                "exit /b %INTERSOS_TEST_EXIT_CODE%\n",
                encoding="ascii",
            )
            sleeper = subprocess.Popen(
                [str(application), "-n", "3", "127.0.0.1"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            command = updater._relaunch_command(installer, application, "9.8.7", sleeper.pid)
            environment = {
                **os.environ,
                "INTERSOS_TEST_VERSION": "9.8.7",
                "INTERSOS_TEST_EXIT_CODE": "0",
                "INTERSOS_TEST_INSTALL_DIR": str(application.parent),
                "INTERSOS_UPDATE_NO_DIALOG": "1",
            }
            result = subprocess.run(command, env=environment, capture_output=True, text=True, timeout=30, check=False)
            sleeper.wait(timeout=5)
            log_path = installer.parent / "update-runner.log"
            diagnostics = log_path.read_text(encoding="utf-8-sig") if log_path.exists() else result.stderr
            self.assertEqual(result.returncode, 0, diagnostics)
            self.assertEqual((application.parent / "app-version.txt").read_text().strip(), "9.8.7")
            runner_log = (installer.parent / "update-runner.log").read_text(encoding="utf-8-sig")
            self.assertIn("Installer exited with code 0", runner_log)
            self.assertIn("Update completed successfully", runner_log)
            time.sleep(1)

    @unittest.skipUnless(os.name == "nt" and shutil.which("powershell.exe"), "Windows integration test")
    def test_runner_windows_integration_reports_install_and_version_failures(self):
        scenarios = (
            ("installer exit", "7", "9.8.7", "The installer failed with exit code 7"),
            ("version mismatch", "0", "9.8.6", "does not match expected version 9.8.7"),
        )
        for label, exit_code, marker_version, expected_error in scenarios:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temp_root:
                root = Path(temp_root)
                application = root / "installed" / "test-update-app.exe"
                application.parent.mkdir()
                shutil.copy2(Path(os.environ["SystemRoot"]) / "System32" / "ping.exe", application)
                installer = root / "download" / "fake-installer.cmd"
                installer.parent.mkdir()
                installer.write_text(
                    "@echo off\n"
                    ">\"%INTERSOS_TEST_INSTALL_DIR%\\app-version.txt\" echo %INTERSOS_TEST_VERSION%\n"
                    "exit /b %INTERSOS_TEST_EXIT_CODE%\n",
                    encoding="ascii",
                )
                command = updater._relaunch_command(installer, application, "9.8.7", process_id=999999)
                environment = {
                    **os.environ,
                    "INTERSOS_TEST_VERSION": marker_version,
                    "INTERSOS_TEST_EXIT_CODE": exit_code,
                    "INTERSOS_TEST_INSTALL_DIR": str(application.parent),
                    "INTERSOS_UPDATE_NO_DIALOG": "1",
                }
                result = subprocess.run(command, env=environment, capture_output=True, text=True, timeout=30, check=False)
                self.assertEqual(result.returncode, 1)
                runner_log = (installer.parent / "update-runner.log").read_text(encoding="utf-8-sig")
                self.assertIn(expected_error, runner_log)
                self.assertNotIn("Update completed successfully", runner_log)

    def test_update_installs_over_the_running_application_directory(self):
        command = updater._installer_command(
            Path("setup.exe"), Path(r"C:\Users\Person\App Folder"), Path(r"C:\Temp\update.log")
        )
        self.assertIn(r"/DIR=C:\Users\Person\App Folder", command)
        self.assertIn(r"/LOG=C:\Temp\update.log", command)

    def test_status_reports_download_byte_counts(self):
        updater._set(phase="downloading", progress=45, downloadedBytes=45_000_000, totalBytes=100_000_000)
        result = updater.status()
        self.assertEqual(result["downloadedBytes"], 45_000_000)
        self.assertEqual(result["totalBytes"], 100_000_000)

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
