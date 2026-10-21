"""Complete report compatibility checks, including narratives and drill-down IDs."""
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
import pytest

from backend.indicator_reporting import PreparedIndicatorData, build_indicator_report
from backend.legal_platform import LegalStore
from scripts.benchmark_indicator_performance import digest, filter_scenarios, synthetic_frames


# Generated from the pre-optimization implementation with synthetic_frames(120).
# Rebased for the approved awareness session-ID/participant-name correction.
# Audited all 12 payloads against the preceding implementation: only awareness
# source descriptors changed; counts, ordering and narratives remain identical.
# Full payload hashes protect warnings, row order, deduplication, IDs and narratives.
LEGACY_DIGESTS = [
    "8db02b90c3209e341bb0aeb5cb1a9cd82cd6274c66287cd937808339c0895d11",
    "789a501b45ba489ca5e3d60ff77ad2d7035c320e7561d055ef571f01d46fee2f",
    "f607477db9990d9c4aa876c2823304327575d967404632c69dba893bb8fdc355",
    "e8d1b3dde4de4d83d7c4775fa87ca2fa9c14e49aa4754101e599b9879974b061",
    "cae8741ec6194df699d39700b727f75a0bea666c47d5e08e2593f4b22c11bb2e",
    "562602c6e51287e56a91e6f63a929c1d1147b919eb8a0b01724cb3d608b640a1",
    "182b1b73dd4f944c60487a72ba42baede96e6b1e6f57a549e41c039493f517e6",
    "0351435b13450439727a9261ca1f3ecf8b9e5d5d223cb491e498cb12adf08cc4",
    "16f7d8eab591b57f8161d73764e2b1c2dd8a0dcd71d698cbe1a1ec47ea086c11",
    "9df5a8a6a36b2aa67d1a7f3191006ab4455e0f753fec2158f3733ddccda9ff14",
    "58713afac937061a375e5984b8c7e3a1b90244ad68aa78a8a95e323d9b869dc1",
    "7e293cacdce150a30772d28fc485fe0165d6714210af3be0d1a481af0daf45bf",
]


def legacy_report_digest(frames,prepared,filters):
    # Option lists intentionally changed to facets. Project only that metadata
    # back to the old shape so the original hashes still verify every number,
    # narrative, drill-down ID, and active selection without updating snapshots.
    from backend.indicator_reporting import REPORT_ROWS
    report=build_indicator_report(frames,prepared=prepared,**filters)
    pairs=[pair for pair in REPORT_ROWS if pair in prepared.available_pairs]
    projects=list(dict.fromkeys(project for project,_ in pairs))
    months,quarters,years=set(),set(),set()
    hints={"assessments":(("Date of Assessment",),("Date of the released or deported",)),"legalservices":(("Date of Service Provision",),("Date Service Completed",)),"deportationrecords":(("Date of Deportation Knowledge","Date of deporting"),),"awareness":(("Date of Session",),)}
    for name,fields in hints.items():
        if name not in frames:continue
        frame=frames[name]
        for wanted in fields:
            column=prepared.find(list(frame.columns),*wanted)
            if column:
                m,q,y=prepared.reporting_dates(frame,column,filters.get("community_types",[]))
                months.update(m);quarters.update(q);years.update(y)
    report={**report,"filterOptions":{"projects":projects,"locations":list(dict.fromkeys(location for _,location in pairs)),"locationsByProject":{project:[location for row_project,location in pairs if row_project==project] for project in projects},"years":sorted(years,reverse=True),"quarters":sorted(quarters,reverse=True),"months":sorted(months,reverse=True),"communityTypes":prepared.community_options}}
    return digest(report)


@pytest.fixture(scope="module")
def source():
    frames = synthetic_frames()
    return frames, PreparedIndicatorData(frames)


@pytest.mark.parametrize("filters,expected", list(zip(filter_scenarios(), LEGACY_DIGESTS)))
def test_complete_reports_match_legacy_multi_filter_results(source, filters, expected):
    frames, prepared = source
    assert legacy_report_digest(frames,prepared,filters) == expected


def test_prepared_indexes_are_reused_without_reparsing(source, monkeypatch):
    frames, prepared = source
    for filters in filter_scenarios():
        build_indicator_report(frames, prepared=prepared, **filters)
    dates, eligibility = dict(prepared.dates), dict(prepared.eligibility)
    def unexpected_parse(*args, **kwargs):
        raise AssertionError("Previously prepared dates must not be parsed again")
    monkeypatch.setattr(pd, "to_datetime", unexpected_parse)
    build_indicator_report(frames, prepared=prepared, months=["2026-01", "2026-07"], quarters=["2026-Q1", "2026-Q3"])
    assert all(prepared.dates[key] is value for key, value in dates.items())
    assert all(prepared.eligibility[key] is value for key, value in eligibility.items())


def test_concurrent_filters_do_not_change_prepared_data(source):
    frames, prepared = source
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda filters: legacy_report_digest(frames,prepared,filters), filter_scenarios()))
    assert results == LEGACY_DIGESTS


def test_store_rebuilds_preparation_on_revision_and_source_replacement():
    store = LegalStore(synthetic_frames(), "synthetic", [])
    revision, prepared = store.indicator_preparation()
    assert store.indicator_preparation() == (revision, prepared)
    store._indicator_cache[()] = {"old": True}
    store.set_review_exclusions([("Possible duplicate name", "B1")])
    next_revision, next_prepared = store.indicator_preparation()
    assert revision != next_revision
    assert prepared is not next_prepared
    assert not store._indicator_cache
    replacement = LegalStore(synthetic_frames(24), "replacement", [])
    assert replacement.indicator_preparation()[1] is not next_prepared


def test_mixed_date_formats_and_duplicate_ids_across_months():
    frames = synthetic_frames(4)
    frame = frames["assessments"]
    frame["Date of Assessment"] = ["15/01/2026", "2026-02-15", "invalid", ""]
    frame["Assessment ID"] = "shared-id"
    frame["Type of Legal Service Needed"] = "Legal Representation"
    frame["UNHCR Age Group"] = "(18-39)"
    prepared = PreparedIndicatorData(frames)
    report = build_indicator_report(frames, months=["2026-01", "2026-02"], prepared=prepared)
    reached = next(item for group in report["groups"] for item in group["indicators"] if item["id"] == "individuals-reached")
    assert reached["total"] == 1
    dates = prepared.date_index(frame, "Date of Assessment")[0]
    assert dates.iloc[1] == pd.Timestamp("2026-02-15")
    assert dates.iloc[2:].isna().all()


def test_endpoint_reuses_equivalent_filters_and_does_not_cache_an_old_revision(monkeypatch):
    monkeypatch.setenv("INTERSOS_DEFER_LEGAL_LOAD", "1")
    from backend import main
    store = LegalStore(synthetic_frames(24), "synthetic", [])
    monkeypatch.setattr(main, "require_legal_store", lambda: store)
    first = main.legal_indicators(main.IndicatorReportRequest(months=["2026-01", "2026-02"]))
    repeated = main.legal_indicators(main.IndicatorReportRequest(months=["2026-02", "2026-01", "2026-01"]))
    assert first is repeated
    original_build = main.build_indicator_report
    def change_revision_during_build(*args, **kwargs):
        result = original_build(*args, **kwargs)
        store.set_review_exclusions([("Possible duplicate name", "B1")])
        return result
    monkeypatch.setattr(main, "build_indicator_report", change_revision_during_build)
    main.legal_indicators(main.IndicatorReportRequest(months=["2026-03", "2026-04"]))
    assert not store._indicator_cache
