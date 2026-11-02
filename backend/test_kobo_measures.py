import copy
import pytest
from backend.kobo import KoboSettings, QuestionSettings, analyze
from backend.kobo_measures import Calculation, aggregate
from backend.test_kobo_answer_order import fixture


@pytest.mark.parametrize('operation,expected',[('sum',60),('average',60/7),('median',10),('unique',2)])
def test_measure_totals_come_from_records(operation,expected):
    project=fixture();settings=KoboSettings(questions={'answer':QuestionSettings(breakdowns=['region'],calculation=Calculation(operation=operation,field='number'))})
    result=analyze(project,settings)['questions'][0]
    assert result['measureTotal']['value']==pytest.approx(expected)
    assert result['measureTotal']['contributingCount']==7
    assert sum(r['count'] for r in result['rows'])==7
    by_id={r['id']:r for r in result['rows']}
    assert by_id['a']['value']==(1 if operation=='unique' else 0)
    if operation in {'average','median'}:assert result['measureTotal']['value']!=sum(r['value'] for r in result['rows'])


def test_missing_negative_zero_and_stable_measure_ties():
    project=fixture()
    for r,v in zip(project['records'],[None,-10,0,10,0,0,0]):r['values']['number']=v
    settings=KoboSettings(questions={'answer':QuestionSettings(calculation=Calculation(operation='sum',field='number'))})
    result=analyze(project,settings)['questions'][0]
    assert result['measureTotal']=={'value':0.0,'contributingCount':6}
    assert [r['id'] for r in result['rows']]==['b','c','a']
    assert result['rows'][-1]['value'] is None


def test_multiple_answers_do_not_duplicate_overall_values():
    project=fixture();q=project['form']['questions'][0];q['kind']='multiple'
    for r in project['records']:r['values']['answer']=['a','b']
    result=analyze(project,KoboSettings(questions={'answer':QuestionSettings(calculation=Calculation(operation='sum',field='number'))}))['questions'][0]
    assert result['measureTotal']['value']==60
    assert sum(r['value'] for r in result['rows'])==120


def test_parent_values_repeat_per_entry_and_child_values_are_rejected():
    project=fixture();q=copy.deepcopy(project['form']['questions'][0]);q.update(id='visits/answer',repeat='visits');project['form']['questions'].append(q)
    for i in range(2):project['records'].append(dict(id=f'v{i}',parent='1',scope='visits',row=i+2,sheet=1,values={'visits/answer':'a'}))
    settings=KoboSettings(questions={q['id']:QuestionSettings(calculation=Calculation(operation='sum',field='number'))})
    result=next(r for r in analyze(project,settings)['questions'] if r['id']==q['id'])
    assert result['measureTotal']['value']==20 and result['measure']['parentValuesRepeated']
    settings.questions={'answer':QuestionSettings(calculation=Calculation(operation='unique',field=q['id']))}
    with pytest.raises(ValueError,match='ancestor'):analyze(project,settings)


def test_empty_values_and_invalid_calculations():
    field={'id':'v','repeat':''}
    assert aggregate([],field,'sum',{})=={'value':None,'contributingCount':0}
    assert aggregate([],field,'unique',{})=={'value':0,'contributingCount':0}
    with pytest.raises(ValueError,match='numeric'):analyze(fixture(),KoboSettings(questions={'answer':QuestionSettings(calculation=Calculation(operation='median',field='region'))}))
    with pytest.raises(ValueError,match='support'):analyze(fixture(),KoboSettings(questions={'answer':QuestionSettings(chart='pie',calculation=Calculation(operation='sum',field='number'))}))


def test_calculation_settings_survive_shared_settings_and_saved_views():
    from backend.kobo_settings_share import export_settings,preview_settings,SettingsFile
    from backend.kobo import AnalysisViewSettings
    project=fixture();settings=KoboSettings(questions={'answer':QuestionSettings(calculation=Calculation(operation='median',field='number',decimals=3))})
    pack=SettingsFile.model_validate(export_settings(project,settings))
    restored=preview_settings(project,KoboSettings(),pack)
    assert restored['settings']['questions']['answer']['calculation']==settings.questions['answer'].calculation.model_dump()
    snapshot=AnalysisViewSettings.model_validate(settings.model_dump())
    assert snapshot.questions['answer'].calculation.decimals==3


def test_even_median_and_unique_value_normalization():
    field={'id':'v','repeat':''}
    records=[{'id':str(i),'scope':'','values':{'v':value}} for i,value in enumerate([-10,0,2,10])]
    assert aggregate(records,field,'median',{})['value']==1
    records=[{'id':str(i),'scope':'','values':{'v':value}} for i,value in enumerate(['A','a','001','1',1,1.0])]
    assert aggregate(records,field,'unique',{})['value']==4
