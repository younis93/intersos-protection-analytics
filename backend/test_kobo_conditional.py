import copy
import io

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from backend.kobo import KoboSettings, ProjectStore, analyze, parse_form
from backend.kobo_api import make_router
from backend.kobo_conditional import scan, review, analysis_project, preserve_review, digest
from backend.kobo_data import data_page, data_workbook
from backend.kobo_excel import source_rows
from backend.kobo_excel_source import response_layout, query_config
from backend.kobo_excel_direct import direct_helpers, choice_lookup_rows
from backend.kobo_excel_prepare import helper_values
from backend.kobo_connection_rules import parse_condition, matches_tree, excel_condition
from backend.test_kobo import workbook


@pytest.fixture
def conditional():
    form = parse_form(workbook({
        'survey': [
            ['type', 'name', 'label::English (en)', 'label::العربية (ar)', 'relevant'],
            ['select_one yesno', 'a', 'Question A', 'السؤال أ', ''],
            ['begin_group', 'no', 'No branch', 'فرع لا', "${a} = 'no'"],
            ['select_multiple reasons', 'reason', 'Reason', 'السبب', ''],
            ['text', 'other', 'Other details', 'تفاصيل أخرى', "selected(${reason}, 'other')"],
            ['integer', 'amount', 'Amount', 'العدد', ''],
            ['end_group', '', '', '', ''],
            ['begin_repeat', 'visits', 'Visits', 'الزيارات', ''],
            ['text', 'detail', 'Visit detail', 'تفاصيل الزيارة', "${a} = 'no'"],
            ['end_repeat', '', '', '', ''],
        ],
        'choices': [['list_name', 'name', 'label'], ['yesno', 'yes', 'Yes'], ['yesno', 'no', 'No'], ['reasons', 'other', 'Other'], ['reasons', 'cost', 'Cost']],
    }))
    records = [
        {'id': 'r1', 'row': 2, 'scope': '', 'parent': '', 'sourceIdentity': 'uuid-1', 'values': {'a': 'yes', 'no/reason': ['other'], 'no/other': 'Transport costs', 'no/amount': 0}},
        {'id': 'r2', 'row': 3, 'scope': '', 'parent': '', 'sourceIdentity': 'uuid-2', 'values': {'a': 'no', 'no/reason': ['other'], 'no/other': 'Valid answer', 'no/amount': 7}},
        {'id': 'r3', 'row': 4, 'scope': '', 'parent': '', 'sourceIdentity': 'uuid-3', 'values': {'a': 'yes', 'no/reason': [], 'no/other': '  ', 'no/amount': None}},
        {'id': 'v1', 'row': 2, 'scope': 'visits', 'parent': 'r1', 'sourceIdentity': 'visit-1', 'values': {'visits/detail': 'Leftover repeat answer'}},
    ]
    return {'form': form, 'records': records, 'warnings': [], 'issues': []}


@pytest.fixture
def conditional_api(conditional, tmp_path):
    store = ProjectStore(tmp_path / 'conditional.sqlite3')
    saved = store.create('Conditional review', conditional, b'form', b'data')
    settings = KoboSettings(language='en', hideEmpty=True, hideBlanks=False, hideZero=False)
    store.save(saved['id'], settings)
    app = FastAPI(); app.include_router(make_router(store))
    return TestClient(app), store, saved['id'], settings


def act(client, pid, settings, action, question='no/other', *, status='open'):
    url = f'/api/kobo/projects/{pid}/conditional-review'
    result = client.post(url, json={'settings': settings.model_dump(), 'question': question, 'status': status}).json()
    response = client.post(url+'/actions', json={'revision': result['revision'], 'settings': settings.model_dump(), 'action': action,
        'items': [{'record': row['record'], 'question': row['question'], 'fingerprint': row['fingerprint']} for row in result['rows']]})
    assert response.status_code == 200, response.text
    return result, response.json()


