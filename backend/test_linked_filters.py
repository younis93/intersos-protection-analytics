import os
os.environ.setdefault("INTERSOS_DEFER_LEGAL_LOAD", "1")
import pandas as pd
from backend.linked_filters import available_values
from backend.filter_selection import EXCLUDE_PREFIX
from backend.test_page_filter_audit import store
from backend.hotline import dashboard
from backend.indicator_reporting import build_indicator_report
from scripts.benchmark_indicator_performance import synthetic_frames


def test_facets_ignore_their_own_selection_and_respect_other_exclusions():
    frame=pd.DataFrame({"project":["A","A","B"],"location":["One","Two","Three"]})
    options=available_values({key:frame[key] for key in frame}, {"project":["A"],"location":[EXCLUDE_PREFIX+"One"]})
    assert options=={"project":["A","B"],"location":["One","Two"]}
    assert available_values({key:frame[key] for key in frame},{"project":["missing"]})["location"]==[]


def test_explorer_linking_both_directions_search_and_own_multiselect(store):
    project="UNHCR 2026 - AMAL CAMP"
    options={item["name"]:item for item in store.explorer_filters("assessments",{"Project":[project]})["columns"]}
    assert options["Project Location"]["values"]==["AMAL Camp"]
    assert len(options["Project"]["values"])==3
    inverse={item["name"]:item["values"] for item in store.explorer_filters("assessments",{"Project Location":["AMAL Camp"]})["columns"]}
    assert inverse["Project"]==[project]
    assert all(not item["values"] for item in store.explorer_filters("assessments",{},"no-such-record-xyz")["columns"])
    assert store.explorer_filters("assessments",{"Project":[project]}) is store.explorer_filters("assessments",{"Project":[project]})


def test_explorer_truncation_is_based_on_matching_source_not_table_page(store):
    from backend.legal_platform import LegalStore
    local=LegalStore({"beneficiaries":pd.DataFrame({"Case ID":[str(i) for i in range(600)],"Project":["A"]*550+["B"]*50})},"test",[],{})
    result={item["name"]:item for item in local.explorer_filters("beneficiaries",{"Project":["A"]})["columns"]}
    assert result["Case ID"]["valueCount"]==550
    assert result["Case ID"]["truncated"]
    assert len(result["Case ID"]["values"])==500


def test_connected_case_facets_follow_assessment_service_and_child_ids(store):
    project="UNHCR 2026 - AMAL CAMP"
    for field in ("assessments::Project","legalservices::Project","followupslogbooks::Project","legalfees::Project"):
        options={column["key"]:column["values"] for group in store.case_filters({field:[project]})["groups"] for column in group["columns"]}
        assert options["beneficiaries::Project Location"]==["AMAL Camp"],field
        assert len(options[field])==3
    options={column["key"]:column["values"] for group in store.case_filters({},"1")["groups"] for column in group["columns"]}
    assert options["beneficiaries::Case ID"]==["1"]


def test_dashboard_and_lawyer_facets(store):
    project="UNHCR 2026 - AMAL CAMP"
    assert store.analytics_dashboard("assessments",{"Project":[project]})["filterOptions"]["Project Location"]==["AMAL Camp"]
    assert store.deportation_dashboard({"Project":[project]})["filterOptions"]["Project Location"]==["AMAL Camp"]
    assert store.detention_cases(filters={"Project":[project]})["filterOptions"]["Project location"]==["AMAL Camp"]
    assert store.intelligence("lawyer-intelligence",{"project":[project]})["filterOptions"]["location"]==["AMAL Camp"]
    assert store.lawyer_summary({"project":[project]})["filterOptions"]["location"]==["AMAL Camp"]
    assert dashboard(store.frames["legalhotlines"],{"Project":[project]})["filterOptions"]["Project Location"]==["AMAL Camp"]


def test_reporting_projects_locations_community_and_periods_link():
    frames=synthetic_frames(120)
    baseline=build_indicator_report(frames)["filterOptions"]
    amal="UNHCR 2026 - AMAL CAMP"
    result=build_indicator_report(frames,projects=[amal])["filterOptions"]
    assert result["locations"]==["AMAL Camp"]
    assert result["communityTypes"]==["IDP"]
    assert build_indicator_report(frames,locations=["AMAL Camp"])["filterOptions"]["projects"]==[amal]
    month=baseline["months"][0]
    result=build_indicator_report(frames,months=[month])["filterOptions"]
    assert result["quarters"]==[month[:4]+"-Q"+str((int(month[5:7])-1)//3+1)]
    assert month in result["months"]
    result=build_indicator_report(frames,projects=[amal],community_types=["Syrian Refugee"])["filterOptions"]
    assert result["locations"]==[]
    assert result["communityTypes"]==["IDP"]


def test_search_scopes_dashboard_options_without_changing_existing_metrics(store):
    base=store.deportation_dashboard()
    result=store.deportation_dashboard(search="no-such-record-xyz")
    assert result["total"]==base["total"]
    assert result["filterOptions"]["Project"]==[]
    assert all(not values for values in dashboard(store.frames["legalhotlines"],search="no-such-record-xyz")["filterOptions"].values())
    assert store.detention_cases(search="no-such-record-xyz")["filterOptions"]["Project"]==[]


def test_review_options_follow_other_filters_and_search(store):
    baseline=store.review("beneficiaries")
    if baseline["rows"]:
        row=baseline["rows"][0]
        result=store.review("beneficiaries",project=row["project"])
        assert result["filterOptions"]["location"]==sorted({item["location"] for item in baseline["rows"] if item["project"]==row["project"] and item.get("location")})
    result=store.review("beneficiaries",search="no-such-record-xyz")
    assert all(not values for values in result["filterOptions"].values())


def test_option_endpoints_preserve_get_and_accept_scoped_post(store,monkeypatch):
    import backend.main as main
    from fastapi.testclient import TestClient
    monkeypatch.setattr(main,"require_legal_store",lambda:store)
    client=TestClient(main.app)
    for path,body in (("/api/legal/explorer-filters/assessments",{"filters":{"Project":["UNHCR 2026 - AMAL CAMP"]}}),("/api/legal/case-filters",{"filters":{"assessments::Project":["UNHCR 2026 - AMAL CAMP"]}})):
        assert client.get(path).status_code==200
        response=client.post(path,json={"query":"",**body})
        assert response.status_code==200
        payload=response.json()
        options=payload["columns"] if "columns" in payload else next(group["columns"] for group in payload["groups"] if group["dataset"]=="beneficiaries")
        location=next(option for option in options if option["name"]=="Project Location")
        assert location["values"]==["AMAL Camp"]


def test_analytics_raw_date_selection_keeps_existing_query_semantics(store):
    key="Date of Assessment"
    value=store.frames["assessments"][key].astype(str).iloc[0]
    result=store.analytics_dashboard("assessments",{key:[value]})
    assert result["matchedRows"]==1
    assert result["filterOptions"]["Project Location"]==["AMAL Camp"]


def test_selected_value_beyond_cap_is_not_falsely_marked_unavailable():
    from backend.legal_platform import LegalStore
    frame=pd.DataFrame({"Case ID":[str(i).zfill(4) for i in range(600)],"Project":["A"]*600})
    local=LegalStore({"beneficiaries":frame},"test",[],{})
    result=local.explorer_filters("beneficiaries",{"Case ID":["0599"],"Project":["A"]})
    option=next(item for item in result["columns"] if item["name"]=="Case ID")
    assert "0599" in option["values"]
    assert option["valueCount"]==600
