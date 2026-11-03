from copy import deepcopy

import pytest

from backend.kobo import KoboSettings, QuestionSettings, analyze
from backend.kobo_data import data_rows
from backend.kobo_excel import source_rows
from backend.test_kobo_answer_order import fixture


def result(project, settings, qid='answer'):
    return next(q for q in analyze(project, settings)['questions'] if q['id'] == qid)


@pytest.mark.parametrize('mode', ['page', 'own'])
@pytest.mark.parametrize('percentage', ['legacy-respondents', 'grand-total', 'column-total', 'row-total', 'breakdown-group'])
def test_exclusions_precede_calculations_and_drilldown(mode, percentage):
    project = fixture()
    before = deepcopy(project)
    cfg = QuestionSettings(hiddenAnswers=['b'], filterMode=mode, ownFilters=[{'field':'region','values':['north']}], breakdowns=['region'], percentageMode=percentage)
    settings = KoboSettings(hideZero=False, filters=[{'field':'region','values':['north']}], questions={'answer':cfg})
    snapshot = result(project, settings)
    assert snapshot['denominator'] == snapshot['total'] == 2
    assert {row['id'] for row in snapshot['rows']} == {'a', 'c'}
    assert snapshot['breakdowns'][0]['denominator'] == 2
    records = data_rows(project, settings, '', ['answer'], drilldown={'question':'answer'})
    assert len(records['rows']) == 2
    assert {row[0] for row in source_rows(project, snapshot, settings)} == {'0', '1'}
    assert result(project, settings, 'region')['denominator'] == 4
    assert project == before


def test_multiple_excludes_whole_records_and_recalculates_measures_and_trends():
    project = fixture()
    project['form']['questions'][0]['kind'] = 'multiple'
    for record in project['records']:
        record['values']['answer'] = list(dict.fromkeys([record['values']['answer'], 'a']))
    settings = KoboSettings(questions={'answer':QuestionSettings(hiddenAnswers=['b'], percentageMode='grand-total', calculation={'operation':'sum','field':'number'}, trendDateField='date', chart='line')})
    snapshot = result(project, settings)
    assert snapshot['denominator'] == 4
    rows = {r['id']:r for r in snapshot['rows']}
    assert set(rows) == {'a', 'c'}
    assert rows['a']['count'] == 4
    assert rows['a']['value'] == 30
    assert rows['c']['value'] == 30
    assert snapshot['measureTotal']['value'] == 30
    assert all(s['id'] != 'b' for s in snapshot['trend']['series'])
    assert len(data_rows(project, settings, '', ['answer'], drilldown={'question':'answer','answer':'a'})['rows']) == 4


def test_blanks_all_hidden_and_roundtrip_restore():
    project = fixture()
    project['records'][0]['values']['answer'] = None
    settings = KoboSettings(hideBlanks=False, questions={'answer':QuestionSettings(hiddenAnswers=['a','b','c','__blank__'])})
    settings = KoboSettings.model_validate_json(settings.model_dump_json())
    snapshot = result(project, settings)
    assert snapshot['rows'] == []
    assert snapshot['denominator'] == snapshot['missing'] == snapshot['total'] == 0
    settings.questions['answer'].hiddenAnswers = []
    assert result(project, settings)['total'] == 7
    assert result(project, settings)['rows'][-1]['id'] == '__blank__'


def test_text_codes_and_repeat_entries():
    project = fixture()
    q = project['form']['questions'][0]
    q.update(kind='text', choices=[], repeat='children')
    project['records'].append(dict(id='parent',parent='',scope='',row=1,sheet=0,values={}))
    for record in project['records'][:-1]:
        record['scope'] = 'children'
        record['parent'] = 'parent'
    settings = KoboSettings(questions={'answer':QuestionSettings(hiddenAnswers=['b'])})
    snapshot = result(project, settings)
    assert snapshot['total'] == 4
    assert {r['id'] for r in snapshot['rows']} == {'a','c'}


