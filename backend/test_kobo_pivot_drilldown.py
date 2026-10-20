import copy
import pytest
from backend.kobo import KoboSettings, QuestionSettings, filtered_records, question_result
from backend.kobo_data import data_page
from backend.test_kobo import sample
from backend.test_kobo_preview import preview_client
from backend.test_kobo_data import read_export


def pivot(project, settings, qid):
    questions = {q['id']: q for q in project['form']['questions']}
    return question_result(questions[qid], filtered_records(project, settings), settings, questions, {r['id']: r for r in project['records']})


def verify_cells(project, settings, qid):
    result = pivot(project, settings, qid)
    scope = next(q['repeat'] for q in project['form']['questions'] if q['id'] == qid)
    records = lambda **selection: data_page(project, settings, scope, [qid], drilldown={'question': qid, **selection})
    assert records()['matched'] == result['denominator']
    for row in result['rows']:
        data = records(answer=row['id'])
        assert data['matched'] == row['count']
        assert len({r['id'] for r in data['rows']}) == len(data['rows'])
        for series in row.get('series', []):
            assert records(answer=row['id'], breakdown=series['id'])['matched'] == series['count']
    for column in result['breakdowns']:
        assert records(breakdown=column['id'])['matched'] == column['denominator']
    return result


@pytest.mark.parametrize('qid', ['group/gender', 'group/needs', 'group/age', 'group/day', 'group/respondent_name'])
def test_every_answer_count_and_total_matches_selected_records(sample, qid):
    project = copy.deepcopy(sample[0])
    settings = KoboSettings(hideZero=False, hideEmpty=False, hideBlanks=False)
    verify_cells(project, settings, qid)


def test_multiple_dimensions_missing_breakdown_zero_cells_and_filtered_totals(sample):
    project = copy.deepcopy(sample[0])
    project['records'][0]['values']['group/respondent_name'] = None
    settings = KoboSettings(hideZero=False, hideBlanks=False, questions={'group/needs': QuestionSettings(breakdowns=['group/gender', 'group/respondent_name'])})
    result = verify_cells(project, settings, 'group/needs')
    assert any('__blank__' in column['values'] for column in result['breakdowns'])
    assert any(series['count'] == 0 for row in result['rows'] for series in row.get('series', []))
    assert result['denominator'] == 2  # water + food belong to one record, rather than two records.
    settings = KoboSettings.model_validate({**settings.model_dump(), 'filters': [{'field': 'group/gender', 'kind': 'category', 'values': ['f']}]})
    assert verify_cells(project, settings, 'group/needs')['denominator'] == 1


def test_numeric_bins_preserve_upper_exclusion_and_final_inclusion(sample):
    project = copy.deepcopy(sample[0])
    template = project['records'][0]
    project['records'] = [{**template, 'id': str(index), 'row': index+1, 'values': {**template['values'], 'group/age': value}} for index, value in enumerate([0, 5, 10, 15, 20])]
    settings = KoboSettings(questions={'group/age': QuestionSettings(numericMode='bins', bins=2)})
    result = verify_cells(project, settings, 'group/age')
    assert [row['count'] for row in result['rows']] == [2, 3]


@pytest.mark.parametrize('unit', ['day', 'month', 'year'])
def test_date_group_membership(sample, unit):
    project = sample[0]
    settings = KoboSettings(questions={'group/day': QuestionSettings(dateUnit=unit)})
    verify_cells(project, settings, 'group/day')


def test_repeat_scope_uses_parent_breakdown_and_parent_filters(sample):
    project = copy.deepcopy(sample[0])
    question = {**project['form']['questions'][2], 'id': 'visits/age', 'repeat': 'visits'}
    project['form']['questions'].append(question)
    for index, (parent, value) in enumerate([(0, 0), (1, 10), (2, None), (2, 20)]):
        project['records'].append({'id': f'child{index}', 'parent': project['records'][parent]['id'], 'scope': 'visits', 'row': index+10, 'values': {'visits/age': value}})
    settings = KoboSettings(hideBlanks=False, questions={'visits/age': QuestionSettings(breakdowns=['group/gender'])}, filters=[{'field': 'group/gender', 'kind': 'category', 'values': ['f']}])
    assert verify_cells(project, settings, 'visits/age')['denominator'] == 2
    with pytest.raises(ValueError, match='different response table'):
        data_page(project, settings, '', ['group/age'], drilldown={'question': 'visits/age'})


def test_api_search_sort_paging_exports_and_invalid_selectors_preserve_settings(preview_client):
    client, store, pid = preview_client
    before = store.get(pid)
    settings = {**before['settings'], 'language': 'en', 'hideZero': False, 'hideBlanks': False}
    base = {'settings': settings, 'columns': ['group/gender', 'group/needs', 'group/age'], 'drilldown': {'question': 'group/needs', 'answer': 'water'}, 'pageSize': 1}
    url = f'/api/kobo/projects/{pid}/data'
    data = client.post(url, json=base).json()
    assert data['total'] == data['matched'] == 1
    assert client.post(url, json={**base, 'page': 2}).json()['rows'] == []
    assert client.post(url, json={**base, 'search': 'none'}).json()['matched'] == 0
    assert client.post(url, json={**base, 'sortColumn': 'group/age', 'sortDirection': 'desc'}).json()['rows'] == data['rows']
    rows = list(read_export(client.post(url+'/export', json=base)).active.values)
    assert len(rows) == 2 and 'Clean water' in rows[1][2]
    assert len(list(read_export(client.post(url+'/export', json={**base, 'search': 'none'})).active.values)) == 1
    outside = next(r['id'] for r in before['records'] if r['id'] != data['rows'][0]['id'])
    assert len(list(read_export(client.post(url+'/export', json={**base, 'selectedIds': [outside]})).active.values)) == 1
    assert client.post(url, json={**base, 'drilldown': {'question': 'group/needs', 'answer': 'none'}}).json()['matched'] == 1
    for selector in [{'question': 'unknown'}, {'question': 'group/needs', 'answer': 'unknown'}, {'question': 'group/needs', 'breakdown': 'unknown'}]:
        assert client.post(url, json={**base, 'drilldown': selector}).status_code == 400
    assert client.post(url, json={**base, 'drilldown': {'question': ''}}).status_code == 422
    assert store.get(pid) == before
