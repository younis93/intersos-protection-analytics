import json
import sqlite3
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend import legal_page_cache as cache, legal_processing_cache as processing, main
from backend.legal_platform import LegalStore
from backend.test_legal_platform import required_payload
from backend.test_legal_workspace import full_payload


@pytest.fixture
def environment(monkeypatch):
    payload = full_payload()
    original = LegalStore.from_files(payload, "first")
    monkeypatch.setattr(main, "legal_store", original)
    return payload, original, TestClient(main.app)


@pytest.mark.parametrize("path,body,method", [
    ("overview", {}, "overview"), ("overview-filters", {}, "overview_filters"),
    ("explorer", {}, "explorer"), ("analytics-dashboard", {"dataset": "beneficiaries"}, "analytics_dashboard"),
    ("review", {"exactMatchesOnly": True, "pageSize": 5000}, "review"), ("lawyers", {}, "lawyer_summary"),
    ("deportation-dashboard", {}, "deportation_dashboard"), ("detention", {}, "detention_cases"),
    ("case", {"query": ""}, "case"), ("case-filters", {"query": ""}, "case_filters"),
    ("explorer-filters/beneficiaries", {}, "explorer_filters"),
    ("representation-case-load/open", {}, "representation_case_load"),
    ("intelligence/command-center", {}, "intelligence"),
])
def test_default_pages_reuse_results_after_restoring_store(environment, monkeypatch, path, body, method):
    payload, original, client = environment
    response = client.post("/api/legal/" + path, json=body)
    assert response.status_code == 200, response.text
    restored = LegalStore.from_files(payload, "second")
    assert restored.revision != original.revision
    monkeypatch.setattr(main, "legal_store", restored)
    with patch.object(restored, method, side_effect=AssertionError("Page recalculated")):
        reopened = client.post("/api/legal/" + path, json=body)
    assert reopened.status_code == 200, reopened.text
    assert reopened.json() == response.json()
    assert "no-store" in reopened.headers["cache-control"]


@pytest.mark.parametrize("change", [
    {"search": "B1"}, {"filters": {"Project": ["Example"]}}, {"page": 2},
    {"pageSize": 50}, {"sortColumn": "Case ID"}, {"sortDirection": "desc"},
    {"filterColumn": "Case ID", "filterValue": "B1"},
])
def test_custom_views_are_neither_loaded_nor_saved(environment, change):
    _, store, client = environment
    assert client.post("/api/legal/explorer", json={}).status_code == 200
    calls = []
    def calculate(*args, **kwargs):
        calls.append(True)
        return {"custom": len(calls)}
    with patch.object(store, "explorer", calculate), \
         patch.object(cache, "_read", side_effect=AssertionError("Custom cache read")), \
         patch.object(cache, "_write", side_effect=AssertionError("Custom cache write")):
        first = client.post("/api/legal/explorer", json=change)
        second = client.post("/api/legal/explorer", json=change)
    assert first.status_code == second.status_code == 200
    assert first.json() == {"custom": 1} and second.json() == {"custom": 2}


@pytest.mark.parametrize("selection", [
    main.OverviewRequest(projects=["A"]), main.OverviewRequest(months=["2026-01"]),
    main.IndicatorReportRequest(quarters=["2026-Q1"]), main.IndicatorReportRequest(communityTypes=["IDP"]),
    main.CaseQuery(query="B1"), main.CaseQuery(query="", viewMode="table"),
    main.SamplingQuery(removeDuplicateContacts=True), main.LegalQuery(rule="Invalid age"),
])
def test_filter_and_custom_settings_bypass_persistence(selection):
    assert not cache.initial_request({"request": selection})


def test_review_initial_table_defaults_do_not_allow_custom_queries():
    initial = main.LegalQuery(exactMatchesOnly=True, pageSize=5000)
    assert cache.initial_request({"request": initial}, review_defaults=True)
    for change in ({"page": 2}, {"pageSize": 2500}, {"rule": "Invalid age"}, {"exactMatchesOnly": False}):
        assert not cache.initial_request({"request": initial.model_copy(update=change)}, review_defaults=True)
    hotline = main.LegalQuery(dataset="legalhotlines", allowNameVariations=True, pageSize=5000)
    assert cache.initial_request({"request": hotline}, review_defaults=True)


