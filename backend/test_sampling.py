import io

import pandas as pd
import pytest
from openpyxl import load_workbook

from .sampling import LEADING, export, pipeline, table


def record(identifier="1", phone="7712345678", gender="Male ذكر", completed="01/10/2026", **changes):
    row = {names[0]: "" for _, *names in LEADING}
    row.update({"Service ID": identifier, "Beneficiary ID": identifier, "Contact Number": phone,
                "Gender": gender, "Date Service Completed": completed, "Service Status": "Completed اکتملت",
                "Type of Service Provided": "Legal Representation - تمثيل", "Projects": "P1", "Project Location": "L1"})
    row.update(changes)
    return row


def ids(result):
    return [row["Service ID"] for row in result["rows"]]


@pytest.mark.parametrize("phone,valid", [
    ("7712345678", True), ("7812345678", True), ("7512345678", True), ("٧٧١٢٣٤٥٦٧٨", True),
    ("۷۸۱۲۳۴۵۶۷۸", True), ("77 123-45(678)", True), ("\u200e7712345678", True),
    ("07712345678", True), ("07812345678", True), ("07512345678", True),
    ("٠٧٧ ١٢٣-٤٥(٦٧٨)", True), ("۰۷۸۱۲۳۴۵۶۷۸", True),
    ("", False), (None, False), ("77123456", False), ("771234567", False), ("77123456789", False),
    ("0771234567", False), ("007712345678", False), ("+9647712345678", False),
    ("7412345678", False), ("7912345678", False), ("07412345678", False), ("07912345678", False),
])
def test_exact_primary_phone(phone, valid):
    source = pd.DataFrame([record(phone=phone, **{"Secondary Contact Number": "7712345678"})])
    result = table(source)
    assert result["total"] == int(valid)
    if valid:
        assert result["rows"][0]["Contact Number"] == phone


@pytest.mark.parametrize("status,service,valid", [
    ("Completed اکتملت", "Legal Representation - تمثيل", True),
    ("Completed", "Legal Representation", True), ("اكتملت", "تمثيل", True),
    ("Uncompleted لم تكتمل", "Legal Representation", False),
    ("In-Process قيد المعالجة", "Legal Representation", False),
    ("Completed", "Legal Assistance - مساعدة", False),
    ("Completed", "Legal Counselling - استشارة", False), ("", "Legal Representation", False),
])
def test_service_eligibility(status, service, valid):
    assert table(pd.DataFrame([record(**{"Service Status": status, "Type of Service Provided": service})]))["total"] == int(valid)


def conflicts():
    return pd.DataFrame([
        record("old", "7711111118", completed="01/01/2026", **{"Beneficiary ID": "A"}),
        record("latest", "7822222228", completed="03/01/2026", **{"Beneficiary ID": "A"}),
        record("phone-conflict", "7822222228", completed="02/01/2026", **{"Beneficiary ID": "B"}),
        record("retained-after-skip", "7533333338", completed="01/01/2026", **{"Beneficiary ID": "B"}),
        record("empty-one", "7544444448", completed="invalid", **{"Beneficiary ID": ""}),
        record("empty-two", "7555555558", completed="", **{"Beneficiary ID": None}),
        record("tie", "7566666668", completed="03/01/2026", **{"Beneficiary ID": "A"}),
    ])


def test_duplicate_flags_independent_and_reversible():
    source = conflicts()
    original = source.copy(deep=True)
    assert ids(table(source, removeDuplicateBeneficiaryIds=True)) == ["latest", "phone-conflict", "empty-one", "empty-two"]
    assert ids(table(source, removeDuplicateContacts=True)) == ["latest", "tie", "old", "retained-after-skip", "empty-one", "empty-two"]
    assert ids(table(source, removeDuplicateBeneficiaryIds=True, removeDuplicateContacts=True)) == ["latest", "retained-after-skip", "empty-one", "empty-two"]
    assert table(source)["total"] == 7
    pd.testing.assert_frame_equal(source, original)


def test_normalized_contact_duplicates_keep_source_values():
    source = pd.DataFrame([record("older", phone="٧٧١٢٣٤٥٦٧٨", completed="01/01/2026"),
                           record("newer", phone="077 123-45(678)", completed="02/01/2026")])
    assert ids(table(source)) == ["newer", "older"]
    result = table(source, removeDuplicateContacts=True)
    assert ids(result) == ["newer"]
    assert result["rows"][0]["Contact Number"] == "077 123-45(678)"
    sheet = load_workbook(io.BytesIO(export(source, removeDuplicateContacts=True))).active
    assert sheet.cell(2, result["columns"].index("Contact Number") + 1).value == "077 123-45(678)"


def test_sampling_accepts_phone_normalized_by_beneficiaries_import():
    from .legal_platform import LegalStore

    services = pd.DataFrame([record("S1", phone="", **{"Assessment ID": "A1", "Beneficiary ID": "B1"})])
    payload = {
        "beneficiaries": b"Case ID,Name (Filter Color Red),Contact Number\nB1,Test Name,7512345678\n",
        "assessments": b"Assessment ID,Beneficiary ID\nA1,B1\n",
        "legalservices": services.to_csv(index=False).encode(),
    }
    store = LegalStore.from_files(payload, "sampling import fixture", use_cache=False)
    result = table(store.frames["legalservices"])
    assert ids(result) == ["S1"]
    assert result["rows"][0]["Contact Number"] == "07512345678"


