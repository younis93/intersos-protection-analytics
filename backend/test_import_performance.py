import asyncio
import io
from threading import get_ident
from unittest.mock import patch

import pandas as pd
import pytest
from fastapi import HTTPException, UploadFile

from backend.legal_platform import LegalStore, replace_legal_assistance
from backend.test_legal_platform import required_payload


def test_exclusions_are_applied_before_warming_and_exact_names_are_reused():
    original = LegalStore._name_match_flags
    calls = []
    def track(self, *args, **kwargs):
        calls.append(kwargs)
        return original(self, *args, **kwargs)
    with patch.object(LegalStore, "_name_match_flags", track):
        store = LegalStore.from_files(required_payload(), "test", exclusions=[("Possible duplicate name", "B1")])
        assert any(call.get("excluded_case_ids") == {"B1"} for call in calls)
        warm_calls = len(calls)
        store.review("beneficiaries", search="B1")
        store.review("beneficiaries", exact_matches_only=True, rule="Possible duplicate name")
        store.metadata()
        assert len(calls) == warm_calls
        revision = store.revision
        store.set_review_exclusions([])
        assert store.revision != revision
        store.review("beneficiaries")
        assert len(calls) > warm_calls


def test_import_is_ready_with_metadata_and_monotonic_progress():
    progress = []
    store = LegalStore.from_files(required_payload(), "test", progress.append)
    assert progress == sorted(progress)
    assert store._metadata_cache is not None
    assert store.metadata()["revision"] == store.revision
    assert {"csv_read", "cleaning", "validation", "review_preparation", "metadata", "total"} == set(store.import_timings)
    revision = store.revision
    store.set_review_exclusions([])
    assert store.revision == revision
    assert LegalStore.from_files(required_payload(), "test").revision != revision


def test_import_exclusions_preserve_base_findings_and_overview_totals():
    payload = required_payload()
    frame = pd.read_csv(io.BytesIO(payload["beneficiaries"]), dtype=object)
    frame["Name (Filter Color Red)"] = ["Same long synthetic name"] * 2
    frame["Project"] = ["UNHCR 2026 - Erbil"] * 2
    payload["beneficiaries"] = frame.to_csv(index=False).encode("utf-8")
    exclusions = [("Possible duplicate name", "B1")]
    after_import = LegalStore.from_files(payload, "test")
    after_import.set_review_exclusions(exclusions)
    during_import = LegalStore.from_files(payload, "test", exclusions=exclusions)
    assert after_import.flags == during_import.flags
    assert after_import.metadata()["overview"] == during_import.metadata()["overview"]
    assert after_import.review("beneficiaries") == during_import.review("beneficiaries")


def test_batch_cleaning_preserves_values_dates_and_identifiers():
    payload = required_payload()
    frame = pd.read_csv(io.BytesIO(payload["beneficiaries"]), dtype=object)
    frame["Case ID"] = ["00001", "00002"]
    frame["Notes"] = ["LEGAL ASSISTANCE - مساعدة / legal assistance", "اسم عربي"]
    frame["Empty"] = [None, None]
    payload["beneficiaries"] = frame.to_csv(index=False).encode("utf-8-sig")
    result = LegalStore.from_files(payload, "test").frames["beneficiaries"]
    assert result["Case ID"].tolist() == ["00001", "00002"]
    assert result["Notes"].tolist() == frame["Notes"].map(replace_legal_assistance).tolist()
    assert result["Empty"].isna().all()
    assert result["Date of Identification / تاريخ التحديد"].dt.strftime("%Y-%m-%d").tolist() == ["2026-01-31", "2026-02-01"]


def test_metadata_retries_if_exclusions_change_during_calculation():
    store = LegalStore.from_files(required_payload(), "test")
    store._metadata_cache = None
    original = store.review
    changed = False
    def review(*args, **kwargs):
        nonlocal changed
        result = original(*args, **kwargs)
        if not changed:
            changed = True
            store.set_review_exclusions([("Invalid contact number", "B1")])
        return result
    with patch.object(store, "review", review):
        metadata = store.metadata()
    assert metadata["revision"] == store.revision
    assert metadata["reviewCounts"]["beneficiaries"] == sum(store.review("beneficiaries")["ruleCounts"].values())


def test_legacy_encoding_and_malformed_spouse_dates_are_preserved():
    payload = required_payload()
    payload["beneficiaries"] = (
        'Case ID,Name (Filter Color Red),Spouse DOB,Notes\n'
        '0001,René,not-a-date,Legal Assistance\n'
        '0002,Other,01/01/2000,\n'
    ).encode("cp1252")
    frame = LegalStore.from_files(payload, "test").frames["beneficiaries"]
    assert frame["Case ID"].tolist() == ["0001", "0002"]
    assert frame["Name (Filter Color Red)"].iloc[0] == "René"
    assert frame["Spouse DOB"].tolist() == ["not-a-date", "01/01/2000"]
    assert frame["Notes"].iloc[0] == "Legal Representation"


def test_explorer_filters_include_every_column_and_bound_large_value_lists():
    store = LegalStore.from_files(required_payload(), "test")
    store.frames["beneficiaries"]["High cardinality"] = [f"Value {index}" for index in range(len(store.frames["beneficiaries"]))]
    # Add more rows directly because this test targets filter metadata only.
    store.frames["beneficiaries"] = pd.concat([
        store.frames["beneficiaries"],
        pd.DataFrame({"High cardinality": [f"Value {index}" for index in range(2, 602)]}),
    ], ignore_index=True)
    result = store.explorer_filters("beneficiaries")
    assert [item["name"] for item in result["columns"]] == list(store.frames["beneficiaries"].columns)
    high = next(item for item in result["columns"] if item["name"] == "High cardinality")
    assert high["valueCount"] == 602
    assert len(high["values"]) == 500
    assert high["truncated"] is True


def test_upload_prepares_metadata_in_worker_and_failure_preserves_previous_store(monkeypatch):
    from backend import main
    previous = LegalStore.from_files(required_payload(), "previous")
    monkeypatch.setattr(main, "legal_store", previous)
    monkeypatch.setattr(main.duplicate_exclusions, "exclusion_rows", lambda: [])
    main_thread = get_ident()
    metadata_threads = []
    original = LegalStore.metadata
    def metadata(self):
        if self._metadata_cache is None:
            metadata_threads.append(get_ident())
        return original(self)
    def files():
        return [UploadFile(filename=f"{name}.csv", file=io.BytesIO(raw)) for name, raw in required_payload().items()]
    with patch.object(LegalStore, "metadata", metadata):
        result = asyncio.run(main.legal_upload(files()))
    assert metadata_threads and all(thread != main_thread for thread in metadata_threads)
    assert result["revision"] != previous.revision
    current = main.legal_store
    with patch.object(LegalStore, "metadata", side_effect=ValueError("metadata failed")):
        with pytest.raises(HTTPException) as error:
            asyncio.run(main.legal_upload(files()))
    assert error.value.status_code == 400
    assert main.legal_store is current
