import pandas as pd
from backend.filter_selection import EXCLUDE_PREFIX, selection_mask
from backend.legal_platform import filter_rows
from backend.explorer_preparation import PreparedExplorer
from backend.hotline import filter_frame


def test_exclusions_keep_new_and_blank_values_and_never_reset_all_excluded():
    values = pd.Series(["Baghdad", "Erbil", "New governorate", ""])
    assert values[selection_mask(values, [EXCLUDE_PREFIX + "Baghdad"])].tolist() == ["Erbil", "New governorate", ""]
    assert not selection_mask(values, [EXCLUDE_PREFIX + value for value in values]).any()
    assert values[selection_mask(values, ["Baghdad"])].tolist() == ["Baghdad"]


def test_date_exclusion_matches_explorer_and_export_filtering():
    frame = pd.DataFrame({"Date of Assessment": ["01/01/2026", "01/02/2026", "01/03/2026", ""]})
    selection = [EXCLUDE_PREFIX + "2026-01"]
    assert filter_rows(frame, "Date of Assessment", selection).index.tolist() == [1, 2, 3]
    assert PreparedExplorer(frame, "assessments").select("", {"Date of Assessment": selection}).tolist() == [1, 2, 3]


def test_hotline_exclusion():
    frame = pd.DataFrame({"Project": ["Baghdad", "Erbil", "New project"]})
    assert filter_frame(frame, {"Project": [EXCLUDE_PREFIX + "Baghdad"]}).index.tolist() == [1, 2]


def test_indicator_exclusions_match_explicit_remaining_values():
    from backend.indicator_reporting import REPORT_ROWS, build_indicator_report, build_monthly_reports
    from scripts.benchmark_indicator_performance import synthetic_frames
    frames = synthetic_frames(120)
    options = build_indicator_report(frames)["filterOptions"]
    for field, option in (("projects", "projects"), ("months", "months"),
                          ("locations", "locations"), ("community_types", "communityTypes")):
        removed = "UNHCR 2026 - AMAL CAMP" if field == "projects" else options[option][0]
        remaining = [value for value in options[option] if value != removed]
        if field == "locations":
            remaining = list({location for _, location in REPORT_ROWS if location != removed})
        excluded = build_indicator_report(frames, **{field: [EXCLUDE_PREFIX + removed]})
        included = build_indicator_report(frames, **{field: remaining})
        assert excluded["groups"] == included["groups"], field
    excluded = build_monthly_reports(frames, months=[EXCLUDE_PREFIX + options["months"][0]])
    assert options["months"][0] not in excluded["months"]


def test_legal_dashboard_and_export_share_exclusions():
    from io import BytesIO
    from backend.legal_platform import LegalStore
    from backend.test_legal_platform import required_payload, csv
    payload = required_payload()
    payload["assessments"] = csv(**{"Assessment ID": ["A1", "A2", "A3"], "Beneficiary ID": ["B1", "B2", "B3"],
                                    "Project": ["Baghdad", "Erbil", "New project"], "Date of Assessment": ["01/01/2026"] * 3})
    store = LegalStore.from_files(payload, "test")
    filters = {"Project": [EXCLUDE_PREFIX + "Baghdad"]}
    assert store.analytics_dashboard("assessments", filters=filters)["matchedRows"] == 2
    assert store.explorer("assessments", filters=filters)["total"] == 2
    exported = pd.read_excel(BytesIO(store.explorer_export("assessments", filters=filters)))
    assert exported["Project"].tolist() == ["Erbil", "New project"]