def test_search_and_filters_before_dedup_month_and_self_excluding_facets():
    source = conflicts()
    source.loc[0, "Projects"] = "P2"
    assert ids(table(source, filters={"Projects": ["P2"]}, removeDuplicateBeneficiaryIds=True)) == ["old"]
    assert ids(table(source, search="old", removeDuplicateBeneficiaryIds=True)) == ["old"]
    result = table(source, filters={"Projects": ["P2"], "Date Service Completed": ["2026-01"]})
    assert ids(result) == ["old"]
    assert result["filterOptions"]["Projects"] == ["P1", "P2"]
    assert table(source, filters={"Projects": ["unavailable"]})["total"] == 0
    assert table(source, search="no results")["total"] == 0


def test_global_gender_order_pagination_and_export_parity():
    source = pd.DataFrame([record(str(index), gender="Male" if index % 2 else "Female", completed=f"{index % 28 + 1:02}/01/2026") for index in range(205)])
    source.loc[0, "Gender"] = "Other"
    source.loc[1, "Gender"] = ""
    source.loc[2, "Name"] = "=HYPERLINK(\"test\")"
    source.loc[3, "Name"] = "اسم عربي"
    whole = table(source, pageSize=10000)
    assert [row["Gender"] for row in whole["rows"][:200]] == ["Male", "Female"] * 100
    assert [row["Gender"] for row in whole["rows"][-2:]] == ["", "Other"]
    pages = [table(source, page=page) for page in (1, 2, 3)]
    assert sum((ids(page) for page in pages), []) == ids(whole)
    assert table(source, page=999)["page"] == 3
    workbook = load_workbook(io.BytesIO(export(source)))
    sheet = workbook.active
    headers = [cell.value for cell in sheet[1]]
    assert headers == whole["columns"]
    assert headers[:12] == [names[0] for _, *names in LEADING]
    service = headers.index("Service ID")
    assert [str(row[service]) for row in sheet.iter_rows(min_row=2, values_only=True)] == ids(whole)
    assert not any(cell.data_type == "f" for row in sheet for cell in row)
    assert sheet.freeze_panes == "A2"


def test_unequal_genders_and_invalid_dates_last_with_stable_ties():
    source = pd.DataFrame([record("m1", completed="invalid"), record("f1", gender="Female"),
                           record("m2"), record("m3"), record("other", gender="Other"),
                           record("arabic", gender="أنثى", completed="02/10/2026")])
    assert ids(table(source)) == ["m2", "arabic", "m3", "f1", "m1", "other"]


def test_iso_and_local_dates_share_correct_months_and_priority():
    source = pd.DataFrame([record("iso", completed="2026-10-12", **{"Beneficiary ID": "same"}),
                           record("local", completed="11/10/2026", **{"Beneficiary ID": "same"}),
                           record("new", completed="2026-11-01", **{"Beneficiary ID": "same"})])
    assert ids(table(source, removeDuplicateBeneficiaryIds=True)) == ["new"]
    result = table(source, filters={"Date Service Completed": ["2026-10"]}, removeDuplicateBeneficiaryIds=True)
    assert ids(result) == ["iso"]
    assert result["filterOptions"]["Date Service Completed"] == ["2026-10", "2026-11"]


def test_bilingual_columns_preserved_and_lookalikes_not_selected():
    source = pd.DataFrame([record()]).rename(columns={
        "Projects": "Projects - المشروع", "Name": "Name / الأسم", "Contact Number": "Contact Number / رقم الاتصال",
        "Type of Document": "Type of Document نوع الوثيقة", "Gender": "Gender النوع الاجتماعي"})
    source.insert(0, "Nationality Stateless", "No")
    source.insert(0, "Age Gender Group", "Adult")
    result = table(source)
    assert result["columns"][:4] == ["Projects - المشروع", "Project Location", "Name / الأسم", "Gender النوع الاجتماعي"]
    assert len(result["columns"]) == len(set(result["columns"])) == len(source.columns)
    secondary_only = source.drop(columns=["Contact Number / رقم الاتصال"])
    assert not table(secondary_only)["available"]
    assert "primary Contact Number" in table(secondary_only)["reason"]


def test_partial_import_unavailable_and_empty_eligible_frame():
    assert not table(None)["available"]
    assert not table(pd.DataFrame({"Service ID": ["1"]}))["available"]
    with pytest.raises(ValueError, match="not been imported"):
        export(None)
    result = table(pd.DataFrame([record(phone="")]))
    assert result["available"] and result["total"] == 0 and result["columns"]
    assert "All 1 completed Legal Representation records have a blank primary contact number" in result["emptyReason"]
    assert "11 digits starting with 075, 077, or 078" in result["emptyReason"]
    assert load_workbook(io.BytesIO(export(pd.DataFrame([record(phone="")])))).active.max_row == 1


