from copy import deepcopy

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.kobo import ProjectStore, normalize, parse_data, parse_form, propose_mapping
from backend.kobo_api import make_router
from backend.kobo_import_links import form_changes, question_matches, reuse_links, review_details
from backend.test_kobo import workbook


def form_bytes(version='2', code='f'):
    return workbook({'survey': [['type', 'name', 'label::English (en)', 'label::العربية (ar)'], ['select_one sex', 'gender', 'Gender', 'الجنس'], ['integer', 'age', 'Age', 'العمر'], ['select_multiple needs', 'needs', 'Needs', 'الاحتياجات'], ['text', 'new_field', 'New field', 'حقل جديد']], 'choices': [['list_name', 'name', 'label'], ['sex', code, 'Female'], ['sex', 'm', 'Male'], ['needs', 'food', 'Food'], ['needs', 'water', 'Water']], 'settings': [['version'], [version]]})


def fixture_data():
    form = parse_form(form_bytes())
    sheets = parse_data('old_gender,gender,old_age,age,old_needs,needs,unused\nf,Female,1,1.0,water food,Food Water,z\n,m,,2,,food,z\nf,m,3,4,food,water,z\n'.encode(), 'data.csv')
    mappings, _ = propose_mapping(form, sheets)
    for m in mappings:
        name = m['header'].removeprefix('old_')
        if name in {'gender', 'age', 'needs'}: m.update(question=name, status='matched', mergeMode='coalesce')
        else: m.update(question='', status='excluded')
    return form, sheets, mappings


def test_typed_coalesce_reports_only_actual_conflicts_and_exact_examples():
    form, sheets, mappings = fixture_data()
    issues, review = review_details(form, sheets, mappings)
    assert review['merged'] == ['gender', 'age', 'needs']
    assert review['noSource'] == ['new_field']
    assert all(entry['count'] == 1 for entry in review['conflicts'].values())
    assert all(entry['examples'][0]['row'] == 4 for entry in review['conflicts'].values())
    assert len(issues) == 3
    records, _ = normalize(form, sheets, mappings)
    assert records[0]['values'] == {'gender': 'f', 'age': 1., 'needs': ['food', 'water']}
    assert records[1]['values'] == {'gender': 'm', 'age': 2., 'needs': ['food']}
    assert records[2]['values'] == {'gender': None, 'age': None, 'needs': None}
    assert review['columns']['0:0']['samples'] == ['f']


@pytest.mark.parametrize('mode,expected', [('priority', {'gender': 'm', 'age': 4., 'needs': ['water']}), ('blank', {'gender': None, 'age': None, 'needs': None})])
def test_explicit_merge_decisions_and_priority(mode, expected):
    form, sheets, mappings = fixture_data()
    for m in mappings: m.update(mergeMode=mode, priority=1 if m['header'].startswith('old_') else 0)
    records, issues = normalize(form, sheets, mappings)
    assert not issues
    assert records[2]['values'] == expected
    _, review = review_details(form, sheets, mappings)
    assert review['conflicts']['age']['count'] == 1  # Keep resolved conflicts reviewable.


def test_old_choice_codes_labels_ignore_and_multiselect():
    form = parse_form(form_bytes())
    sheets = parse_data('old_gender,gender,needs\nقديم,f,old_food water\nignored,,ignored\n'.encode(), 'data.csv')
    mappings, _ = propose_mapping(form, sheets)
    mappings[0].update(question='gender', status='matched', answerMap={'قديم': 'f', 'ignored': ''}, mergeMode='coalesce')
    mappings[1]['mergeMode'] = 'coalesce'
    mappings[2]['answerMap'] = {'old_food': 'food', 'ignored': ''}
    records, issues = normalize(form, sheets, mappings)
    assert not issues
    assert records[0]['values'] == {'gender': 'f', 'needs': ['food', 'water']}
    assert records[1]['values'] == {'gender': None, 'needs': None}
    mappings[0]['answerMap']['bad'] = 'absent'
    with pytest.raises(ValueError, match='unknown current choice'): normalize(form, sheets, mappings)


def test_answer_links_respect_choice_filters_and_split_policy():
    form = parse_form(form_bytes())
    sheets = parse_data(b'needs,needs/food\ngarbage,1\n', 'data.csv')
    mappings, _ = propose_mapping(form, sheets)
    records, issues = normalize(form, sheets, mappings, {'needs': 'split'})
    assert not issues and records[0]['values']['needs'] == ['food']
    default_records, default_issues = normalize(form, sheets, mappings)
    assert not default_issues and default_records == records
    sheets[0]['rows'][0][1] = ''
    blank_records, blank_issues = normalize(form, sheets, mappings)
    assert not blank_issues and blank_records[0]['values']['needs'] is None
    only_combined = [m for m in mappings if not m.get('option')]
    assert any('unknown' in i['message'] for i in normalize(form, sheets, only_combined)[1])


