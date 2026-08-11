import io
from datetime import date

import pandas as pd
import pytest
from openpyxl import load_workbook

from backend.legal_platform import LegalStore, normalize_name, phone_digits, versioned_dataset_name


def csv(**columns):
    return pd.DataFrame(columns).to_csv(index=False).encode("utf-8")


def required_payload():
    return {
        "beneficiaries": csv(**{"Case ID":["B1","B2"],"Name (Filter Color Red)":["أحمد علي","احمدعلي"],"Name / الأسم: First":["Ahmed","Ahmed"],"Age":[17,120],"# total assessments":[0,1],"Contact Number":["1","123"],"Date of Identification / تاريخ التحديد":["31/01/2026","01/02/2026"]}),
        "assessments": csv(**{"Assessment ID":["A1","A2"],"Beneficiary ID":["B1","B1"],"# Total Services":[0,1],"Date of Assessment تاريخ التقييم":["01/01/2026","01/02/2026"]}),
        "legalservices": csv(**{"Service ID":["S1"],"Assessment ID":["A2"],"Beneficiary ID":["B1"],"Secured documents Files  الرجاء ارفاق الوثيقة الصادرة":["blob"],"Secured documents Files  الرجاء ارفاق الوثيقة الصادرة: URL":["https://example.test/a.jpg"],"Date of Service Provision / تاريخ بدء الخدمة":["02/02/2026"]}),
    }


def test_optional_files_are_not_required_and_cleanup_is_applied():
    store=LegalStore.from_files(required_payload(),"test")
    assert store.metadata()["availability"]["awareness"] is False
    assert len(store.warnings)==4
    assert not any(column.endswith(": First") for column in store.frames["beneficiaries"].columns)
    assert "Secured documents Files  الرجاء ارفاق الوثيقة الصادرة" not in store.frames["legalservices"].columns
    dates=store.explorer("beneficiaries")["rows"]
    assert dates[0]["Date of Identification / تاريخ التحديد"]=="2026-01-31"
    assert dates[1]["Date of Identification / تاريخ التحديد"]=="2026-02-01"


def test_missing_mandatory_file_rejects_import():
    payload=required_payload();del payload["assessments"]
    with pytest.raises(ValueError,match="assessments.csv"): LegalStore.from_files(payload,"test")


def test_blank_consolidated_names_are_built_before_split_columns_are_hidden():
    payload=required_payload()
    beneficiaries=pd.read_csv(io.BytesIO(payload["beneficiaries"]),dtype=object)
    beneficiaries=beneficiaries.drop(columns=[column for column in beneficiaries.columns if column.endswith(": First")])
    beneficiaries["Name (Filter Color Red)"]=""
    beneficiaries["Name / Arabic: First"]=["Ahmed","Ahmad"]
    beneficiaries["Name / Arabic: Middle"]=["Ali","Ali"]
    beneficiaries["Name / Arabic: Last"]=["Hassani","Hassani"]
    beneficiaries["Project"]=["UNHCR 2026 - Erbil","UNHCR 2026 - Erbil"]
    payload["beneficiaries"]=beneficiaries.to_csv(index=False).encode("utf-8")
    store=LegalStore.from_files(payload,"test")
    assert store.frames["beneficiaries"]["Name (Filter Color Red)"].tolist()==["Ahmed Ali Hassani","Ahmad Ali Hassani"]
    assert not any(column.endswith(": First") for column in store.frames["beneficiaries"].columns)
    assert store.review("beneficiaries",rule="Possible duplicate name")["total"]==0
    assert store.review("beneficiaries",rule="Possible duplicate name",allow_name_variations=True)["total"]==2


def test_name_matching_requires_at_least_the_selected_number_of_characters():
    payload=required_payload()
    payload["beneficiaries"]=csv(**{
        "Case ID":["B1","B2","B3","B4"],
        "Name (Filter Color Red)":["short","short","A"*31,"A"*31],
        "Project":["UNHCR 2026 - Erbil"]*4,
    })
    store=LegalStore.from_files(payload,"test")
    assert store.review("beneficiaries",rule="Possible duplicate name",name_compare_chars=30)["total"]==2
    assert store.review("beneficiaries",rule="Possible duplicate name",name_compare_chars=30)["nameCompareCharsApplied"]==30


