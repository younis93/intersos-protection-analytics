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
