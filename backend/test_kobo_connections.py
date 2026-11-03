from copy import deepcopy
from io import BytesIO
import pytest
from openpyxl import Workbook
from backend.kobo import KoboSettings, QuestionSettings, analyze, parse_form
from backend.kobo_api import AnalysisResponse, FormSchema
from backend.kobo_connections import connection_details


def project():
    def q(name, choices=(), kind='category', relevant=''):
        return dict(id=name, name=name, labels={'en': name, 'ar': name}, kind=kind, type=kind, repeat='', group='', metadata=False, identifying=False, relevant=relevant, choices=[{'name': c, 'labels': {'en': c}} for c in choices])
    questions = [q('main', ['other','yes']), q('follow', ['a','b'], relevant="${main} = 'other'"), q('region', ['north','south']), q('date', kind='date')]
    records = [dict(id=str(i),parent='',scope='',row=i+2,sheet=0,values={'main':'other' if i<5 else 'yes','follow':'a' if i<3 else 'b' if i<5 else None,'region':'north' if i<50 else 'south','date':'2026-01-01' if i<50 else '2026-02-01'}) for i in range(100)]
    return dict(id='p',name='Example',form=dict(questions=questions,groups=[],settings={},language='en',warnings=[]),records=records)


def run(base='question', **kwargs):
    settings=KoboSettings(questions={'follow':QuestionSettings(percentageBase=base,percentageParent='main' if base=='parent' else '',**kwargs)})
    snapshot=analyze(project(),settings)
    return next(q for q in snapshot['questions'] if q['id']=='follow'),settings,snapshot


def test_followup_and_parent_bases_and_totals():
    own,_,_=run()
    assert [r['percent'] for r in own['rows']] == [60,40]
    parent,settings,snapshot=run('parent',percentageMode='grand-total')
    assert [r['percent'] for r in parent['rows']] == [3,2]
    assert parent['denominator']==5
    assert parent['respondentBasis']['denominator']==100
    assert parent['pivotTotal']=={'count':5,'percent':5}
    assert parent['connections']['parents'][0]['triggers']==['other']
    assert AnalysisResponse.model_validate(snapshot).model_dump()['questions'][1]['respondentBasis']['denominator']==100
    assert KoboSettings.model_validate_json(settings.model_dump_json()).questions['follow'].percentageParent=='main'


@pytest.mark.parametrize('base,mode,expected', [('question','adjust',100),('parent','keep-original',2)])
def test_adjust_and_keep_original_and_restore(base,mode,expected):
    result,_,_=run(base,hiddenAnswers=['a'],connectedPercentageMode=mode)
    assert result['rows'][0]['percent']==expected
    # Legacy hidden-answer mode does not compete with the connected base mode.
    legacy,_,_=run(base,hiddenAnswers=['a'],hiddenAnswerPercentageMode='keep-original')
    assert legacy['rows'][0]['percent']==expected
    restored,_,_=run(base)
    assert restored['rows'][0]['percent']==(60 if base=='question' else 3)


def test_parent_visibility_filters_breakdowns_and_trend():
    result,settings,_=run('parent',breakdowns=['region'],chart='line',trendDateField='date')
    assert result['rows'][0]['series'][0]['percent']==6
    assert result['breakdowns'][0]['totalPercent']==10
    assert result['trend']['denominators']==[50,50]
    assert result['trend']['series'][0]['points'][0]['percent']==6
    assert result['trend']['series'][0]['points'][1]['percent']==0
    settings.hidden=['main'];settings.questions['main']=QuestionSettings(hiddenAnswers=['other'])
    hidden=next(q for q in analyze(project(),settings)['questions'] if q['id']=='follow')
    assert hidden['rows']==result['rows']
    assert hidden['connections']['parents'][0]['hidden']
    settings=KoboSettings.model_validate({**settings.model_dump(),'filters':[{'field':'region','values':['north']}]})
    filtered=next(q for q in analyze(project(),settings)['questions'] if q['id']=='follow')
    assert filtered['respondentBasis']['denominator']==50
    assert filtered['rows'][0]['percent']==6