def test_name_character_sensitivity_changes_duplicate_table_results():
    payload=required_payload()
    payload["beneficiaries"]=csv(**{
        "Case ID":["B1","B2"],
        "Name (Filter Color Red)":["A"*15+"X"*15,"A"*15+"Y"*15],
        "Project":["UNHCR 2026 - Erbil"]*2,
    })
    store=LegalStore.from_files(payload,"test")
    assert store.review("beneficiaries",rule="Possible duplicate name",name_compare_chars=10)["total"]==2
    assert store.review("beneficiaries",rule="Possible duplicate name",name_compare_chars=15)["total"]==2
    assert store.review("beneficiaries",rule="Possible duplicate name",name_compare_chars=30)["total"]==0


def test_small_spelling_differences_are_optional_and_do_not_match_unrelated_names():
    payload=required_payload()
    payload["beneficiaries"]=csv(**{
        "Case ID":["B1","B2","B3"],
        "Name (Filter Color Red)":["Ahmed Ali Hassani","Ahmad Ali Hassani","Completely Other"],
        "Project":["UNHCR 2026 - Erbil"]*3,
    })
    store=LegalStore.from_files(payload,"test")
    assert store.review("beneficiaries",rule="Possible duplicate name")["total"]==0
    result=store.review("beneficiaries",rule="Possible duplicate name",allow_name_variations=True)
    assert result["total"]==2
    assert {row["caseId"] for row in result["rows"]}=={"B1","B2"}
    assert result["allowNameVariationsApplied"] is True
    assert {row["nameMatchMode"] for row in result["rows"]}=={"variation"}
    assert all(90 <= row["duplicateSimilarity"] < 100 for row in result["rows"])


def test_exact_duplicate_mode_remains_exact_when_variations_are_enabled():
    payload=required_payload();payload["beneficiaries"]=csv(**{
        "Case ID":["B1","B2"],"Name (Filter Color Red)":["Identical Beneficiary Name"]*2,
        "Project":["UNHCR 2026 - Baghdad","UNHCR 2026 - Gov"],
    })
    rows=LegalStore.from_files(payload,"test").review("beneficiaries",rule="Possible duplicate name",allow_name_variations=True)["rows"]
    assert {row["nameMatchMode"] for row in rows}=={"exact"}
    assert {row["duplicateSimilarity"] for row in rows}=={100}


def test_duplicate_similarity_uses_each_rows_strongest_peer():
    payload=required_payload();base="A"*20
    payload["beneficiaries"]=csv(**{
        "Case ID":["B1","B2","B3"],"Name (Filter Color Red)":[base,base,"A"*18+"BB"],
        "Project":["UNHCR 2026 - Erbil"]*3,
    })
    rows=LegalStore.from_files(payload,"test").review("beneficiaries",rule="Possible duplicate name",name_compare_chars=20,allow_name_variations=True)["rows"]
    by_case={row["caseId"]:row for row in rows}
    assert by_case["B1"]["duplicateSimilarity"]==100
    assert by_case["B2"]["duplicateSimilarity"]==100
    assert by_case["B3"]["duplicateSimilarity"]==90


def test_duplicate_names_follow_north_south_and_amal_project_boundaries():
    payload=required_payload()
    duplicate="Identical Beneficiary Name"
    payload["beneficiaries"]=csv(**{
        "Case ID":["E1","E2","M1","S1","B1","G1","B2","A1","A2","U1","U2"],
        "Name (Filter Color Red)":[duplicate]*11,
        "Project":[
            "UNHCR 2026 - Erbil","UNHCR 2026 - Erbil",
            "UNHCR 2026 - Mosul & Kirkuk","UNHCR 2026 - SULI",
            "UNHCR 2026 - Baghdad","UNHCR 2026 - Gov","UNHCR 2026 - Baghdad",
            "UNHCR 2026 - AMAL CAMP","UNHCR 2026 - AMAL CAMP",
            "Unknown Project","",
        ],
    })
    store=LegalStore.from_files(payload,"test")
    result=store.review("beneficiaries",rule="Possible duplicate name")
    flagged={row["caseId"] for row in result["rows"]}
    assert flagged=={"E1","E2","B1","G1","B2","A1","A2"}
    details={row["caseId"]:row["detail"] for row in result["rows"]}
    assert "North - Erbil" in details["E1"]
    assert "South (Baghdad + Gov)" in details["G1"]
    assert "AMAL" in details["A1"]


def test_name_counts_distinguish_loaded_names_from_threshold_eligible_names():
    payload=required_payload()
    payload["beneficiaries"]=csv(**{
        "Case ID":["B1","B2"],
        "Name (Filter Color Red)":["Short Name","Another Short"],
        "Project":["UNHCR 2026 - Baghdad","UNHCR 2026 - Gov"],
    })
    result=LegalStore.from_files(payload,"test").review("beneficiaries",name_compare_chars=30)
    assert result["nameRecordCount"]==2
    assert result["eligibleNameRecordCount"]==0