def test_conflicts_text_multiselect_zero_inherited_and_repeat(conditional):
    before = copy.deepcopy(conditional)
    result = scan(conditional, KoboSettings(language='en'))
    assert {row['question'] for row in result['rows']} == {'no/reason', 'no/other', 'no/amount', 'visits/detail'}
    assert all(row['status'] == 'open' and row['outcome'] == 'conflict' for row in result['rows'])
    text = next(row for row in result['rows'] if row['question'] == 'no/other')
    assert 'Question A' in text['condition'] and 'Reason' in text['condition']
    assert text['answer'] == 'Transport costs' and text['controls'][0]['answer'] == 'Yes'
    assert next(row for row in result['rows'] if row['question'] == 'no/amount')['value'] == 0
    assert next(row for row in result['rows'] if row['question'] == 'visits/detail')['controls'][0]['record'] == 'r1'
    assert conditional == before
    # A fully condition-filtered pivot still appears so its warnings can be opened.
    snapshot = analyze(conditional, KoboSettings(language='en'))
    assert next(q for q in snapshot['questions'] if q['id'] == 'visits/detail')['conditionalWarnings']['open'] == 1


def test_manual_override_hidden_questions_and_filters(conditional):
    settings = KoboSettings(language='en', hidden=['no/other'], questions={'no/other': {'connectionSource': 'manual', 'connectionRules': {'type': 'rule', 'field': 'a', 'operator': 'eq', 'value': 'yes'}}})
    result = scan(conditional, settings)
    rows = [row for row in result['rows'] if row['question'] == 'no/other' and row['outcome'] == 'conflict']
    assert len(rows) == 1 and rows[0]['record'] == 'r2' and rows[0]['source'] == 'manual'
    filtered = review(conditional, settings.model_copy(update={'filters': []}), search='Transport')
    assert filtered['matched'] == 0
    filtered = review(conditional, KoboSettings(filters=[{'field': 'a', 'values': ['no']}]))
    assert filtered['matched'] == 0
    page1 = review(conditional, KoboSettings(), page_size=2)
    page2 = review(conditional, KoboSettings(), page=2, page_size=2)
    assert len(page1['rows']) == len(page2['rows']) == 2 and page1['rows'][0]['id'] != page2['rows'][0]['id']


@pytest.mark.parametrize('expression', ["regex(${a}, 'no')", "${unknown} = 'no'", "${other} = 'x'"])
def test_unsupported_missing_and_self_reference_are_uncheckable(conditional, expression):
    conditional['form']['questions'][2]['relevant'] = expression
    result = scan(conditional, KoboSettings())
    rows = [row for row in result['rows'] if row['question'] == 'no/other']
    assert len(rows) == 2 and all(row['outcome'] == 'uncheckable' for row in rows)


def test_bad_parent_links_and_invalid_control_values(conditional):
    conditional['records'][-1]['parent'] = 'v1'
    conditional['records'][0]['values']['a'] = 'bad-code'
    result = scan(conditional, KoboSettings())
    assert next(row for row in result['rows'] if row['question'] == 'visits/detail')['outcome'] == 'uncheckable'
    assert next(row for row in result['rows'] if row['question'] == 'no/other')['outcome'] == 'uncheckable'
    # Filtering a corrupt repeat chain must terminate.
    result = review(conditional, KoboSettings(filters=[{'field': 'a', 'values': ['no']}]))
    assert result['matched'] == 0


def test_decisions_persist_ignore_keeps_calculations_stale_request_rejected(conditional_api):
    client, store, pid, settings = conditional_api
    before = analyze(store.get(pid), settings)
    result, saved = act(client, pid, settings, 'ignore')
    after = analyze(store.get(pid), settings)
    assert next(q for q in before['questions'] if q['id'] == 'no/other')['rows'] == next(q for q in after['questions'] if q['id'] == 'no/other')['rows']
    reviewed = review(store.get(pid), settings, status='ignored')
    assert reviewed['counts']['ignored'] == 1
    assert store.get(pid, raw=True)['conditionalReview']['decisions']
    row = result['rows'][0]
    response = client.post(f'/api/kobo/projects/{pid}/conditional-review/actions', json={'settings': settings.model_dump(), 'revision': result['revision'], 'action': 'exclude', 'items': [{key: row[key] for key in ['record','question','fingerprint']}]})
    assert response.status_code == 409
    act(client, pid, settings, 'reopen', status='ignored')
    assert review(store.get(pid), settings)['counts'].get('ignored', 0) == 0
    assert store.sources(pid) == (b'form', b'data')


