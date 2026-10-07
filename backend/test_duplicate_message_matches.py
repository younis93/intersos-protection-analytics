from email import policy
from email.parser import BytesParser

from backend.legal_platform import LegalStore
from backend.send_issues import collect_findings, render_draft, DraftRequest
from backend.test_legal_platform import csv, required_payload


def awareness_store(ids=True):
    columns = {'Participant Name': ['أحمد <tag>'] * 3 + ['Unrelated'], 'Session Topic': ['Documentation'] * 4,
               'Lawyers': ['Alice', 'Bob', 'Alice', 'Other']}
    if ids:
        columns['Awareness ID'] = ['W1', 'W2', 'W1', 'W1']
    return LegalStore.from_files({'awareness': csv(**columns)}, 'awareness')


def test_awareness_lists_all_exact_rows_and_owners_with_repeated_ids():
    store = awareness_store()
    rows = collect_findings(store)[1]
    finding = next(row for row in rows if row['row'] == 2)
    assert {peer['row'] for peer in finding['duplicateMatches']} == {3, 4}
    assert {(peer['awarenessId'], peer['lawyer']) for peer in finding['duplicateMatches']} == {('W2', 'Bob'), ('W1', 'Alice')}
    assert all(peer['name'] == 'أحمد <tag>' and peer['sessionTopic'] == 'Documentation' for peer in finding['duplicateMatches'])
    assert 'Other' not in finding['matchingCases']
    body, plain, eml = render_draft(DraftRequest(revision=store.revision, lawyer='Alice', ids=[finding['id']]), 'alice@example.org', [finding])
    for value in ['Matching records and lawyers', 'Awareness W2 (row 3)', 'Bob', 'Awareness W1 (row 4)', 'Documentation']:
        assert value in body and value in plain
    assert '&lt;tag&gt;' in body and '<tag>' not in body
    message = BytesParser(policy=policy.default).parsebytes(eml)
    assert message['To'] == 'alice@example.org'
    assert message.get_body(preferencelist=('html',)).get_content().replace('\r\n', '\n').strip() == body.strip()


def test_awareness_peer_exclusions_restoration_and_recheck():
    store = awareness_store()
    entry = {'dataset': 'awareness', 'rule': 'Duplicate participant in session', 'identifierType': 'awarenessId', 'identifierValue': 'W2'}
    store.set_review_exclusions([entry])
    rows = collect_findings(store)[1]
    assert all(peer['awarenessId'] != 'W2' for row in rows for peer in row.get('duplicateMatches', []))
    store.set_review_exclusions([{**entry, 'pendingRecheck': True}])
    assert any(peer['awarenessId'] == 'W2' for row in collect_findings(store)[1] for peer in row.get('duplicateMatches', []))
    store.set_review_exclusions([])
    assert any(peer['awarenessId'] == 'W2' for row in collect_findings(store)[1] for peer in row.get('duplicateMatches', []))


def test_missing_awareness_id_and_lawyer_keep_row_reference():
    store = LegalStore.from_files({'awareness': csv(**{'Participant Name': ['Same'] * 2, 'Session Topic': ['Topic'] * 2, 'Lawyers': ['Alice', '']})}, 'missing')
    match = next(row for row in collect_findings(store)[1] if row['row'] == 2)['duplicateMatches'][0]
    assert match['reference'] == 'Row 3' and match['lawyer'] == 'Unassigned'


def test_service_and_assessment_duplicates_have_matching_ids_and_lawyers():
    payload = required_payload()
    payload['assessments'] = csv(**{'Assessment ID': ['A1', 'A2'], 'Beneficiary ID': ['B1'] * 2,
                                  'Date of Assessment': ['01/10/2026', '02/10/2026'], 'Assessment Status': ['Open'] * 2, 'Lawyers': ['Alice', 'Bob']})
    payload['legalservices'] = csv(**{'Service ID': ['S1', 'S2', 'S3'], 'Assessment ID': ['A1'] * 3, 'Beneficiary ID': ['B1'] * 3,
                                    'Type of Service Provided': ['Legal Counselling'] * 3, 'Type of Document': ['ID Card', 'ID Card', 'Passport'],
                                    'Lawyers': ['Alice', 'Bob', 'Other']})
    rows = collect_findings(LegalStore.from_files(payload, 'core'))[1]
    assessment = next(row for row in rows if row['rule'] == 'Beneficiary has multiple assessments' and row['assessmentId'] == 'A1')
    assert [(peer['assessmentId'], peer['lawyer']) for peer in assessment['duplicateMatches']] == [('A2', 'Bob')]
    service = next(row for row in rows if row['rule'] == 'Duplicate service' and row['serviceId'] == 'S1')
    assert [(peer['serviceId'], peer['lawyer']) for peer in service['duplicateMatches']] == [('S2', 'Bob')]


def test_hotline_duplicates_preserve_identity_and_lawyer_referral():
    store = LegalStore.from_files({'legalhotlines': csv(**{'Hotline ID': ['H1', 'H2', 'H3'],
        'Name of the detained person': ['Ahmed Mohammed Hassan'] * 2 + ['Other Person'], 'Refer to Lawyer': ['Alice', 'Bob', 'Other'],
        'Lawyer': ['Alice', 'Bob', 'Other']})}, 'hotline')
    finding = next(row for row in collect_findings(store)[1] if row['hotlineId'] == 'id:H1' and row['rule'] == 'Duplicate detained-person name')
    assert [(peer['hotlineId'], peer['lawyer']) for peer in finding['duplicateMatches']] == [('id:H2', 'Bob')]
    store.set_review_exclusions([{'dataset': 'legalhotlines', 'rule': 'Duplicate detained-person name', 'identifierType': 'hotlineId', 'identifierValue': 'id:H2'}])
    finding = next(row for row in collect_findings(store)[1] if row['hotlineId'] == 'id:H1' and row['rule'] == 'Duplicate detained-person name')
    assert finding['duplicateMatches'] == []


def test_historical_duplicates_list_only_earlier_records_and_dates():
    payload = required_payload()
    payload['assessments'] = csv(**{'Assessment ID': ['A1', 'A2'], 'Beneficiary ID': ['B1'] * 2,
        'Date of Assessment': ['01/07/2026', '01/10/2026'], 'Created On': ['01/07/2026', '05/11/2026'], 'Lawyers': ['Bob', 'Alice']})
    payload['legalservices'] = csv(**{'Service ID': ['S1', 'S2'], 'Assessment ID': ['A1', 'A2'], 'Beneficiary ID': ['B1'] * 2,
        'Date of Service Provision': ['01/07/2026', '01/10/2026'], 'Created On': ['01/07/2026', '05/11/2026'], 'Lawyers': ['Bob', 'Alice']})
    rows = collect_findings(LegalStore.from_files(payload, 'history'))[1]
    for rule, field, identifier in [('Selected month with previous assessment', 'assessmentId', 'A1'), ('Current and previous month duplicate', 'serviceId', 'S1')]:
        finding = next(row for row in rows if row['rule'] == rule)
        assert [(peer[field], peer['lawyer'], peer['date']) for peer in finding['duplicateMatches']] == [(identifier, 'Bob', '01/07/2026')]
