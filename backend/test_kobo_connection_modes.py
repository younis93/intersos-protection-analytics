from copy import deepcopy
import pytest
from backend.kobo import KoboSettings,QuestionSettings,analyze
from backend.test_kobo_connections import project
from backend.kobo_connection_rules import parse_condition,matches_tree,validate_tree


def example():
    p=project()
    for i,r in enumerate(p['records']):
        r['values']['main']='other' if i<10 else 'yes'
        r['values']['follow']='a' if i<6 else 'b' if i<10 else None
    return p


def result(p=None,**config):
    settings=KoboSettings(questions={'follow':QuestionSettings(**config)})
    snapshot=analyze(p or example(),settings)
    return next(q for q in snapshot['questions'] if q['id']=='follow'),settings


def leaf(field,value,operator='eq'):return dict(type='rule',field=field,operator=operator,value=value)
def group(*rules,match='all'):return dict(type='group',match=match,rules=list(rules))


@pytest.mark.parametrize('mode,hidden,expected,total,base',[
    ('adjust',[],[60,40],100,10),('keep-original',[],[6,4],10,100),
    ('adjust',['a'],[100],100,4),('keep-original',['a'],[4],4,100)])
def test_switch_changes_the_base_even_without_hiding(mode,hidden,expected,total,base):
    q,_=result(connectedPercentageMode=mode,hiddenAnswers=hidden)
    assert [row['percent'] for row in q['rows']]==expected
    assert q['pivotTotal']['percent']==total
    assert q['respondentBasis']['denominator']==base
    assert q['respondentBasis']['parentId']=='main'


def test_manual_replaces_auto_condition_and_does_not_filter_original_base():
    p=example();p['records'][-1]['values']['follow']='b'
    rules=group(leaf('main','yes'),leaf('region','south'))
    adjusted,_=result(p,connectionSource='manual',connectionRules=rules,percentageParent='main')
    assert adjusted['rows'][0]['count']==1 and adjusted['rows'][0]['percent']==100
    kept,_=result(p,connectionSource='manual',connectionRules=rules,percentageParent='main',connectedPercentageMode='keep-original')
    assert kept['rows'][0]['percent']==1
    assert kept['respondentBasis']['denominator']==100
    assert kept['connections']['source']=='manual'


def test_manual_from_zero_detected_links_and_nested_groups_deduplicate():
    p=example();p['form']['questions'][1]['relevant']=''
    rules=group(group(leaf('main','other'),leaf('region','north'),match='any'),leaf('main','other'))
    q,settings=result(p,connectionSource='manual',connectionRules=rules,percentageParent='main',connectedPercentageMode='keep-original')
    assert [row['count'] for row in q['rows']]==[6,4]
    assert q['respondentBasis']['denominator']==100
    assert [row['percent'] for row in q['rows']]==[6,4]
    restored=KoboSettings.model_validate_json(settings.model_dump_json())
    assert restored.questions['follow'].connectionRules==rules
    assert len(q['connections']['parents'])==2


def test_unsupported_auto_allows_adjust_but_requires_manual_for_original():
    p=example();p['form']['questions'][1]['relevant']="regex(${main}, 'other')"
    q,_=result(p,connectedPercentageMode='adjust')
    assert q['rows'][0]['percent']==60 and not q['respondentBasis']['issue']
    assert not q['respondentBasis']['canKeepOriginal']
    q,_=result(p,connectedPercentageMode='keep-original')
    assert q['respondentBasis']['issue']=='unsupported-condition'
    assert all(row['percent'] is None for row in q['rows'])
    q,_=result(p,connectionSource='manual',connectionRules=group(leaf('main','other')),connectedPercentageMode='keep-original')
    assert q['rows'][0]['percent']==6 and q['respondentBasis']['canKeepOriginal']


@pytest.mark.parametrize('rules,issue',[(group(),'incomplete-condition'),(group(leaf('removed','x')),'missing-rule-question'),(group(leaf('main','removed')),'missing-rule-answer')])
def test_invalid_manual_links_are_explicitly_reviewable(rules,issue):
    q,_=result(connectionSource='manual',connectionRules=rules)
    assert q['respondentBasis']['issue']==issue
    assert all(row['percent'] is None for row in q['rows'])


