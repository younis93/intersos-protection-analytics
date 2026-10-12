from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import desktop_launcher as launcher
from backend import main
from backend.import_progress import ImportTracker
from backend.test_legal_platform import csv


def source_payload(identifier):
    return csv(**{"PN ID": [identifier], "Date of deporting": ["05/01/2026"], "Nationality": ["Syrian"]})


@pytest.fixture
def import_session(monkeypatch, tmp_path):
    tracker = ImportTracker()
    monkeypatch.setattr(main, "legal_import_tracker", tracker)
    monkeypatch.setattr("backend.import_progress.legal_import_tracker", tracker)
    monkeypatch.setattr(main, "legal_store", None)
    monkeypatch.setattr(main, "legal_store_loading", False)
    monkeypatch.setattr(main, "legal_store_restore_error", "")
    monkeypatch.setattr(main, "prepare_import_exclusions", lambda store: None)
    monkeypatch.setattr(launcher, "settings_path", lambda: tmp_path / "settings.json")
    return launcher.DesktopApi(None), TestClient(main.app)


@pytest.mark.parametrize("mode", ["files", "folder"])
def test_refresh_replace_and_startup_read_current_bytes(import_session, monkeypatch, tmp_path, mode):
    api, client = import_session
    folder = tmp_path / "first" / "Data"
    folder.mkdir(parents=True)
    path = folder / "deportationrecords.CSV"
    path.write_bytes(source_payload("OLD"))
    process = api.process_legal_files if mode == "files" else api.process_legal_folder
    argument = lambda directory: [str(directory / path.name)] if mode == "files" else str(directory)
    first = process(argument(folder))

    def check(identifier, revision):
        assert client.get("/api/legal/metadata").json()["revision"] == revision
        rows = client.post("/api/legal/explorer", json={"dataset": "deportationrecords"}).json()["rows"]
        assert [row["PN ID"] for row in rows] == [identifier]
        assert client.post("/api/legal/deportation-dashboard", json={}).json()["total"] == 1

    check("OLD", first["revision"])
    path.write_bytes(source_payload("UPDATED"))
    refresh = api.refresh_legal_files if mode == "files" else api.refresh_legal_folder
    second = refresh()
    assert second["revision"] != first["revision"]
    check("UPDATED", second["revision"])

    # Use the same folder/file names with a different source location.
    other = tmp_path / "second" / "Data"
    other.mkdir(parents=True)
    (other / path.name).write_bytes(source_payload("REPLACEMENT"))
    third = process(argument(other))
    assert third["revision"] != second["revision"]
    check("REPLACEMENT", third["revision"])
    settings = launcher.load_settings()
    assert settings["legalSource"] == mode

    (other / path.name).write_bytes(source_payload("STARTUP"))
    monkeypatch.setattr(main, "REMEMBERED_LEGAL_SOURCE_CONFIGURED", True)
    monkeypatch.setattr(main, "REMEMBERED_LEGAL_SOURCE", settings["legalSource"])
    monkeypatch.setattr(main, "REMEMBERED_LEGAL_FOLDER", Path(settings["legalFolder"]) if mode == "folder" else None)
    monkeypatch.setattr(main, "REMEMBERED_LEGAL_FILES", [Path(value) for value in settings.get("legalFiles", [])])
    main.load_initial_legal_store()
    fourth = main.legal_store.metadata()
    assert fourth["revision"] != third["revision"]
    check("STARTUP", fourth["revision"])
    assert not main.legal_store_restore_error and not main.legal_store_loading


def test_missing_remembered_file_fails_refresh_without_publishing_subset(import_session, tmp_path):
    api, client = import_session
    deportation = tmp_path / "deportationrecords.csv"
    awareness = tmp_path / "awareness.csv"
    deportation.write_bytes(source_payload("ORIGINAL"))
    awareness.write_bytes(csv(**{"Awareness ID": ["W1"], "Participant Name": ["Test"]}))
    original = api.process_legal_files([str(deportation), str(awareness)])
    awareness.unlink()
    with pytest.raises(ValueError, match="no longer available"):
        api.refresh_legal_files()
    assert client.get("/api/legal/metadata").json()["revision"] == original["revision"]
    assert len(launcher.load_settings()["legalFiles"]) == 2


def test_browser_upload_replaces_existing_rows(import_session):
    _, client = import_session
    revisions = []
    for identifier in ("OLD", "NEW"):
        response = client.post("/api/legal/upload", files=[("files", ("deportationrecords.csv", source_payload(identifier), "text/csv"))])
        assert response.status_code == 200, response.text
        revisions.append(response.json()["revision"])
        result = client.post("/api/legal/explorer", json={"dataset": "deportationrecords"}).json()
        assert [row["PN ID"] for row in result["rows"]] == [identifier]
    assert revisions[0] != revisions[1]
