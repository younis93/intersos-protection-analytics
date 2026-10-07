import io
from email import policy
from email.parser import BytesParser
from types import SimpleNamespace

import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import Workbook

from backend.send_issues import Contacts, DraftRequest, collect_findings, make_router, render_draft, valid_email


def fake_store():
    flags = [
        dict(dataset="beneficiaries", rule="Invalid contact number", row=1, caseId="B1", lawyer="Alice", detail="<script>alert(1)</script>", action="Correct the record", phone="SECRET"),
        dict(dataset="beneficiaries", rule="Invalid contact number", row=2, caseId="B2", lawyer="Bob", detail="Issue B", action="Correct"),
        dict(dataset="beneficiaries", rule="Invalid contact number", row=3, caseId="B3", lawyer="", detail="Missing owner", action="Correct"),
        dict(dataset="legalhotlines", rule="Invalid contact number", row=1, hotlineId="H1", lawyer="Yes", detail="Bad number", action="Correct"),
        dict(dataset="legalhotlines", rule="Invalid contact number", row=2, hotlineId="H2", lawyer=" alice ", detail="Bad number", action="Correct"),
    ]
    store = SimpleNamespace(revision="r1", frames={"beneficiaries": pd.DataFrame({"Lawyers": ["Alice", "Bob", "No Issues"]}), "legalhotlines": pd.DataFrame({"Refer to Lawyer": ["Yes", "Alice"]})}, calls=[])

    def review(dataset, rule="", page=1, page_size=5000, **kwargs):
        store.calls.append((dataset, kwargs))
        rows = [flag for flag in flags if flag["dataset"] == dataset]
        return {"rows": rows[(page-1)*page_size:page*page_size], "total": len(rows), "rules": ["Invalid contact number"]}

    # This fixture represents core review findings, which require the full core group.
    store.frames.update({"assessments": pd.DataFrame(), "legalservices": pd.DataFrame()})
    store.review = review
    store.flags = flags
    return store


@pytest.fixture
def client(tmp_path):
    store = fake_store()
    contacts = Contacts(tmp_path / "contacts.json")
    contacts.save({"Alice": "alice@example.org", "Bob": "bob@example.org"})
    app = FastAPI()
    app.include_router(make_router(lambda: store, contacts))
    return TestClient(app), store, contacts


def test_findings_grouping_pagination_and_safe_fields(client):
    api, store, _ = client
    response = api.post("/api/legal/send-issues/findings", json={"pageSize": 2}).json()
    assert response["total"] == 5
    assert response["lawyers"] == ["Alice", "Bob", "No Issues"]
    assert len(response["rows"]) == 2
    assert "phone" not in response["rows"][0]
    assert response["rows"][0]["affectedFields"] == ["Contact Number"]
    rows = api.post("/api/legal/send-issues/findings", json={"lawyer": "Unassigned"}).json()["rows"]
    assert {row.get("caseId") or row.get("hotlineId") for row in rows} == {"B3", "H1"}
    assert api.post("/api/legal/send-issues/findings", json={"lawyer": "Alice", "filters": {"dataset": "legalhotlines"}}).json()["total"] == 1
    assert any(kwargs.get("exact_matches_only") for _, kwargs in store.calls)


def test_contacts_persist_validate_and_reject_unknown(client):
    api, _, contacts = client
    assert api.put("/api/legal/send-issues/contacts", json={"contacts": {"Alice": "new@example.org"}}).status_code == 200
    assert Contacts(contacts.path).read()["Alice"] == "new@example.org"
    assert api.put("/api/legal/send-issues/contacts", json={"contacts": {"Alice": "x\r\nBcc: evil@example.org"}}).status_code == 400
    assert api.put("/api/legal/send-issues/contacts", json={"contacts": {"Unknown": "new@example.org"}}).status_code == 400
    assert Contacts(contacts.path).read()["Bob"] == "bob@example.org"