def test_multiple_parents_require_explicit_primary_parent():
    p=example();p['form']['questions'][1]['relevant']="${main} = 'other' and ${region} = 'north'"
    q,_=result(p,connectedPercentageMode='keep-original')
    assert q['respondentBasis']['issue']=='missing-parent'
    q,_=result(p,connectedPercentageMode='keep-original',percentageParent='main')
    assert q['rows'][0]['percent']==6


def test_filters_breakdowns_periods_and_missing_followup_answers():
    p=example();p['records'][0]['values']['follow']=None
    q,_=result(p,connectedPercentageMode='keep-original',breakdowns=['region'],chart='line',trendDateField='date')
    assert q['rows'][0]['percent']==5
    assert q['pivotTotal']['percent']==9
    assert q['rows'][0]['series'][0]['percent']==10
    assert q['trend']['denominators']==[50,50]
    assert q['trend']['series'][0]['points'][0]['percent']==10
    settings=KoboSettings(filters=[{'field':'region','values':['north']}],questions={'follow':QuestionSettings(connectedPercentageMode='keep-original')})
    q=next(q for q in analyze(p,settings)['questions'] if q['id']=='follow')
    assert q['respondentBasis']['denominator']==50 and q['rows'][0]['percent']==10


def test_parent_visibility_and_multiple_select_do_not_rescale_original_total():
    p=example();p['form']['questions'][1]['kind']='multiple'
    for i,r in enumerate(p['records']):r['values']['follow']=['a','b'] if i<10 else None
    settings=KoboSettings(hidden=['main'],questions={'main':QuestionSettings(hiddenAnswers=['other']),'follow':QuestionSettings(connectedPercentageMode='keep-original')})
    q=next(q for q in analyze(p,settings)['questions'] if q['id']=='follow')
    assert [r['percent'] for r in q['rows']]==[10,10]
    assert q['pivotTotal']['percent']==10


def test_numeric_and_not_selected_rules_are_safe_and_type_aware():
    p=example();fields={q['id']:q for q in p['form']['questions']};fields['main']['kind']='multiple'
    fields['age']={**fields['main'],'id':'age','name':'age','kind':'number','choices':[]}
    tree=parse_condition("not(selected(${main}, 'yes')) and ${age} >= 18",fields['follow'],fields)
    kinds={key:f['kind'] for key,f in fields.items()}
    assert matches_tree(tree,{'main':['other'],'age':20}.get,kinds)
    assert not matches_tree(tree,{'main':['other'],'age':17}.get,kinds)
    assert not matches_tree(tree,{'main':['yes'],'age':30}.get,kinds)
    with pytest.raises(ValueError):parse_condition("__import__('os').system('echo unsafe')",fields['follow'],fields)
    with pytest.raises(ValueError):validate_tree({'type':'rule','field':'main','operator':'execute','value':'x'})


@pytest.mark.parametrize('kind,excel_mode',[('category','native'),('multiple','native'),('multiple','binary')])
@pytest.mark.parametrize('mode,base',[('adjust',4),('keep-original',100)])
def test_manual_rule_sources_keep_eligibility_separate_from_original_denominators(kind,excel_mode,mode,base):
    from backend.kobo_excel_source import response_layout,query_config,multi_config
    from backend.kobo_excel_direct import direct_helpers
    from backend.kobo_excel_prepare import helper_values,materialize_multi
    p=example();p['form']['questions'][1].update(kind=kind,relevant='')
    if kind=='multiple':
        for record in p['records']:
            value=record['values']['follow'];record['values']['follow']=[value] if value else None
    rules=group(group(leaf('main','other'),leaf('main','other'),match='any'),leaf('region','north'))
    cfg=KoboSettings(questions={'follow':QuestionSettings(connectionSource='manual',connectionRules=rules,connectedPercentageMode=mode,percentageParent='main',hiddenAnswers=['a'])})
    snapshot=analyze(p,cfg,'follow');layouts=response_layout(p,cfg);config=query_config(p,snapshot,cfg,[],layouts);config['excelMode']=excel_mode
    if kind=='multiple' and excel_mode=='native':
        own=multi_config(config,config['questions'][0]);rows=materialize_multi((own,p['records']))
        cells=[dict(zip(own['headers'],row)) for row in rows]
        assert sum(row['Answered'] for row in cells)==base
        assert sum(row['Selected'] for row in cells if row['AnswerCode']=='b')==4
        assert sum(row['Selected'] for row in cells if row['AnswerCode']=='a')==0
    else:
        helpers,sources=direct_helpers(config,layouts);fields=sources['follow']['fields']
        rows=helper_values(layouts,config,sources,helpers)[0]
        cells=[dict(zip(helpers[''],row)) for row in rows]
        allowed=[row for row in cells if row[fields['AnswerAllowed']]=='Included']
        assert sum(row[fields['Answered']] for row in allowed)==base
        if mode=='keep-original':assert sum(row[fields['FollowupAnswered']] for row in allowed)==4
    assert snapshot['questions'][0]['rows'][0]['percent']==(100 if mode=='adjust' else 4)