def test_review_export_uses_the_same_south_duplicate_group():
    payload=required_payload()
    payload["beneficiaries"]=csv(**{
        "Case ID":["B1","G1","E1"],
        "Name (Filter Color Red)":["Shared Beneficiary Name"]*3,
        "Project":["UNHCR 2026 - Baghdad","UNHCR 2026 - Gov","UNHCR 2026 - Erbil"],
    })
    exported=LegalStore.from_files(payload,"test").review_export("beneficiaries")
    workbook=load_workbook(io.BytesIO(exported),read_only=True,data_only=True)
    assert workbook.sheetnames==["Review findings"]
    rows=list(workbook["Review findings"].iter_rows(values_only=True))
    header=list(rows[0]);case_id_index=header.index("Case ID");detail_index=header.index("Review Detail")
    duplicate_rows=[row for row in rows[1:] if row[header.index("Review Finding")]=="Possible duplicate name"]
    assert {row[case_id_index] for row in duplicate_rows}=={"B1","G1"}
    assert all("South (Baghdad + Gov)" in row[detail_index] for row in duplicate_rows)


def test_review_export_uses_consistent_rows_and_duplicate_name_colors():
    payload=required_payload()
    payload["beneficiaries"]=csv(**{
        "Case ID":["B1","G1"],"Name (Filter Color Red)":["Shared Beneficiary Name"]*2,
        "Project":["UNHCR 2026 - Baghdad","UNHCR 2026 - Gov"],
    })
    workbook=load_workbook(io.BytesIO(LegalStore.from_files(payload,"test").review_export("beneficiaries")))
    sheet=workbook["Review findings"]
    header=[cell.value for cell in sheet[1]];name_column=header.index("Name")+1
    duplicate_rows=[row for row in range(2,sheet.max_row+1) if sheet.cell(row,2).value=="Possible duplicate name"]
    assert {sheet.row_dimensions[row].height for row in duplicate_rows}=={24.0}
    assert len({sheet.cell(row,name_column).fill.fgColor.rgb for row in duplicate_rows})==1
    assert {sheet.cell(row,name_column).fill.fgColor.rgb for row in duplicate_rows}=={"00FDE8E8"}
    assert {sheet.cell(row,name_column).font.color.rgb for row in duplicate_rows}=={"00991B1B"}


def test_marital_and_spouse_age_use_current_date_of_birth_age():
    payload=required_payload();current_year=date.today().year
    payload["beneficiaries"]=csv(**{
        "Case ID":["B1","B2"],"Name (Filter Color Red)":["Adult Beneficiary","Minor Beneficiary"],
        "Age":[17,25],"DoB / Date of Birth":[f"01/01/{current_year-19}",f"01/01/{current_year-17}"],
        "Marital Status":["Married","Married"],"Spouse name":["Young Spouse","Adult Spouse"],
        "Spouse DoB":[f"01/01/{current_year-17}",f"01/01/{current_year-20}"],
    })
    result=LegalStore.from_files(payload,"test").review("beneficiaries",page_size=100)
    marital=[row for row in result["rows"] if row["rule"]=="Marital status below 18"]
    assert {row["caseId"] for row in marital}=={"B2"}
    spouses=[row for row in result["rows"] if row["rule"]=="Spouse below 18"]
    assert {row["caseId"] for row in spouses}=={"B1"}
    assert spouses[0]["spouseName"]=="Young Spouse"
    assert spouses[0]["spouseAge"]==17


def test_normalization_and_review_rules():
    store=LegalStore.from_files(required_payload(),"test")
    assert normalize_name(" أَحْمَد ة ")==normalize_name("احمده")
    assert phone_digits("٠٧٧٠-١٢٣-٤٥٦٧")=="07701234567"
    rules={row["rule"] for row in store.review("beneficiaries")["rows"]}
    assert {"Case without assessment","Invalid age","Invalid contact number"}<=rules
    assert "Possible duplicate name" not in rules
    assessment_rules={row["rule"] for row in store.review("assessments")["rows"]}
    assert "Beneficiary has multiple assessments" in assessment_rules