def test_default_indicator_tokens_follow_current_import(environment, monkeypatch):
    payload, original, client = environment
    report = client.post("/api/legal/indicators", json={})
    assert report.status_code == 200, report.text
    restored = LegalStore.from_files(payload, "second")
    monkeypatch.setattr(main, "legal_store", restored)
    with patch.object(main, "build_indicator_report", side_effect=AssertionError("Indicators recalculated")):
        reopened = client.post("/api/legal/indicators", json={})
    assert reopened.status_code == 200
    assert reopened.json()["revision"] == restored.data_revision != original.data_revision
    assert {key: value for key, value in reopened.json().items() if key != "revision"} == {
        key: value for key, value in report.json().items() if key != "revision"}
    # Cached figures still support fresh downloads from the current source.
    exported = client.post("/api/legal/indicators/records-export", json={"revision": reopened.json()["revision"],
        "records": [{"dataset": "assessments", "rowIndex": 0}]})
    assert exported.status_code == 200


@pytest.mark.parametrize("change", ["data", "exclusions", "day", "version"])
def test_page_cache_invalidates_with_data_and_decisions(environment, monkeypatch, change):
    payload, store, client = environment
    assert client.post("/api/legal/explorer", json={}).status_code == 200
    if change == "data":
        payload["beneficiaries"] += b"\n"
        store = LegalStore.from_files(payload, "changed")
        monkeypatch.setattr(main, "legal_store", store)
    if change == "exclusions": store.set_review_exclusions([("Invalid age", "B2")])
    if change == "version": monkeypatch.setattr(cache, "PAGE_CACHE_VERSION", cache.PAGE_CACHE_VERSION + 1)
    if change == "day":
        tomorrow = date.today() + timedelta(days=1)
        class Tomorrow(date):
            @classmethod
            def today(cls): return tomorrow
        monkeypatch.setattr(cache, "date", Tomorrow)
    with patch.object(store, "explorer", return_value={"rebuilt": True}) as build:
        assert client.post("/api/legal/explorer", json={}).json() == {"rebuilt": True}
    assert build.call_count == 1


def test_changed_revision_during_computation_is_not_saved(environment):
    _, store, _ = environment
    def build():
        store.set_review_exclusions([("Invalid age", "B2")])
        return {"old": True}
    with patch.object(cache, "_write", side_effect=AssertionError("Stale write")):
        assert cache.compute(store, "test", {}, build) == {"old": True}


def test_bounds_corruption_and_unavailable_storage(environment, monkeypatch, tmp_path):
    _, store, _ = environment
    identity = cache._identity(store, "test", {}, None)
    monkeypatch.setattr(cache, "MAX_ENTRIES", 2)
    for index in range(3):
        cache._write((identity[0], str(index)), {"index": index})
    assert cache._read((identity[0], "0")) is None
    assert cache._read((identity[0], "2")) == {"index": 2}
    monkeypatch.setattr(cache, "MAX_BYTES", 30)
    cache._write((identity[0], "small"), {"x": "a" * 10})
    cache._write((identity[0], "small2"), {"x": "b" * 10})
    connection = sqlite3.connect(processing.cache_directory() / "pages.sqlite3")
    try:
        assert connection.execute("SELECT sum(length(body)) FROM pages").fetchone()[0] <= 30
        connection.execute("UPDATE pages SET body=?", (b'{"corrupted":true}',))
        connection.commit()
    finally:
        connection.close()
    assert cache._read((identity[0], "small2")) is None
    monkeypatch.setattr(cache, "MAX_ENTRY_BYTES", 2)
    cache._write((identity[0], "large"), {"too": "large"})
    assert cache._read((identity[0], "large")) is None
    blocked = tmp_path / "blocked"
    blocked.write_text("not a directory")
    monkeypatch.setattr(processing, "cache_directory", lambda: blocked)
    assert cache.compute(store, "test", {}, lambda: {"works": True}) == {"works": True}


def test_errors_exports_and_authentication_remain_live(environment, monkeypatch):
    _, store, client = environment
    monkeypatch.setattr(main, "LOCAL_SESSION_TOKEN", "test-token")
    assert client.post("/api/legal/explorer", json={}).status_code == 403
    client.cookies.set(main.SESSION_COOKIE, "test-token")
    with patch.object(store, "explorer", side_effect=ValueError("bad query")) as build:
        assert client.post("/api/legal/explorer", json={}).status_code == 400
        assert client.post("/api/legal/explorer", json={}).status_code == 400
    assert build.call_count == 2
    with patch.object(store, "export", return_value=b"fresh export") as build:
        assert client.get("/api/legal/export/beneficiaries").status_code == 200
        assert client.get("/api/legal/export/beneficiaries").status_code == 200
    assert build.call_count == 2