def test_csv_and_excel_import_matching_preview(client):
    api, store, contacts = client
    store.frames["beneficiaries"] = pd.DataFrame({"Lawyers": ["Alice", "Bob", " BOB ", "No Issues"]})
    source = b"Person,Email\n ALICE ,alice@example.org\nBob,bob@example.org\nUnknown,u@example.org\nAlice,wrong\n"
    url = "/api/legal/send-issues/contacts/preview"
    headers = api.post(url, files={"file": ("contacts.csv", source)}).json()
    assert headers["columns"] == ["Person", "Email"]
    response = api.post(url, data={"nameColumn": "Person", "emailColumn": "Email"}, files={"file": ("contacts.csv", source)}).json()
    # Trimmed names remain ambiguous when distinct source labels normalize equally.
    assert [row["status"] for row in response["rows"]] == ["Matched", "Ambiguous name", "Unmatched name", "Invalid email"]
    assert response["rows"][0]["lawyer"] == "Alice"
    assert contacts.read()["Alice"] == "alice@example.org"
    workbook = Workbook(); workbook.active.append(["Name", "Email"]);workbook.active.append(["Bob", "updated@example.org"])
    buffer = io.BytesIO(); workbook.save(buffer)
    result = api.post(url, data={"nameColumn": "Name", "emailColumn": "Email"}, files={"file": ("contacts.xlsx", buffer.getvalue())})
    assert result.status_code == 200 and result.json()["rows"][0]["email"] == "updated@example.org"
    assert api.post(url, files={"file": ("contacts.exe", source)}).status_code == 400


def test_draft_lawyer_isolation_assignments_and_stale_revision(client):
    api, store, _ = client
    rows = api.post("/api/legal/send-issues/findings", json={}).json()["rows"]
    alice = next(row for row in rows if row["caseId"] == "B1")
    bob = next(row for row in rows if row["caseId"] == "B2")
    unassigned = next(row for row in rows if row["caseId"] == "B3")
    request = {"revision": "r1", "lawyer": "Alice", "ids": [alice["id"]]}
    result = api.post("/api/legal/send-issues/draft", json=request)
    assert result.status_code == 200
    message = BytesParser(policy=policy.default).parsebytes(result.content)
    assert message["To"] == "alice@example.org" and message["X-Unsent"] == "1"
    body = message.get_body(preferencelist=("html",)).get_content()
    assert "B1" in body and "B2" not in body and "SECRET" not in body
    assert "<script>" not in body and "&lt;script&gt;" in body
    assert 'dir="auto"' in body and "Finding detail (Arabic)" in body
    assert "<table" in body
    assert "<th" in body
    assert api.post("/api/legal/send-issues/draft", json={**request, "ids": [bob["id"]], "assignments": {bob["id"]: "Alice"}}).status_code == 400
    assert api.post("/api/legal/send-issues/draft", json={**request, "ids": [unassigned["id"]]}).status_code == 400
    assert api.post("/api/legal/send-issues/draft", json={**request, "ids": [unassigned["id"]], "assignments": {unassigned["id"]: "Alice"}}).status_code == 200
    assert api.post("/api/legal/send-issues/draft", json={**request, "subject": "Review\r\nBcc: evil@example.org"}).status_code == 400
    store.revision = "r2"
    assert api.post("/api/legal/send-issues/draft", json=request).status_code == 409


def test_render_deadline_and_plain_alternative():
    _, rows = collect_findings(fake_store())
    request = DraftRequest(revision="r1", lawyer="Alice", ids=[rows[0]["id"]], deadline="2026-10-15", signature="Manager")
    body, plain, eml = render_draft(request, "alice@example.org", [rows[0]])
    assert "2026-10-15" in body and "2026-10-15" in plain
    message = BytesParser(policy=policy.default).parsebytes(eml)
    assert message.get_body(preferencelist=("plain",)).get_content().replace("\r\n", "\n").strip() == plain.strip()
    request.deadline = ""
    assert "Correction deadline" not in render_draft(request, "alice@example.org", [rows[0]])[0]
    request.deadline = "2026-99-99"
    with pytest.raises(ValueError, match="deadline"):
        render_draft(request, "alice@example.org", [rows[0]])