def test_contact_numbers_ignore_one_digit_and_prefix_ten_digits():
    payload=required_payload()
    payload["beneficiaries"]=csv(**{
        "Case ID":["B1","B2","B3"],
        "Name (Filter Color Red)":["Alpha Person","Beta Person","Gamma Person"],
        "Contact Number":["7","7701234567","12345"],
    })
    store=LegalStore.from_files(payload,"test")
    assert store.frames["beneficiaries"]["Contact Number"].tolist()==["7","07701234567","12345"]
    flagged={row["caseId"] for row in store.review("beneficiaries",rule="Invalid contact number")["rows"]}
    assert flagged=={"B3"}


def connected_case_payload():
    payload=required_payload()
    payload["beneficiaries"]=csv(**{"Case ID":["B1","B2"],"Name (Filter Color Red)":["First Person","Second Person"],"Lawyer":["Beneficiary Lawyer","Other Lawyer"],"Project":["North","South"]})
    payload["assessments"]=csv(**{"Assessment ID":["A1","A2","A3"],"Beneficiary ID":["B1","B1","B2"],"Assessment Status":["Closed","Open","Open"],"Lawyer":["Assessment Lawyer","Second Assessment Lawyer","Other Lawyer"]})
    payload["legalservices"]=csv(**{"Service ID":["S1","S2","S3"],"Assessment ID":["A1","A2","A3"],"Beneficiary ID":["B1","B1","B2"],"Service Status":["Closed after review","Open","Open"],"Lawyer":["Service Lawyer","","Other Lawyer"]})
    payload["followupslogbooks"]=csv(**{"Follow-up ID":["F1","F2"],"Service ID":["S1","S2"],"Follow-up Status":["Close","Pending"]})
    payload["legalfees"]=csv(**{"Fee ID":["L1"],"Legal Service ID":["S1"],"Payment Status":["Paid"]})
    return payload


def test_lawyer_summary_monthly_assessments_only_uses_2026_and_later():
    payload=required_payload()
    payload["assessments"]=csv(**{
        "Assessment ID":["OLD","A1","A2","A3","A3"],
        "Beneficiary ID":["B1","B1","B2","B3","B3"],
        "Date of Assessment تاريخ التقييم":["31/12/2025","10/01/2026","20/02/2026","21/02/2026","21/02/2026"],
        "Lawyers":["Lawyer One","Lawyer One","Lawyer One","Lawyer Two","Lawyer Two"],
    })
    result=LegalStore.from_files(payload,"test").lawyer_summary()
    monthly={(row["lawyer"],row["month"]):(row["count"],row["average"]) for row in result["monthlyAssessments"]}
    assert monthly[("Lawyer One","2026-01")]==(1,1.0)
    assert monthly[("Lawyer One","2026-02")]==(1,1.0)
    assert monthly[("Lawyer Two","2026-02")]==(1,0.5)
    assert all(month>="2026-01" for _,month in monthly)


def test_intelligence_integrates_distinct_records_and_keeps_awareness_separate():
    payload=required_payload()
    payload["assessments"]=csv(**{"Assessment ID":["OLD","A1","A2"],"Beneficiary ID":["B1","B1","B2"],"Date of Assessment":["31/12/2025","10/01/2026","12/01/2026"],"Lawyers":["One","One","Two"]})
    payload["legalservices"]=csv(**{"Service ID":["S1","S1","S2"],"Assessment ID":["A1","A1","A2"],"Beneficiary ID":["B1","B1","B2"],"Service Status":["Completed","Completed","Open"],"Lawyers":["One","One","Two"]})
    payload["followupslogbooks"]=csv(**{"Follow-ups & Logbook ID":["F1"],"Service ID":["S1"],"Date of follow-up":["15/01/2026"],"Lawyer":["One"]})
    payload["legalfees"]=csv(**{"Fee ID":["L1"],"Legal Service ID":["S1"],"Amount Spent (IQD)":["10,000"],"Paid date":["16/01/2026"],"Created by":["One"]})
    payload["deportationrecords"]=csv(**{"PN ID":["D1"],"Date of deporting":["17/01/2026"]})
    payload["awareness"]=csv(**{"Awareness ID":["W1","W2"],"Date of Session":["18/01/2026","18/01/2026"],"Lawyer":["One","One"]})
    result=LegalStore.from_files(payload,"test").intelligence("command-center")
    kpis={item["label"]:item["value"] for item in result["kpis"]}
    assert kpis["Assessments"]==2
    assert kpis["Legal services"]==2
    assert kpis["Completed services"]==1
    assert kpis["Awareness participants"]==2
    assert kpis["Legal fees"]==10000
    assert result["period"]=="2026 onward"


