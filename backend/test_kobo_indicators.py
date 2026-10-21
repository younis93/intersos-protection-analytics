import copy
import math
import pytest
from pydantic import ValidationError
from backend.kobo import KoboSettings, ProjectStore
from backend.kobo_indicators import IndicatorDefinition, IndicatorQuestion, NumericScoreRange, calculate_indicator, indicator_issues, score_record
from backend.kobo_settings_share import export_settings, preview_settings
from backend.test_kobo import sample
from backend.test_kobo_preview import preview_client


def definition(**changes):
    return IndicatorDefinition.model_validate({'id': 'score-1', 'name': 'Example indicator', 'higherMeaning': 'More of the measured attribute', 'questions': [
        {'question': 'group/gender', 'kind': 'category', 'points': {'f': 0, 'm': 2}},
        {'question': 'group/needs', 'kind': 'multiple', 'multipleMethod': 'sum', 'points': {'water': 10, 'food': 5, 'none': 0}},
    ], **changes})


def test_worked_example_normalizes_unequal_scales_and_excludes_incomplete(sample):
    project = sample[0]
    before = copy.deepcopy(project)
    result = calculate_indicator(project, KoboSettings(), definition())
    assert result.complete == 2 and result.incomplete == 1 and result.total == 3
    assert result.average == 50 and result.completeness == pytest.approx(200/3)
    assert [row.score for row in result.rows] == [50, 50, None]
    assert result.rows[0].contributions[1].maximum == 15
    assert result.rows[2].contributions[1].reason
    assert project == before


def test_custom_weights_have_fixed_shares_on_incomplete_records(sample):
    item = definition(); item.questions[1].weight = 3
    result = calculate_indicator(sample[0], KoboSettings(), item)
    assert [row.score for row in result.rows] == [75, 25, None]
    assert [part.share for part in result.rows[-1].contributions] == [25, 75]
    assert result.rows[-1].contributions[0].contribution == 0


@pytest.mark.parametrize('method,expected', [('sum', 100/6), ('highest', 25)])
def test_multi_select_method_and_duplicate_option_handling(sample, method, expected):
    project = copy.deepcopy(sample[0])
    project['records'][0]['values']['group/needs'] = ['food', 'food']
    item = definition(); item.questions[1].multipleMethod = method
    result = calculate_indicator(project, KoboSettings(), item)
    assert result.rows[0].score == pytest.approx(expected)


def test_zero_point_answers_are_complete_not_missing(sample):
    item = definition(questions=[{'question': 'group/needs', 'kind': 'multiple', 'multipleMethod': 'highest', 'points': {'water': 1, 'food': 1, 'none': 0}}])
    result = calculate_indicator(sample[0], KoboSettings(), item)
    assert result.rows[1].status == 'complete' and result.rows[1].score == 0


@pytest.mark.parametrize('combine,expected', [('all', 50), ('any', 100)])
def test_percentage_conditions_use_unique_complete_responses(sample, combine, expected):
    item = definition(mode='percentage', conditionMatch=combine, higherMeaning='', questions=[
        {'question': 'group/gender', 'kind': 'category', 'selectedCodes': ['m']},
        {'question': 'group/needs', 'kind': 'multiple', 'selectedCodes': ['food', 'water', 'none']},
    ])
    project = copy.deepcopy(sample[0]); project['records'][0]['values']['group/needs'] = ['food', 'food', 'water']
    result = calculate_indicator(project, KoboSettings(), item)
    assert result.complete == 2 and result.incomplete == 1
    assert result.value == expected and result.denominator == 2 and result.numerator == expected/50
    assert result.rows[2].score is None
    assert result.questionPivots[1].rows[1].count == 1
    assert sum(r.completePercent for r in result.questionPivots[1].rows) == 150


def test_percentage_numeric_conditions_keep_nonmatching_values_in_denominator(sample):
    item = definition(mode='percentage', higherMeaning='', questions=[{'question': 'group/age', 'kind': 'number', 'ranges': [{'minimum': 0, 'maximum': 20, 'points': 1}]}])
    result = calculate_indicator(sample[0], KoboSettings(), item)
    assert result.value == 50 and result.complete == 2
    assert [r.score for r in result.rows] == [100, 0, None]
    assert result.questionPivots[0].unscorable == 0
    assert result.questionPivots[0].rows[-1].count == 1
    assert sum(r.completePercent for r in result.questionPivots[0].rows) == 100