def test_duplicate_record_shared_by_lawyers_keeps_distinct_recipient_findings(client):
    api, store, _ = client
    store.flags.append({**store.flags[0], "lawyer": "Bob", "row": 4})
    rows = api.post("/api/legal/send-issues/findings", json={}).json()["rows"]
    shared = [row for row in rows if row["caseId"] == "B1"]
    assert len(shared) == 2 and len({row["id"] for row in shared}) == 2
    bob = next(row for row in shared if row["lawyer"] == "Bob")
    request = {"revision": "r1", "lawyer": "Alice", "ids": [bob["id"]]}
    assert api.post("/api/legal/send-issues/draft", json=request).status_code == 400


def test_actual_review_exclusions_and_bilingual_coverage():
    from backend.legal_platform import LegalStore, REGISTERED_RULES, REVIEW_FINDING_ARABIC
    from backend.test_legal_platform import required_payload
    store = LegalStore.from_files(required_payload(), "test")
    _, rows = collect_findings(store)
    excluded = next(row for row in rows if row["dataset"] == "beneficiaries" and row["rule"] == "Invalid contact number")
    store.set_review_exclusions([{"dataset": "beneficiaries", "rule": "Invalid contact number", "identifierType": "caseId", "identifierValue": excluded["caseId"]}])
    assert excluded["id"] not in {row["id"] for row in collect_findings(store)[1]}
    assert all(rule in REVIEW_FINDING_ARABIC for rules in REGISTERED_RULES.values() for rule in rules)


