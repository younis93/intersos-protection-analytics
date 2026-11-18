import json
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from backend import main
from backend.duplicate_exclusions import DuplicateExclusionRegistry


def test_notice_is_claimed_once_per_dataset_and_survives_restart(tmp_path, monkeypatch):
    path = tmp_path / "exclusions.json"
    rows = [
        {"caseId": "B1", "pendingRecheck": True, "pendingSince": "2026-10-01"},
        {"identifierValue": "A1", "dataset": "assessments", "pendingRecheck": True, "pendingSince": "2026-10-01"},
    ]
    path.write_text(json.dumps(rows), encoding="utf-8")
    registry = DuplicateExclusionRegistry(path)
    monkeypatch.setattr(main, "duplicate_exclusions", registry)
    client = TestClient(main.app)
    client.get("/")

    def show(dataset="beneficiaries", pending_since="2026-10-01", previously_seen=False):
        response = client.post("/api/legal/duplicate-exclusions/recheck-notice", json={
            "dataset": dataset, "pendingSince": pending_since, "previouslySeen": previously_seen,
        })
        assert response.status_code == 200
        return response.json()["show"]

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: show(), range(2))) == [False, True]
    assert json.loads(path.read_text(encoding="utf-8")) == rows

    monkeypatch.setattr(main, "duplicate_exclusions", DuplicateExclusionRegistry(path))
    assert not show()
    assert not show("assessments", previously_seen=True)
    assert not DuplicateExclusionRegistry(path).claim_recheck_notice("assessments", "2026-10-01")

    rows.append({"caseId": "B2", "pendingRecheck": True, "pendingSince": "2026-10-02"})
    path.write_text(json.dumps(rows), encoding="utf-8")
    assert not show()
    assert show(pending_since="2026-10-02")
    assert not show(pending_since="2026-10-02")


def test_notice_is_claimed_in_memory_if_preferences_cannot_be_saved(tmp_path, monkeypatch):
    path = tmp_path / "exclusions.json"
    path.write_text('[{"caseId":"B1","pendingRecheck":true}]', encoding="utf-8")
    registry = DuplicateExclusionRegistry(path)

    def fail_write(*args):
        raise PermissionError("Read-only preferences")

    monkeypatch.setattr("backend.duplicate_exclusions.update_settings", fail_write)
    assert registry.claim_recheck_notice("beneficiaries", "0")
    assert not registry.claim_recheck_notice("beneficiaries", "0")