@pytest.mark.parametrize('mode,expected,denominator', [('numeric_sum', 23, 2), ('numeric_average', 5.75, 4)])
def test_raw_numeric_calculations_use_complete_records_and_original_values(sample, mode, expected, denominator):
    project = copy.deepcopy(sample[0])
    other = copy.deepcopy(next(q for q in project['form']['questions'] if q['id'] == 'group/age')); other.update(id='group/other', name='other'); project['form']['questions'].append(other)
    for record, value in zip(project['records'], [-2, 5, 100]): record['values']['group/other'] = value
    item = definition(mode=mode, higherMeaning='', questions=[{'question': qid, 'kind': 'number'} for qid in ['group/age', 'group/other']])
    result = calculate_indicator(project, KoboSettings(), item)
    assert result.value == expected and result.numerator == 23 and result.denominator == denominator
    assert result.complete == 2 and result.incomplete == 1
    assert result.questionPivots[0].numericTotal == 20
    assert result.questionPivots[1].numericTotal == 3
    assert result.questionPivots[1].numericAverage == 1.5
    filtered = calculate_indicator(project, KoboSettings(filters=[{'field':'group/gender','kind':'category','values':['f']}]), item)
    assert filtered.complete == 1 and filtered.value == (-2 if mode == 'numeric_sum' else -1)


def test_pivot_complete_basis_reconciles_to_final_weighted_score(sample):
    item = definition(); item.questions[1].weight = 3
    result = calculate_indicator(sample[0], KoboSettings(), item)
    assert sum(p.averageContribution for p in result.questionPivots) == result.value == 50
    gender, needs = result.questionPivots
    assert gender.answered == 3 and gender.complete == 2
    assert gender.rows[0].count == 2 and gender.rows[0].completeCount == 1
    assert gender.rows[0].percent == pytest.approx(200/3) and gender.rows[0].completePercent == 50
    assert needs.missing == 1 and needs.answered == 2
    assert sum(r.completeCount for r in needs.rows) == 3


@pytest.mark.parametrize('changes', [
    {'mode':'percentage', 'questions':[{'question':'group/gender','kind':'category','selectedCodes':[]}]},
    {'mode':'percentage', 'questions':[{'question':'group/gender','kind':'category','selectedCodes':['unknown']}]},
    {'mode':'numeric_sum'},
])
def test_invalid_new_calculations_are_rejected(sample, changes):
    with pytest.raises(ValueError): calculate_indicator(sample[0], KoboSettings(), definition(**changes))


def test_new_modes_empty_results_and_unrecognized_answers(sample):
    item = definition(mode='percentage', higherMeaning='', questions=[{'question':'group/gender','kind':'category','selectedCodes':['f']}])
    project = copy.deepcopy(sample[0]); project['records'][0]['values']['group/gender'] = 'unknown'
    result = calculate_indicator(project, KoboSettings(), item)
    assert result.complete == 2 and result.incomplete == 1 and result.value == 50
    assert result.questionPivots[0].unscorable == 1
    empty = calculate_indicator(project, KoboSettings(filters=[{'field':'group/gender','kind':'category','values':['never']}]), item)
    assert empty.value is None and empty.numerator is None and empty.denominator == 0
    assert all(r.completePercent is None for r in empty.questionPivots[0].rows)


def test_unknown_options_missing_and_invalid_values_are_incomplete(sample):
    project = copy.deepcopy(sample[0])
    for record, value in zip(project['records'], [['water', 'unknown'], None, 'water']): record['values']['group/needs'] = value
    result = calculate_indicator(project, KoboSettings(), definition())
    assert result.average is None and result.complete == 0 and result.incomplete == 3
    assert all(row.score is None for row in result.rows)


def test_numeric_boundaries_gaps_and_zero(sample):
    item = definition(questions=[{'question': 'group/age', 'kind': 'number', 'ranges': [
        {'minimum': 0, 'maximum': 10, 'points': 0},
        {'minimum': 10, 'maximum': 20, 'includeMaximum': True, 'points': 4}]}])
    project = copy.deepcopy(sample[0])
    first = project['records'][0]
    project['records'] = [{**first, 'id': str(i), 'row': i+1, 'values': {**first['values'], 'group/age': value}} for i, value in enumerate([0, 9, 10, 20, 21, None])]
    result = calculate_indicator(project, KoboSettings(), item)
    assert [row.score for row in result.rows] == [0, 0, 100, 100, None, None]
    assert result.average == 50