@pytest.mark.parametrize('dataset,rule,identifier_type', [
    ('beneficiaries', 'Invalid contact number', 'caseId'),
    ('assessments', 'Assessment without services', 'assessmentId'),
    ('legalservices', 'Legal service date after today', 'serviceId'),
    ('awareness', 'Invalid contact number', 'awarenessId'),
    ('legalhotlines', 'Invalid contact number', 'hotlineId'),
])
@pytest.mark.parametrize('mode', ['single', 'bulk', 'import'])
def test_send_issues_snapshot_tracks_review_exclusion_and_restoration(dataset, rule, identifier_type, mode, tmp_path, monkeypatch):
    from backend import main
    from backend.duplicate_exclusions import DuplicateExclusionRegistry
    from backend.legal_platform import LegalStore
    from backend.test_legal_platform import required_payload, csv
    payload = required_payload()
    payload['legalservices'] = csv(**{'Service ID': ['S1'], 'Assessment ID': ['A2'], 'Beneficiary ID': ['B1'],
                                      'Date of Service Provision': ['01/01/2099'], 'Lawyers': ['Alice']})
    payload['awareness'] = csv(**{'Awareness ID': ['W1'], 'Participant Name': ['Participant'], 'Phone Number': ['123'], 'Lawyers': ['Alice']})
    payload['legalhotlines'] = csv(**{'Hotline ID': ['H1'], 'Contact Number': ['123'], 'Refer to Lawyer': ['Alice']})
    store = LegalStore.from_files(payload, 'exclusion tests')
    monkeypatch.setattr(main, 'legal_store', store)
    monkeypatch.setattr(main, 'duplicate_exclusions', DuplicateExclusionRegistry(tmp_path / 'exclusions.json'))
    registry = Contacts(tmp_path / 'contacts.json')
    app = FastAPI(); app.include_router(make_router(lambda: store, registry))
    app.add_api_route('/exclusions', main.create_duplicate_exclusion, methods=['POST'])
    app.add_api_route('/exclusions/bulk', main.create_duplicate_exclusions_bulk, methods=['POST'])
    app.add_api_route('/exclusions/import', main.import_duplicate_exclusions, methods=['POST'])
    app.add_api_route('/exclusions/{case_id}', main.restore_duplicate_exclusion, methods=['DELETE'])
    api = TestClient(app)
    original = api.post('/api/legal/send-issues/findings', json={}).json()
    target = next(row for row in original['rows'] if row['dataset'] == dataset and row['rule'] == rule)
    entry = {'dataset': dataset, 'rule': rule, 'identifierType': identifier_type, 'identifierValue': target[identifier_type]}
    unaffected = {(row['dataset'], row['rule'], row[identifier_type]) for row in original['rows']
                  if row['dataset'] == dataset and row[identifier_type] == target[identifier_type] and row['rule'] != rule}
    if mode == 'single':
        response = api.post('/exclusions', json=entry)
    elif mode == 'bulk':
        response = api.post('/exclusions/bulk', json={'records': [entry]})
    else:
        column = {'caseId': 'Case ID', 'assessmentId': 'Assessment ID', 'serviceId': 'Service ID', 'awarenessId': 'Awareness ID', 'hotlineId': 'Hotline ID'}[identifier_type]
        response = api.post('/exclusions/import', data={'dataset': dataset, 'identifier_type': identifier_type, 'rules': rule},
                            files={'file': ('exclusions.csv', csv(**{column: [target[identifier_type]]}), 'text/csv')})
    assert response.status_code == 200, response.text
    excluded = api.post('/api/legal/send-issues/findings', json={}).json()
    assert excluded['revision'] != original['revision']
    assert excluded['total'] == len(excluded['rows']) < original['total']
    assert not any(row['dataset'] == dataset and row['rule'] == rule and row[identifier_type] == target[identifier_type] for row in excluded['rows'])
    remaining = {(row['dataset'], row['rule'], row[identifier_type]) for row in excluded['rows'] if row['dataset'] == dataset}
    assert unaffected <= remaining
    assert not any(row[identifier_type] == target[identifier_type] for row in store.review(dataset, rule=rule)['rows'])
    response = api.delete('/exclusions/' + target[identifier_type], params={'rule': rule, 'dataset': dataset, 'identifier_type': identifier_type})
    assert response.status_code == 200, response.text
    restored = api.post('/api/legal/send-issues/findings', json={}).json()
    assert restored['total'] == original['total']
    assert target['id'] in {row['id'] for row in restored['rows']}


def test_send_issues_includes_duplicates_returned_by_reviews_for_rechecking():
    store = duplicate_store()
    store.set_review_exclusions([{'dataset': 'beneficiaries', 'rule': 'Possible duplicate name',
                                 'identifierType': 'caseId', 'identifierValue': 'D2', 'pendingRecheck': True}])
    assert any(row['caseId'] == 'D2' for row in store.review('beneficiaries', rule='Possible duplicate name')['rows'])
    rows = collect_findings(store)[1]
    assert any(row['caseId'] == 'D2' and row['rule'] == 'Possible duplicate name' for row in rows)
    assert any(peer['caseId'] == 'D2' for row in rows for peer in row.get('duplicateMatches', []))