def test_exclusion_is_cell_scoped_raw_table_preserved_and_exports_agree(conditional_api):
    client, store, pid, settings = conditional_api
    act(client, pid, settings, 'exclude', question='no/amount')
    project = store.get(pid)
    projected = analysis_project(project, settings)
    assert projected['records'][0]['values']['no/amount'] is None
    assert projected['records'][0]['values']['a'] == 'yes'
    assert project['records'][0]['values']['no/amount'] == 0
    rows = data_page(project, settings, '', ['no/amount'])['rows']
    assert rows[0]['values']['no/amount'] == '0' and rows[0]['conditionalWarnings']['no/amount']['status'] == 'excluded'
    result = next(q for q in analyze(project, settings)['questions'] if q['id'] == 'no/amount')
    assert result['denominator'] == 1
    assert all(row[0] != 'r1' for row in source_rows(project, result, settings))
    preview = client.post(f'/api/kobo/projects/{pid}/analysis/preview', json={'settings': settings.model_dump(), 'question': 'no/amount'})
    assert preview.status_code == 200 and preview.json()['denominator'] == result['denominator']
    assert preview.json()['conditionalWarnings']['excluded'] == 1
    layouts = response_layout(project, settings)
    config = query_config(projected, analyze(project, settings), settings, [], layouts)
    q = next(q for q in config['questions'] if q['id'] == 'no/amount')
    assert q['excludedRecords'] == ['r1']
    helpers, sources = direct_helpers(config, layouts)
    formula = helpers[''][sources['no/amount']['fields']['IncludeInPivot']]
    assert 'exclude:no/amount|' in formula
    assert ('exclude:no/amount|r1', 'Excluded') in choice_lookup_rows(config)
    cached = helper_values(layouts, config, sources, helpers)
    header = list(helpers['']).index(sources['no/amount']['fields']['IncludeInPivot'])
    assert cached[0][0][header] == 'Excluded'
    raw_book = load_workbook(io.BytesIO(data_workbook(project, settings, '', ['no/amount'])))
    assert raw_book.active.cell(2, 2).value in ('0', 0)
    act(client, pid, settings, 'restore', question='no/amount', status='excluded')
    assert analysis_project(store.get(pid), settings)['records'][0]['values']['no/amount'] == 0


def test_evidence_changes_reopen_and_corrections_undo(conditional_api):
    client, store, pid, settings = conditional_api
    act(client, pid, settings, 'ignore')
    operation = {'kind': 'cells', 'cells': [{'record': 'r1', 'field': 'no/other', 'value': 'Changed text'}]}
    response = client.post(f'/api/kobo/projects/{pid}/edits/apply', json={'revision': 0, 'operation': operation})
    assert response.status_code == 200, response.text
    result = review(store.get(pid), settings, question='no/other')
    assert result['matched'] == 1 and result['rows'][0]['status'] == 'open'
    response = client.post(f'/api/kobo/projects/{pid}/edits/undo', json={'revision': 1, 'operation': {'kind': 'cells'}})
    assert response.status_code == 200
    assert review(store.get(pid), settings, status='ignored', question='no/other')['matched'] == 1
    operation['cells'][0]['value'] = None
    response = client.post(f'/api/kobo/projects/{pid}/edits/apply', json={'revision': 2, 'operation': operation})
    assert response.status_code == 200
    assert review(store.get(pid), settings, status='all', question='no/other')['matched'] == 0


