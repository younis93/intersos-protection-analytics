from copy import deepcopy
import pytest
from backend.kobo import KoboFilter,KoboSettings,QuestionSettings,analyze,resolved_question_settings
from backend.kobo_data import data_rows
from backend.kobo_measures import Calculation
from backend.kobo_saved_views import snapshot_issues
from backend.test_kobo_answer_order import fixture


def answer(project,settings):return next(q for q in analyze(project,settings)['questions'] if q['id']=='answer')


def test_own_filters_replace_page_filters_and_empty_own_filters_keep_independence():
    project=fixture()
    settings=KoboSettings(filters=[{'field':'region','values':['north']}],questions={'answer':QuestionSettings(filterMode='own',ownFilters=[{'field':'region','values':['south']}])})
    before=deepcopy(settings.model_dump())
    result=answer(project,settings)
    assert result['cohortCount']==3 and result['denominator']==3
    assert [(r['id'],r['count']) for r in result['rows']]==[('c',2),('b',1)]
    assert result['filterSummary']==['region: south']
    assert settings.model_dump()==before
    settings.questions['answer'].ownFilters=[]
    assert answer(project,settings)['cohortCount']==7
    settings.questions['answer'].filterMode='page'
    assert answer(project,settings)['cohortCount']==4


def test_multiple_conditions_and_values_and_empty_cohort():
    settings=KoboSettings(hideEmpty=False,questions={'answer':QuestionSettings(filterMode='own',ownFilters=[{'field':'region','values':['north','south']},{'field':'number','kind':'number','minimum':10}])})
    assert answer(fixture(),settings)['cohortCount']==6
    settings.questions['answer'].ownFilters[1].minimum='11'
    assert answer(fixture(),settings)['rows']==[]


def test_own_filter_drilldown_ignores_conflicting_page_filters():
    settings=KoboSettings(filters=[{'field':'region','values':['north']}],questions={'answer':QuestionSettings(filterMode='own',ownFilters=[{'field':'region','values':['south']}])})
    result=data_rows(fixture(),settings,'',['answer'],drilldown={'question':'answer','answer':'c'})
    assert len(result['rows'])==2


def test_repeat_filters_resolve_ancestor_values_and_reject_descendants():
    project=fixture()
    child=deepcopy(project['form']['questions'][0]);child.update(id='child',repeat='people',name='child')
    project['form']['questions'].append(child)
    project['records'] += [dict(id='child'+str(i),scope='people',parent=str(i),row=i+2,sheet=1,values={'child':'a'}) for i in range(7)]
    settings=KoboSettings(questions={'child':QuestionSettings(filterMode='own',ownFilters=[{'field':'region','values':['south']}])})
    result=next(q for q in analyze(project,settings)['questions'] if q['id']=='child')
    assert result['cohortCount']==3
    settings.questions['answer']=QuestionSettings(filterMode='own',ownFilters=[{'field':'child','values':['a']}])
    with pytest.raises(ValueError,match='ancestor'):analyze(project,settings)


def test_invalid_own_filters_require_repair_in_saved_views():
    settings=KoboSettings(questions={'answer':QuestionSettings(filterMode='own',ownFilters=[{'field':'removed','values':['x']}])})
    assert any('unavailable' in message for message in snapshot_issues(fixture(),settings))


@pytest.mark.parametrize('operation',['count','sum','average','median','unique'])
def test_top_n_uses_effective_measure_without_changing_pivots(operation):
    settings=KoboSettings(questions={'answer':QuestionSettings(chartTopN=1,chartOther=True,answerSort='form',calculation=Calculation(operation=operation,field='number'))})
    result=answer(fixture(),settings)
    assert [r['id'] for r in result['rows']]==['a','c','b']
    projected=result['chartProjection']
    assert projected['topNShown']==1 and projected['topNTotal']==3
    assert projected['rows'][0]['id']==('a' if operation=='unique' else 'c')
    assert projected['topNOther']==(operation in {'count','sum'})
    assert result['denominator']==7


@pytest.mark.parametrize('mode',['grand-total','column-total','row-total','breakdown-group'])
def test_other_keeps_complete_percentage_bases(mode):
    settings=KoboSettings(questions={'answer':QuestionSettings(chartTopN=1,chartOther=True,percentageMode=mode,breakdowns=['region'])})
    result=answer(fixture(),settings)
    other=result['chartProjection']['rows'][-1]
    assert other['count']==4
    if mode=='row-total':assert sum(c['percent'] for c in other['series'])==pytest.approx(100)
    if mode=='grand-total':assert other['percent']==pytest.approx(400/7)
    if mode in {'column-total','breakdown-group'}:
        assert other['series'][0]['percent']==pytest.approx(75)
        assert other['series'][1]['percent']==pytest.approx(100/3)