def test_whatsapp_contacts_persist_and_validate(client):
    api, _, contacts = client
    payload = {"contacts": {}, "whatsappNumbers": {"Alice": "+964 770 123 4567"}}
    assert api.put("/api/legal/send-issues/contacts", json=payload).status_code == 200
    assert Contacts(contacts.path).read_whatsapp()["Alice"] == "9647701234567"
    assert api.post("/api/legal/send-issues/findings", json={}).json()["whatsappNumbers"]["Alice"] == "9647701234567"
    assert api.put("/api/legal/send-issues/contacts", json={"contacts": {"Alice": "new@example.org"}}).status_code == 200
    assert contacts.read_whatsapp()["Alice"] == "9647701234567"
    for local in ["0770 123 4567", "7701234567"]:
        assert api.put("/api/legal/send-issues/contacts", json={"contacts": {}, "whatsappNumbers": {"Alice": local}}).status_code == 200
        assert Contacts(contacts.path).read_whatsapp()["Alice"] == "9647701234567"
    for numbers in [{"Alice": "0770123"}, {"Unknown": "+9647701234567"}]:
        assert api.put("/api/legal/send-issues/contacts", json={"contacts": {}, "whatsappNumbers": numbers}).status_code == 400
    assert api.put("/api/legal/send-issues/contacts", json={"contacts": {}, "whatsappNumbers": {"Alice": ""}}).status_code == 200
    assert contacts.read_whatsapp()["Alice"] == ""

def duplicate_store():
    from backend.test_legal_platform import required_payload, csv
    from backend.legal_platform import LegalStore
    payload = required_payload()
    payload['beneficiaries'] = csv(**{'Case ID':['D1','D2','D3','D4'], 'Name (Filter Color Red)':['abcdefghijklmnop','abcdefghijklmnop','abcdefghijklmnoq','Other Person'], 'Projects':['UNHCR 2026 - Erbil']*4, 'Lawyers':['Alice','Bob','Carol','Alice'], 'Contact Number':['07701234567']*4, 'ID Number':['I1','I2','I3','I4']})
    return LegalStore.from_files(payload,'test')


def test_send_duplicates_exact_similar_cross_lawyer_and_independent_contact():
    _, rows = collect_findings(duplicate_store())
    names = [row for row in rows if row['rule']=='Possible duplicate name']
    assert {row['caseId'] for row in names}=={'D1','D2','D3'}
    first=next(row for row in names if row['caseId']=='D1')
    assert {(peer['caseId'],peer['lawyer'],peer['matchType']) for peer in first['duplicateMatches']}=={('D2','Bob','exact'),('D3','Carol','similar')}
    contacts=[row for row in rows if row['rule']=='Possible duplicate contact and name']
    assert {row['caseId'] for row in contacts}=={'D1','D2','D3'}
    assert len({row['id'] for row in rows})==len(rows)
    request=DraftRequest(revision='r',lawyer='Alice',ids=[first['id']])
    body,plain,_=render_draft(request,'alice@example.org',[first])
    assert 'D2 - Bob (exact)' in body and 'D3 - Carol (similar)' in plain
    malicious={**first,'matchingCases':'<script>peer</script>'}
    assert '<script>peer</script>' not in render_draft(request,'alice@example.org',[malicious])[0]


def test_send_exclusions_remove_peers_respect_rule_scope_and_restore():
    store=duplicate_store()
    store.set_review_exclusions([('Possible duplicate name','D2')])
    _,rows=collect_findings(store)
    names=[row for row in rows if row['rule']=='Possible duplicate name']
    assert {row['caseId'] for row in names}=={'D1','D3'}
    assert all(peer['caseId']!='D2' for row in names for peer in row['duplicateMatches'])
    assert any(row['caseId']=='D2' and row['rule']=='Possible duplicate contact and name' for row in rows)
    store.set_review_exclusions([('Possible duplicate name','D2'),('Possible duplicate name','D3')])
    assert not any(row['rule']=='Possible duplicate name' for row in collect_findings(store)[1])
    store.set_review_exclusions([])
    assert len([row for row in collect_findings(store)[1] if row['rule']=='Possible duplicate name'])==3