def test_bulk_atomicity_invalid_evidence_and_uncheckable_exclusion(conditional_api):
    client, store, pid, settings = conditional_api
    base = f'/api/kobo/projects/{pid}/conditional-review'
    data = client.post(base, json={'settings': settings.model_dump()}).json()
    items = [{key: r[key] for key in ['record','question','fingerprint']} for r in data['rows']]
    items[-1]['fingerprint'] = 'stale'
    response = client.post(base+'/actions', json={'settings': settings.model_dump(), 'revision': data['revision'], 'action': 'ignore', 'items': items})
    assert response.status_code == 409 and not store.get(pid).get('conditionalReview')
    items[-1]['fingerprint'] = data['rows'][-1]['fingerprint']
    response = client.post(base+'/actions', json={'settings': settings.model_dump(), 'revision': data['revision'], 'action': 'ignore', 'items': items})
    assert response.status_code == 200
    assert review(store.get(pid), settings, status='ignored')['matched'] == 4


def test_reimport_only_preserves_reliable_identity_and_evidence(conditional):
    settings = KoboSettings()
    row = next(r for r in scan(conditional, settings)['rows'] if r['question'] == 'no/other')
    conditional['conditionalReview'] = {'decisions': {row['id']: {'record': row['record'], 'question': row['question'], 'fingerprint': row['fingerprint'], 'status': 'ignored'}}}
    replacement = copy.deepcopy(conditional)
    replacement['records'][0]['id'] = 'moved'
    replacement['records'][-1]['parent'] = 'moved'
    preserve_review(conditional, replacement, settings)
    assert review(replacement, settings, status='ignored')['matched'] == 1
    replacement['records'][0]['sourceIdentity'] = 'different-person'
    preserve_review(conditional, replacement, settings)
    assert review(replacement, settings, status='ignored')['matched'] == 0
    replacement = copy.deepcopy(conditional)
    for record in replacement['records']: record.pop('sourceIdentity')
    preserve_review(conditional, replacement, settings)
    assert not replacement['conditionalReview']['decisions']


def test_arabic_does_not_invalidate_decisions(conditional_api):
    client, store, pid, settings = conditional_api
    act(client, pid, settings, 'ignore')
    result = review(store.get(pid), settings.model_copy(update={'language': 'ar'}), status='ignored')
    assert result['matched'] == 1 and result['rows'][0]['label'] == 'تفاصيل أخرى'


def test_measure_exclusion_changes_denominator_and_related_measures(conditional_api):
    client, store, pid, settings = conditional_api
    settings = settings.model_copy(update={'questions': KoboSettings(questions={
        'no/amount': {'calculation': {'operation': 'sum', 'field': 'no/amount'}, 'numericMode': 'values'},
        'a': {'calculation': {'operation': 'sum', 'field': 'no/amount'}},
    }).questions})
    before = analyze(store.get(pid), settings)
    amount = next(q for q in before['questions'] if q['id'] == 'no/amount')
    assert amount['denominator'] == 2  # Calculated measures do not automatically apply form relevance.
    act(client, pid, settings, 'exclude', question='no/amount')
    after = analyze(store.get(pid), settings)
    amount = next(q for q in after['questions'] if q['id'] == 'no/amount')
    assert amount['denominator'] == 1 and amount['measureTotal']['contributingCount'] == 1
    parent = next(q for q in after['questions'] if q['id'] == 'a')
    assert parent['denominator'] == 3 and parent['measureTotal']['contributingCount'] == 1


def test_uncheckable_cannot_be_excluded_and_changed_rules_reopen(conditional_api):
    client, store, pid, settings = conditional_api
    act(client, pid, settings, 'ignore')
    manual = settings.model_copy(update={'questions': KoboSettings(questions={'no/other': {
        'connectionSource': 'manual', 'connectionRules': {'type': 'rule', 'field': 'absent', 'operator': 'eq', 'value': 'no'},
    }}).questions})
    base = f'/api/kobo/projects/{pid}/conditional-review'
    result = client.post(base, json={'settings': manual.model_dump(), 'question': 'no/other', 'category': 'all'}).json()
    assert result['matched'] == 3 and all(r['outcome'] == 'uncheckable' and r['status'] == 'open' for r in result['rows'])
    row = result['rows'][0]
    response = client.post(base+'/actions', json={'settings': manual.model_dump(), 'revision': result['revision'], 'action': 'exclude', 'items': [{key: row[key] for key in ['record','question','fingerprint']}]})
    assert response.status_code == 409


