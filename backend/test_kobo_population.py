import copy
import pytest
from backend.kobo import KoboSettings
from backend.kobo_population import compare_population
from backend.kobo_indicators import IndicatorDefinition
from backend.test_kobo import sample
from backend.test_kobo_preview import preview_client
from backend.test_kobo_indicators import definition


def compare(project, **changes):
    return compare_population(project, changes.pop('settings',KoboSettings()), group_field=changes.pop('group_field','group/gender'),groups=changes.pop('groups',['f','m']),question_id=changes.pop('question_id','group/needs'),**changes)


def test_choice_comparison_uses_within_group_denominators_and_keeps_missing_visible(sample):
    project = sample[0]; before = copy.deepcopy(project)
    result = compare(project)
    assert [c.total for c in result.columns] == [2,1]
    assert [c.answered for c in result.columns] == [1,1]
    assert [c.missing for c in result.columns] == [1,0]
    assert result.rows[0].values[0].count == 1 and result.rows[0].values[0].percent == 100
    assert sum(r.values[0].percent for r in result.rows) == 200
    assert project == before


def test_multi_select_options_count_once_and_invalid_answers_are_separate(sample):
    project = copy.deepcopy(sample[0]); project['records'][0]['values']['group/needs'] = ['food','food']
    result = compare(project)
    assert next(r for r in result.rows if r.id=='food').values[0].count == 1
    project['records'][0]['values']['group/needs'] = ['food','unknown']
    result = compare(project)
    assert result.columns[0].invalid == 1 and result.columns[0].answered == 0
    assert all(r.values[0].percent is None for r in result.rows)


def test_numeric_comparison_keeps_original_scale(sample):
    result = compare(sample[0],question_id='group/age')
    assert [c.value for c in result.columns] == [0,20]
    assert [c.numerator for c in result.columns] == [0,20]
    assert result.mode=='numeric_average' and not result.rows


@pytest.mark.parametrize('mode',['score','percentage','numeric_sum','numeric_average'])
def test_indicators_are_calculated_separately_for_each_group(sample,mode):
    item=definition() if mode=='score' else definition(mode=mode,higherMeaning='',questions=[{'question':'group/needs','kind':'multiple','selectedCodes':['water']}] if mode=='percentage' else [{'question':'group/age','kind':'number'}])
    result=compare(sample[0],question_id='',indicator=item)
    assert result.kind=='indicator' and result.mode==mode
    assert [c.answered for c in result.columns] == [1,1]
    assert [c.missing for c in result.columns] == [1,0]
    if mode=='score': assert [c.value for c in result.columns]==[50,50]
    elif mode=='percentage': assert [c.value for c in result.columns]==[100,0]
    else: assert [c.value for c in result.columns]==[0,20]


def test_filters_missing_groups_unselected_groups_and_empty_denominators(sample):
    project=copy.deepcopy(sample[0]); project['form']['questions'][0]['choices'].append({'name':'other','labels':{}})
    project['records'][2]['values']['group/gender']='other'
    result=compare(project)
    assert result.otherGroups==1 and result.missingGroup==0
    project['records'][2]['values']['group/gender']=None
    assert compare(project).missingGroup==1
    result=compare(project,settings=KoboSettings(filters=[{'field':'group/gender','values':['m']}]))
    assert result.columns[0].total==0 and result.columns[0].answered==0
    assert all(r.values[0].percent is None for r in result.rows)
    assert result.filterSummary


def test_repeat_questions_can_use_parent_population_groups(sample):
    project=copy.deepcopy(sample[0]); q=copy.deepcopy(project['form']['questions'][2]); q.update(id='visits/age',repeat='visits')
    project['form']['questions'].append(q); project['form']['groups'].append({'id':'visits','name':'Visits','labels':{},'parent':'','repeat':True})
    project['records'] += [{'id':f'v{i}','scope':'visits','parent':project['records'][i]['id'],'row':10+i,'values':{'visits/age':i}} for i in range(3)]
    result=compare(project,question_id='visits/age')
    assert [c.total for c in result.columns]==[2,1]
    assert [c.value for c in result.columns]==[1,1]
    project['records'][-1]['parent']='missing'
    assert compare(project,question_id='visits/age').total==2


@pytest.mark.parametrize('changes',[
    {'group_field':'group/respondent_name'}, {'group_field':'group/needs'},
    {'groups':['f','f']}, {'groups':['f','unknown']}, {'groups':['f']},
    {'question_id':'group/respondent_name'}, {'question_id':'group/day'},
])
def test_invalid_or_identifying_comparisons_are_rejected(sample,changes):
    with pytest.raises(ValueError): compare(sample[0],**changes)


def test_api_comparison_is_read_only(preview_client):
    client,store,pid=preview_client; before=store.get(pid)
    url=f'/api/kobo/projects/{pid}/population-comparison'
    body={'settings':KoboSettings().model_dump(),'groupField':'group/gender','groups':['f','m'],'question':'group/needs'}
    response=client.post(url,json=body)
    assert response.status_code==200,response.text
    assert response.json()['columns'][0]['answered']==1
    assert store.get(pid)==before
    assert client.post(url,json={**body,'groups':['f']}).status_code==422
