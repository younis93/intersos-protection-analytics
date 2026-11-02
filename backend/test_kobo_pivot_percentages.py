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