def test_numeric_and_date_exclusions_are_not_applied():
    project = fixture()
    settings = KoboSettings(questions={'number':QuestionSettings(hiddenAnswers=['10']), 'date':QuestionSettings(hiddenAnswers=['2026-02'])})
    assert result(project, settings, 'number')['total'] == 7
    assert result(project, settings, 'date')['total'] == 7


def test_shared_settings_validate_hidden_answer_codes():
    from backend.kobo_settings_share import export_settings, preview_settings
    project = fixture()
    incoming = KoboSettings(questions={'answer':QuestionSettings(hiddenAnswers=['b','removed'])})
    preview = preview_settings(project, KoboSettings(), export_settings(project, incoming))
    assert preview['settings']['questions']['answer']['hiddenAnswers'] == ['b']
    assert any('hidden answers' in warning for warning in preview['warnings'])


@pytest.mark.parametrize('kind,engine', [('category','native'), ('multiple','binary'), ('multiple','native')])
def test_live_excel_config_and_seed_values_keep_exclusions(kind, engine):
    from backend.kobo_excel_source import response_layout, query_config, multi_config, query_formula
    from backend.kobo_excel_direct import direct_helpers
    from backend.kobo_excel_prepare import helper_values, materialize_multi
    project = fixture()
    project['form']['questions'][0]['kind'] = kind
    if kind == 'multiple':
        for record in project['records']:
            record['values']['answer'] = list(dict.fromkeys([record['values']['answer'], 'a']))
    settings = KoboSettings(questions={'answer':QuestionSettings(hiddenAnswers=['b'])})
    snapshot = analyze(project, settings, 'answer')
    layouts = response_layout(project, settings)
    config = query_config(project, snapshot, settings, [], layouts)
    config['excelMode'] = engine
    assert config['questions'][0]['hiddenAnswers'] == ['b']
    if engine == 'native' and kind == 'multiple':
        local = multi_config(config, config['questions'][0])
        rows = materialize_multi((local, project['records']))
        assert not any(row[4] in {'2','3','6'} for row in rows)
        assert 'hiddenAnswers' in query_formula(local)
    else:
        helpers, sources = direct_helpers(config, layouts)
        included = sources['answer']['fields']['IncludeInPivot']
        formula = helpers[''][included]
        assert 'Excluded' in formula and ('FIND' in formula if kind=='multiple' else 'EXACT' in formula)
        values = helper_values(layouts, config, sources, helpers)[0]
        index = list(helpers['']).index(included)
        assert [row[index] for row in values] == ['Included','Included','Excluded','Excluded','Included','Included','Excluded']


@pytest.mark.parametrize('percentage', ['legacy-respondents', 'grand-total', 'column-total', 'row-total', 'breakdown-group'])
@pytest.mark.parametrize('kind', ['category', 'multiple', 'text'])
@pytest.mark.parametrize('operation', ['count', 'sum', 'average'])
def test_original_percentages_preserve_complete_calculations(percentage, kind, operation):
    project = fixture()
    project['form']['questions'][0]['kind'] = kind
    if kind == 'multiple':
        for record in project['records']:
            record['values']['answer'] = list(dict.fromkeys([record['values']['answer'], 'a']))
    cfg = QuestionSettings(percentageMode=percentage, breakdowns=['region'], trendDateField='date', chart='line',
        calculation={'operation':operation,'field':'number'} if operation != 'count' else None)
    settings = KoboSettings(questions={'answer':cfg}, filters=[{'field':'region','values':['north']}])
    before = deepcopy(project)
    original = result(project, settings)
    settings.questions['answer'] = cfg.model_copy(update={'hiddenAnswers':['b'], 'hiddenAnswerPercentageMode':'keep-original'})
    actual = result(project, settings)
    assert actual['rows'] == [row for row in original['rows'] if row['id'] != 'b']
    for key in (['denominator','total','missing','measureTotal','statistics'] if operation == 'count' else ['denominator','total','missing','breakdowns','pivotTotal','measureTotal','statistics']):
        assert actual.get(key) == original.get(key)
    assert actual['trend']['series'] == [series for series in original['trend']['series'] if series['id'] != 'b']
    assert actual['trend']['percentageSeries'] == original['trend']['series']
    assert project == before
    assert 'Hidden answers remain included' in actual['percentageBasis']
    assert len(data_rows(project, settings, '', ['answer'], drilldown={'question':'answer','answer':'a'})['rows']) == (4 if kind == 'multiple' else 1)