def test_page_reopens_in_fresh_backend_process(environment):
    payload, _, client = environment
    first = client.post("/api/legal/overview", json={})
    assert first.status_code == 200
    script = '''
import json, sys
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend import main, legal_processing_cache as cache
from backend.legal_platform import LegalStore
from backend.test_legal_workspace import full_payload
cache.cache_directory = lambda: Path(sys.argv[1])
main.legal_store = LegalStore.from_files(full_payload(), "fresh process")
with patch.object(main.legal_store, "overview", side_effect=AssertionError("Page recalculated")):
    response = TestClient(main.app).post("/api/legal/overview", json={})
assert response.status_code == 200, response.text
print(json.dumps(response.json()))
'''
    result = subprocess.run([sys.executable, "-c", script, str(processing.cache_directory())],
        cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, check=True, timeout=60)
    assert json.loads(result.stdout) == first.json()


def test_send_issues_reuses_only_base_findings_and_reads_current_contacts(monkeypatch, tmp_path):
    from fastapi import FastAPI
    from backend import send_issues
    payload = required_payload()
    for name, raw in list(payload.items()):
        lines = raw.decode("utf-8").splitlines()
        payload[name] = (lines[0] + ",Lawyers\n" + "\n".join(line + ",Alice" for line in lines[1:]) + "\n").encode("utf-8")
    current = [LegalStore.from_files(payload, "first")]
    contacts = send_issues.Contacts(tmp_path / "contacts.json")
    contacts.save({"Alice": "first@example.test"})
    def application():
        app = FastAPI()
        app.include_router(send_issues.make_router(lambda: current[0], contacts))
        return TestClient(app)
    original = application().post("/api/legal/send-issues/findings", json={})
    assert original.status_code == 200
    current[0] = LegalStore.from_files(payload, "second")
    contacts.save({"Alice": "updated@example.test"})
    with patch.object(send_issues, "collect_findings", side_effect=AssertionError("Findings recalculated")):
        response = application().post("/api/legal/send-issues/findings", json={"lawyer": "Alice"})
    assert response.status_code == 200
    assert response.json()["contacts"]["Alice"] == "updated@example.test"
    assert response.json()["revision"] == current[0].revision
    connection = sqlite3.connect(processing.cache_directory() / "pages.sqlite3")
    try:
        # Only the unfiltered base collection is persisted, never the selection.
        assert connection.execute("SELECT count(*) FROM pages").fetchone()[0] == 1
    finally:
        connection.close()


def test_every_dataset_keeps_every_field_through_processing_and_page_cache():
    import io
    import pandas as pd
    payload = full_payload()
    beneficiaries = pd.read_csv(io.BytesIO(payload['beneficiaries']), dtype=object)
    beneficiaries['Name (Filter Color Red)'] = ['اسم المستفيد الأول', 'اسم المستفيد الثاني']
    beneficiaries['Contact Number'] = ['07501234567', '07701234567']
    beneficiaries['Secondary Contact Number'] = ['000123', '000456']
    beneficiaries['Gender'] = ['Female', 'Male']
    beneficiaries['Nationality'] = ['Iraqi', 'Syrian']
    beneficiaries['DoB'] = ['15/03/1990', '20/04/1992']
    beneficiaries['ID Number'] = ['000001', '000002']
    beneficiaries['Spouse name'] = ['اسم الزوج', 'اسم الزوجة']
    beneficiaries['Custom notes'] = ['تفاصيل إضافية\nسطر جديد', 'All source information']
    payload['beneficiaries'] = beneficiaries.to_csv(index=False).encode('utf-8-sig')
    original = LegalStore.from_files(payload, 'Complete source')
    expected = {dataset: cache.compute(original, 'field-integrity', {'dataset': dataset},
        lambda dataset=dataset: original.explorer(dataset)) for dataset in original.frames}
    expected_case = cache.compute(original, 'case-integrity', {}, lambda: original.case(''))
    restored = LegalStore.from_files(payload, 'Reopened source')
    assert restored.import_timings['cache_hit'] == 1
    assert restored.source_files == payload
    def should_not_rebuild():
        raise AssertionError('Expected a cached page')
    for dataset in original.frames:
        pd.testing.assert_frame_equal(original.frames[dataset], restored.frames[dataset])
        actual = cache.compute(restored, 'field-integrity', {'dataset': dataset}, should_not_rebuild)
        assert actual == expected[dataset]
        assert actual['columns'] == list(original.frames[dataset].columns)
        for row in actual['rows']:
            assert all(column in row for column in actual['columns'])
    cases = cache.compute(restored, 'case-integrity', {}, should_not_rebuild)
    assert cases == expected_case
    assert cases['cases'][0]['beneficiary']['Name (Filter Color Red)'] == 'اسم المستفيد الأول'
    assert cases['cases'][0]['beneficiary']['ID Number'] == '000001'