def test_compound_or_and_dependency_cycles(conditional):
    q = next(q for q in conditional['form']['questions'] if q['id'] == 'no/other')
    q.update(group='', inheritedRelevant=[], relevant="${a} = 'no' or (${a} = 'yes' and selected(${reason}, 'other'))")
    result = scan(conditional, KoboSettings())
    assert not any(r['question'] == 'no/other' for r in result['rows'])
    q.update(relevant="${amount} > 0")
    amount = next(q for q in conditional['form']['questions'] if q['id'] == 'no/amount')
    amount['relevant'] = "${other} != ''"
    result = scan(conditional, KoboSettings())
    assert all(r['outcome'] == 'uncheckable' for r in result['rows'] if r['question'] in {'no/other', 'no/amount'})


def test_quality_summary_and_api_pagination(conditional_api):
    client, store, pid, settings = conditional_api
    base = f'/api/kobo/projects/{pid}'
    result = client.post(base+'/quality-review', json={'settings': settings.model_dump()})
    assert result.status_code == 200
    assert result.json()['conditional']['counts']['open'] == 4
    assert client.post(base+'/conditional-review', json={'page': 0}).status_code == 422
    assert client.post(base+'/conditional-review', json={'pageSize': 101}).status_code == 422
    response = client.post(base+'/conditional-review', json={'settings': settings.model_dump(), 'search': 'Transport costs', 'pageSize': 1}).json()
    assert response['matched'] == 1 and len(response['rows']) == 1


def test_store_repair_and_backup_preserve_only_matching_decisions(conditional_api):
    from backend.kobo_workspace import backup_project, read_backup
    client, store, pid, settings = conditional_api
    act(client, pid, settings, 'ignore')
    _, payload, restored_settings, _, _ = read_backup(backup_project(store, pid))
    assert review(payload, restored_settings, status='ignored')['matched'] == 1
    replacement = copy.deepcopy(store.get(pid, raw=True))
    for key in ['id', 'name', 'updated', 'settings']: replacement.pop(key)
    replacement['records'][0]['row'] = 500
    replacement['records'][0]['id'] = 'new-normalized-row'
    replacement['records'][-1]['parent'] = 'new-normalized-row'
    saved = store.repair(pid, replacement, b'form', b'new-data', preserve_settings=True)
    ignored = review(saved, settings, status='ignored')
    assert ignored['matched'] == 1 and ignored['rows'][0]['record'] == 'new-normalized-row'
    replacement = copy.deepcopy(replacement)
    replacement['records'][0]['values']['no/other'] = 'New evidence'
    saved = store.repair(pid, replacement, b'form', b'newer-data', preserve_settings=True)
    assert review(saved, settings, status='ignored')['matched'] == 0


def test_drilldown_uses_analysis_projection_but_displays_stored_cells(conditional):
    # Excluding a value can make a downstream "is blank" condition true.
    # Drilldown must use that same eligibility as the displayed pivot.
    q = next(q for q in conditional['form']['questions'] if q['id'] == 'no/other')
    q.update(group='', inheritedRelevant=[], relevant="${amount} = ''")
    settings = KoboSettings(hideEmpty=False, hideBlanks=False)
    row = next(r for r in scan(conditional, settings)['rows'] if r['question'] == 'no/amount')
    conditional['conditionalReview'] = {'decisions': {row['id']: {**{key: row[key] for key in ['record','question','fingerprint']}, 'status': 'excluded'}}}
    result = next(q for q in analyze(conditional, settings)['questions'] if q['id'] == 'no/other')
    assert result['denominator'] == 1
    data = data_page(conditional, settings, '', ['no/other', 'no/amount'], drilldown={'question': 'no/other', 'answer': 'Transport costs'})
    assert len(data['rows']) == 1
    assert data['rows'][0]['values']['no/amount'] == '0'


