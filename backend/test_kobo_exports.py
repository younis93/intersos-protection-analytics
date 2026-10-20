import copy
from unittest.mock import Mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.kobo import KoboSettings, ProjectStore, analyze
from backend.kobo_api import make_router
from backend.test_kobo import sample


def test_scoped_analysis_only_calculates_requested_question(sample, monkeypatch):
    import backend.kobo as kobo
    project = sample[0]
    settings = KoboSettings()
    expected = next(result for result in analyze(project, settings)['questions'] if result['id']=='group/needs')
    original = kobo.question_result
    spy = Mock(side_effect=original)
    monkeypatch.setattr(kobo, 'question_result', spy)
    result = analyze(project, settings, 'group/needs')
    assert result['questions'] == [expected]
    assert spy.call_count == 1


def test_excel_route_queues_without_analyzing_or_counting(sample, tmp_path, monkeypatch):
    import backend.kobo_api as api
    from backend.kobo_excel import jobs
    project = copy.deepcopy(sample[0])
    store = ProjectStore(tmp_path/'exports.sqlite3')
    saved = store.create('Exports', {**project, 'mappings': [], 'policies': {}, 'warnings': [], 'issues': []}, b'form', b'data')
    app = FastAPI(); app.include_router(make_router(store))
    start = Mock(return_value={'id':'job','state':'queued','progress':0,'message':'Preparing'})
    monkeypatch.setattr(jobs,'start',start)
    monkeypatch.setattr(api,'analyze',Mock(side_effect=AssertionError('Request must not analyze')))
    with TestClient(app) as client:
        response = client.post(f'/api/kobo/projects/{saved["id"]}/exports',json={'settings':saved['settings'],'question':'group/needs'})
        assert response.status_code == 200, response.text
        assert response.json()['state'] == 'queued'
        assert start.call_args.args[1] is None
        assert start.call_args.args[3] == 'group/needs'
        assert start.call_args.kwargs['chart_metric'] == 'count'

        for metric in ['count', 'percent', 'both']:
            response = client.post(f'/api/kobo/projects/{saved["id"]}/exports',json={'settings':saved['settings'],'chartMetric':metric})
            assert response.status_code == 200
            assert start.call_args.kwargs['chart_metric'] == metric
        assert client.post(f'/api/kobo/projects/{saved["id"]}/exports',json={'settings':saved['settings'],'chartMetric':'invalid'}).status_code == 422

        for selection in ([], ['group']):
            response = client.post(f'/api/kobo/projects/{saved["id"]}/exports',json={'settings':saved['settings'],'separateGroups':selection})
            assert response.status_code == 200, response.text
            assert start.call_args.kwargs['separate_groups'] == selection
        calls = start.call_count
        response = client.post(f'/api/kobo/projects/{saved["id"]}/exports',json={'settings':saved['settings'],'separateGroups':['missing']})
        assert response.status_code == 400
        assert start.call_count == calls
