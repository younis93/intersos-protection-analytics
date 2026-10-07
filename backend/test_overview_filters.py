import copy

import pytest

from backend.filter_selection import EXCLUDE_PREFIX
from backend.legal_platform import LegalStore
from backend.test_legal_platform import csv


@pytest.fixture
def overview_store():
    return LegalStore.from_files({
        "beneficiaries": csv(**{"Case ID": ["B1", "B2"], "Name (Filter Color Red)": ["One", "Two"], "Project": ["P1", "P2"], "Project Location": ["L1", "L2"], "Nationality": ["Iraq", "Syria"], "Date of Identification": ["10/01/2026", "10/02/2026"]}),
        "assessments": csv(**{"Assessment ID": ["A1", "A2"], "Beneficiary ID": ["B1", "B2"], "Project": ["P1", "P2"], "Project Location": ["L1", "L2"], "Date of Assessment": ["10/01/2026", "10/02/2026"], "Is the beneficiary detained": ["Yes", "Yes"], "Detainee current status": ["Released", "Detained"], "Date of the released or deported": ["10/02/2026", ""], "Detention Governorate": ["Baghdad", "Erbil"]}),
        "legalservices": csv(**{"Service ID": ["S1", "S2"], "Assessment ID": ["A1", "A2"], "Beneficiary ID": ["B1", "B2"], "Project": ["P1", "P2"], "Project Location": ["L1", "L2"], "Date of Service Provision": ["12/02/2026", "12/03/2026"], "Type of Service Provided": ["Legal Representation", "Legal Representation"], "Service Status": ["Completed", "Open"]}),
        "followupslogbooks": csv(**{"Follow-ups & Logbook ID": ["F1"], "Service ID": ["S1"], "Project": ["P1"], "Project Location": ["L1"], "Date of follow-up": ["14/03/2026"]}),
        "legalfees": csv(**{"Fee ID": ["X1"], "Legal Service ID": ["S1"], "Paid date": ["15/04/2026"]}),
        "awareness": csv(**{"Awareness ID": ["W1"], "Project": ["P1"], "Project Location": ["L1"], "Date of Session": ["15/02/2026"]}),
        "deportationrecords": csv(**{"PN ID": ["D1"], "Project": ["P2"], "Project Location": ["L2"], "Date of deporting": ["15/03/2026"]}),
    }, "overview test")


def test_unfiltered_parity_and_source_immutability(overview_store):
    metadata = copy.deepcopy(overview_store.metadata())
    originals = {name: frame.copy(deep=True) for name, frame in overview_store.frames.items()}
    assert overview_store.overview()["overview"] == metadata["overview"]
    overview_store.overview(["P1"], ["L1"], ["2026-02"], {"beneficiaries::Nationality": ["Iraq"]})
    assert overview_store.metadata() == metadata
    for name, frame in originals.items():
        assert overview_store.frames[name].equals(frame)


def test_quick_filters_combine_and_exclude(overview_store):
    result = overview_store.overview(["P1", "P2"], ["L1"])["overview"]
    assert (result["beneficiaries"], result["assessments"], result["services"], result["fees"]) == (1, 1, 1, 1)
    excluded = overview_store.overview([EXCLUDE_PREFIX + "P1"])["overview"]
    assert (excluded["beneficiaries"], excluded["services"], excluded["fees"]) == (1, 1, 0)


def test_each_activity_uses_its_reporting_month(overview_store):
    february = overview_store.overview(months=["2026-02"])["overview"]
    assert (february["beneficiaries"], february["assessments"], february["services"], february["awareness"]) == (1, 1, 1, 1)
    assert february["followups"] == february["fees"] == 0
    assert overview_store.overview(months=["2026-03"])["overview"]["followups"] == 1
    assert overview_store.overview(months=["2026-04"])["overview"]["fees"] == 1


def test_release_month_does_not_require_assessment_in_same_month(overview_store):
    result = overview_store.overview(projects=["P1"], months=["2026-02"])["overview"]
    assert result["assessments"] == 0
    assert result["detention2026"]["trend"] == [{"month": "2026-02", "detainedAssessments": 0, "released": 1}]
    assert result["detention2026"]["map"][0]["released"] == 1
    assert result["locationPerformance"][0]["released"] == 1


def test_release_only_month_remains_selectable(overview_store):
    overview_store.frames["assessments"].loc[0, "Date of the released or deported"] = "2026-06-10"
    assert "2026-06" in overview_store.overview(projects=["P1"])["filterOptions"]["months"]
    result = overview_store.overview(months=["2026-06"])
    assert result["filterOptions"]["locations"] == ["L1"]
    assert result["overview"]["detention2026"]["trend"][0]["released"] == 1


@pytest.mark.parametrize("field,value", [("beneficiaries::Nationality", "Iraq"), ("assessments::Assessment ID", "A1"), ("legalservices::Service ID", "S1"), ("followupslogbooks::Follow-ups & Logbook ID", "F1"), ("legalfees::Fee ID", "X1")])
def test_advanced_filters_select_connected_cases(overview_store, field, value):
    result = overview_store.overview(filters={field: [value]})
    assert result["overview"]["beneficiaries"] == result["overview"]["services"] == 1
    assert result["overview"]["fees"] == 1
    assert result["overview"]["awareness"] is None
    assert result["overview"]["deportations"] is None
    assert set(result["unavailable"]) == {"awareness", "deportationrecords"}


def test_linked_options_keep_own_dimension_and_full_case_filter_list(overview_store):
    base = overview_store.case_filters()["groups"]
    result = overview_store.overview(projects=["P1"])["filterOptions"]
    assert result["projects"] == ["P1", "P2"]
    assert result["locations"] == ["L1"]
    assert [option["key"] for group in result["groups"] for option in group["columns"]] == [option["key"] for group in base for option in group["columns"]]
    assert overview_store.overview(filters={"beneficiaries::Nationality": ["Iraq"]})["filterOptions"]["projects"] == ["P1"]
    february = overview_store.overview(projects=["P1"], months=["2026-02"])["filterOptions"]
    options = {option["key"]: option["values"] for group in february["groups"] for option in group["columns"]}
    # January assessments remain selectable through their February service/release.
    assert options["assessments::Assessment ID"] == ["A1"]


def test_no_matches_and_missing_dates(overview_store):
    result = overview_store.overview(projects=["missing"])["overview"]
    assert result["beneficiaries"] == result["assessments"] == result["services"] == 0
    assert result["locationPerformance"] == []
    overview_store.frames["legalservices"]["Date of Service Provision"] = "invalid"
    assert overview_store.overview(months=["2026-02"])["overview"]["services"] == 0


def test_api_response(overview_store, monkeypatch):
    from backend import main
    from fastapi.testclient import TestClient
    monkeypatch.setattr(main, "legal_store", overview_store)
    response = TestClient(main.app).post("/api/legal/overview", json={"projects": ["P1"], "months": ["2026-02"]})
    assert response.status_code == 200
    assert response.json()["overview"]["services"] == 1
    assert TestClient(main.app).post("/api/legal/overview", json={"months": "bad"}).status_code == 422
