from copy import deepcopy

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.kobo import ProjectStore, KoboSettings
from backend.kobo_api import make_router
from backend.kobo_question_flow import cyclic_nodes, question_flow
from backend.test_kobo_connections import project


def grouped_project():
    p = project()
    p['settings'] = {'language': 'en', 'hidden': ['main'], 'filters': [{'field': 'region', 'values': ['south']}]}
    p['form']['groups'] = [
        dict(id='details', name='details', labels={'en': 'Details', 'ar': 'التفاصيل'}, parent='', repeat=False, relevant="${main} = 'yes'"),
        dict(id='details/members', name='members', labels={'en': 'Members'}, parent='details', repeat=True, relevant=''),
    ]
    p['form']['questions'][1].update(group='details/members', repeat='details/members')
    return p


def test_group_conditions_are_single_edges_and_inherited_in_details():
    p = grouped_project()
    before = deepcopy(p)
    result = question_flow(p)
    follow = result['questions'][1]
    assert follow['groupPath'] == ['details', 'details/members']
    assert [c['source'] for c in follow['connections']['conditions']] == ['details', 'follow']
    assert [(e['source'], e['target']) for e in result['edges']] == [('main', 'details'), ('main', 'follow')]
    assert not follow['connections']['parents'][0]['hidden']
    assert p == before
    assert 'records' not in result
    assert result['groups'][1]['repeat']


def test_unconditional_and_arabic_and_no_response_access():
    p = grouped_project()
    p['records'] = object()
    result = question_flow(p, 'ar')
    assert result['language'] == 'ar'
    assert result['groups'][0]['label'] == 'التفاصيل'
    assert result['questions'][0]['connections']['conditions'] == []


def test_compound_and_unsupported_and_unresolved_references():
    p = project()
    p['form']['questions'][1]['relevant'] = "(${main} = 'yes' or selected(${main}, 'other')) and ${region} != 'south'"
    result = question_flow(p)
    assert len(result['edges']) == 2
    assert all(e['compound'] and not e['review'] for e in result['edges'])
    p['form']['questions'][1]['relevant'] = 'regex(${main}, "yes") and ${missing} = 1'
    result = question_flow(p)
    assert result['edges'][0]['review']
    assert result['edges'][0]['expression'].startswith('regex(')
    assert 'unresolved-reference:missing' in result['questions'][1]['connections']['issues']
    assert 'unsupported-condition' in result['questions'][1]['connections']['issues']


def test_duplicate_names_resolve_with_lexical_group_scope():
    p = grouped_project()
    original = p['form']['questions'][0]
    p['form']['questions'].extend([{**deepcopy(original), 'id': 'details/main', 'group': 'details'}, {**deepcopy(original), 'id': 'other/main', 'group': 'other'}])
    result = question_flow(p)
    # Nearest lexical scope disambiguates duplicate names.
    assert next(e for e in result['edges'] if e['target'] == 'follow')['source'] == 'details/main'
    p['form']['questions'].pop(0)
    result = question_flow(p)
    assert next(e for e in result['edges'] if e['target'] == 'follow')['source'] == 'details/main'


def test_cycles_and_conditional_group_descendant_cycles():
    p = grouped_project()
    p['form']['questions'][0]['relevant'] = "${follow} = 'a'"
    result = question_flow(p)
    assert 'cyclic-dependency' in result['questions'][0]['connections']['issues']
    assert all(e['review'] for e in result['edges'])
    p = grouped_project()
    p['form']['groups'][0]['relevant'] = "${follow} = 'a'"
    result = question_flow(p)
    assert 'cyclic-dependency' in result['groups'][0]['connections']['issues']
    assert 'cyclic-dependency' in result['questions'][1]['connections']['issues']
    assert cyclic_nodes(['a', 'b', 'c'], [('a', 'b'), ('a', 'c'), ('b', 'c')]) == set()
    assert cyclic_nodes(['a'], [('a', 'a')]) == {'a'}
    assert cyclic_nodes([str(i) for i in range(3000)], [(str(i), str(i+1)) for i in range(2999)]) == set()


def test_api_is_read_only_and_returns_not_found(tmp_path):
    store = ProjectStore(tmp_path / 'flow.sqlite3')
    p = grouped_project()
    p.pop('id')
    p.pop('name')
    saved = store.create('Flow test', {**p, 'mappings': [], 'policies': {}, 'warnings': [], 'issues': []}, b'form', b'data')
    store.save(saved['id'], KoboSettings(language='ar', hidden=['main']))
    app = FastAPI()
    app.include_router(make_router(store))
    client = TestClient(app)
    before = deepcopy(store.get(saved['id']))
    response = client.get(f"/api/kobo/projects/{saved['id']}/question-flow")
    assert response.status_code == 200
    assert response.json()['language'] == 'ar'
    assert len(response.json()['questions']) == 4
    assert store.get(saved['id']) == before
    assert client.get('/api/kobo/projects/missing/question-flow').status_code == 404
    assert client.get(f"/api/kobo/projects/{saved['id']}/question-flow?language=invalid").status_code == 422