def test_repeat_and_type_boundaries():
    form = parse_form(workbook({'survey': [['type','name','label'], ['text','name','Name'], ['begin_repeat','members','Members'], ['integer','age','Age'], ['end_repeat','','']]}))
    sheets = parse_data(workbook({'submissions': [['name'], ['A']], 'members': [['age'], [2]]}), 'data.xlsx')
    for m in [{'sheet':0,'column':0,'question':'members/age','option':''}, {'sheet':1,'column':0,'question':'name','option':''}, {'sheet':0,'column':0,'question':'name','option':'','sourceKind':'number'}]:
        with pytest.raises(ValueError): normalize(form, sheets, [m])


def test_reuse_by_header_not_position_and_prune_stale_answer_links():
    form, sheets, mappings = fixture_data()
    mappings[0]['answerMap'] = {'old_f': 'f', 'obsolete': 'absent'}
    project = {'form': form, 'mappings': mappings}
    replacement = deepcopy(sheets)
    replacement[0]['headers'] = list(reversed(sheets[0]['headers']))
    replacement[0]['rows'] = [list(reversed(row)) for row in sheets[0]['rows']]
    proposed, _ = propose_mapping(form, replacement)
    result, warnings = reuse_links(project, form, replacement, sheets, proposed)
    linked = {m['header']: m for m in result}
    assert linked['old_gender']['question'] == 'gender' and linked['old_gender']['column'] == 6
    assert linked['unused']['status'] == 'excluded'
    assert linked['old_gender']['answerMap'] == {'old_f': 'f'}
    assert warnings
    duplicate = deepcopy(replacement); duplicate[0]['headers'][0] = 'old_gender'
    result, _ = reuse_links(project, form, duplicate, sheets, propose_mapping(form, duplicate)[0])
    assert all(m['status'] == 'ambiguous' for m in result if m['header'] == 'old_gender')


def test_question_identity_and_form_change_review():
    form = parse_form(form_bytes('1'))
    updated = deepcopy(form)
    updated['questions'][0]['id'] = 'group/gender'  # Same unique name and repeat context.
    assert question_matches(form, updated)['gender'] == 'group/gender'
    updated['questions'].append({**updated['questions'][0], 'id': 'other/gender'})
    assert 'gender' not in question_matches(form, updated)
    updated = parse_form(form_bytes('2', 'female'))
    updated['questions'] = [q for q in updated['questions'] if q['name'] != 'age']
    changes = form_changes(form, updated)
    assert changes['previousVersion'] == '1' and changes['uploadedVersion'] == '2'
    assert {'question': 'gender', 'change': 'Answer options changed'} in changes['items']
    assert {'question': 'age', 'change': 'Removed question'} in changes['items']


@pytest.fixture
def client_store(tmp_path, monkeypatch):
    monkeypatch.setenv('INTERSOS_DEFER_LEGAL_LOAD', '1')
    store = ProjectStore(tmp_path / 'links.sqlite3')
    app = FastAPI(); app.include_router(make_router(store))
    return TestClient(app), store


def test_create_check_confirm_conflict_cannot_be_bypassed_and_reopen(client_store):
    client, store = client_store
    raw = b'old_gender,gender,age,unused\nf,Female,1,z\nf,m,2,z\n'
    response = client.post('/api/kobo/imports/preview', files={'form':('form.xlsx',form_bytes()),'data':('data.csv',raw)})
    assert response.status_code == 200, response.text
    preview = response.json(); mappings = preview['mappings']
    mappings[0].update(question='gender', status='matched', answerMap={})
    mappings[-1].update(question='', status='excluded')
    body = {'token':preview['token'],'name':'Updated form','mappings':mappings,'acceptInvalid':True,'reviewConfig':{'excludedQuestionIds':['needs','new_field']}}
    checked = client.post(f"/api/kobo/imports/{preview['token']}/check", json=body).json()
    assert checked['linkReview']['conflicts']['gender']['examples'][0]['row'] == 3
    assert client.post('/api/kobo/imports/confirm',json=body).status_code == 422
    for m in mappings:
        if m['question']=='gender': m.update(mergeMode='priority',priority=0 if m['header']=='gender' else 1)
    saved = client.post('/api/kobo/imports/confirm',json=body)
    assert saved.status_code == 200, saved.text
    pid = saved.json()['id']; reopened = store.get(pid)
    assert reopened['records'][1]['values']['gender']=='m'
    assert reopened['mappings'][0]['header']=='old_gender'
    assert store.sources(pid)[1] == raw
    review = client.post(f'/api/kobo/projects/{pid}/review', files={'data':('data.csv', b'age,gender,old_gender,unused\n3,f,Female,z\n')})
    assert review.status_code == 200, review.text
    assert next(m for m in review.json()['mappings'] if m['header']=='old_gender')['question']=='gender'
    before = store.get(pid)
    client.delete('/api/kobo/imports/'+review.json()['token'])
    assert store.get(pid)==before


