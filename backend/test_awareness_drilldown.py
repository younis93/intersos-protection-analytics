import pandas as pd

from backend.indicator_reporting import build_indicator_report


def test_awareness_drilldown_uses_session_id_and_participant_name():
    common = {"Projects": "UNHCR 2026 - AMAL CAMP", "Project Location": "AMAL Camp",
              "Community Type": "IDP", "Gender": "Female", "UNHCR Age Group": "(18-39)",
              "Date of Session": pd.Timestamp("2026-01-05"), "Session Topic": "Civil documentation"}
    frame = pd.DataFrame([{**common, "Awareness ID": "AW1", "Beneficiary ID": "B1", "Participant Name": "First participant"},
                          {**common, "Awareness ID": "AW1", "Beneficiary ID": "B2", "Participant Name": "Second participant"}])
    report = build_indicator_report({"awareness": frame, "assessments": pd.DataFrame(), "legalservices": pd.DataFrame()}, "2026-01-01", "2026-01-31", include_source_records=True)
    item = next(item for group in report["groups"] for item in group["indicators"] if item["id"] == "legal-awareness-participants")
    assert item["total"] == 2
    ids = item["sections"][0]["totalBeneficiaryIds"][12]
    assert len(ids) == 2
    assert all(value.startswith("AW1  |  ") for value in ids)
    assert "Name: First participant" in ids[0]
    assert "Name: Second participant" in ids[1]
    assert item["sections"][0]["totalSourceRecords"][12] == [{"dataset": "awareness", "rowIndex": 0}, {"dataset": "awareness", "rowIndex": 1}]