def test_case_search_resolves_case_assessment_and_service_ids():
    store=LegalStore.from_files(connected_case_payload(),"test")
    assert {item["beneficiary"]["Case ID"] for item in store.case("B1")["cases"]}=={"B1"}
    assert {item["beneficiary"]["Case ID"] for item in store.case("A2")["cases"]}=={"B1"}
    assert {item["beneficiary"]["Case ID"] for item in store.case("S1")["cases"]}=={"B1"}


def test_case_filters_cover_connected_datasets_with_contains_semantics():
    store=LegalStore.from_files(connected_case_payload(),"test")
    result=store.case("",{"assessments::Assessment Status":["Close"],"legalservices::Service Status":["review"]})
    assert {item["beneficiary"]["Case ID"] for item in result["cases"]}=={"B1"}
    options=store.case_filters();labels={group["label"] for group in options["groups"]}
    assert {"Beneficiary","Assessment","Legal service","Follow-up","Legal fee"}<=labels
    assessment_group=next(group for group in options["groups"] if group["dataset"]=="assessments")
    status=next(column for column in assessment_group["columns"] if column["name"]=="Assessment Status")
    assert status["values"].count("Closed")==1


def test_connected_case_table_returns_one_expandable_hierarchy_per_case():
    store=LegalStore.from_files(connected_case_payload(),"test")
    result=store.case("B1",view_mode="table",page=1,page_size=1)
    assert result["totalCases"]==result["totalRows"]==1 and len(result["cases"])==1
    case=result["cases"][0]
    assert len(case["assessments"])==2
    assert sum(len(node["services"]) for node in case["assessments"])==2
    assert case["counts"]=={"assessments":2,"services":2,"followups":2,"fees":1}
    assert case["lawyers"]==["Service Lawyer","Assessment Lawyer","Second Assessment Lawyer","Beneficiary Lawyer"]


def test_assessment_review_excludes_requested_service_rule():
    store=LegalStore.from_files(required_payload(),"test")
    result=store.review("assessments")
    assert "Requested service not provided" not in result["ruleCounts"]
    assert all(row["rule"]!="Requested service not provided" for row in result["rows"])


def test_awareness_duplicate_priority_uses_name_and_session_and_minor_is_hidden_from_overview():
    payload=required_payload()
    payload["awareness"]=csv(**{
        "Awareness ID":["W1","W2","W3"],
        "Participant Name":["Same Person","Same Person","Same Person"],
        "Session Topic":["Housing","Housing","Documentation"],
    })
    store=LegalStore.from_files(payload,"test")
    rows=store.review("awareness",page_size=100)["rows"]
    high=[row for row in rows if row["rule"]=="Duplicate participant in session"]
    minor=[row for row in rows if row["rule"]=="Possible duplicate participant name"]
    assert {row["awarenessId"] for row in high}=={"W1","W2"}
    assert {row["awarenessId"] for row in minor}=={"W3"}
    assert all(row["severity"]=="High" for row in high)
    assert all(row["severity"]=="Minor" for row in minor)
    assert store.metadata()["reviewCounts"]["awareness"]==2


def test_case_hierarchy_works_without_optional_files():
    store=LegalStore.from_files(required_payload(),"test")
    case=store.case("B1")["cases"][0]
    assert len(case["assessments"])==2
    assert sum(len(assessment["services"]) for assessment in case["assessments"])==1
    service=case["assessments"][1]["services"][0]
    assert service["followups"]==[] and service["fees"]==[]
    workbook=load_workbook(io.BytesIO(store.case_export("B1")))
    assert workbook.sheetnames==["Connected cases"]
    sheet=workbook["Connected cases"]
    assert sheet.freeze_panes=="A3"
    assert "Case ID" in [cell.value for cell in sheet[2]]


def test_connected_case_table_sorts_and_paginates_by_beneficiary_case():
    store=LegalStore.from_files(connected_case_payload(),"test")
    result=store.case("",{},view_mode="table",page=1,page_size=1,sort_column="beneficiaries::Case ID",sort_direction="desc")
    assert result["totalCases"]==2 and len(result["cases"])==1
    assert result["cases"][0]["beneficiary"]["Case ID"]=="B2"
    second=store.case("",{},view_mode="table",page=2,page_size=1,sort_column="beneficiaries::Case ID",sort_direction="desc")
    assert second["cases"][0]["beneficiary"]["Case ID"]=="B1"


