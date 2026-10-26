"""Data-only updates must preserve setup or leave the saved project untouched."""
from copy import deepcopy
from types import SimpleNamespace

import pytest

from backend.kobo import KoboSettings, KoboFilter, AnalysisViewSettings, SavedAnalysisView
from backend.test_custom_analysis import env, stage, confirm
from backend.test_kobo_import_links import client_store, form_bytes
from backend.test_kobo import workbook


def custom_update(client, preview, reuse=True):
    return client.post('/api/custom/columns/confirm', json={
        'token': preview['token'], 'name': 'Custom dataset', 'config': preview['config'], 'reuseOnly': reuse})


def kobo_create(client):
    raw = b'gender,age,unused\nf,20,keep\nm,30,keep\n'
    p = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form_bytes()), 'data': ('data.csv', raw)}).json()
    p['mappings'][-1].update(question='', status='excluded')
    result = client.post('/api/kobo/imports/confirm', json={'token': p['token'], 'name': 'Reuse', 'mappings': p['mappings'], 'reviewConfig': {'excludedQuestionIds': ['needs', 'new_field']}})
    assert result.status_code == 200, result.text
    return result.json()


def kobo_stage(client, pid, raw=None, form=None):
    files = {}
    if raw is not None: files['data'] = ('data.csv', raw)
    if form: files['form'] = ('form.xlsx', form)
    result = client.post(f'/api/kobo/projects/{pid}/review', files=files)
    assert result.status_code == 200, result.text
    return result.json()


def kobo_update(client, p, reuse=True):
    return client.post('/api/kobo/imports/confirm', json={'token': p['token'], 'name': 'Reuse', 'mappings': p['mappings'], 'policies': p['policies'], 'reviewConfig': p['reviewConfig'], 'reuseOnly': reuse})


def customize(store, saved, field):
    settings = KoboSettings.model_validate(saved['settings'])
    settings.language = 'ar'
    settings.viewMode = 'table'
    settings.questions[field].palette = 'Teal'
    settings.questions[field].chart = 'column'
    settings.savedViews = [SavedAnalysisView(id='saved', name='My setup', snapshot=AnalysisViewSettings.model_validate(settings.model_dump()), questionKinds={q['id']: q['kind'] for q in saved['form']['questions']})]
    settings.activeViewId = 'saved'
    store.save(saved['id'], settings)
    return store.get(saved['id'])


def test_custom_reuse_preserves_preparation_calculations_filters_views_and_settings(env):
    client, store = env
    p = stage(client, b'Code,Amount,Count,Unused\n001, 10 ,2,x\n002,20,3,y\n')
    code, amount, count, unused = p['config']['columns']
    amount['preparation']['trim'] = True
    unused['included'] = False
    p['config']['filterFields'] = [code['id'], amount['id']]
    p['config']['calculatedColumns'] = [{'id': 'calc_total', 'label': 'Total', 'operation': 'multiply', 'left': amount['id'], 'right': count['id']}]
    saved = confirm(client, p)
    before = customize(store, saved, code['id'])
    next_preview = stage(client, b'Count,Unused,Code,Amount\n4,z,003,30\n', pid=saved['id'])
    assert next_preview['reuse'] == {'eligible': True, 'reasons': []}
    assert store.get(saved['id']) == before
    updated = custom_update(client, next_preview)
    assert updated.status_code == 200, updated.text
    after = store.get(saved['id'])
    assert after['settings'] == before['settings']
    assert after['id'] == before['id'] and len(store.list()) == 1
    assert len(after['records']) == 1
    assert after['records'][0]['values']['calc_total'] == 120
    assert next(c for c in after['customConfig']['columns'] if c['id'] == unused['id'])['included'] is False


@pytest.mark.parametrize('raw', [b'A,B,C\n1,2,3\n', b'A\n1\n', b'A,Renamed\n1,2\n', b'A,A\n1,2\n', b'A,B\nbad,2\n'])
def test_custom_changed_or_invalid_columns_require_review(env, raw):
    client, store = env
    saved = confirm(client, stage(client, b'A,B\n1,2\n'))
    before = store.get(saved['id'])
    p = stage(client, raw, pid=saved['id'])
    assert not p['reuse']['eligible'] and p['reuse']['reasons']
    assert custom_update(client, p).status_code in {409, 422}
    assert store.get(saved['id']) == before
    assert client.delete('/api/custom/columns/' + p['token']).status_code == 200
    assert custom_update(client, p).status_code == 410
    assert store.get(saved['id']) == before


def test_custom_schema_change_can_be_applied_after_manual_review(env):
    client, store = env
    saved = confirm(client, stage(client, b'A,B\n1,2\n'))
    p = stage(client, b'A,B,C\n3,4,5\n', pid=saved['id'])
    assert not p['reuse']['eligible']
    assert custom_update(client, p, reuse=False).status_code == 200