def test_send_closure_categories_and_assessment_exclusion():
    from backend.test_legal_platform import required_payload,csv
    from backend.legal_platform import LegalStore
    payload=required_payload()
    payload['assessments']=csv(**{'Assessment ID':['A1','A2','A3'],'Beneficiary ID':['B1']*3,'Assessment Status':['Open']*3,'Request for Closed Status':['Yes','No',''],'Lawyers':['Alice']*3})
    payload['legalservices']=csv(**{'Service ID':['S1','S2','S3'],'Assessment ID':['A1','A2','A3'],'Beneficiary ID':['B1']*3,'Service Status':['Closed']*3})
    store=LegalStore.from_files(payload,'test')
    closure=[row for row in collect_findings(store)[1] if row['rule'].startswith('Open assessment with all services closed')]
    assert len(closure)==3
    assert next(row for row in closure if row['assessmentId']=='A1')['rule'].endswith('(Closure requested by lawyer)')
    assert all(row['rule'].endswith('(Closure not requested by lawyer)') for row in closure if row['assessmentId']!='A1')
    assert all(row['linkedServiceCount']==1 and row['linkedServiceStatuses'] for row in closure)
    store.set_review_exclusions([{'dataset':'assessments','rule':'Open assessment with all services closed','identifierType':'assessmentId','identifierValue':'A1'}])
    assert not any(row['assessmentId']=='A1' and row['rule'].startswith('Open assessment with all services closed') for row in collect_findings(store)[1])


def test_stale_preview_and_download_rejected_after_exclusion(tmp_path):
    store=duplicate_store();registry=Contacts(tmp_path/'contacts.json');registry.save({'Alice':'alice@example.org'})
    app=FastAPI();app.include_router(make_router(lambda:store,registry));api=TestClient(app)
    snapshot=api.post('/api/legal/send-issues/findings',json={}).json()
    selected=next(row for row in snapshot['rows'] if row['caseId']=='D1' and row['rule']=='Possible duplicate name')
    request={'revision':snapshot['revision'],'lawyer':'Alice','ids':[selected['id']]}
    assert api.post('/api/legal/send-issues/preview',json=request).status_code==200
    store.set_review_exclusions([('Possible duplicate name','D1')])
    for endpoint in ['preview','draft']:
        assert api.post('/api/legal/send-issues/'+endpoint,json=request).status_code==409
    latest=api.post('/api/legal/send-issues/findings',json={}).json()
    assert latest['revision']!=snapshot['revision']
    assert selected['id'] not in {row['id'] for row in latest['rows']}

def test_send_similar_matches_include_only_direct_peers():
    from backend.test_legal_platform import required_payload,csv
    from backend.legal_platform import LegalStore
    payload=required_payload()
    payload['beneficiaries']=csv(**{'Case ID':['X1','X2','X3'],'Name (Filter Color Red)':['abcdefghijklmno','abxdefghijklmno','abxdyfghijklmno'],'Projects':['UNHCR 2026 - Erbil']*3,'Lawyers':['Alice','Bob','']})
    store=LegalStore.from_files(payload,'test')
    names=[row for row in collect_findings(store)[1] if row['rule']=='Possible duplicate name']
    assert {peer['caseId'] for peer in next(row for row in names if row['caseId']=='X1')['duplicateMatches']}=={'X2'}
    middle=next(row for row in names if row['caseId']=='X2')
    assert {(peer['caseId'],peer['lawyer']) for peer in middle['duplicateMatches']}=={('X1','Alice'),('X3','Unassigned')}

@pytest.mark.parametrize('language',['en','ar','bilingual'])
def test_message_language_preview_download_and_translated_details(client,language):
    api,store,_=client
    store.flags[0]['detail']='7 digits'
    rows=api.post('/api/legal/send-issues/findings',json={}).json()['rows']
    row=next(row for row in rows if row['caseId']=='B1')
    assert row['detailArabic']
    request={'revision':'r1','lawyer':'Alice','ids':[row['id']],'language':language,'signature':'Sender name\nOfficer','deadline':'2026-10-15'}
    preview=api.post('/api/legal/send-issues/preview',json=request).json()
    downloaded=api.post('/api/legal/send-issues/draft',json=request)
    assert downloaded.status_code==200
    parsed=BytesParser(policy=policy.default).parsebytes(downloaded.content)
    assert parsed.get_body(preferencelist=('html',)).get_content().replace('\r\n','\n').strip()==preview['html'].strip()
    assert parsed.get_body(preferencelist=('plain',)).get_content().replace('\r\n','\n').strip()==preview['text'].strip()
    assert '2026-10-15' in preview['text']
    assert 'Sender name' not in preview['text'] and 'Sender name' not in preview['html']
    assert 'Required action' not in preview['text'] and 'Correct the record' not in preview['text']
    assert 'Dear Alice' in preview['text']
    assert 'Please review the following' not in preview['text']
    assert 'الأستاذ/ة' not in preview['text']
    assert 'رقم الحالة' not in preview['text']
    assert row['detailArabic'] in preview['text']
    assert 'dir="auto"' in preview['html']