def test_explorer_excel_export_respects_search_and_checkbox_filters():
    store=LegalStore.from_files(required_payload(),"test")
    exported=store.explorer_export("beneficiaries","B1",{"Age":["17"]},"xlsx")
    assert exported[:2]==b"PK"
    workbook=pd.read_excel(io.BytesIO(exported))
    assert workbook["Case ID"].tolist()==["B1"]


def test_refugee_2026_detention_scope_and_selectable_month():
    payload=required_payload()
    payload["assessments"]=csv(**{
        "Assessment ID":["A1","A2","A3","A4"],"Beneficiary ID":["B1","B1","B2","B2"],
        "Date of Assessment تاريخ التقييم":["15/12/2025","10/01/2026","12/01/2026","15/02/2026"],
        "Community Type":["Syrian Refugee لاجيء-سوري","Syrian Refugee لاجيء-سوري","IDPs النازحين","Non-Syrian Refugee لاجئ غير سوري"],
        "Is the beneficiary detained هل المستفيد موقوف":["Yes","Yes","Yes","No"],
        "Is it an immigration related charge? هل هو معتقل على اساس قانون الاقامة ؟":["","","","Yes"],
        "# Total Services":[1,1,1,1],
    })
    store=LegalStore.from_files(payload,"test")
    january=store.review("assessments",comparison_month="2026-01",page_size=100)
    detention=[row for row in january["rows"] if row["rule"]=="Detention/immigration inconsistency"]
    assert {row["assessmentId"] for row in detention}=={"A2","A4"}
    repeated=[row for row in january["rows"] if row["rule"]=="Selected month with previous assessment"]
    assert {row["assessmentId"] for row in repeated}=={"A2"}
    assert january["activeComparisonMonth"]=="2026-01"
    assert "Marital status below 18" in store.review("beneficiaries")["ruleCounts"]
    assert "Spouse below 18" in store.review("beneficiaries")["ruleCounts"]


def test_versioned_csv_names_and_detention_page():
    assert versioned_dataset_name("assessments.csv") == ("assessments", 0)
    assert versioned_dataset_name("Assessments (2).csv") == ("assessments", 2)
    assert versioned_dataset_name("legal services (12).CSV") == ("legalservices", 12)
    assert versioned_dataset_name("notes (2).csv") is None
    payload=required_payload()
    payload["assessments"]=csv(**{
        "Assessment ID":["A1","A2","A3"],"Beneficiary ID":["B1","B2","B3"],
        "Is the beneficiary detained":["Yes","No","Yes"],"Date of Assessment":["05/01/2026","01/02/2026","06/01/2026"],"Date of Detention":["02/01/2026","","03/01/2026"] ,
        "Detention Governorate":["Ninewa","","Baghdad"] ,"Detainee current status":["Detained","Released","Released after review"],
        "Date of the released or deported":["10/02/2026","","12/02/2026"] ,
    })
    store=LegalStore.from_files(payload,"test")
    result=store.detention_cases()
    assert result["total"]==2
    assert result["rows"][0]["caseId"]=="B1"
    assert result["filterOptions"]["Detention governorate"]==["Baghdad","Ninewa"]
    assert result["map"]=={"items":[{"label":"Ninawa","count":1,"detained":1,"released":0,"values":["Ninewa"]},{"label":"Baghdad","count":1,"detained":1,"released":1,"values":["Baghdad"]}]}
    assert result["trend"]==[{"month":"2026-01","detainedAssessments":2,"released":0},{"month":"2026-02","detainedAssessments":0,"released":1}]
    february=store.detention_cases(filters={"month":["2026-02"]})
    assert february["total"]==0
    assert february["trend"]==[{"month":"2026-02","detainedAssessments":0,"released":1}]
    assert february["map"]=={"items":[{"label":"Baghdad","count":0,"detained":0,"released":1,"values":["Baghdad"]}]}
    empty_month=store.detention_cases(filters={"month":["2026-03"]})
    assert empty_month["trend"]==[]


