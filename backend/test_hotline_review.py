from io import BytesIO

import pandas as pd
from openpyxl import load_workbook

from backend.duplicate_exclusions import DuplicateExclusionRegistry
from backend.hotline import dashboard
from backend.hotline_review import RULES
from backend.legal_platform import LegalStore


def store_for(rows, exclusions=None):
    frame = pd.DataFrame(rows)
    return LegalStore.from_files({"legalhotlines": frame.to_csv(index=False).encode("utf-8-sig")}, "hotline review test", exclusions=exclusions or [])


def row(identifier, name="", **changes):
    return {"Hotline ID": identifier, "Name of the detained person اسم الشخص المعتقل": name,
            "Name of the caller اسم المتصل": "Different Caller", "Contact Number": "7501234567",
            "Contact Date تاريخ الاتصال": "2/1/2026", "Is the beneficiary detained هل المستفيد موقوف": "",
            "Has the beneficiary referred to the helpline? هل تم احالة المستفيد الى خط المساعدة": "",
            "Priority الاولوية": "Low", "Refer to Lawyer": "", **changes}


def review(store, **kwargs):
    return store.review("legalhotlines", allow_name_variations=True, **kwargs)


def test_seven_rules_and_hotline_only_source_preservation():
    rows = [row("1", "Ahmed Mohammed Hassan"), row("2", "AHMED  MOHAMMED HASSAN"),
            row("3", "Ahmed Mohammad Hassan"),
            row("4", "Ali Ahmed", **{"Name of the caller اسم المتصل": "Ali"}),
            row("5", **{"Is the beneficiary detained هل المستفيد موقوف": "Yes نعم"}),
            row("6", **{"Is the beneficiary detained هل المستفيد موقوف": "No لا", "Has the beneficiary referred to the helpline? هل تم احالة المستفيد الى خط المساعدة": "No لا"}),
            row("7", **{"Priority الاولوية": "High عالية"}), row("8", **{"Contact Number": "123"})]
    store = store_for(rows)
    source = store.frames["legalhotlines"].copy(deep=True)
    result = review(store)
    assert result["ruleCounts"] == dict(zip(RULES, [2, 3, 1, 1, 1, 1, 1]))
    assert not result["unavailableRules"]
    assert all(flag["caseId"] == "" for flag in result["rows"])
    assert {flag["severity"] for flag in result["rows"] if flag["rule"] in RULES[3:6]} == {"High"}
    assert len({flag["duplicateGroup"] for flag in review(store, rule=RULES[0])["rows"]}) == 1
    assert review(store, date="2026-02")["total"] == result["total"]
    assert review(store, date="2026-01")["total"] == 0
    pd.testing.assert_frame_equal(store.frames["legalhotlines"], source)
    assert dashboard(store.frames["legalhotlines"])["total"] == len(rows)


def test_caller_match_complete_words_and_not_across_records():
    store = store_for([row("1", "Ali Ahmed", **{"Name of the caller اسم المتصل": "Ali"}),
                       row("2", "Alison", **{"Name of the caller اسم المتصل": "Ali"}),
                       row("3", "Omar Hassan", **{"Name of the caller اسم المتصل": "Ahmed"}),
                       row("4", "", **{"Name of the caller اسم المتصل": ""}),
                       row("5", "محمد أحمد", **{"Name of the caller اسم المتصل": "أحمد"})])
    assert {flag["hotlineId"] for flag in review(store, rule=RULES[2])["rows"]} == {"id:1", "id:5"}


def test_phone_validation_allows_blank_and_only_formatting():
    phones = ["", "7501234567", "750 123-4567", "(750)1234567", "+9647501234567", "07501234567", "750123456", "75012345678", "abc7501234567", "750/1234567"]
    store = store_for([row(str(i), **{"Contact Number": phone}) for i, phone in enumerate(phones)])
    assert review(store, rule=RULES[6])["total"] == 6


def test_missing_columns_do_not_generate_false_findings():
    store = store_for([{"Hotline ID": "1", "Priority": "High"}])
    result = review(store)
    assert result["total"] == 0
    assert set(result["unavailableRules"]) == set(RULES)
    assert "Refer to Lawyer" in result["unavailableRules"][RULES[5]]


def test_arabic_headers_and_blank_answers():
    store = store_for([{"اسم الشخص المعتقل": "محمد علي", "اسم المتصل": "محمد", "هل المستفيد موقوف": "نعم", "هل تم احالة المستفيد الى خط المساعدة": "لا", "الاولوية": "عالية", "احالة الى محامي": "", "رقم الهاتف": "7501234567"},
                       {"اسم الشخص المعتقل": "", "اسم المتصل": "", "هل المستفيد موقوف": "", "هل تم احالة المستفيد الى خط المساعدة": "لا", "الاولوية": "", "احالة الى محامي": "", "رقم الهاتف": ""}])
    counts = review(store)["ruleCounts"]
    assert counts[RULES[2]] == counts[RULES[3]] == counts[RULES[5]] == 1
    assert counts[RULES[4]] == 0


