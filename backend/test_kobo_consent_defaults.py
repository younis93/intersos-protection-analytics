from copy import deepcopy
from backend.kobo_shared_dependencies import annotate, rule_key


def project():
    consent=dict(id='consent',name='consent',labels={'en':'Consent'},kind='select_one',choices=[{'name':'1','labels':{'en':'Yes'}},{'name':'0','labels':{'en':'No'}}],repeat='',group='')
    def question(name, relevant):
        return dict(id=name,name=name,labels={'en':name},kind='text',choices=[],repeat='',group='',relevant=relevant)
    return {'form':{'questions':[consent,question('yes',"${consent} = '1'"),question('no',"${consent} = '0'"),question('plain',''),question('mixed',"${consent} = '1' and ${no} = 'ok'"),question('either',"${consent} = '1' or ${no} = 'ok'")]},'settings':{},'records':[{'values':{'consent':'0'}}]}


def test_only_existing_affirmative_consent_conditions_default_to_ignored():
    data=project(); original=deepcopy(data)
    annotate(data)
    questions={q['id']:q for q in data['form']['questions']}
    assert questions['yes']['ignoredConnectionRules'][0]['value']=='1'
    assert questions['mixed']['ignoredConnectionRules'][0]['field']=='consent'
    assert all(not questions[key].get('ignoredConnectionRules') for key in ['consent','no','plain','either'])
    assert data['records']==original['records']
    assert [q.get('relevant') for q in data['form']['questions']]==[q.get('relevant') for q in original['form']['questions']]


def test_restore_opt_out_and_manual_rules_are_respected():
    data=project();annotate(data)
    data['restoredConsentDependencies']=[rule_key(data['form']['questions'][1]['ignoredConnectionRules'][0])]
    annotate(data)
    assert all(not q.get('ignoredConnectionRules') for q in data['form']['questions'])
    data=project();data['settings']={'questions':{'yes':{'connectionSource':'manual'}}}
    annotate(data)
    assert not data['form']['questions'][1].get('ignoredConnectionRules')


def test_fully_ignored_recovered_connection_does_not_need_setup():
    from backend.kobo_question_conditions import annotate as annotate_conditions
    data=project()
    for q in data['form']['questions'][1:]:
        recovered={'relevant':q['relevant'],'inheritedRelevant':[]}
        q['relevant']=''
        q['connectionSetup']={'pending':True,'recovered':recovered}
    annotate(data);annotate_conditions(data)
    questions={q['id']:q for q in data['form']['questions']}
    assert not questions['yes'].get('connectionSetup')
    assert questions['yes']['relevant']=="${consent} = '1'"
    assert questions['yes']['ignoredConnectionRules']
    assert not questions['mixed'].get('connectionSetup')
    assert questions['no']['connectionSetup']['pending']
    assert questions['either']['connectionSetup']['pending']


def test_stale_ignored_connection_still_requires_review():
    from backend.kobo_connection_setup import resolve_ignored_setup
    data=project();annotate(data)
    q=data['form']['questions'][1]
    q['connectionSetup']={'pending':True,'recovered':{'relevant':q['relevant'],'inheritedRelevant':[]}}
    q['dependencyReviewNeeded']=True
    resolve_ignored_setup(data)
    assert q['connectionSetup']['pending']


def test_consent_field_with_underscores_and_untranslated_label():
    data=project()
    data['form']['questions'][0].update(name='informed_consent',labels={'en':'Do you agree to participate?'})
    annotate(data)
    assert data['form']['questions'][1]['ignoredConnectionRules']


def test_saved_ignore_does_not_exclude_other_default_consent_questions():
    data=project();annotate(data)
    key,entry=next(iter(data['sharedDependencyOverrides'].items()))
    saved={**entry,'default':False,'questions':{'yes':entry['questions']['yes']}}
    data['sharedDependencyOverrides']={key:saved}
    annotate(data)
    assert data['form']['questions'][4]['ignoredConnectionRules']
    assert data['sharedDependencyOverrides'][key]['questions']['yes']==saved['questions']['yes']


def test_invalid_remaining_dependency_still_needs_setup():
    from backend.kobo_question_conditions import annotate as annotate_conditions
    data=project();q=data['form']['questions'][4]
    q['connectionSetup']={'pending':True,'recovered':{'relevant':"${consent} = '1' and ${missing} = 'other'",'inheritedRelevant':[]}}
    annotate(data);annotate_conditions(data)
    assert q['connectionSetup']['pending']


def test_changed_source_still_needs_review_even_with_valid_remaining_dependency():
    from backend.kobo_question_conditions import annotate as annotate_conditions
    data=project();q=data['form']['questions'][4]
    q['connectionSetup']={'pending':True,'reason':'source-condition-changed','recovered':{'relevant':q['relevant'],'inheritedRelevant':[]}}
    annotate(data);annotate_conditions(data)
    assert q['connectionSetup']['pending']


def test_auto_resolved_question_is_removed_from_bulk_setup_group():
    from backend.kobo_question_conditions import annotate as annotate_conditions
    data=project()
    shared={'fingerprint':'old-group','questions':['yes','no']}
    for q in data['form']['questions'][1:3]:
        q['connectionSetup']={'pending':True,'fingerprint':q['id'],'shared':deepcopy(shared),'recovered':{'relevant':q['relevant'],'inheritedRelevant':[]}}
    annotate(data);annotate_conditions(data)
    assert not data['form']['questions'][1].get('connectionSetup')
    remaining=data['form']['questions'][2]['connectionSetup']
    assert remaining['pending'] and 'shared' not in remaining


def test_invalid_consent_answer_is_not_silently_ignored():
    data=project()
    data['form']['questions'][0]['kind']='category'
    data['form']['questions'][1]['relevant']="${consent} = 'yes'"
    annotate(data)
    assert not data['form']['questions'][1].get('ignoredConnectionRules')