def test_top_n_disabled_for_dates_and_numeric_bins():
    settings=KoboSettings(questions={'date':QuestionSettings(chartTopN=1),'number':QuestionSettings(chartTopN=1,chart='histogram')})
    snapshot=analyze(fixture(),settings)
    assert all(q['chartProjection'] is None for q in snapshot['questions'] if q['id'] in {'date','number'})


def test_missing_percentage_setting_uses_explicit_default_only_for_new_fields():
    project=fixture()
    settings=KoboSettings(percentageDefault='row-total',questions={'answer':QuestionSettings(percentageMode='legacy-respondents')})
    assert resolved_question_settings(project['form']['questions'][0],settings).percentageMode=='legacy-respondents'
    assert resolved_question_settings(project['form']['questions'][1],settings).percentageMode=='row-total'


@pytest.mark.parametrize('operation',['count','sum'])
def test_nested_group_percentages_match_idp_and_refugee_example(operation):
    project=fixture()
    gender=deepcopy(project['form']['questions'][1]);gender.update(id='gender',name='gender',choices=[{'name':v,'labels':{'en':v}} for v in ['Men','Women']])
    project['form']['questions'].append(gender)
    project['form']['questions'][1]['choices']=[{'name':v,'labels':{'en':v}} for v in ['IDP','Refugee']]
    values=[('IDP','Men')]*4+[('IDP','Women')]*6+[('Refugee','Men')]*7+[('Refugee','Women')]*3
    project['records']=[dict(id=str(i),scope='',parent='',sheet=0,row=i+2,values={'answer':'a','region':status,'gender':sex,'number':1}) for i,(status,sex) in enumerate(values)]
    settings=KoboSettings(questions={'answer':QuestionSettings(percentageMode='breakdown-group',breakdowns=['region','gender'],calculation=Calculation(operation=operation,field='number'))})
    result=answer(project,settings)
    percents={tuple(c['values']):result['rows'][0]['series'][i]['percent'] for i,c in enumerate(result['breakdowns'])}
    assert percents=={('IDP','Men'):40,('IDP','Women'):60,('Refugee','Men'):70,('Refugee','Women'):30}


def test_own_drilldown_with_base_filters_uses_own_cohort_and_local_filters():
    settings=KoboSettings(questions={'answer':QuestionSettings(filterMode='own',ownFilters=[{'field':'region','values':['south']}])})
    selection={'question':'answer','answer':'c','baseFilters':[{'field':'region','values':['north']}]}
    assert len(data_rows(fixture(),settings,'',['answer'],drilldown=selection)['rows'])==2
    settings.filters=[KoboFilter(field='number',kind='number',values=[],minimum='11')]
    assert data_rows(fixture(),settings,'',['answer'],drilldown=selection)['rows']==[]


def test_empty_independent_card_remains_available_to_repair_its_filters():
    settings=KoboSettings(questions={'answer':QuestionSettings(filterMode='own',ownFilters=[{'field':'number','kind':'number','minimum':'100'}])})
    result=answer(fixture(),settings)
    assert result['cohortCount']==0 and result['denominator']==0 and result['rows']==[]


def multiple_filter_project():
    project = fixture()
    multi = deepcopy(project['form']['questions'][0])
    multi.update(id='needs', name='needs', labels={'en': 'needs'}, kind='multiple', type='select_multiple',
                 choices=[{'name': code, 'labels': {'en': code}} for code in ['food', 'water', 'shelter']])
    project['form']['questions'].append(multi)
    values = [['food', 'water'], ['water'], ['shelter'], ['food'], [], None, ['water', 'shelter']]
    for record, value in zip(project['records'], values):
        record['values']['needs'] = value
    return project


@pytest.mark.parametrize('target', ['answer', 'needs'])
@pytest.mark.parametrize('mode', ['own', 'additional'])
def test_multiple_choice_question_filters_apply_to_self_and_other_questions(target, mode):
    settings = KoboSettings(hideEmpty=False, questions={target: QuestionSettings(
        filterMode=mode, ownFilters=[{'field': 'needs', 'values': ['food']}])})
    snapshot = analyze(multiple_filter_project(), settings)
    result = next(item for item in snapshot['questions'] if item['id'] == target)
    assert result['cohortCount'] == 2
    assert result['denominator'] == 2
    assert result['filterSummary'] == ['needs: food']
    other = next(item for item in snapshot['questions'] if item['id'] == ('answer' if target == 'needs' else 'needs'))
    assert other['cohortCount'] == 7
    selection = {'question': target, 'answer': 'food' if target == 'needs' else 'a'}
    rows = data_rows(multiple_filter_project(), settings, '', [target], drilldown=selection)['rows']
    assert len(rows) == (2 if target == 'needs' else 1)