def test_missing_parent_zero_base_and_unsupported_conditions():
    q,settings,_=run('parent');settings.questions['follow'].percentageParent='removed'
    q=next(q for q in analyze(project(),settings)['questions'] if q['id']=='follow')
    assert q['respondentBasis']['issue']=='missing-parent'
    assert all(r['percent'] is None and r['displayPercent'] is None for r in q['rows'])
    p=project()
    for r in p['records']:r['values']['main']=None
    settings.questions['follow'].percentageParent='main'
    q=next(q for q in analyze(p,settings)['questions'] if q['id']=='follow')
    assert q['respondentBasis']['denominator']==0
    assert q['pivotTotal']['percent'] is None
    p['form']['questions'][1]['relevant']="regex(${main}, 'other') or ${removed} = 'x'"
    details=connection_details(p['form']['questions'][1],{q['id']:q for q in p['form']['questions']},settings)
    assert details['conditions'][0]['readable'] is None
    assert 'unresolved-reference:removed' in details['issues']


def test_nested_logic_and_multiple_parents():
    p=project();q=p['form']['questions'][1]
    q['relevant']="(${main} = 'other' or selected(${main}, 'yes')) and ${region} != 'south'"
    details=connection_details(q,{q['id']:q for q in p['form']['questions']},KoboSettings())
    assert [p['id'] for p in details['parents']]==['main','region']
    assert details['conditions'][0]['readable']=='((main = other OR main = yes) AND region ≠ south)'
    assert details['issues']==[]


def test_group_conditions_survive_import_and_api():
    book=Workbook();survey=book.active;survey.title='survey'
    survey.append(['type','name','label','relevant'])
    survey.append(['select_one options','main','Main',''])
    survey.append(['begin_group','group','Details',"${main} = 'other'"])
    survey.append(['text','follow','Follow',"selected(${main}, 'other')"])
    survey.append(['end_group','','',''])
    choices=book.create_sheet('choices');choices.append(['list_name','name','label']);choices.append(['options','other','Other'])
    stream=BytesIO();book.save(stream)
    form=parse_form(stream.getvalue())
    assert form['questions'][1]['inheritedRelevant']==[{'source':'group','expression':"${main} = 'other'"}]
    assert FormSchema.model_validate(form).model_dump()['groups'][0]['relevant']=="${main} = 'other'"


def test_older_group_metadata_and_unresolved_saved_view_are_reviewable():
    from backend.kobo_saved_views import snapshot_issues
    from backend.kobo import AnalysisViewSettings
    p=project();p['form']['groups']=[dict(id='g',parent='',name='g',labels={'en':'Details'},repeat=False,relevant="${main} = 'other'")]
    p['form']['questions'][1].update(group='g',relevant='')
    result=next(q for q in analyze(p,KoboSettings())['questions'] if q['id']=='follow')
    assert result['connections']['conditions'][0]['source']=='g'
    view=AnalysisViewSettings(questions={'follow':QuestionSettings(percentageBase='parent',percentageParent='removed')})
    assert any('connected question percentage base' in issue for issue in snapshot_issues(p,view))


def test_ambiguous_names_are_not_guessed_and_local_references_use_their_scope():
    from backend.kobo_connections import resolve_reference
    p=project();child=p['form']['questions'][1];child['group']='details'
    original=p['form']['questions'][0]
    local={**original,'id':'details/main','name':'main','group':'details'}
    questions={q['id']:q for q in [*p['form']['questions'],local]}
    assert resolve_reference('main',child,questions)['id']=='details/main'
    del questions['main'];questions['other/main']={**local,'id':'other/main'};child['group']='unrelated'
    assert resolve_reference('main',child,questions) is None


def test_repeat_scope_and_multiple_select():
    p=project();p['form']['questions'][1]['kind']='multiple'
    for r in p['records']:r['values']['follow']=['a','b'] if int(r['id'])<5 else None
    q=next(q for q in analyze(p,KoboSettings(questions={'follow':QuestionSettings(percentageBase='parent',percentageParent='main')}))['questions'] if q['id']=='follow')
    assert [r['percent'] for r in q['rows']]==[5,5]
    p['form']['questions'][0]['repeat']='unrelated'
    q=next(q for q in analyze(p,KoboSettings(questions={'follow':QuestionSettings(percentageBase='parent',percentageParent='main')}))['questions'] if q['id']=='follow')
    assert q['respondentBasis']['issue']=='incompatible-rule-scope'