def test_reupload_changed_options_review_and_atomic_apply(client_store):
    client, store = client_store
    data = b'gender,age\nf,1\n'
    preview = client.post('/api/kobo/imports/preview',files={'form':('form.xlsx',form_bytes('1')),'data':('data.csv',data)}).json()
    saved = client.post('/api/kobo/imports/confirm',json={'token':preview['token'],'name':'Version 1','mappings':preview['mappings'],'reviewConfig':{'excludedQuestionIds':['needs','new_field']}}).json()
    pid = saved['id']; before = store.get(pid)
    preview = client.post(f'/api/kobo/projects/{pid}/review',files={'form':('form.xlsx',form_bytes('2','female'))}).json()
    assert preview['formChanges']['items']
    assert any('unknown choice' in issue['message'] for issue in preview['issues'])
    mappings=preview['mappings'];mappings[0]['answerMap']={'f':'female'}
    body={'token':preview['token'],'name':'Version 1','mappings':mappings,'reviewConfig':preview['reviewConfig']}
    assert not client.post(f"/api/kobo/imports/{preview['token']}/check",json=body).json()['issues']
    assert store.get(pid)==before
    response=client.post('/api/kobo/imports/confirm',json=body)
    assert response.status_code==200,response.text
    assert store.get(pid)['records'][0]['values']['gender']=='female'
    assert store.get(pid)['settings']==before['settings']
    assert store.sources(pid)[1]==data


def test_date_zero_and_overridden_multiselect_codes_compare_after_decoding():
    form = parse_form(workbook({'survey': [['type','name','label'], ['date','day','Day'], ['integer','age','Age'], ['select_multiple opts','needs','Needs']], 'choices': [['list_name','name','label'], ['opts','food','Food'], ['opts','water','Water']]}))
    sheets = parse_data(b'old_day,day,old_age,age,old_needs,needs\n2026-01-01,2026-01-01T00:00:00,0,0.0,Water Food,food\n', 'data.csv')
    mappings = propose_mapping(form, sheets)[0]
    for m in mappings:
        m.update(question=m['header'].removeprefix('old_'),status='matched',mergeMode='coalesce')
    mappings[4]['answerMap']={'water':'food'}
    records, issues = normalize(form,sheets,mappings)
    assert not issues
    assert records[0]['values']=={'day':'2026-01-01T00:00:00','age':0.,'needs':['food']}


def test_reuse_warns_on_changed_type_and_missing_sources():
    form,sheets,mappings=fixture_data()
    updated=deepcopy(form)
    updated['questions'][0].update(kind='text',type='text')
    replacement=deepcopy(sheets);replacement[0]['headers'][0]='replacement'
    result,warnings=reuse_links({'form':form,'mappings':mappings},updated,replacement,sheets,propose_mapping(updated,replacement)[0])
    assert next(m for m in result if m['header']=='gender')['status']=='unmatched'
    assert any('absent' in warning for warning in warnings)
    assert any('could not be reused' in warning for warning in warnings)


def test_invalid_answer_links_and_cross_scope_are_rejected_in_check(client_store):
    client,_=client_store
    preview=client.post('/api/kobo/imports/preview',files={'form':('form.xlsx',form_bytes()),'data':('data.csv',b'gender,age\nf,1\n')}).json()
    links=preview['mappings']
    for answer_map in [{'f':'absent'},{'f':'f','F':'m'},{' ':'m'}]:
        links[0]['answerMap']=answer_map
        response=client.post(f"/api/kobo/imports/{preview['token']}/check",json={'mappings':links})
        assert response.status_code==400,response.text
    links[0]['answerMap']={}
    links[1].update(question='gender',sourceKind='')
    # Omitting or overriding source metadata cannot bypass staged type validation.
    assert client.post(f"/api/kobo/imports/{preview['token']}/check",json={'mappings':links}).status_code==400