def test_detention_detail_columns_and_monthly_excel_reconciliation():
    payload=required_payload()
    shared={
        "DoB / تأريخ الولاده":"01/01/1990","Age":36,"Gender النوع الاجتماعي":"Male ذكر",
        "Date of Detention تاريخ الاحتجاز":"02/01/2026","Detention Governorate / محافظة الاحتجاز":"Ninewa",
        "Detaining Authority جهة الاحتجاز":"Police","Reasons for Detention أسباب الاحتجاز":"Immigration",
        "Possible Charges التهم المحتملة":"Overstay","Nationality الجنسية":"Iraqi",
        "Name of the reporting person اسم الشخص المبلغ":"Reporter","Relationship to the detainee العلاقة بالمحتجز":"Brother",
        "Phone number of the reporter رقم هاتف المبلغ":"07501234567","Type of Legal Service Needed":"Legal Representation - Court follow-up",
        "Detainee current status حالة المعتقل الحالية":"Detained","Type of Released نوع الافراج":"",
        "Date of the released or deported تاريخ الافراج او الترحيل":"",
    }
    payload["assessments"]=csv(**{
        "Assessment ID":["A1","A3"],"Beneficiary ID":["B1","B3"],"Lawyer":["Assessment Lawyer",""],"Projects":["P1","P2"],"Is the beneficiary detained":["Yes","Yes"],
        "Date of Assessment تاريخ التقييم":["05/01/2026","06/01/2026"],"Name / الأسم":["أحمد علي","سارة حسن"],
        **{column:[value,value] for column,value in shared.items()},
    })
    store=LegalStore.from_files(payload,"test")
    detail=store.detention_cases()
    assert "Name of the reporting person اسم الشخص المبلغ" in detail["columns"]
    assert "Phone number of the reporter رقم هاتف المبلغ" in detail["columns"]
    external=pd.DataFrame({
        "Lawyer":["Excel Lawyer","L2","L3"],"Identification Date | تاريخ تحديد الحالة":["05/01/2026","06/01/2026","07/01/2026"],
        "Beneficiary ID (Platform Case ID)":["B1","B3","B9"],"Registration Number | رقم التسجيل":["R1","R3","R9"],
        "English Name | الاسم بالإنكليزي":["Ahmed Ali","Sara Hassan","Other"],"Arabic Name | الاسم بالعربي":["أحمد علي","سارة حسن","شخص آخر"],
        "Date of Birth | تاريخ الميلاد":["01/01/1990"]*3,"Age | العمر":[99]*3,"Sex | الجنس":["Male"]*3,
        "Date of Arrest | تاريخ الاعتقال":["02/01/2026"]*3,"Detention Governorate | محافظة الاحتجاز":["Ninewa"]*3,
        "Detaining Authority | الجهة المحتجزة":["Police"]*3,"Place of Detention | مكان الاحتجاز":[""]*3,
        "Reason of Arrest | سبب الاعتقال":["Immigration"]*3,"Charges | التهم":["Different charge","Overstay","Overstay"],
        "Nationality | الجنسية":["Iraqi"]*3,"Case Reporter | مُبلغ القضية":["Different reporter"]*3,
        "Relationship with Detainee | العلاقة مع المعتقل":["Different relationship"]*3,"Phone Number | رقم الهاتف":["Different phone"]*3,
        "Type of Service by INTERSOS | نوع الخدمة المقدمة من قبل محامي انترسوس":["Legal Representation"]*3,
        "Detainee Current Status | الحالة الحالية للمعتقل":["Detained"]*3,"Type of Release | نوع الإفراج":[""]*3,
        "Date of Release/Deportation | تاريخ الإفراج أو الترحيل":[""]*3,"ملاحظات | Note":["Check charge","",""]
    })
    workbook=io.BytesIO();external.to_excel(workbook,index=False)
    result=store.detention_reconciliation(workbook.getvalue(),"detention.xlsx","2026-01")
    assert result["platformRecords"]==2
    assert result["comparisonRecords"]==3
    assert result["matched"]==1
    assert result["unmatched"]==2
    assert "Date of birth" in result["comparedFields"]
    assert "Detention governorate" in result["comparedFields"]
    assert "Age" not in result["comparedFields"]
    assert result["rows"][0]["beneficiaryId"]=="B1"
    assert result["rows"][0]["differences"]==[{"field":"Possible charges","assessment":"Overstay","excel":"Different charge"}]
    assert result["rows"][1]["beneficiaryId"]=="B9"
    exported=store.detention_reconciliation_export(workbook.getvalue(),"detention.xlsx","2026-01")
    issue_sheet=load_workbook(io.BytesIO(exported))["Comparison issues"]
    assert [cell.value for cell in issue_sheet[4]]==["Lawyer","Note group","Case ID","Name","Different field","Assessment value","Excel value"]
    assert issue_sheet["A5"].value=="Assessment Lawyer"
    assert issue_sheet["A5"].fill.fgColor.rgb.endswith("E8F1FB")
    multiple=store.detention_reconciliation(workbook.getvalue(),"detention.xlsx","2026-01,2026-02")
    assert multiple["months"]==["2026-01","2026-02"]
    assert multiple["platformRecords"]==2
    project_result=store.detention_reconciliation(workbook.getvalue(),"detention.xlsx","2026-01","P1")
    assert project_result["project"]=="P1"
    assert project_result["platformRecords"]==1
    assert project_result["comparisonRecords"]==3
    assert not any("no Project column" in warning for warning in project_result["warnings"])
    excel_only=next(row for row in project_result["rows"] if row["beneficiaryId"]=="B9")
    assert excel_only["note"]=="Case ID available in Excel but missing from Assessments"
    assert excel_only["caseAvailable"] is False
    projects_result=store.detention_reconciliation(workbook.getvalue(),"detention.xlsx","2026-01",["P1","P2"])
    assert projects_result["projects"]==["P1","P2"]
    assert projects_result["platformRecords"]==2
    multi_sheet=io.BytesIO()
    with pd.ExcelWriter(multi_sheet,engine="openpyxl") as writer:
        external.to_excel(writer,index=False,sheet_name="January cases")
        external.to_excel(writer,index=False,sheet_name="Reviewed cases")
    assert LegalStore.detention_workbook_sheets(multi_sheet.getvalue())==["January cases","Reviewed cases"]
    selected_sheet=store.detention_reconciliation(multi_sheet.getvalue(),"detention.xlsx","2026-01","","Reviewed cases")
    assert selected_sheet["sheet"]=="Reviewed cases"