@pytest.mark.parametrize('kind,mode', [('category','native'),('multiple','binary'),('multiple','native')])
@pytest.mark.parametrize('hidden_mode', ['adjust','keep-original'])
def test_live_excel_sources_use_the_same_parent_base(kind,mode,hidden_mode):
    from backend.kobo_excel_source import response_layout,query_config,multi_config,query_formula
    from backend.kobo_excel_direct import direct_helpers
    from backend.kobo_excel_prepare import helper_values,materialize_multi
    p=project();p['form']['questions'][1]['kind']=kind
    if kind=='multiple':
        for r in p['records']:
            v=r['values']['follow'];r['values']['follow']=[v] if v else None
    settings=KoboSettings(questions={'follow':QuestionSettings(percentageBase='parent',percentageParent='main',hiddenAnswers=['a'],hiddenAnswerPercentageMode=hidden_mode)})
    snapshot=analyze(p,settings,question='follow');result=snapshot['questions'][0]
    layouts=response_layout(p,settings);config=query_config(p,snapshot,settings,[],layouts);config['excelMode']=mode
    expected=100
    if kind=='multiple' and mode=='native':
        cfg=multi_config(config,config['questions'][0]);rows=materialize_multi((cfg,p['records']))
        assert all(len(row)==len(cfg['headers']) for row in rows)
        cells=[dict(zip(cfg['headers'],row)) for row in rows]
        assert sum(row['Answered'] for row in cells)==expected
        assert sum(row['FollowupAnswered'] or 0 for row in cells)==2
        assert sum(row['Selected'] for row in cells if row['AnswerCode']=='b')==2
        assert 'q[percentageParent]' in query_formula(cfg)
    else:
        helpers,sources=direct_helpers(config,layouts)
        rows=helper_values(layouts,config,sources,helpers)[0];cells=[dict(zip(helpers[''],row)) for row in rows]
        fields=sources['follow']['fields']
        included=[r for r in cells if r[fields['AnswerAllowed']]=='Included']
        assert sum(r[fields['Answered']] for r in included)==expected
        assert sum(r[fields['FollowupAnswered']] for r in included)==2
    assert result['respondentBasis']['denominator']==expected


def test_ancestor_parent_and_identifying_export_guard():
    from backend.kobo_excel_source import validate_export_fields
    p=project();follow=p['form']['questions'][1];follow.update(repeat='visits',group='visits',id='visits/follow')
    p['form']['groups']=[dict(id='visits',name='visits',labels={'en':'Visits'},parent='',repeat=True)]
    p['records'] += [dict(id='v'+str(i),parent=str(i),scope='visits',row=i+2,sheet=1,values={'visits/follow':'a' if i<3 else 'b' if i<5 else None}) for i in range(10)]
    cfg=KoboSettings(questions={'visits/follow':QuestionSettings(percentageBase='parent',percentageParent='main')})
    q=next(q for q in analyze(p,cfg)['questions'] if q['id']=='visits/follow')
    assert q['respondentBasis']['denominator']==10
    assert [r['percent'] for r in q['rows']]==[30,20]
    p['form']['questions'][0]['identifying']=True;cfg.hidden=['main']
    with pytest.raises(ValueError,match='Identifying'):validate_export_fields(p,cfg,'visits/follow')


def test_conditional_multiple_defaults_to_answered_respondents_and_top_n_uses_parent_base():
    p=project();p['form']['questions'][1]['kind']='multiple'
    for r in p['records']:r['values']['follow']=['a','b'] if int(r['id'])<5 else None
    cfg=KoboSettings(questions={'follow':QuestionSettings(percentageMode='grand-total')})
    result=next(q for q in analyze(p,cfg)['questions'] if q['id']=='follow')
    assert [r['percent'] for r in result['rows']]==[100,100]
    result,_,_=run('parent',chartTopN=1,chartOther=True)
    assert [r['percent'] for r in result['chartProjection']['rows']]==[3,2]


def test_drilldown_keeps_numerators_separate_from_the_parent_base():
    from backend.kobo_data import pivot_records
    p=project();settings=KoboSettings(questions={'follow':QuestionSettings(percentageBase='parent',percentageParent='main',breakdowns=['region'])})
    assert len(pivot_records(p,settings,'',p['records'],{'question':'follow','answer':'a'}))==3
    assert len(pivot_records(p,settings,'',p['records'],{'question':'follow','breakdown':'north'}))==5