def test_message_language_validation_and_original_fallback(client):
    api,_,_=client
    row=api.post('/api/legal/send-issues/findings',json={}).json()['rows'][0]
    request={'revision':'r1','lawyer':'Alice','ids':[row['id']]}
    assert api.post('/api/legal/send-issues/preview',json={**request,'language':'invalid'}).status_code==422
    preview = api.post('/api/legal/send-issues/preview',json={**request,'language':'ar'}).json()
    assert row['detail'] in preview['text']
    assert 'translation unavailable' not in preview['text'] and 'Original detail' not in preview['text']


def test_detail_translation_preserves_numbers_and_unknown_text():
    from backend.issue_message_details import arabic_detail
    assert '12' in arabic_detail('Open assessment has 12 linked service(s), all with a closed or completed status')
    assert '2026-10' in arabic_detail('Selected month 2026-10; 3 earlier assessment(s), from 01/01/2026 to 01/09/2026; created on 02/10/2026')
    assert arabic_detail('Custom text from source')==''
    assert '2' in arabic_detail('Name and session topic occur 2 times')
    assert '3' in arabic_detail('Name occurs 3 times across different sessions')

def test_supplied_contact_defaults_and_saved_overrides(tmp_path,monkeypatch):
    from backend.lawyer_contact_defaults import DEFAULT_LAWYER_CONTACTS
    monkeypatch.setenv('LOCALAPPDATA',str(tmp_path))
    registry=Contacts()
    assert len(DEFAULT_LAWYER_CONTACTS)==49
    assert all(valid_email(email) for email in DEFAULT_LAWYER_CONTACTS.values())
    assert registry.for_lawyers(['Yousif Mahmood Salman'])['Yousif Mahmood Salman']=='lawyer8.bgd.iraq@intersos.org'
    assert registry.for_lawyers(['  yousif   mahmood salman '])['  yousif   mahmood salman ']=='lawyer8.bgd.iraq@intersos.org'
    assert registry.for_lawyers(['Yousif Mahmood Salmaan'])=={}
    assert registry.read_whatsapp()=={}
    registry.save({'Yousif Mahmood Salman':'updated@example.org'})
    assert Contacts().for_lawyers(['Yousif Mahmood Salman'])['Yousif Mahmood Salman']=='updated@example.org'
    registry.save({'Yousif Mahmood Salman':''})
    assert Contacts().for_lawyers(['Yousif Mahmood Salman'])['Yousif Mahmood Salman']==''