def test_custom_new_duplicate_group_needs_explicit_decision(env):
    client, store = env
    p = stage(client, b'Code,Age\n001,20\n002,30\n')
    p['config']['duplicateReview']['fields'] = [p['config']['columns'][0]['id']]
    saved = confirm(client, p)
    before = store.get(saved['id'])
    next_preview = stage(client, b'Code,Age\n001,20\n001,40\n', pid=saved['id'])
    assert next_preview['duplicateResult']['unresolved'] == 1
    assert not next_preview['reuse']['eligible']
    assert custom_update(client, next_preview).status_code == 409
    assert store.get(saved['id']) == before


def test_custom_reuse_cannot_adjust_config_or_overwrite_newer_settings(env):
    client, store = env
    saved = confirm(client, stage(client, b'A,B\n1,2\n'))
    p = stage(client, b'A,B\n3,4\n', pid=saved['id'])
    original = deepcopy(p['config'])
    p['config']['columns'][0]['label'] = 'Changed'
    assert custom_update(client, p).status_code == 409
    p['config'] = original
    settings = KoboSettings.model_validate(saved['settings']); settings.language = 'ar'
    store.save(saved['id'], settings)
    before = store.get(saved['id'])
    result = custom_update(client, p)
    assert result.status_code in {400, 409}
    assert store.get(saved['id']) == before


def test_kobo_reordered_columns_keep_exclusions_and_saved_settings(client_store):
    client, store = client_store
    saved = kobo_create(client)
    before = customize(store, saved, 'gender')
    p = kobo_stage(client, saved['id'], b'age,unused,gender\n40,ignored,Female\n')
    assert p['reuse'] == {'eligible': True, 'reasons': []}
    assert next(m for m in p['mappings'] if m['header'] == 'unused')['status'] == 'excluded'
    result = kobo_update(client, p)
    assert result.status_code == 200, result.text
    after = store.get(saved['id'])
    assert after['settings'] == before['settings']
    assert after['records'][0]['values'] == {'gender': 'f', 'age': 40.0}
    assert len(after['records']) == 1 and len(store.list()) == 1


@pytest.mark.parametrize('raw', [b'gender,age,unused,new\nf,1,z,x\n', b'gender,age\nf,1\n', b'gender,age,renamed\nf,1,z\n', b'gender,age,unused\nf,invalid,z\n', b'gender,age,unused\nunknown,1,z\n'])
def test_kobo_schema_changes_or_new_invalid_values_leave_project_untouched(client_store, raw):
    client, store = client_store
    saved = kobo_create(client); before = store.get(saved['id'])
    p = kobo_stage(client, saved['id'], raw)
    assert not p['reuse']['eligible']
    assert kobo_update(client, p).status_code == 409
    assert store.get(saved['id']) == before
    client.delete('/api/kobo/imports/' + p['token'])
    assert kobo_update(client, p).status_code == 410


def test_kobo_replacement_form_requires_review_even_when_identical(client_store):
    client, store = client_store
    saved = kobo_create(client); before = store.get(saved['id'])
    p = kobo_stage(client, saved['id'], form=form_bytes())
    assert not p['reuse']['eligible']
    assert kobo_update(client, p).status_code == 409
    assert store.get(saved['id']) == before
    assert kobo_update(client, p, reuse=False).status_code == 200


def test_kobo_reuse_rejects_changed_decisions_and_stale_project(client_store):
    client, store = client_store
    saved = kobo_create(client)
    p = kobo_stage(client, saved['id'], b'gender,age,unused\nf,1,z\n')
    assert p['reuse']['eligible']
    original = deepcopy(p['mappings'])
    p['mappings'][0]['answerMap'] = {'f': 'm'}
    assert kobo_update(client, p).status_code == 409
    p['mappings'] = original
    settings = KoboSettings.model_validate(saved['settings']); settings.language = 'ar'
    store.save(saved['id'], settings); before = store.get(saved['id'])
    assert kobo_update(client, p).status_code == 409
    assert store.get(saved['id']) == before


def test_custom_changed_worksheet_and_header_layout_need_review(env):
    client, store = env
    saved = confirm(client, stage(client, workbook({'Data': [['A', 'B'], [1, 2]]}), 'data.xlsx'))
    before = store.get(saved['id'])
    p = stage(client, workbook({'Renamed': [['A', 'B'], [3, 4]]}), 'data.xlsx', saved['id'])
    assert not p['reuse']['eligible']
    assert custom_update(client, p).status_code == 409
    assert store.get(saved['id']) == before


def test_custom_new_warning_findings_require_acknowledgment(env):
    client, store = env
    p = stage(client, b'Age\n150\n')
    p['config']['validationRules'] = [{'id': 'rule_age', 'label': 'Age range', 'kind': 'number_range', 'field': p['config']['columns'][0]['id'], 'maximum': 120, 'severity': 'warning'}]
    review = client.post('/api/custom/columns/' + p['token'] + '/configure', json=p['config']).json()
    p['config']['validationRules'][0]['acceptedSignature'] = review['validationResults'][0]['signature']
    saved = confirm(client, p); before = store.get(saved['id'])
    p = stage(client, b'Age\n150\n200\n', pid=saved['id'])
    assert not p['validationResults'][0]['acknowledged']
    assert not p['reuse']['eligible']
    assert custom_update(client, p).status_code == 409
    assert store.get(saved['id']) == before