@pytest.mark.parametrize('answers,conflict', [(['cost'], False), (['cost','other'], False), (['none'], True), (['unknown'], True), (['refuse'], True), ([], True), (None, True), (['cost','none'], True)])
def test_screenshot_negated_selection_group(conditional, answers, conflict):
    project = copy.deepcopy(conditional)
    reason = next(q for q in project['form']['questions'] if q['id'] == 'no/reason')
    reason['choices'] += [{'name': code, 'labels': {'en': code}} for code in ['none','unknown','refuse']]
    other = next(q for q in project['form']['questions'] if q['id'] == 'no/other')
    other.update(group='', inheritedRelevant=[], relevant="${reason} != '' and not(selected(${reason}, 'none') or selected(${reason}, 'unknown') or selected(${reason}, 'refuse'))")
    project['records'] = [project['records'][0]]
    project['records'][0]['values']['no/reason'] = answers
    result = scan(project, KoboSettings(language='en'))
    hits = [r for r in result['rows'] if r['question'] == other['id']]
    assert bool(hits) == conflict
    assert all(r['outcome'] == 'conflict' for r in hits)
    # Normalized trees remain usable by Excel without a new negation node type.
    tree = parse_condition(other['relevant'], other, {q['id']: q for q in project['form']['questions']})
    formula = excel_condition(tree, lambda field: field.replace('/', '_'), {'no/reason': 'multiple'})
    assert 'AND(' in formula and 'FIND(' in formula


def test_nested_negation_preserves_boolean_semantics(conditional):
    questions = {q['id']: q for q in conditional['form']['questions']}
    q = questions['no/other']
    expression = "not(selected(${reason}, 'cost') and not(selected(${reason}, 'other')))"
    tree = parse_condition(expression, q, questions)
    for actual, expected in [(['cost'], False), (['other'], True), (['cost','other'], True), ([], True)]:
        assert matches_tree(tree, lambda key: actual, {'no/reason':'multiple'}) == expected
    # Do not invert numeric comparisons whose blank-value behavior differs.
    with pytest.raises(ValueError): parse_condition('not(${amount} > 3)', q, questions)
    assert parse_condition("not(selected(${amount}, '0'))", q, questions)['operator'] == 'neq'
    unresolved = parse_condition("not(selected(${missing}, 'none'))", q, questions, allow_unresolved=True)
    assert unresolved['field'] == 'missing' and unresolved['operator'] == 'neq'


def test_condition_groups_filter_before_pagination_and_separate_counts(conditional):
    q = next(q for q in conditional['form']['questions'] if q['id'] == 'no/other')
    q['relevant'] = "regex(${a}, 'no')"
    for n in range(30):
        record = copy.deepcopy(conditional['records'][0])
        record.update(id=f'extra-{n}', row=n+10)
        conditional['records'].append(record)
    settings = KoboSettings(language='en')
    result = review(conditional, settings, category='checks', page_size=1)
    assert result['matched'] == 1 and len(result['groups']) == 1 and not result['rows']
    assert result['groups'][0]['count'] == 32
    assert result['summary']['uncheckedAnswers'] == 32
    assert result['conditionQuestions']['no/other']['open'] == 32
    assert 'no/other' not in result['questions']
    assert '${' not in result['groups'][0]['condition']
    assert result['groups'][0]['rawConditions']
    group = result['groups'][0]['id']
    records = review(conditional, settings, category='checks', group=group, page=2, page_size=25)
    assert records['matched'] == 32 and len(records['rows']) == 7 and not records['groups']
    searched = review(conditional, settings, category='checks', search='Valid answer')
    assert searched['groups'][0]['count'] == 1
    assert searched['summary'] == result['summary']
    conflicts = review(conditional, settings, category='conflicts')
    assert all(r['outcome'] == 'conflict' for r in conflicts['rows'])


def test_uncheckable_records_do_not_count_as_confirmed_review_or_badges(conditional):
    from backend.kobo_quality import quality_review
    q = next(q for q in conditional['form']['questions'] if q['id'] == 'no/other')
    q['relevant'] = "regex(${a}, 'no')"
    conditional['records'] = [copy.deepcopy(conditional['records'][1])]
    settings = KoboSettings(language='en')
    result = next(q for q in analyze(conditional, settings)['questions'] if q['id'] == 'no/other')
    assert result['conditionalWarnings'] == {} and result['conditionChecks']['open'] == 1
    assert quality_review(conditional, settings).affected == 0