def test_excel_duplicate_pipeline_matches_table():
    source = conflicts()
    query = dict(removeDuplicateBeneficiaryIds=True, removeDuplicateContacts=True, filters={"Projects": ["P1"]})
    result = table(source, **query)
    sheet = load_workbook(io.BytesIO(export(source, **query))).active
    service = result["columns"].index("Service ID")
    assert [row[service] for row in sheet.iter_rows(min_row=2, values_only=True)] == ids(result)


def test_read_only_endpoints_and_validation(monkeypatch):
    from types import SimpleNamespace
    from fastapi.testclient import TestClient
    monkeypatch.setenv("INTERSOS_DEFER_LEGAL_LOAD", "1")
    from . import main
    source = conflicts()
    original = source.copy(deep=True)
    monkeypatch.setattr(main, "require_legal_store", lambda: SimpleNamespace(frames={"legalservices": source}))
    with TestClient(main.app) as client:
        result = client.post("/api/legal/sampling", json={"removeDuplicateContacts": True})
        assert result.status_code == 200
        assert result.json()["total"] == 6
        assert client.post("/api/legal/sampling", json={"page": 0}).status_code == 400
        assert client.post("/api/legal/sampling", json={"pageSize": 10001}).status_code == 400
        download = client.post("/api/legal/sampling/export", json={"removeDuplicateContacts": True})
        assert download.status_code == 200
        assert "sampling.xlsx" in download.headers["content-disposition"]
        assert load_workbook(io.BytesIO(download.content)).active.max_row == 7
    pd.testing.assert_frame_equal(source, original)


def test_hotline_match_availability():
    source = pd.DataFrame([record(**{"Name": "Caller"})])
    missing_hotline = table(source)
    assert missing_hotline["total"] == 1
    assert "Import Hotline" in missing_hotline["hotlineMatchReason"]
    assert table(source, hotlineOnly=True)["total"] == 0
    missing_caller = table(source, hotline=pd.DataFrame({"Created By": ["Operator"]}))
    assert "Name of the caller" in missing_caller["hotlineMatchReason"]
    hotline = pd.DataFrame({"Name of the caller": ["Caller"]})
    missing_service_name = table(source.drop(columns="Name"), hotline=hotline)
    assert "Legal Services is missing the Name" in missing_service_name["hotlineMatchReason"]
    missing_creator = table(source, hotline=hotline, hotlineOnly=True)
    assert missing_creator["total"] == 1
    assert not missing_creator["hotlineMatchReason"]
    assert "Created By" in missing_creator["hotlineOperatorReason"]


def test_hotline_name_matches_operator_before_deduplication_and_across_endpoints(monkeypatch):
    from types import SimpleNamespace
    from fastapi.testclient import TestClient
    monkeypatch.setenv("INTERSOS_DEFER_LEGAL_LOAD", "1")
    from . import main

    source = pd.DataFrame([
        record("older-match", phone="07712345678", **{"Name": "أَحمد علي", "Beneficiary ID": "B1"}),
        record("newer-other", completed="02/10/2026", **{"Name": "Different Caller", "Beneficiary ID": "B1"}),
        record("detained-only", **{"Name": "Detained Person"}),
        record("word-boundary", **{"Name": "DifferentCaller"}),
        record("blank", **{"Name": "  "}),
        record("invalid-phone", phone="", **{"Name": "أَحمد علي"}),
    ])
    hotline = pd.DataFrame({
        "Name of the caller / اسم المتصل": ["احمد   علی", "احمد علي", " DIFFERENT CALLER ", "", None],
        "Name of the detained person": ["Detained Person"] * 5,
        "Created By": [" Operator A ", "Operator A", "Operator B", "", None],
    })
    frames = {"legalservices": source, "legalhotlines": hotline}
    monkeypatch.setattr(main, "require_legal_store", lambda: SimpleNamespace(frames=frames))
    with TestClient(main.app) as client:
        default = client.post("/api/legal/sampling", json={}).json()
        assert default["total"] == 5
        assert default["hotlineOperators"] == ["Operator A", "Operator B"]
        all_matches = client.post("/api/legal/sampling", json={"hotlineOnly": True}).json()
        assert ids(all_matches) == ["newer-other", "older-match"]

        query = {"hotlineOperator": "Operator A", "removeDuplicateBeneficiaryIds": True}
        response = client.post("/api/legal/sampling", json=query)
        assert response.status_code == 200
        result = response.json()
        assert ids(result) == ["older-match"]

        values = client.post("/api/legal/record-values", json={**query, "source": "sampling", "column": "Service ID"})
        assert values.status_code == 200
        assert values.json()["values"] == ids(result)
        download = client.post("/api/legal/sampling/export", json=query)
        assert download.status_code == 200
        sheet = load_workbook(io.BytesIO(download.content)).active
        service = result["columns"].index("Service ID")
        assert [row[service] for row in sheet.iter_rows(min_row=2, values_only=True)] == ids(result)