def test_email_tables_group_columns_complete_contents_and_mime():
    rows = [dict(reviewPage="Beneficiaries Review",rule="Possible duplicate name",ruleArabic="Duplicate",caseId="C1",assessmentId="A1",serviceId="",detail="Detail <tag> & full prose",detailArabic="Arabic detail",action="Verify all records",matchingCases="C2 - Bob (similar)",row=1),dict(reviewPage="Beneficiaries Review",rule="Possible duplicate name",ruleArabic="Duplicate",caseId="C3",assessmentId="",detail="Second detail",action="Coordinate corrections",matchingCases="C4 - Unassigned",row=2),dict(reviewPage="Assessments Review",rule="Open assessment with all services closed (Closure not requested by lawyer)",ruleArabic="Closure",assessmentId="A9",assessmentStatus="Open",requestForClosedStatus="",linkedServiceCount=0,linkedServiceStatuses="Closed",detail="Closure detail",action="Verify closure",row=3)]
    request=DraftRequest(revision="r1",lawyer="Alice",ids=["1","2","3"],deadline="2026-10-15",signature="Sender")
    body,plain,eml=render_draft(request,"alice@example.org",rows)
    assert body.count("<table")==2
    assert body.count("<tbody>")==2
    assert 'background:#f5f8fc' in body
    assert 'Service ID /' not in body
    assert 'Hotline ID /' not in body
    assert 'Detail &lt;tag&gt; &amp; full prose' in body
    for value in ["C1","A1","C3","Second detail","C2 - Bob (similar)","C4 - Unassigned","A9","Open","Closed","2026-10-15"]:
        assert value in body and value in plain
    assert 'Required action' not in body and 'Required action' not in plain
    assert 'Sender' not in body and 'Sender' not in plain
    assert 'Verify closure' not in plain and 'Verify closure' not in body
    assert 'Linked services' in body and ': 0' in body
    parsed=BytesParser(policy=policy.default).parsebytes(eml)
    assert parsed.get_body(preferencelist=("html",)).get_content().replace("\r\n","\n").strip()==body.strip()
    assert parsed.get_body(preferencelist=("plain",)).get_content().replace("\r\n","\n").strip()==plain.strip()


def test_email_tables_preserve_reference_fallback_when_peer_has_identifiers():
    rows=[dict(reviewPage="Services",rule="Missing date",ruleArabic="Date",caseId="C1",detail="First",action="Correct",row=1),dict(reviewPage="Services",rule="Missing date",ruleArabic="Date",recordId="R2",detail="Second",action="Correct",row=2)]
    body,plain,_=render_draft(DraftRequest(revision="r1",lawyer="Alice",ids=["1","2"],language="en"),"alice@example.org",rows)
    assert 'Record' in body and 'R2' in body and 'R2' in plain


def test_email_tables_exclude_review_findings_and_matching_peers(tmp_path):
    store=duplicate_store()
    store.set_review_exclusions([('Possible duplicate name','D2')])
    registry=Contacts(tmp_path/'contacts.json');registry.save({'Alice':'alice@example.org'})
    app=FastAPI();app.include_router(make_router(lambda:store,registry));api=TestClient(app)
    snapshot=api.post('/api/legal/send-issues/findings',json={}).json()
    eligible=[row for row in snapshot['rows'] if row['lawyer']=='Alice' and row['rule']=='Possible duplicate name']
    assert eligible
    request={'revision':snapshot['revision'],'lawyer':'Alice','ids':[row['id'] for row in eligible]}
    preview=api.post('/api/legal/send-issues/preview',json=request)
    assert preview.status_code==200
    assert '<table' in preview.json()['html']
    for content in [preview.json()['html'],preview.json()['text']]:
        assert 'D2' not in content
        assert 'D1' in content
    draft=api.post('/api/legal/send-issues/draft',json=request)
    assert draft.status_code==200
    parsed=BytesParser(policy=policy.default).parsebytes(draft.content)
    for kind in ['html','plain']:
        assert 'D2' not in parsed.get_body(preferencelist=(kind,)).get_content()
    store.set_review_exclusions([])
    restored=api.post('/api/legal/send-issues/findings',json={}).json()
    row=next(row for row in restored['rows'] if row['caseId']=='D1' and row['rule']=='Possible duplicate name')
    restored_preview=api.post('/api/legal/send-issues/preview',json={'revision':restored['revision'],'lawyer':'Alice','ids':[row['id']]})
    assert restored_preview.status_code==200
    assert 'D2' in restored_preview.json()['html']