def test_project_reconciliation_compares_dob_and_normalized_detention_governorate():
    payload=required_payload()
    payload["assessments"]=csv(**{
        "Assessment ID":["A1","A2"],"Beneficiary ID":["B1","B2"],"Projects":["P1","P2"],
        "Is the beneficiary detained":["Yes","Yes"],"Date of Assessment":["05/01/2026","05/01/2026"],
        "Name":["Person One","Person Two"],"DoB":["01/01/1990","01/01/1991"],
        "Detention Governorate":["Ninewa","Baghdad"],
    })
    store=LegalStore.from_files(payload,"test")
    external=pd.DataFrame({
        "Identification Date":["05/01/2026","05/01/2026"],"Beneficiary ID (Platform Case ID)":["B1","B2"],
        "Arabic Name":["Person One","Person Two"],"Date of Birth":["02/01/1990","01/01/1991"],
        "Detention Governorate":["Baghdad بغداد","Baghdad"],
    })
    workbook=io.BytesIO();external.to_excel(workbook,index=False)
    result=store.detention_reconciliation(workbook.getvalue(),"detention.xlsx","2026-01","P1")
    assert result["platformRecords"]==1
    assert result["comparisonRecords"]==2
    assert result["rows"][0]["beneficiaryId"]=="B1"
    assert [difference["field"] for difference in result["rows"][0]["differences"]]==["Date of birth","Detention governorate"]

    external.loc[0,"Date of Birth"]=32874
    external.loc[0,"Detention Governorate"]="Ninawa نينوى"
    matched_workbook=io.BytesIO();external.to_excel(matched_workbook,index=False)
    matched=store.detention_reconciliation(matched_workbook.getvalue(),"detention.xlsx","2026-01","P1")
    assert matched["matched"]==1
    assert matched["rows"]==[{"beneficiaryId":"B2","caseAvailable":True,"name":"Person Two","lawyer":"","note":"Case ID available in Excel but missing from Assessments","differences":[{"field":"Case ID","assessment":"Missing","excel":"Present"}]}]


def test_detention_reconciliation_reports_blank_case_ids_on_both_sides():
    payload=required_payload()
    payload["assessments"]=csv(**{
        "Assessment ID":["A1","A2"],"Beneficiary ID":["B1",""],"Projects":["P1","P1"],
        "Is the beneficiary detained":["Yes","Yes"],"Date of Assessment":["05/01/2026","05/01/2026"],
        "Name":["Matched person","Assessment without ID"],
    })
    store=LegalStore.from_files(payload,"test")
    workbook=io.BytesIO()
    pd.DataFrame({
        "Identification Date":["05/01/2026","05/01/2026"],
        "Beneficiary ID (Platform Case ID)":["B1",""],
        "Arabic Name":["Matched person","Excel without ID"],
    }).to_excel(workbook,index=False)
    result=store.detention_reconciliation(workbook.getvalue(),"detention.xlsx","2026-01","P1")
    assert result["missingCaseIds"]=={"assessments":1,"excel":1}
    assert {row["note"] for row in result["rows"]}=={"Case ID missing in Assessments","Case ID missing in Excel"}
