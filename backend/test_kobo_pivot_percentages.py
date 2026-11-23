import pytest
from backend.kobo import KoboSettings,QuestionSettings,analyze,new_project_settings
from backend.kobo_measures import Calculation
from backend.test_kobo_answer_order import fixture

@pytest.mark.parametrize('mode',['grand-total','column-total','row-total'])
@pytest.mark.parametrize('operation',['count','sum'])
def test_additive_percentages_and_margins(mode,operation):
    p=fixture();p['form']['questions'][0]['kind']='multiple'
    for r in p['records']:r['values']['answer']=['a','b']
    cfg=QuestionSettings(percentageMode=mode,breakdowns=['region'],calculation=Calculation(operation='sum',field='number') if operation=='sum' else None)
    result=analyze(p,KoboSettings(questions={'answer':cfg}))['questions'][0]
    assert result['pivotTotal']['value' if operation=='sum' else 'count']==(120 if operation=='sum' else 14)
    cells=[cell for row in result['rows'] for cell in row['series']]
    if mode=='grand-total':assert sum(c['percent'] for c in cells)==pytest.approx(100)
    elif mode=='column-total':
        for column in result['breakdowns']:assert sum(c['percent'] for c in cells if c['id']==column['id'])==pytest.approx(100)
        assert all(c['totalPercent']==100 for c in result['breakdowns'])
    else:
        assert all(sum(c['percent'] for c in row['series'])==pytest.approx(100) for row in result['rows'])
        assert all(row['percent']==100 for row in result['rows'])
    assert result['denominator']==7

def test_blank_answers_zero_and_negative_bases():
    p=fixture();p['records'][0]['values']['answer']=None
    cfg=QuestionSettings(percentageMode='grand-total',breakdowns=['region'])
    result=analyze(p,KoboSettings(hideBlanks=False,questions={'answer':cfg}))['questions'][0]
    assert result['pivotTotal']['count']==7
    assert sum(c['count'] for r in result['rows'] for c in r['series'])==7
    for i,r in enumerate(p['records']):r['values']['number']=0
    cfg.calculation=Calculation(operation='sum',field='number')
    result=analyze(p,KoboSettings(hideBlanks=False,questions={'answer':cfg}))['questions'][0]
    assert result['pivotTotal']['value']==0 and result['pivotTotal']['percent'] is None
    assert all(c['percent'] is None for row in result['rows'] for c in row['series'])

def test_existing_defaults_are_legacy_new_projects_use_grand_total():
    assert QuestionSettings().percentageMode=='legacy-respondents'
    p=fixture();assert all(q.percentageMode=='grand-total' for q in new_project_settings(p['form']).questions.values())

@pytest.mark.parametrize(('rows','columns','expected'), [
    ('all','all',2/8), ('visible','all',2/4),
    ('all','visible',2/5), ('visible','visible',2/3),
])
def test_hidden_rows_and_columns_have_independent_percentage_scopes(rows, columns, expected):
    project = fixture()
    # Two hidden answers per region, with three visible selections in the north.
    project['records'][0]['values']['answer'] = 'b'
    project['records'][2]['values']['answer'] = 'a'
    project['records'][3]['values']['answer'] = 'a'
    project['records'].append({**project['records'][1], 'id':'7', 'row':9})
    cfg = QuestionSettings(percentageMode='grand-total', breakdowns=['region'], hiddenAnswers=['c'],
                           additiveAnswerScope=rows, hiddenPivotColumns=['south'], hiddenColumnPercentageScope=columns)
    result = analyze(project, KoboSettings(questions={'answer':cfg}), 'answer')['questions'][0]
    row = next(row for row in result['rows'] if row['id'] == 'a')
    cell = next(cell for cell in row['series'] if cell['id'] == 'north')
    assert cell['count'] == 2
    assert cell['percent'] == pytest.approx(expected * 100)
    assert result['pivotTotal']['count'] == 4


@pytest.mark.parametrize(('mode','expected'), [
    ('row-total', 100), ('column-total', 50), ('breakdown-group', 50),
    ('legacy-respondents', 50), ('visible-selections', 50),
])
def test_column_scope_respects_the_active_percentage_basis(mode, expected):
    project = fixture()
    cfg = QuestionSettings(percentageMode=mode, breakdowns=['region'],
                           hiddenPivotColumns=['south'], hiddenColumnPercentageScope='visible')
    result = analyze(project, KoboSettings(questions={'answer':cfg}), 'answer')['questions'][0]
    row = next(row for row in result['rows'] if row['id'] == 'b')
    north = next(cell for cell in row['series'] if cell['id'] == 'north')
    assert north['percent'] == pytest.approx(expected)
    assert row['count'] == 3
    assert result['pivotTotal']['count'] == 7