def test_multiple_choice_filters_combine_any_selected_answer_with_other_fields_and_page_filters():
    project = multiple_filter_project()
    settings = KoboSettings(hideEmpty=False, filters=[{'field': 'region', 'values': ['north']}],
        questions={'answer': QuestionSettings(filterMode='additional', ownFilters=[
            {'field': 'needs', 'values': ['food', 'shelter']},
            {'field': 'number', 'kind': 'number', 'minimum': 10}])})
    assert answer(project, settings)['cohortCount'] == 2
    settings.questions['answer'].ownFilters[0].values = ['water']
    assert answer(project, settings)['cohortCount'] == 1
    settings.questions['answer'].ownFilters[1].minimum = '100'
    assert answer(project, settings)['cohortCount'] == 0


@pytest.mark.parametrize('target', ['answer', 'needs'])
def test_blank_multiple_choice_filter_matches_empty_lists_and_null(target):
    settings = KoboSettings(hideEmpty=False, questions={target: QuestionSettings(
        filterMode='additional', ownFilters=[{'field': 'needs', 'values': ['__blank__']}])})
    result = next(item for item in analyze(multiple_filter_project(), settings)['questions'] if item['id'] == target)
    assert result['cohortCount'] == 2


@pytest.mark.parametrize('mode', ['own', 'additional'])
@pytest.mark.parametrize('percentage', ['legacy-respondents', 'grand-total', 'column-total'])
def test_multiple_choice_self_filter_only_displays_selected_answers(mode, percentage):
    project = multiple_filter_project()
    settings = KoboSettings(hideEmpty=False, hideZero=False, questions={'needs': QuestionSettings(
        filterMode=mode, percentageMode=percentage, breakdowns=['region'], chartTopN=2,
        ownFilters=[{'field': 'needs', 'values': ['food']}])})
    result = next(item for item in analyze(project, settings)['questions'] if item['id'] == 'needs')
    assert [(row['id'], row['count']) for row in result['rows']] == [('food', 2)]
    assert result['cohortCount'] == 2
    assert result['rows'][0]['percent'] == 100
    assert [row['id'] for row in result['chartProjection']['rows']] == ['food']
    with pytest.raises(ValueError, match='no longer available'):
        data_rows(project, settings, '', ['needs'], drilldown={'question': 'needs', 'answer': 'water'})
    settings.questions['needs'].ownFilters[0].values = ['food', 'water']
    result = next(item for item in analyze(project, settings)['questions'] if item['id'] == 'needs')
    assert {row['id']: row['count'] for row in result['rows']} == {'food': 2, 'water': 3}
    settings.questions['needs'].ownFilters[0].values = []
    result = next(item for item in analyze(project, settings)['questions'] if item['id'] == 'needs')
    assert {row['id'] for row in result['rows']} == {'food', 'water', 'shelter'}


def test_multiple_choice_cross_filter_preserves_target_answer_choices():
    project = multiple_filter_project()
    settings = KoboSettings(hideZero=False, questions={'answer': QuestionSettings(filterMode='additional',
        ownFilters=[{'field': 'needs', 'values': ['food']}])})
    assert {row['id'] for row in answer(project, settings)['rows']} == {'a', 'b', 'c'}



def test_multiple_choice_filter_resolves_parent_answers_for_repeat_questions():
    project = multiple_filter_project()
    child = deepcopy(project['form']['questions'][0])
    child.update(id='child', name='child', repeat='people')
    project['form']['questions'].append(child)
    project['records'] += [dict(id='child'+str(i), scope='people', parent=str(i), row=i+2, sheet=1,
                               values={'child': 'a'}) for i in range(7)]
    settings = KoboSettings(questions={'child': QuestionSettings(filterMode='additional',
        ownFilters=[{'field': 'needs', 'values': ['food']}])})
    result = next(item for item in analyze(project, settings)['questions'] if item['id'] == 'child')
    assert result['cohortCount'] == 2
    assert result['rows'][0]['count'] == 2


def test_multiple_choice_self_filter_export_source_uses_selected_answer_rows_only():
    from backend.kobo_excel import iter_source_rows
    project = multiple_filter_project()
    settings = KoboSettings(questions={'needs': QuestionSettings(filterMode='additional',
        ownFilters=[{'field': 'needs', 'values': ['food']}])})
    result = next(item for item in analyze(project, settings)['questions'] if item['id'] == 'needs')
    rows = list(iter_source_rows(project, result, settings))
    assert rows
    assert all(row[5] == 'food' for row in rows)