def test_custom_missing_filter_value_requires_review_instead_of_dropping_filter(env):
    client, store = env
    p = stage(client, b'City\nMosul\nBaghdad\n')
    qid = p['config']['columns'][0]['id']; p['config']['filterFields'] = [qid]
    saved = confirm(client, p)
    settings = KoboSettings.model_validate(saved['settings'])
    settings.filters = [KoboFilter(field=qid, kind='category', values=['Mosul'])]
    store.save(saved['id'], KoboSettings.model_validate(settings.model_dump()))
    before = store.get(saved['id'])
    p = stage(client, b'City\nBaghdad\n', pid=saved['id'])
    assert not p['reuse']['eligible']
    assert custom_update(client, p).status_code == 409
    assert store.get(saved['id']) == before


def test_expired_custom_preview_does_not_update(env, monkeypatch):
    import backend.custom_analysis as custom
    client, store = env
    saved = confirm(client, stage(client, b'A,B\n1,2\n')); before = store.get(saved['id'])
    p = stage(client, b'A,B\n3,4\n', pid=saved['id'])
    now = custom.time.monotonic()
    monkeypatch.setattr(custom, 'time', SimpleNamespace(monotonic=lambda: now + 1801))
    assert custom_update(client, p).status_code == 410
    assert store.get(saved['id']) == before


def test_expired_kobo_preview_does_not_update(client_store, monkeypatch):
    import backend.kobo_api as kobo
    client, store = client_store
    saved = kobo_create(client); before = store.get(saved['id'])
    p = kobo_stage(client, saved['id'], b'gender,age,unused\nf,1,z\n')
    now = kobo.time.monotonic()
    monkeypatch.setattr(kobo, 'time', SimpleNamespace(monotonic=lambda: now + 1801))
    assert kobo_update(client, p).status_code == 410
    assert store.get(saved['id']) == before


def test_kobo_reuse_retains_answer_links_and_multiselect_policy(client_store):
    client, store = client_store
    raw = b'gender,age,needs\nold_f,20,food water\n'
    p = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form_bytes()), 'data': ('data.csv', raw)}).json()
    p['mappings'][0]['answerMap'] = {'old_f': 'f'}
    saved = client.post('/api/kobo/imports/confirm', json={'token': p['token'], 'name': 'Reuse', 'mappings': p['mappings'], 'policies': {'needs': 'combined'}, 'reviewConfig': {'excludedQuestionIds': ['new_field']}}).json()
    assert saved.get('id'), saved
    p = kobo_stage(client, saved['id'], b'needs,age,gender\nwater,40,old_f\n')
    assert p['reuse']['eligible'], p['reuse']
    assert next(m for m in p['mappings'] if m['header'] == 'gender')['answerMap'] == {'old_f': 'f'}
    assert p['policies'] == {'needs': 'combined'}
    assert kobo_update(client, p).status_code == 200
    assert store.get(saved['id'])['records'][0]['values'] == {'gender': 'f', 'age': 40.0, 'needs': ['water']}


def test_kobo_missing_selected_worksheet_opens_staged_review(client_store):
    client, store = client_store
    raw = workbook({'Data': [['gender', 'age'], ['f', 20]]})
    p = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form_bytes()), 'data': ('data.xlsx', raw)}, data={'worksheet': 'Data'}).json()
    saved = client.post('/api/kobo/imports/confirm', json={'token': p['token'], 'name': 'Reuse', 'mappings': p['mappings'], 'reviewConfig': {'excludedQuestionIds': ['needs', 'new_field']}}).json()
    assert saved.get('id'), saved
    before = store.get(saved['id'])
    raw = workbook({'Renamed': [['gender', 'age'], ['m', 40]]})
    response = client.post(f'/api/kobo/projects/{saved["id"]}/review', files={'data': ('data.xlsx', raw)})
    assert response.status_code == 200, response.text
    p = response.json()
    assert not p['reuse']['eligible']
    assert p['sheets'][0]['name'] == 'Renamed'
    assert kobo_update(client, p).status_code == 409
    assert store.get(saved['id']) == before
    assert kobo_update(client, p, reuse=False).status_code == 200


def test_custom_explicit_invalid_as_missing_policy_is_reused(env):
    client, store = env
    p = stage(client, b'Amount\n10\n')
    p['config']['columns'][0]['invalidAsMissing'] = True
    saved = confirm(client, p)
    p = stage(client, b'Amount\n20\ninvalid\n', pid=saved['id'])
    assert p['reuse']['eligible'], p['reuse']
    assert custom_update(client, p).status_code == 200
    assert store.get(saved['id'])['records'][1]['values'][p['config']['columns'][0]['id']] is None