def test_empty_visible_column_base_and_counts_for_a_sum():
    cfg = QuestionSettings(percentageMode='grand-total', breakdowns=['region'],
                           hiddenPivotColumns=['north','south'], hiddenColumnPercentageScope='visible',
                           calculation=Calculation(operation='sum', field='number'))
    result = analyze(fixture(), KoboSettings(questions={'answer':cfg}), 'answer')['questions'][0]
    assert result['pivotTotal']['value'] == 60
    assert result['pivotTotal']['percent'] is None
    assert all(row['percent'] is None for row in result['rows'])
    assert all(column['totalPercent'] is None for column in result['breakdowns'])


def test_scoped_chart_other_uses_the_original_top_n_answers_and_visible_percentages():
    project = fixture()
    cfg = QuestionSettings(percentageMode='grand-total', breakdowns=['region'],
                           hiddenPivotColumns=['south'], hiddenColumnPercentageScope='visible',
                           chartTopN=1, chartOther=True)
    baseline = analyze(project, KoboSettings(questions={'answer':cfg.model_copy(update={'hiddenColumnPercentageScope':'all'})}), 'answer')['questions'][0]
    result = analyze(project, KoboSettings(questions={'answer':cfg}), 'answer')['questions'][0]
    original, scoped = baseline['chartProjection']['rows'], result['chartProjection']['rows']
    assert [row['id'] for row in scoped] == [row['id'] for row in original]
    assert [row['count'] for row in scoped] == [row['count'] for row in original]
    assert sum(row['percent'] for row in scoped) == pytest.approx(100)

def test_hidden_columns_respect_the_group_level_of_a_nested_breakdown():
    import json
    project = fixture()
    question = dict(project['form']['questions'][1], id='site', name='site', choices=[])
    project['form']['questions'].append(question)
    for i, record in enumerate(project['records']):
        record['values']['site'] = 'one' if i % 2 == 0 else 'two'
    north_two = json.dumps(('north', 'two'))
    cfg = QuestionSettings(percentageMode='breakdown-group', breakdowns=['region', 'site'],
                           hiddenPivotColumns=[north_two], hiddenColumnPercentageScope='visible')
    result = analyze(project, KoboSettings(questions={'answer':cfg}), 'answer')['questions'][0]
    columns = {(column['values'][0], column['values'][1]): column for column in result['breakdowns']}
    assert columns['north','one']['totalPercent'] == 100
    assert columns['south','one']['totalPercent'] == pytest.approx(200/3)
    assert columns['north','two']['totalPercent'] is None
    assert result['pivotTotal']['count'] == 7


def test_hidden_columns_limit_the_linked_respondent_base_and_keep_full_counts():
    from backend.kobo_api import AnalysisResponse
    from backend.test_kobo_connections import project

    data = project()
    data['records'][0]['values']['region'] = 'south'
    cfg = QuestionSettings(percentageBase='parent', percentageParent='main', breakdowns=['region'],
                           hiddenPivotColumns=['south'], hiddenColumnPercentageScope='visible')
    snapshot = analyze(data, KoboSettings(questions={'follow':cfg}), 'follow')
    result = AnalysisResponse.model_validate(snapshot).model_dump()['questions'][0]
    a = next(row for row in result['rows'] if row['id'] == 'a')
    assert result['respondentBasis']['denominator'] == 49
    assert a['count'] == 3
    assert a['percentageCount'] == 2
    assert a['percent'] == pytest.approx(200/49)
    assert result['pivotTotal']['count'] == 5

def test_answer_filter_summary_uses_the_same_visible_column_base_as_the_pivot():
    cfg = QuestionSettings(percentageMode='grand-total', breakdowns=['region'],
                           answerFilters=[{'field':'answer','values':['b']}],
                           hiddenPivotColumns=['south'], hiddenColumnPercentageScope='visible')
    result = analyze(fixture(), KoboSettings(questions={'answer':cfg}), 'answer')['questions'][0]
    assert result['percentageSummary'] == {'numerator': 2, 'denominator': 4, 'visibleColumnsOnly': True,
                                           'rowScope': None, 'columnScope': 'excluded'}
    assert result['answerFilterSummary']['count'] == 2
    assert result['answerFilterSummary']['denominator'] == 4
    assert result['answerFilterSummary']['percent'] == 50
    assert result['pivotTotal']['count'] == 3
    assert result['pivotTotal']['percent'] == 50

