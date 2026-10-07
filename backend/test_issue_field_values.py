from email import policy
from email.parser import BytesParser

import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.issue_field_values import IssueFieldValues
from backend.legal_platform import LegalStore
from backend.send_issues import Contacts, DraftRequest, make_router, render_draft
from backend.test_legal_platform import csv


def test_source_aliases_dates_missing_values_zero_and_leading_zero_identifiers():
    resolver = IssueFieldValues({
        'beneficiaries': pd.DataFrame({'Case ID': ['0001'], 'Age': [0], 'DoB تاريخ الميلاد': [pd.Timestamp('2026-01-02')]}),
        'assessments': pd.DataFrame({'Assessment ID': ['0002'], '# Total Services': [0]}),
        'legalservices': pd.DataFrame({'Type of Document': [None], 'Date of Service Provision': [pd.Timestamp('2026-02-03')]}),
        'awareness': pd.DataFrame({'Participant Name اسم المشارك': ['أحمد'], 'Topic الموضوع': ['Documentation'], 'Phone Number': ['0123']}),
        'legalhotlines': pd.DataFrame({'اسم الشخص المعتقل': ['علي'], 'اسم المتصل': ['Ali'], 'Contact Number': ['07501234567']}),
    })
    assert resolver.values({'dataset': 'beneficiaries', 'row': 2}, ['Case ID', 'Age', 'Date of Birth', 'Missing']) == {
        'Case ID': '0001', 'Age': '0', 'Date of Birth': '02/01/2026', 'Missing': ''}
    assert resolver.values({'dataset': 'assessments', 'row': 2}, ['Assessment ID', '# Total Services']) == {'Assessment ID': '0002', '# Total Services': '0'}
    assert resolver.values({'dataset': 'legalservices', 'row': 2}, ['Type of Document', 'Date of Service Provision']) == {'Type of Document': '', 'Date of Service Provision': '03/02/2026'}
    assert resolver.values({'dataset': 'awareness', 'row': 2}, ['Participant Name', 'Session Topic', 'Contact Number']) == {
        'Participant Name': 'أحمد', 'Session Topic': 'Documentation', 'Contact Number': '0123'}
    assert resolver.values({'dataset': 'legalhotlines', 'row': 2}, ['Name of the detained person', 'Name of the caller', 'Contact Number']) == {
        'Name of the detained person': 'علي', 'Name of the caller': 'Ali', 'Contact Number': '07501234567'}


def test_linked_comparisons_use_assessment_id_without_other_beneficiary_services():
    resolver = IssueFieldValues({
        'beneficiaries': pd.DataFrame({'Case ID': ['B1'], 'DoB': ['01/01/2000']}),
        'assessments': pd.DataFrame({'Assessment ID': ['A1', 'A2'], 'Beneficiary ID': ['B1', 'B1'],
                                   'Type of Legal Service Needed': ['Representation', 'Counselling']}),
        'legalservices': pd.DataFrame({'Assessment ID': ['A1', 'A1', 'A2'], 'Type of Service Provided': ['Counselling', 'Representation', 'Unrelated'],
                                      'Service Status': ['Closed', 'Closed', 'Open']}),
    })
    assert resolver.values({'dataset': 'assessments', 'row': 2, 'assessmentId': 'A1', 'caseId': 'B1'},
                           ['Type of Legal Service Needed', 'Type of Service Provided', 'Service Status', 'Date of Birth']) == {
        'Type of Legal Service Needed': 'Representation', 'Type of Service Provided': 'Counselling; Representation',
        'Service Status': 'Closed', 'Date of Birth': '01/01/2000'}
    assert resolver.values({'dataset': 'legalservices', 'row': 2, 'assessmentId': 'A1'}, ['Type of Legal Service Needed']) == {
        'Type of Legal Service Needed': 'Representation'}
    assert resolver.values({'dataset': 'assessments', 'row': 2, 'assessmentId': 'absent'}, ['Type of Service Provided']) == {'Type of Service Provided': ''}


def test_awareness_preview_and_draft_include_source_values_and_arabic_translation(tmp_path):
    store = LegalStore.from_files({'awareness': csv(**{
        'Awareness ID': ['002830', '002867'], 'Participant Name اسم المشارك': ['أحمد <tag> & Ali'] * 2,
        'Session Topic الموضوع': ['Documentation'] * 2, 'Lawyers': ['Alice'] * 2,
    })}, 'awareness')
    registry = Contacts(tmp_path / 'contacts.json'); registry.save({'Alice': 'alice@example.org'})
    app = FastAPI(); app.include_router(make_router(lambda: store, registry)); api = TestClient(app)
    snapshot = api.post('/api/legal/send-issues/findings', json={}).json()
    rows = [row for row in snapshot['rows'] if row['rule'] == 'Duplicate participant in session']
    assert len(rows) == 2
    assert rows[0]['affectedFieldValues'] == {'Participant Name': 'أحمد <tag> & Ali', 'Session Topic': 'Documentation'}
    request = {'revision': snapshot['revision'], 'lawyer': 'Alice', 'ids': [row['id'] for row in rows]}
    preview = api.post('/api/legal/send-issues/preview', json=request).json()
    for value in ['Participant Name', 'Session Topic', 'Documentation', '002830', '002867', rows[0]['detailArabic']]:
        assert value in preview['html'] and value in preview['text']
    assert 'أحمد &lt;tag&gt; &amp; Ali' in preview['html']
    assert 'translation unavailable' not in preview['html']
    eml = api.post('/api/legal/send-issues/draft', json=request)
    assert eml.status_code == 200
    message = BytesParser(policy=policy.default).parsebytes(eml.content)
    assert message.get_body(preferencelist=('html',)).get_content().replace('\r\n', '\n').strip() == preview['html'].strip()
    assert message.get_body(preferencelist=('plain',)).get_content().replace('\r\n', '\n').strip() == preview['text'].strip()


def test_unknown_translation_uses_original_and_fields_avoid_duplicate_identifiers():
    row = dict(reviewPage='Assessment Review', rule='Custom rule', ruleArabic='', assessmentId='0002', detail='Original <text> قيمة',
               caseId='0001', affectedFields=['Assessment ID', 'Beneficiary ID', 'Age', 'Missing'],
               affectedFieldValues={'Assessment ID': '0002', 'Beneficiary ID': '0001', 'Age': '0', 'Missing': ''})
    body, plain, _ = render_draft(DraftRequest(revision='r1', lawyer='Alice', ids=['1']), 'alice@example.org', [row])
    assert body.count('>Assessment ID</th>') == 1
    assert '>Beneficiary ID</th>' not in body
    assert '>Age</th>' in body and '>Missing</th>' in body
    assert 'Age: 0' in plain and 'Missing: Not available' in plain
    assert 'Original &lt;text&gt; قيمة' in body and 'Original <text> قيمة' in plain
    assert 'translation unavailable' not in body and 'dir="auto"' in body