def test_original_missing_connection_remains_available_after_manual_override():
    p=example();p['form']['questions'][1]['relevant']="${removed_parent} = 'old_answer'"
    rules=group(leaf('main','other'))
    q,_=result(p,connectionSource='manual',connectionRules=rules,connectedPercentageMode='keep-original')
    assert q['rows'][0]['percent']==6
    assert q['connections']['conditions'][0]['expression']=="${removed_parent} = 'old_answer'"
    assert q['connections']['unresolvedReferences']==[{'reference':'removed_parent','source':'follow'}]
    assert q['connections']['originalParents']==[]
    assert q['connections']['parents'][0]['id']=='main'
    q,_=result(connectionSource='manual',connectionRules=group(leaf('region','north')),percentageParent='region',connectedPercentageMode='keep-original')
    assert q['connections']['originalParents'][0]['id']=='main'
    assert q['connections']['parents'][0]['id']=='region'


def test_expanded_source_rows_preserve_original_base_with_hidden_answers():
    from backend.kobo_excel import source_rows
    p=example();q,cfg=result(p,connectedPercentageMode='keep-original',hiddenAnswers=['a'])
    rows=source_rows(p,q,cfg)
    assert sum(row[2] for row in rows if row[5]=='b')==4
    assert sum(row[3] for row in rows if row[5]=='b')==100


def test_settings_transfer_remaps_manual_rules_and_the_primary_parent():
    from backend.kobo_settings_share import export_settings,preview_settings,SettingsFile
    p=example();_,cfg=result(p,connectionSource='manual',connectionRules=group(leaf('main','other')),percentageParent='main',connectedPercentageMode='keep-original')
    package=SettingsFile.model_validate(export_settings(p,cfg))
    destination=deepcopy(p)
    for question in destination['form']['questions']:question['id']='new/'+question['id']
    review=preview_settings(destination,KoboSettings(),package)
    imported=review['settings']['questions']['new/follow']
    assert imported['percentageParent']=='new/main'
    assert imported['connectionRules']['rules'][0]['field']=='new/main'
    assert imported['connectedPercentageMode']=='keep-original'


def test_explicit_adjust_mode_keeps_a_zero_base_question_reviewable():
    p=example()
    for record in p['records']:record['values']['follow']=None
    q,_=result(p,connectedPercentageMode='adjust')
    assert q['respondentBasis']['denominator']==0
    assert q['pivotTotal']['percent'] is None


def test_broken_detected_rules_preserve_tree_and_target_diagnostics():
    from backend.kobo_connections import connection_plan
    from backend.kobo import QuestionSettings
    p = example()
    questions = {q['id']: q for q in p['form']['questions']}
    child = {**questions['follow'], 'relevant': "${removed_main} = 'other' and ${main} = 'removed_answer'"}
    plan = connection_plan(child, QuestionSettings(), questions)
    assert plan['tree']['rules'][0]['rules'][0]['field'] == 'removed_main'
    assert [(d['code'], d['path']) for d in plan['diagnostics']] == [('missing-rule-question', [0, 0]), ('missing-rule-answer', [0, 1])]
    assert 'main' in plan['diagnostics'][0]['availableIds']
    assert plan['issue'] == ''  # Adjust remains available for actual follow-up answers.
    assert not plan['canKeepOriginal']