def test_answer_filter_reports_the_effective_hidden_row_policy():
    project = fixture()
    cfg = QuestionSettings(percentageMode='grand-total', hiddenAnswers=['c'],
                           answerFilters=[{'field': 'answer', 'values': ['b']}], additiveAnswerScope='visible')
    result = analyze(project, KoboSettings(questions={'answer': cfg}), 'answer')['questions'][0]
    assert result['percentageSummary']['rowScope'] == 'answer-filter-excluded'
    assert result['answerFilterSummary']['denominator'] == 4
    assert result['answerFilterSummary']['count'] == 3

    include = cfg.model_copy(update={'additiveAnswerScope': 'all'})
    included = analyze(project, KoboSettings(questions={'answer':include}), 'answer')['questions'][0]
    assert included['percentageSummary']['rowScope'] == 'display-only'
    assert included['answerFilterSummary']['denominator'] == 7
    assert included['answerFilterSummary']['count'] == 3

    legacy_filter = cfg.model_copy(update={'additiveAnswerScope': None})
    result = analyze(project, KoboSettings(questions={'answer': legacy_filter}), 'answer')['questions'][0]
    assert result['percentageSummary']['rowScope'] == 'cohort-excluded'
    assert result['answerFilterSummary']['denominator'] == 4

@pytest.mark.parametrize('decimals', [0, 1, 2])
def test_grand_total_balances_displayed_shares_of_visible_answers(decimals):
    from backend.kobo_pivot_percentages import apply_pivot_percentages

    counts = [201, 6, 2, 1, 1]
    rows = [{'id': str(i), 'count': count} for i, count in enumerate(counts)]
    result = {'rows': rows, 'breakdowns': [], 'denominator': 211, 'percentageDecimals': decimals}
    cfg = QuestionSettings(percentageMode='grand-total', hiddenAnswers=['hidden'], additiveAnswerScope='visible')
    apply_pivot_percentages(result, cfg)

    assert [row['percent'] for row in rows] == pytest.approx([count / 211 * 100 for count in counts])
    assert sum(row['displayPercent'] for row in rows) == pytest.approx(100)
    assert result['pivotTotal']['count'] == 211

    original = {**result, 'rows': [*rows, {'id':'hidden', 'count':10}]}
    apply_pivot_percentages(result, cfg.model_copy(update={'additiveAnswerScope':'all'}), original)
    assert result['pivotTotal']['percent'] == pytest.approx(211 / 221 * 100)
    assert sum(row['displayPercent'] for row in rows) < 100

@pytest.mark.parametrize('scope', ['all','visible'])
def test_hidden_selection_share_counts_both_axes_once(scope):
    project = fixture()
    project['form']['questions'][0]['kind'] = 'multiple'
    for record in project['records']:
        record['values']['answer'] = ['b','c']
    cfg = QuestionSettings(percentageMode='grand-total', breakdowns=['region'], hiddenAnswers=['c'],
                           additiveAnswerScope=scope, hiddenPivotColumns=['south'], hiddenColumnPercentageScope=scope)
    result = analyze(project, KoboSettings(questions={'answer':cfg}), 'answer')['questions'][0]
    assert result['hiddenAnswerSelections'] == {'hidden': 10, 'total': 14}


@pytest.mark.parametrize('mode', ['legacy-respondents','grand-total'])
def test_answer_filter_excludes_hidden_only_responses_but_keeps_mixed_choices(mode):
    project = fixture()
    project['form']['questions'][0]['kind'] = 'multiple'
    for record, choices in zip(project['records'], [['a'], ['c'], ['b','c'], ['b'], ['c'], ['c'], ['b']]):
        record['values']['answer'] = choices
    cfg = QuestionSettings(percentageMode=mode, breakdowns=['region'], hiddenAnswers=['c'],
                           additiveAnswerScope='visible', hiddenPivotColumns=['south'], hiddenColumnPercentageScope='visible',
                           answerFilters=[{'field':'answer','values':['b']}])
    result = analyze(project, KoboSettings(questions={'answer':cfg}), 'answer')['questions'][0]
    assert result['answerFilterSummary']['denominator'] == 3
    assert result['answerFilterSummary']['count'] == 2
    include = cfg.model_copy(update={'additiveAnswerScope':'all'})
    result = analyze(project, KoboSettings(questions={'answer':include}), 'answer')['questions'][0]
    assert result['answerFilterSummary']['denominator'] == 4
    assert result['answerFilterSummary']['count'] == 2
