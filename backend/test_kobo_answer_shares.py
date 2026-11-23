import pytest

from backend.kobo import KoboFilter, KoboSettings, QuestionSettings, analyze
from backend.kobo_api import QuestionResult
from backend.kobo_data import data_rows
from backend.test_kobo_answer_order import fixture


def test_selected_answer_share_uses_filtered_source_and_survives_api_serialization():
    project = fixture()
    project['records'][0]['values'].pop('answer')
    settings = KoboSettings(
        filters=[{'field': 'region', 'values': ['north']}],
        questions={'number': QuestionSettings(
            chart='bar', breakdowns=['region'], answerStackMode='percent',
            answerShareQuestion='answer', answerShareAnswer='b',
        )},
    )

    result = QuestionResult.model_validate(analyze(project, settings, 'number')['questions'][0]).model_dump()

    assert result['answerShare'] == {
        'questionLabel': 'answer', 'answerLabel': 'b',
        'count': 2, 'denominator': 3, 'percent': 200 / 3,
    }
    assert result['answerStack']['groups'] == [{'id': 'north', 'label': 'north', 'counts': {'b': 2, 'c': 1}}]
    assert result['answerStack']['highlightedAnswer'] == 'b'
    assert result['denominator'] == 4


def test_multiple_select_share_counts_people_once_and_returns_null_for_empty_data():
    project = fixture()
    project['form']['questions'][0].update(kind='multiple', type='select_multiple')
    for record in project['records']:
        value = record['values']['answer']
        record['values']['answer'] = [value, value, 'a']
    settings = KoboSettings(hideEmpty=False, questions={'answer': QuestionSettings(
        chart='column', breakdowns=['region'], answerStackMode='count',
        answerShareQuestion='answer', answerShareAnswer='a',
    )})

    result = analyze(project, settings, 'answer')['questions'][0]
    assert result['answerShare']['percent'] == 100
    assert result['answerStack']['multiple']
    assert [group['counts']['a'] for group in result['answerStack']['groups']] == [4, 3]

    project['records'].clear()
    result = analyze(project, settings, 'answer')['questions'][0]
    assert result['answerShare']['denominator'] == 0
    assert result['answerShare']['percent'] is None
    assert result['answerStack']['groups'] == []


def test_selected_answer_percentage_keeps_the_unfiltered_base_across_pivot_and_chart():
    project = fixture()
    project['records'] = [
        {**project['records'][index % 7], 'id': str(index), 'values': {
            'answer': 'a' if index < 56 else 'b',
            'region': 'north' if index < 30 or 56 <= index < 80 else 'south',
            'number': 10,
        }} for index in range(100)
    ]
    settings = KoboSettings(questions={'region': QuestionSettings(
        chart='pie', chartTopN=1, chartOther=True, percentageMode='row-total',
        answerFilters=[{'field': 'answer', 'values': ['a']}],
        answerShareQuestion='answer', answerShareAnswer='a',
    )})
    raw = analyze(project, settings, 'region')['questions'][0]
    result = QuestionResult.model_validate(raw).model_dump()
    assert result['percentageMode'] == 'answer-filter'
    assert result['pivotTotal']['percent'] == pytest.approx(56)
    assert result['pivotTotal']['count'] == 56
    assert result['answerFilterSummary']['denominator'] == 100
    assert result['answerShare'] is None
    assert result['chart'] == 'bar'
    assert [(row['id'], row['displayPercent']) for row in result['rows']] == [('north', 30), ('south', 26)]
    assert [(row['id'], row['displayPercent']) for row in result['chartProjection']['rows']] == [('north', 30), ('__chart_other__', 26)]
    assert result['filterMode'] == 'page'

    cfg = settings.questions['region']
    cfg.breakdowns = ['answer']
    cfg.chart = 'bar'
    result = analyze(project, settings, 'region')['questions'][0]
    assert result['breakdowns'][0]['totalPercent'] == pytest.approx(56)
    assert result['rows'][0]['series'][0]['displayPercent'] == 30
    drilldown = data_rows(project, settings, '', ['region'], drilldown={'question': 'region'})
    assert len(drilldown['rows']) == 56
    assert drilldown['total'] == 56
    cfg.answerFilters = []
    assert analyze(project, settings, 'region')['questions'][0]['percentageMode'] == 'row-total'


def test_answer_matches_are_deduplicated_and_use_page_and_question_filters():
    project = fixture()
    project['form']['questions'][0].update(kind='multiple', type='select_multiple')
    choices = [['a','b'], ['b'], ['c'], [], ['c'], ['a'], ['b']]
    for record, values in zip(project['records'], choices):
        record['values']['answer'] = values
    settings = KoboSettings(filters=[{'field': 'region', 'values': ['north']}], questions={'answer': QuestionSettings(
        filterMode='additional', ownFilters=[{'field': 'number', 'kind': 'number', 'minimum': 0}],
        answerFilters=[{'field': 'answer', 'values': ['a','b']}],
    )})
    result = analyze(project, settings, 'answer')['questions'][0]
    assert result['answerFilterSummary']['count'] == 2
    assert result['answerFilterSummary']['denominator'] == 3
    assert sum(row['count'] for row in result['rows']) == 3
    assert result['pivotTotal']['percent'] == pytest.approx(100 * 2 / 3)
    settings.questions['answer'].answerFilters.append(KoboFilter(field='region', values=['south']))
    # The two source questions must both match, even when the checked values overlap.
    result = analyze(project, settings, 'answer')['questions'][0]
    assert result['answerFilterSummary']['count'] == 0
    assert result['answerFilterSummary']['denominator'] == 3
    settings.questions['answer'].answerFilters.pop()
    settings.questions['answer'].answerFilters[0].values = ['a']
    settings.questions['answer'].ownFilters[0].minimum = 10.0
    result = analyze(project, settings, 'answer')['questions'][0]
    assert result['pivotTotal']['percent'] == 0
    settings.questions['answer'].ownFilters[0].minimum = 100.0
    result = analyze(project, settings, 'answer')['questions'][0]
    assert result['pivotTotal']['percent'] is None