def test_sixty_forty_and_restore_original_preference():
    project = fixture()
    project['records'] = project['records'][:5]
    for index, record in enumerate(project['records']): record['values']['answer'] = 'a' if index < 3 else 'b'
    cfg = QuestionSettings(percentageMode='grand-total',hiddenAnswers=['b'])
    settings = KoboSettings(questions={'answer':cfg})
    assert result(project, settings)['rows'][0]['percent'] == 100
    cfg.hiddenAnswerPercentageMode = 'keep-original'
    assert result(project, settings)['rows'][0]['percent'] == 60
    cfg.hiddenAnswers = ['a','b','c','__blank__']
    assert result(project, settings)['rows'] == []
    assert result(project, settings)['denominator'] == 5
    cfg.hiddenAnswers = []
    restored = result(project, KoboSettings.model_validate_json(settings.model_dump_json()))
    assert len(restored['rows']) == 2
    assert cfg.hiddenAnswerPercentageMode == 'keep-original'
    assert QuestionSettings().hiddenAnswerPercentageMode == 'adjust'


@pytest.mark.parametrize('kind', ['category','multiple'])
def test_original_live_excel_sources_keep_hidden_selections(kind):
    from backend.kobo_excel_source import query_config, response_layout
    from backend.kobo_excel_direct import direct_helpers
    from backend.kobo_excel_ratio import selection_base
    from backend.kobo_settings_share import export_settings, preview_settings
    project = fixture()
    project['form']['questions'][0]['kind'] = kind
    if kind == 'multiple':
        for record in project['records']: record['values']['answer'] = [record['values']['answer'], 'a']
    cfg = QuestionSettings(hiddenAnswers=['b'],hiddenAnswerPercentageMode='keep-original',percentageMode='grand-total')
    settings = KoboSettings(questions={'answer':cfg})
    snapshot = analyze(project, settings, 'answer')
    layouts = response_layout(project, settings)
    config = query_config(project, snapshot, settings, [], layouts)
    question = config['questions'][0]
    assert question['hiddenAnswers'] == []
    assert 'b' in {a['id'] for a in question['answers']}
    config['excelMode'] = 'binary'
    helpers, sources = direct_helpers(config, layouts)
    assert 'AnswerAllowed' not in sources['answer']['fields']
    local = {**snapshot['questions'][0], '_source':sources['answer'], '_countPivot':'Counts!A1'}
    denominator = selection_base('Totals!A1',local)
    assert 'b' in denominator
    shared = preview_settings(project,KoboSettings(),export_settings(project,settings))
    assert shared['settings']['questions']['answer']['hiddenAnswerPercentageMode'] == 'keep-original'


@pytest.mark.parametrize('percentage', ['legacy-respondents','grand-total','column-total','row-total','breakdown-group'])
def test_original_top_n_trend_other_excludes_hidden_series_but_keeps_their_base(percentage):
    project = fixture()
    cfg = QuestionSettings(percentageMode=percentage,trendDateField='date',chart='line',chartTopN=1,chartOther=True)
    settings = KoboSettings(questions={'answer':cfg})
    original = result(project,settings)
    cfg.hiddenAnswers = ['b']
    cfg.hiddenAnswerPercentageMode = 'keep-original'
    actual = result(project,settings)
    projection = actual['chartProjection']
    assert {row['id'] for row in projection['rows']} == {'c','__chart_other__'}
    other = next(series for series in projection['trend']['series'] if series['id']=='__chart_other__')
    answer_a = next(series for series in original['trend']['series'] if series['id']=='a')
    for expected,point in zip(answer_a['points'],other['points']):
        assert point['count'] == expected['count']
        assert point['percent'] == pytest.approx(expected['percent']) if expected['percent'] is not None else point['percent'] is None


