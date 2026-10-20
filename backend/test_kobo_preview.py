import copy

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.kobo import ProjectStore
from backend.kobo_api import make_router
from backend.test_kobo import sample


@pytest.fixture
def preview_client(sample, tmp_path, monkeypatch):
    monkeypatch.setenv('INTERSOS_DEFER_LEGAL_LOAD', '1')
    project = copy.deepcopy(sample[0])
    project['form']['questions'].append({**project['form']['questions'][0], 'id': 'group/location', 'name': 'location'})
    for record in project['records']:
        record['values']['group/location'] = record['values']['group/gender']
    store = ProjectStore(tmp_path / 'preview.sqlite3')
    saved = store.create('Preview', {**project, 'mappings': [], 'policies': {}, 'warnings': [], 'issues': []}, b'form', b'data')
    app = FastAPI(); app.include_router(make_router(store))
    return TestClient(app), store, saved['id']


@pytest.mark.parametrize('language', ['en', 'ar'])
@pytest.mark.parametrize('levels', range(4))
@pytest.mark.parametrize('mode', ['count', 'percent', 'both'])
def test_preview_equals_analysis_and_never_saves(preview_client, levels, mode, language):
    client, store, pid = preview_client
    before = store.get(pid)
    config = {'breakdowns': ['group/gender', 'group/respondent_name', 'group/location'][:levels], 'breakdownDisplay': mode}
    settings = {**before['settings'], 'language': language, 'hideBlanks': False, 'questions': {'group/needs': config}}
    body = {'settings': settings, 'question': 'group/needs'}
    response = client.post(f'/api/kobo/projects/{pid}/analysis/preview', json=body)
    assert response.status_code == 200, response.text
    full = client.post(f'/api/kobo/projects/{pid}/analysis', json={'settings': settings}).json()
    assert response.json() == next(question for question in full['questions'] if question['id'] == 'group/needs')
    assert store.get(pid) == before
    assert store.sources(pid) == (b'form', b'data')


@pytest.mark.parametrize('qid,config', [('group/age', {'numericMode': 'bins', 'bins': 2}), ('group/day', {'dateUnit': 'day'}), ('group/day', {'dateUnit': 'year'})])
def test_targeted_preview_numeric_date_filters_and_empty(preview_client, qid, config):
    client, store, pid = preview_client
    for values in [[], ['f'], ['unavailable']]:
        settings = {**store.get(pid)['settings'], 'questions': {qid: config}, 'filters': [{'field': 'group/gender', 'kind': 'category', 'values': values}] if values else []}
        preview = client.post(f'/api/kobo/projects/{pid}/analysis/preview', json={'question': qid, 'settings': settings})
        full = client.post(f'/api/kobo/projects/{pid}/analysis', json={'settings': settings}).json()
        assert preview.status_code == 200
        if not preview.json()['denominator'] and settings.get('hideEmpty', True):
            assert all(question['id'] != qid for question in full['questions'])
        else:
            assert preview.json() == next(question for question in full['questions'] if question['id'] == qid)


def test_preview_computes_only_target_and_validates_requests(preview_client, monkeypatch):
    import backend.kobo_api as api
    client, store, pid = preview_client
    called = []
    original = api.question_result
    def record(question, *args):
        called.append(question['id'])
        return original(question, *args)
    monkeypatch.setattr(api, 'question_result', record)
    settings = store.get(pid)['settings']
    assert client.post(f'/api/kobo/projects/{pid}/analysis/preview', json={'question': 'group/age', 'settings': settings}).status_code == 200
    assert called == ['group/age']
    assert client.post(f'/api/kobo/projects/{pid}/analysis/preview', json={'question': 'missing', 'settings': settings}).status_code == 404
    for config in [{'breakdowns': ['missing']}, {'breakdowns': ['group/gender', 'group/gender']}]:
        invalid = {**settings, 'questions': {'group/needs': config}}
        assert client.post(f'/api/kobo/projects/{pid}/analysis/preview', json={'question': 'group/needs', 'settings': invalid}).status_code == 400
    invalid = {**settings, 'questions': {'group/age': {'bins': 101}}}
    assert client.post(f'/api/kobo/projects/{pid}/analysis/preview', json={'question': 'group/age', 'settings': invalid}).status_code == 422