def test_grouped_checks_api_and_acknowledgment(conditional_api):
    client, store, pid, settings = conditional_api
    manual = settings.model_copy(update={'questions': KoboSettings(questions={'no/other': {
        'connectionSource': 'manual', 'connectionRules': {'type':'rule','field':'missing','operator':'eq','value':'x'},
    }}).questions})
    url = f'/api/kobo/projects/{pid}/conditional-review'
    body = {'settings': manual.model_dump(), 'category':'checks'}
    groups = client.post(url, json=body).json()
    assert groups['matched'] == 1 and groups['groups'][0]['count'] == 3
    rows = client.post(url, json={**body, 'group':groups['groups'][0]['id']}).json()
    row = rows['rows'][0]
    response = client.post(url+'/actions', json={'revision':rows['revision'],'settings':manual.model_dump(),'action':'ignore','items':[{key:row[key] for key in ['record','question','fingerprint']}]})
    assert response.status_code == 200
    ignored = client.post(url, json={**body,'status':'ignored'}).json()
    assert ignored['groups'][0]['count'] == 1
    conflicts = client.post(url, json={'settings':manual.model_dump()}).json()
    assert all(r['outcome']=='conflict' for r in conflicts['rows'])


def test_warning_source_row_uses_identity_not_row_number(conditional_api):
    client, store, pid, settings = conditional_api
    base = f'/api/kobo/projects/{pid}'
    act(client, pid, settings, 'exclude', question='no/other')
    body = {'settings': settings.model_dump(), 'recordIds':['r1'], 'scope':'', 'columns':['a','no/other']}
    page = client.post(base+'/data', json=body)
    assert page.status_code == 200, page.text
    rows = page.json()['rows']
    assert len(rows) == 1 and rows[0]['id'] == 'r1' and rows[0]['row'] == 2
    assert rows[0]['rawValues']['no/other'] == 'Transport costs'
    assert rows[0]['conditionalWarnings']['no/other']['status'] == 'excluded'
    # Repeat table row 2 is a different response and must never be substituted.
    repeat = client.post(base+'/data', json={**body,'scope':'visits','columns':['visits/detail']}).json()
    assert repeat['matched'] == 0
    repeat = client.post(base+'/data', json={**body,'recordIds':['v1'],'scope':'visits','columns':['visits/detail']}).json()
    assert repeat['matched'] == 1 and repeat['rows'][0]['id'] == 'v1'
    values = client.post(base+'/data/values', json={**body,'column':'no/other'}).json()
    assert values['values'] == ['Transport costs']
    download = client.post(base+'/data/export', json=body)
    assert download.status_code == 200
    book = load_workbook(io.BytesIO(download.content))
    assert book.active.max_row == 2 and book.active.cell(2,3).value == 'Transport costs'
    assert client.post(base+'/data', json={**body,'recordIds':[]}).json()['matched'] == 0
    assert client.post(base+'/data', json={**body,'recordIds':['missing']}).json()['matched'] == 0


def test_correcting_warning_source_row_keeps_row_visible_and_refreshes_findings(conditional_api):
    client, store, pid, settings = conditional_api
    base = f'/api/kobo/projects/{pid}'
    body = {'settings':settings.model_dump(),'recordIds':['r1'],'scope':'','columns':['a','no/other']}
    change = client.post(base+'/edits/apply',json={'revision':0,'operation':{'kind':'cells','cells':[{'record':'r1','field':'a','value':'no'}]}})
    assert change.status_code == 200
    data = client.post(base+'/data',json=body).json()
    assert data['matched'] == 1 and data['rows'][0]['values']['a'] == 'No'
    assert 'no/other' not in data['rows'][0]['conditionalWarnings']
    assert review(store.get(pid),settings,question='no/other')['matched'] == 0