@pytest.mark.parametrize('ranges', [
    [{'minimum': 0, 'maximum': 10, 'includeMaximum': True, 'points': 1}, {'minimum': 10, 'maximum': 20, 'points': 2}],
    [{'minimum': 10, 'maximum': 0, 'points': 1}],
    [{'minimum': 0, 'maximum': None, 'points': 1}, {'minimum': 20, 'maximum': 30, 'points': 2}],
])
def test_invalid_and_overlapping_numeric_ranges_are_rejected(sample, ranges):
    item = definition(questions=[{'question': 'group/age', 'kind': 'number', 'ranges': ranges}])
    with pytest.raises(ValueError, match='range'): calculate_indicator(sample[0], KoboSettings(), item)


@pytest.mark.parametrize('changes', [
    {'questions': []}, {'higherMeaning': ''},
    {'questions': [{'question': 'group/gender', 'kind': 'category', 'points': {'f': 0}}]},
    {'questions': [{'question': 'group/gender', 'kind': 'category', 'points': {'f': 0, 'm': 0}}]},
    {'questions': [{'question': 'group/needs', 'kind': 'multiple', 'points': {'water': 1, 'food': 1, 'none': 0}}]},
    {'questions': [{'question': 'missing', 'kind': 'category', 'points': {'a': 1}}]},
    {'questions': [{'question': 'group/respondent_name', 'kind': 'number', 'ranges': [{'points': 1}]}]},
])
def test_invalid_definitions_cannot_calculate(sample, changes):
    assert indicator_issues(sample[0], definition(**changes))
    with pytest.raises(ValueError): calculate_indicator(sample[0], KoboSettings(), definition(**changes))


@pytest.mark.parametrize('value', [-1, math.nan, math.inf])
def test_invalid_points_and_weights_are_rejected(value):
    with pytest.raises(ValidationError): IndicatorQuestion(question='q', kind='category', points={'a': value})
    with pytest.raises(ValidationError): IndicatorQuestion(question='q', kind='number', weight=value)


def test_repeat_unit_parent_answers_and_scope_validation(sample):
    project = copy.deepcopy(sample[0])
    project['form']['groups'].append({'id': 'visits', 'name': 'visits', 'labels': {}, 'repeat': True, 'parent': ''})
    project['form']['questions'].append({**copy.deepcopy(project['form']['questions'][2]), 'id': 'visits/age', 'name': 'age', 'repeat': 'visits'})
    project['records'].extend({'id': 'child'+str(i), 'parent': project['records'][parent]['id'], 'row': 10+i, 'scope': 'visits', 'values': {'visits/age': age}} for i, (parent, age) in enumerate([(0, 5), (0, None), (1, 5)]))
    item = definition(scope='visits', questions=[definition().questions[0].model_dump(), {'question': 'visits/age', 'kind': 'number', 'ranges': [{'points': 1}]}])
    result = calculate_indicator(project, KoboSettings(), item)
    assert result.total == 3 and result.complete == 2
    assert [row.score for row in result.rows] == [50, None, 100]
    item.scope = ''
    assert any('parent' in issue for issue in indicator_issues(project, item))
    item.scope = 'visits'
    orphan = {'id': 'orphan', 'row': 99, 'scope': 'visits', 'parent': 'absent', 'values': {'visits/age': 5}}
    scored = score_record(orphan, item, {q['id']: q for q in project['form']['questions']}, {}, 'en')
    assert scored.status == 'incomplete' and scored.contributions[0].reason == 'Parent response is missing.'


def test_filters_empty_cohort_and_paging(sample):
    settings = KoboSettings(filters=[{'field': 'group/gender', 'values': ['f']}])
    result = calculate_indicator(sample[0], settings, definition(), status='incomplete', page_size=1)
    assert result.total == 2 and result.complete == result.incomplete == 1
    assert len(result.rows) == 1 and result.rows[0].score is None
    assert calculate_indicator(sample[0], settings, definition(), status='incomplete', page=2, page_size=1).rows == []
    assert result.filterSummary and 'Female' in result.filterSummary[0]
    settings.filters[0].values = ['unknown']
    result = calculate_indicator(sample[0], settings, definition())
    assert result.total == 0 and result.average is None and result.completeness is None


