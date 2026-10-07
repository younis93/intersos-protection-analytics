from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from unittest.mock import patch

import pandas as pd
import pytest
from openpyxl import load_workbook

from backend.indicator_reporting import PreparedIndicatorData, build_indicator_report, build_monthly_reports
from backend.legal_platform import LegalStore
from scripts.benchmark_indicator_performance import synthetic_frames


@pytest.mark.parametrize("options", [
    {"months": [f"2026-{month:02}" for month in range(1, count+1)]} for count in (1, 3, 6, 12)
] + [
    {"months": ["2026-01", "2026-04"], "quarters": ["2026-Q2"]},
    {"months": ["2026-01"], "quarters": ["2026-Q4"]},
    {"months": ["2026-01", "2026-02"], "projects": ["UNHCR 2026 - Gov"],
     "locations": ["Anbar أنبار"], "community_types": ["Syrian Refugee"]},
    {"months": ["2024-01", "2026-01", "2026-12"], "years": ["2024", "2026"], "from_date": "2026-01-03", "to_date": "2026-10-01"},
])
def test_monthly_batch_matches_independent_full_reports(options):
    frames = synthetic_frames(180)
    prepared = PreparedIndicatorData(frames)
    original = {name: frame.copy(deep=True) for name, frame in frames.items()}
    result = build_monthly_reports(frames, **options, prepared=prepared)
    for entry in result["reports"]:
        selected = {**options, "quarters": [], "months": [entry["month"]]}
        assert entry["report"] == build_indicator_report(frames, **selected, prepared=prepared)
    assert result["months"] == sorted(set(result["months"]))
    if options.get("quarters") == ["2026-Q4"]: assert result == {"months": [], "reports": []}
    for name, frame in original.items(): pd.testing.assert_frame_equal(frame, frames[name])


def test_monthly_cache_invalidation_and_concurrent_queries(monkeypatch):
    from backend import main
    store = LegalStore(synthetic_frames(120), "synthetic", [])
    monkeypatch.setattr(main, "legal_store", store)
    request = main.IndicatorReportRequest(months=["2026-02", "2026-01", "2026-01"])
    first = main.legal_indicators_monthly(request)
    with patch("backend.indicator_reporting.build_indicator_report", side_effect=AssertionError("cached month recalculated")):
        assert main.legal_indicators_monthly(request) == first
    prepared = store._indicator_prepared
    store.set_review_exclusions([("Possible duplicate name", "B1")])
    assert store._indicator_prepared is None and store._indicator_cache == {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        responses = list(pool.map(lambda _: main.legal_indicators_monthly(request), range(3)))
    assert all(response == first for response in responses)
    assert store._indicator_prepared is not prepared


def test_explorer_reuses_sort_and_filter_indexes_and_invalidates():
    frame = pd.DataFrame({"Case ID": ["001", "002", "003", "004"],
                          "Date": ["2026-10-01", "02/10/2026", "", "invalid"],
                          "Group": ["A", "A", "B", "A"]})
    store = LegalStore({"beneficiaries": frame}, "synthetic", [])
    first = store.explorer("beneficiaries", filters={"Group": ["A"]}, sort_column="Date")
    assert [row["Case ID"] for row in first["rows"]] == ["001", "002", "004"]
    prepared = store.explorer_preparation("beneficiaries")
    with patch("backend.explorer_preparation.pd.to_datetime", side_effect=AssertionError("date sort reparsed")):
        assert store.explorer("beneficiaries", filters={"Group": ["A"]}, sort_column="Date") == first
    store.set_review_exclusions([("Possible duplicate name", "001")])
    assert store.explorer_preparation("beneficiaries") is not prepared
    assert frame["Date"].tolist() == ["2026-10-01", "02/10/2026", "", "invalid"]


def test_detention_download_is_one_query_and_preserves_workbook(monkeypatch):
    from backend import main
    class Store:
        calls = []
        def detention_cases(self, *args):
            self.calls.append(args)
            return {"total": 2, "columns": ["Date", "Name"], "rows": [
                {"Date": "2026-10-01", "Name": "=BAD", "caseId": "001"},
                {"Date": "2026-10-02", "Name": "Synthetic", "caseId": "002"}]}
    store = Store()
    monkeypatch.setattr(main, "legal_store", store)
    response = main.legal_detention_export(main.LegalQuery(search="x", filters={"Project": ["P"]}, sortColumn="Date", sortDirection="desc"))
    expected = main.table_workbook(main.TableWorkbookRequest(filename="detention-cases.xlsx", columns=["Date", "Name", "Case ID"], rows=[
        {"Date": "2026-10-01", "Name": "=BAD", "Case ID": "001"},
        {"Date": "2026-10-02", "Name": "Synthetic", "Case ID": "002"}]))
    from scripts.benchmark_excel_performance import assert_workbooks_equal
    assert_workbooks_equal(expected.body, response.body)
    assert len(store.calls) == 1
    sheet = load_workbook(BytesIO(response.body)).active
    assert sheet["C2"].value == "001"
    assert sheet["B2"].data_type != "f"
    assert "detention-cases.xlsx" in response.headers["content-disposition"]


def test_monthly_rejects_invalid_dates_even_with_no_months():
    with pytest.raises(ValueError, match="From date is invalid"):
        build_monthly_reports(synthetic_frames(12), from_date="invalid")


def test_monthly_revision_change_does_not_publish_old_cache(monkeypatch):
    from backend import main
    store = LegalStore(synthetic_frames(24), "synthetic", [])
    monkeypatch.setattr(main, "legal_store", store)
    def calculate(*args, **kwargs):
        store.set_review_exclusions([("Possible duplicate name", "B1")])
        return {"months": ["2026-01"], "reports": [{"month": "2026-01", "report": {}}]}
    with patch("backend.indicator_reporting.build_monthly_reports", side_effect=calculate):
        main.legal_indicators_monthly(main.IndicatorReportRequest(months=["2026-01"]))
    assert store._indicator_cache == {}
    assert store._indicator_prepared is None


def test_detention_download_retains_limits_and_sort_errors(monkeypatch):
    from backend import main
    from fastapi import HTTPException
    class Store:
        def detention_cases(self, *args):
            return {"total": 10001, "columns": [], "rows": []}
    monkeypatch.setattr(main, "legal_store", Store())
    with pytest.raises(HTTPException) as limit:
        main.legal_detention_export(main.LegalQuery())
    assert limit.value.status_code == 400
    assert limit.value.detail == "Excel export is limited to 10,000 selected rows."
    with pytest.raises(HTTPException) as direction:
        main.legal_detention_export(main.LegalQuery(sortDirection="invalid"))
    assert direction.value.status_code == 400
    assert direction.value.detail == "Invalid sort direction"
