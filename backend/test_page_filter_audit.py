"""Exercise every exposed categorical/date filter through the page query paths."""
from io import BytesIO

import pandas as pd
import pytest

from backend.filter_selection import EXCLUDE_PREFIX
from backend.hotline import dashboard as hotline_dashboard
from backend.legal_platform import LegalStore, filter_rows


@pytest.fixture(scope="module")
def store():
    common = {"Project": ["UNHCR 2026 - AMAL CAMP", "UNHCR 2026 - Gov", "UNHCR 2026 - SULI"],
              "Project Location": ["AMAL Camp", "Anbar أنبار", "Sulaymaniyah Urban"],
              "Lawyers": ["One", "Two", "Three"], "Original Created By": ["A", "B", "C"],
              "Nationality": ["Syrian", "Iraqi", "Other"], "Community Type": ["IDP", "Syrian Refugee", "Non-Syrian Refugee"],
              "Gender": ["Female", "Male", "Female"], "UNHCR Age Group": ["18-39"] * 3}
    ids = {"beneficiaries": "Case ID", "assessments": "Assessment ID", "legalservices": "Service ID",
           "followupslogbooks": "Follow-up ID", "legalfees": "Fee ID", "awareness": "Awareness ID",
           "deportationrecords": "PN ID", "legalhotlines": "Hotline ID"}
    dates = {"beneficiaries": "Date of Identification", "assessments": "Date of Assessment", "legalservices": "Date of Service Provision",
             "followupslogbooks": "Date of follow-up", "legalfees": "Date Paid", "awareness": "Date of Session",
             "deportationrecords": "Date of deporting", "legalhotlines": "Contact Date"}
    payload = {}
    for dataset, identifier in ids.items():
        fields = {**common, identifier: ["1", "2", "3"], dates[dataset]: ["01/01/2026", "02/04/2026", "03/07/2026"]}
        if dataset == "beneficiaries": fields["Name (Filter Color Red)"] = ["Person One", "Person Two", "Person Three"]
        if dataset in {"assessments", "legalservices"}: fields["Beneficiary ID"] = ["1", "2", "3"]
        if dataset == "assessments":
            fields.update({"Is the beneficiary detained": ["Yes"] * 3, "Detainee current status": ["Detained"] * 3,
                           "Detention Governorate": ["Baghdad", "Erbil", "Basra"], "Date of Detention": fields[dates[dataset]],
                           "Assessment Status": ["Open", "Closed", "Open"]})
        if dataset == "legalservices":
            fields.update({"Assessment ID": ["1", "2", "3"], "Service Status": ["Completed", "In-Process", "Completed"],
                           "Type of Service Provided": ["Legal Representation", "Legal Assistance", "Legal Counselling"]})
        if dataset == "awareness": fields["Participant Name"] = ["Person One", "Person Two", "Person Three"]
        if dataset in {"followupslogbooks", "legalfees"}: fields["Service ID"] = ["1", "2", "3"]
        if dataset == "legalhotlines": fields.update({"Priority": ["High", "Low", "Medium"], "Is the beneficiary detained": ["Yes", "No", "Yes"]})
        payload[dataset] = pd.DataFrame(fields).to_csv(index=False).encode("utf-8-sig")
    return LegalStore.from_files(payload, "filter audit")


@pytest.mark.parametrize("dataset", ["beneficiaries", "assessments", "legalservices", "followupslogbooks", "legalfees", "awareness", "deportationrecords"])
def test_each_explorer_filter_select_all_only_and_exclude_agree_with_export_and_studio(store, dataset):
    source = store.frames[dataset]
    for option in store.explorer_filters(dataset)["columns"]:
        field, values = option["name"], option["values"]
        if not values: continue
        for selection in (values, [values[0]], [EXCLUDE_PREFIX + values[0]]):
            expected = filter_rows(source, field, selection)
            filters = {field: selection}
            assert store.explorer(dataset, filters=filters)["total"] == len(expected), (dataset, field, selection)
            assert store.studio(dataset, "Project", filters=filters)["total"] == len(expected), (dataset, field, selection)
            exported = pd.read_csv(BytesIO(store.explorer_export(dataset, filters=filters, export_format="csv")))
            assert len(exported) == len(expected), (dataset, field, selection)


@pytest.mark.parametrize("dataset", ["beneficiaries", "assessments", "legalservices", "awareness"])
def test_each_analytics_filter_keeps_all_rows_on_select_all(store, dataset):
    baseline = store.analytics_dashboard(dataset)
    for field, values in baseline["filterOptions"].items():
        if values:
            assert store.analytics_dashboard(dataset, filters={field: values})["matchedRows"] == baseline["matchedRows"], (dataset, field)


def test_each_deportation_detention_and_hotline_filter_keeps_all_rows(store):
    for load, count in ((store.deportation_dashboard, "total"), (store.detention_cases, "total"),
                        (lambda filters=None: hotline_dashboard(store.frames["legalhotlines"], filters), "total")):
        baseline = load()
        for field, values in baseline["filterOptions"].items():
            if values:
                assert load(filters={field: values})[count] == baseline[count], field


def test_each_lawyer_overview_filter_keeps_all_counts(store):
    baseline = store.lawyer_summary()
    for field, values in baseline["filterOptions"].items():
        if values:
            filtered = store.lawyer_summary({field: values})
            assert filtered["rows"] == baseline["rows"], field
            assert store.intelligence("lawyer-intelligence", {field: values})["kpis"] == store.intelligence("lawyer-intelligence")["kpis"], field


def test_source_whitespace_does_not_drop_records_on_select_all():
    source = pd.DataFrame({"Project": ["Baghdad ", " Erbil", "Basra"]})
    assert len(filter_rows(source, "Project", ["Baghdad", "Erbil", "Basra"])) == 3


def test_each_case_search_filter_keeps_all_cases_on_select_all(store):
    for group in store.case_filters()["groups"]:
        for option in group["columns"]:
            result = store.case("", {option["key"]: option["values"]})
            assert result["totalCases"] == 3, option["key"]


def test_each_legacy_analytics_filter_select_all_and_exclusion():
    import polars as pl
    from backend.analytics import DataStore, FILTERS
    frames = {page: pl.DataFrame({"id": ["1", "2", "3"], **{field: ["One", "Two", "Three"] for field in fields}})
              for page, fields in FILTERS.items()}
    legacy = DataStore("filter audit", frames, {page: {} for page in frames}, [], "")
    metadata = legacy.metadata()
    for page, fields in FILTERS.items():
        for field in fields:
            values = metadata["pages"][page]["filters"][field]
            assert legacy._filtered(page, {field: values}, False).height == 3, (page, field)
            assert legacy._filtered(page, {field: [values[0]]}, False).height == 1, (page, field)
            assert legacy._filtered(page, {field: [EXCLUDE_PREFIX + values[0]]}, False).height == 2, (page, field)
    legacy.options["assessment"]["legal_need"] = pl.DataFrame({"id": ["1", "1", "2", "3"], "legal_need": ["A", "B", "B", "C"]})
    assert legacy._filtered("assessment", {"legal_need": ["A", "B", "C"]}, False).height == 3
    assert legacy._filtered("assessment", {"legal_need": [EXCLUDE_PREFIX + "B"]}, False).get_column("id").to_list() == ["3"]