def test_original_hidden_blank_and_repeat_cohort():
    project=fixture()
    project['records'][0]['values']['answer']=None
    cfg=QuestionSettings(hiddenAnswers=['__blank__','b'],hiddenAnswerPercentageMode='keep-original')
    settings=KoboSettings(hideBlanks=False,questions={'answer':cfg})
    actual=result(project,settings)
    assert actual['missing']==1 and actual['total']==7
    assert {row['id'] for row in actual['rows']}=={'c'}
    question=project['form']['questions'][0];question['repeat']='children'
    for record in project['records']:record.update(scope='children',parent='parent')
    project['records'].append(dict(id='parent',parent='',scope='',row=1,sheet=0,values={}))
    assert result(project,settings)['total']==7


@pytest.mark.parametrize('mode', ['adjust', 'keep-original'])
def test_visibility_summary_keeps_original_answered_missing_and_total(mode):
    project = fixture()
    project['records'][0]['values']['answer'] = None
    settings = KoboSettings(hideBlanks=False, questions={'answer': QuestionSettings(hiddenAnswers=['b', '__blank__'], hiddenAnswerPercentageMode=mode)})
    snapshot = result(project, settings)
    original = result(project, KoboSettings(hideBlanks=False))
    visible = result(project, KoboSettings(hideBlanks=False, questions={'answer': QuestionSettings(hiddenAnswers=['b', '__blank__'])}))
    from backend.kobo_api import QuestionResult
    assert QuestionResult.model_validate(snapshot).model_dump()['answerVisibility'] == snapshot['answerVisibility']
    assert snapshot['answerVisibility'] == {'shown': visible['denominator'], 'answered': original['denominator'],
        'missing': original['missing'], 'total': original['total'], 'hiddenCount': 2}
    restored = result(project, KoboSettings(hideBlanks=False))
    assert 'answerVisibility' not in restored


def test_visibility_summary_respects_page_filters_and_all_answers_hidden():
    project = fixture()
    settings = KoboSettings(filters=[{'field':'region','values':['north']}], questions={'answer':QuestionSettings(hiddenAnswers=['a','b','c'])})
    snapshot = result(project, settings)
    assert snapshot['answerVisibility'] == {'shown':0, 'answered':4, 'missing':0, 'total':4, 'hiddenCount':3}


@pytest.mark.parametrize('percentage',['legacy-respondents','grand-total','column-total'])
def test_hidden_count_totals_show_visible_share_of_original_base(percentage):
    project=fixture()
    template=deepcopy(project['records'][0])
    project['records']=[]
    for index in range(344):
        record=deepcopy(template);record['id']=str(index)
        record['values']['answer']='a' if index<226 else 'c' if index<247 else 'b'
        project['records'].append(record)
    cfg=QuestionSettings(hiddenAnswers=['b'],percentageMode=percentage)
    settings=KoboSettings(questions={'answer':cfg})
    adjusted=result(project,settings)
    assert adjusted.get('pivotTotal',{}).get('count',adjusted['denominator'])==247
    cfg.hiddenAnswerPercentageMode='keep-original'
    kept=result(project,settings)
    assert kept['pivotTotal']['count']==247
    assert kept['pivotTotal']['percent']==pytest.approx(247/344*100)
    assert kept['denominator']==344
    assert kept['answerVisibility']['shown']==247


def test_hidden_original_breakdown_totals_use_visible_counts():
    project=fixture()
    settings=KoboSettings(questions={'answer':QuestionSettings(hiddenAnswers=['b'],hiddenAnswerPercentageMode='keep-original',breakdowns=['region'])})
    actual=result(project,settings)
    for column in actual['breakdowns']:
        count=sum(cell['count'] for row in actual['rows'] if row['id']!='__blank__' for cell in row.get('series',[]) if cell['id']==column['id'])
        assert column['totalCount']==count
        assert column['totalPercent']==(count/column['denominator']*100 if column['denominator'] else None)