def test_stable_identity_exclusion_restore_and_recheck(tmp_path):
    rows = [row("1", "Ahmed Mohammed Hassan"), row("2", "Ahmed Mohammed Hassan")]
    store = store_for(rows)
    target = review(store, rule=RULES[0])["rows"][0]
    registry = DuplicateExclusionRegistry(tmp_path / "exclusions.json")
    registry.exclude_record("legalhotlines", RULES[0], "hotlineId", target["hotlineId"], duplicate_context=target["duplicateContext"])
    store.set_review_exclusions(registry.exclusion_rows())
    assert review(store, rule=RULES[0])["total"] == 1
    assert dashboard(store.frames["legalhotlines"])["total"] == 2
    reordered = store_for(list(reversed(rows)), registry.exclusion_rows())
    assert review(reordered, rule=RULES[0])["total"] == 1
    assert registry.reconcile_duplicate_contexts(reordered.duplicate_contexts_for_exclusions(registry.exclusion_rows()))[1] is False
    changed = store_for(rows + [row("3", "Ahmed Mohammed Hassan")], registry.exclusion_rows())
    entries, did_change = registry.reconcile_duplicate_contexts(changed.duplicate_contexts_for_exclusions(registry.exclusion_rows()))
    assert did_change and entries[0]["pendingRecheck"]
    changed.set_review_exclusions(registry.exclusion_rows())
    assert review(changed, rule=RULES[0])["total"] == 3
    registry.restore(target["hotlineId"], RULES[0], "legalhotlines", "hotlineId")
    changed.set_review_exclusions(registry.exclusion_rows())
    assert review(changed, rule=RULES[0])["total"] == 3


def test_fallback_ids_stable_after_reorder_including_identical_rows():
    rows = [row("", "Alpha Person"), row("", "Beta Person"), row("", "Alpha Person")]
    first = store_for(rows); second = store_for(list(reversed(rows)))
    from backend.hotline_review import prepare
    ids_a = prepare(first.frames["legalhotlines"])[1]
    ids_b = prepare(second.frames["legalhotlines"])[1]
    assert len(set(ids_a.values())) == 3
    assert set(ids_a.values()) == set(ids_b.values())


def test_export_filtering_and_pagination():
    store = store_for([row("1", "Ahmed Mohammed Hassan"), row("2", "Ahmed Mohammed Hassan"), row("3", **{"Priority الاولوية": "High"})])
    result = review(store, rule=RULES[0], page_size=1, page=2)
    assert result["total"] == 2 and len(result["rows"]) == 1
    workbook = load_workbook(BytesIO(store.review_export("legalhotlines", selected_rules=[RULES[5]], allow_name_variations=True)))
    headers = [cell.value for cell in workbook.active[1]]
    assert "Record identifier" in headers and "Caller name" in headers and "Lawyer referral" in headers
    assert "Case ID" not in headers and "Assessment" not in headers and "Service" not in headers
    values = [cell.value for sheet in workbook for cells in sheet.iter_rows() for cell in cells]
    assert RULES[5] in values and RULES[0] not in values


def test_review_api_exports_and_exclusion_import(monkeypatch, tmp_path):
    import asyncio
    from fastapi import UploadFile
    from backend import main
    store = store_for([row("1", "Ahmed Mohammed Hassan"), row("2", "Ahmed Mohammed Hassan")])
    registry = DuplicateExclusionRegistry(tmp_path / "api-exclusions.json")
    monkeypatch.setattr(main, "legal_store", store)
    monkeypatch.setattr(main, "duplicate_exclusions", registry)
    response = main.legal_review(main.LegalQuery(dataset="legalhotlines", rule=RULES[0], allowNameVariations=True))
    assert response["total"] == 2
    export = main.legal_review_export("legalhotlines", rules=RULES[0])
    book = load_workbook(BytesIO(export.body))
    assert "Record identifier" in [cell.value for cell in book.active[1]]
    response = asyncio.run(main.import_duplicate_exclusions(UploadFile(filename="ids.csv", file=BytesIO(b"Record identifier\nid:1\n")), "legalhotlines", "hotlineId", RULES[0]))
    assert response["imported"] == 1
    assert main.legal_review(main.LegalQuery(dataset="legalhotlines", rule=RULES[0]))["total"] == 1