def test_api_preview_results_review_save_and_no_response_mutation(preview_client):
    client, store, pid = preview_client
    before = store.get(pid)
    settings = KoboSettings.model_validate(before['settings'])
    item = definition()
    url = f'/api/kobo/projects/{pid}'
    body = {'settings': settings.model_dump(), 'indicator': item.model_dump()}
    response = client.post(url+'/indicators/preview', json=body)
    assert response.status_code == 200, response.text
    assert response.json()['average'] == 50
    assert store.get(pid) == before
    reviewed = client.post(url+'/indicators/records', json={**body, 'status': 'incomplete', 'pageSize': 1}).json()
    assert reviewed['matched'] == 1 and reviewed['rows'][0]['status'] == 'incomplete'
    settings.indicators = [item]
    assert client.put(url+'/settings', json=settings.model_dump()).status_code == 200
    summary = client.post(url+'/indicators/results', json={'settings': settings.model_dump()}).json()
    assert summary[0]['complete'] == 2 and summary[0]['rows'] == []
    assert store.get(pid)['records'] == before['records']
    item.questions[0].points['m'] = None
    bad = client.put(url+'/settings', json=settings.model_dump())
    assert bad.status_code == 400
    assert client.post(url+'/indicators/records', json={**body, 'page': 0}).status_code == 422


def test_reupload_and_shared_settings_flag_incompatible_indicators(sample, tmp_path):
    project = copy.deepcopy(sample[0]); settings = KoboSettings(indicators=[definition()])
    package = export_settings(project, settings)
    shared = preview_settings(project, KoboSettings(), package)
    assert not shared['settings']['indicators'][0]['reviewIssues']
    changed = copy.deepcopy(project)
    changed['form']['questions'][0]['choices'].append({'name': 'new', 'labels': {'en': 'New option'}})
    imported = preview_settings(changed, KoboSettings(), package)
    assert imported['settings']['indicators'][0]['reviewIssues']
    assert any('Indicator requires review' in note for note in imported['warnings'])
    store = ProjectStore(tmp_path/'indicators.sqlite3')
    saved = store.create('Indicator', project, b'', b'', settings)
    repaired = store.repair(saved['id'], changed, b'', b'')
    assert repaired['settings']['indicators'][0]['reviewIssues']
    with pytest.raises(ValueError): calculate_indicator(changed, KoboSettings(), IndicatorDefinition.model_validate(repaired['settings']['indicators'][0]))


def test_duplicate_definition_and_question_ids_are_rejected(sample):
    item = definition()
    with pytest.raises(ValidationError): KoboSettings(indicators=[item, item])
    item.questions.append(item.questions[0])
    assert any('only once' in issue for issue in indicator_issues(sample[0], item))


@pytest.mark.parametrize('mode', ['percentage', 'numeric_sum', 'numeric_average'])
def test_new_modes_persist_after_store_reopen_and_settings_share(sample, tmp_path, mode):
    questions = [{'question':'group/gender','kind':'category','selectedCodes':['f']}] if mode == 'percentage' else [{'question':'group/age','kind':'number'}]
    item = definition(mode=mode, questions=questions, higherMeaning='', conditionMatch='any')
    path = tmp_path/'reopen.sqlite3'; store = ProjectStore(path)
    saved = store.create('Saved indicator', sample[0], b'', b'')
    store.save(saved['id'], KoboSettings(indicators=[item]))
    reopened = ProjectStore(path).get(saved['id'])
    actual = IndicatorDefinition.model_validate(reopened['settings']['indicators'][0])
    assert actual == item
    expected = calculate_indicator(sample[0], KoboSettings(), item)
    shared = preview_settings(sample[0], KoboSettings(), export_settings(sample[0], KoboSettings(indicators=[item])))
    imported = IndicatorDefinition.model_validate(shared['settings']['indicators'][0])
    assert not imported.reviewIssues
    assert calculate_indicator(sample[0], KoboSettings(), imported).value == expected.value
    if mode == 'percentage':
        changed = copy.deepcopy(sample[0]); changed['form']['questions'][0]['choices'] = [c for c in changed['form']['questions'][0]['choices'] if c['name'] != 'f']
        assert indicator_issues(changed, imported)


def test_new_calculation_api_returns_pivots_and_final_equation(preview_client):
    client, store, pid = preview_client
    settings = KoboSettings.model_validate(store.get(pid)['settings'])
    settings.indicators = [definition(mode='percentage', higherMeaning='', questions=[{'question':'group/gender','kind':'category','selectedCodes':['f']}])]
    url = f'/api/kobo/projects/{pid}'
    assert client.put(url+'/settings', json=settings.model_dump()).status_code == 200
    saved = client.get(url).json()['settings']['indicators'][0]
    response = client.post(url+'/indicators/preview', json={'settings':settings.model_dump(),'indicator':saved})
    assert response.status_code == 200
    result = response.json()
    assert result['value'] == pytest.approx(200/3) and result['numerator'] == 2 and result['denominator'] == 3
    assert result['questionPivots'][0]['rows'][0]['completeCount'] == 2
