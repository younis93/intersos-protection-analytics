import copy
import io
import json
import pytest
from openpyxl import load_workbook
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.kobo import KoboSettings,ProjectStore,analyze,resolved_question_settings
from backend.kobo_api import make_router
from backend.kobo_connections import form_question_index,connection_plan
from backend.kobo_shared_dependencies import catalog,preview,apply,DependencyRequest,prune,rule_key
from backend.kobo_conditional import scan
from backend.kobo_workspace import backup_project,read_backup
from backend.kobo_excel_source import response_layout,query_config
from backend.test_kobo_required import required_project

@pytest.fixture
def shared(required_project,tmp_path):
    project,source=required_project
    store=ProjectStore(tmp_path/'shared.sqlite3');settings=KoboSettings(language='en')
    pid=store.create('Dependencies',project,source,b'data',settings)['id']
    return store,pid,settings

def chosen(store,pid):
    return next(c for c in catalog(store.get(pid)) if c['rule']['field']=='a' and c['rule']['value']=='yes')

def action(store,pid,kind='ignore'):
    req=DependencyRequest(condition=chosen(store,pid)['id'],action=kind)
    result=preview(store.get(pid),req)
    return apply(store,pid,req.model_copy(update={'token':result['token']}))

def plan(project,settings,qid):
    questions=form_question_index(project['form']);q=questions[qid]
    return connection_plan(q,resolved_question_settings(q,settings),questions)

def test_ignore_restore_preserve_answers_source_review_and_export(shared):
    store,pid,settings=shared;before=store.get(pid)
    req=DependencyRequest(condition=chosen(store,pid)['id'],action='ignore')
    result=preview(before,req)
    assert result['eligible']==3 and not result['individual']
    assert all('Applies to all records' in row['after'] for row in result['rows'])
    after=action(store,pid)
    assert after['records']==before['records']
    for qid in ['branch/required_followup','branch/optional_followup','visits/detail']:
        assert not plan(after,settings,qid)['tree'] and not plan(after,settings,qid)['enabled']
    # No optional connected-blank finding once its only connection was removed.
    rows=scan(after,settings)['rows']
    assert not any(r['question']=='branch/optional_followup' for r in rows)
    assert any(r['question']=='branch/required_followup' and r['record']=='r2' and r['outcome']=='required-missing' for r in rows)
    assert any(r['question']=='visits/detail' and r['record']=='v2' and r['outcome']=='required-missing' for r in rows)
    assert not any(r['outcome']=='uncheckable' for r in rows)
    assert [q['relevant'] for q in after['form']['questions']]==[q['relevant'] for q in before['form']['questions']]
    snapshot=analyze(after,settings)
    layouts=response_layout(after,settings)
    config=query_config(after,snapshot,settings,[],layouts)
    assert not next(q for q in config['questions'] if q['id']=='visits/detail')['connected']
    restored=action(store,pid,'restore')
    assert plan(restored,settings,'visits/detail')['enabled']
    assert restored['records']==before['records']

def test_prune_keeps_other_conditions_and_rejects_or():
    consent={'type':'rule','field':'consent','operator':'eq','value':'yes'}
    other={'type':'rule','field':'q32','operator':'eq','value':'missing'}
    result=prune({'type':'group','match':'all','rules':[consent,other]},rule_key(consent))
    assert result['rules']==[other]
    assert prune({'type':'rule','field':'consent','operator':'eq','value':'no'},rule_key(consent))['value']=='no'
    with pytest.raises(ValueError,match='inside-or'):prune({'type':'group','match':'any','rules':[consent,other]},rule_key(consent))

def test_pending_source_is_confirmed_without_removing_original_conditions(shared):
    store,pid,settings=shared
    with store.connect() as db:
        raw=json.loads(db.execute('SELECT payload FROM projects WHERE id=?',(pid,)).fetchone()[0])
        for q in raw['form']['questions']:
            if q['id'].startswith('branch/'):q.update(relevant='',inheritedRelevant=[])
        next(g for g in raw['form']['groups'] if g['id']=='branch').pop('relevant',None)
        db.execute('UPDATE projects SET payload=? WHERE id=?',(json.dumps(raw),pid))
    assert any(q.get('connectionSetup') for q in store.get(pid)['form']['questions'])
    after=action(store,pid)
    for q in after['form']['questions']:
        if q['id'].startswith('branch/'):
            assert not q.get('connectionSetup')
            assert q['inheritedRelevant'][0]['expression']=="${a} = 'yes'"
            assert q.get('ignoredConnectionRules')

def test_stale_preview_and_source_change_suspend_override(shared):
    store,pid,settings=shared
    req=DependencyRequest(condition=chosen(store,pid)['id'],action='ignore')
    token=preview(store.get(pid),req)['token']
    with store.connect() as db:
        raw=json.loads(db.execute('SELECT payload FROM projects WHERE id=?',(pid,)).fetchone()[0]);raw['records'][0]['values']['a']='no'
        db.execute('UPDATE projects SET payload=? WHERE id=?',(json.dumps(raw),pid))
    with pytest.raises(ValueError,match='changed'):apply(store,pid,req.model_copy(update={'token':token}))
    action(store,pid)
    with store.connect() as db:
        source=bytes(db.execute('SELECT form FROM projects WHERE id=?',(pid,)).fetchone()[0]);book=load_workbook(io.BytesIO(source))
        for row in book['survey'].iter_rows(min_row=2):
            if row[1].value=='branch':row[5].value="${a} = 'no'"
        buffer=io.BytesIO();book.save(buffer);db.execute('UPDATE projects SET form=? WHERE id=?',(buffer.getvalue(),pid))
    current=store.get(pid)
    target=next(q for q in current['form']['questions'] if q['id']=='branch/required_followup')
    assert target.get('dependencyReviewNeeded') and target['connectionSetup']['pending']
    assert not target.get('ignoredConnectionRules')

def test_manual_overrides_are_listed_and_unchanged(shared):
    store,pid,settings=shared
    settings=KoboSettings(language='en',questions={'visits/detail':{'connectionSource':'manual','connectionRules':{'type':'rule','field':'a','operator':'eq','value':'no'}}})
    with store.connect() as db:db.execute('UPDATE projects SET settings=? WHERE id=?',(settings.model_dump_json(),pid))
    result=preview(store.get(pid),DependencyRequest(condition=chosen(store,pid)['id'],action='ignore'))
    assert next(r for r in result['rows'] if r['question']=='visits/detail')['reason']=='manual-override'
    after=action(store,pid)
    assert plan(after,settings,'visits/detail')['tree']['value']=='no'
    assert not next(q for q in after['form']['questions'] if q['id']=='visits/detail').get('ignoredConnectionRules')

def test_backup_reload_and_api_preview_apply(shared):
    store,pid,settings=shared;app=FastAPI();app.include_router(make_router(store));client=TestClient(app);url=f'/api/kobo/projects/{pid}/shared-dependencies'
    condition=chosen(store,pid)['id']
    assert client.get(url).status_code==200
    body={'condition':condition,'action':'ignore'}
    response=client.post(url+'/preview',json=body);assert response.status_code==200,response.text
    response=client.post(url+'/apply',json={**body,'token':response.json()['token']});assert response.status_code==200,response.text
    assert next(q for q in response.json()['form']['questions'] if q['id']=='visits/detail')['ignoredConnectionRules']
    name,payload,rest,source,data=read_backup(backup_project(store,pid))
    new=store.create('Reload',payload,source,data,settings)
    assert next(q for q in new['form']['questions'] if q['id']=='visits/detail')['ignoredConnectionRules']


def test_compound_source_rules_unsafe_or_and_unsupported_are_separated(required_project,tmp_path):
    from backend.kobo import parse_form
    project,source=required_project
    book=load_workbook(io.BytesIO(source))
    expressions={'optional_text':"${a} = 'yes' and ${amount} > 0",'required_text':"${a} = 'yes' or ${amount} > 0",'dynamic':"${a} = 'yes' and regex(${optional_text}, 'x')",'detail':"${a} = 'no'"}
    for row in book['survey'].iter_rows(min_row=2):
        if row[1].value in expressions:row[5].value=expressions[row[1].value]
    buffer=io.BytesIO();book.save(buffer);source=buffer.getvalue();project['form']=parse_form(source)
    store=ProjectStore(tmp_path/'compound.sqlite3');settings=KoboSettings(language='en');pid=store.create('Compound',project,source,b'data',settings)['id']
    result=preview(store.get(pid),DependencyRequest(condition=chosen(store,pid)['id'],action='ignore'))
    reasons={r['question']:r['reason'] for r in result['rows']}
    assert reasons['required_text']=='inside-or' and reasons['dynamic']=='unsupported-condition'
    assert not reasons['optional_text'] and 'visits/detail' not in reasons
    after=action(store,pid)
    tree=plan(after,settings,'optional_text')['tree']
    from backend.kobo_shared_dependencies import leaves
    assert [r['field'] for r in leaves(tree)]==['amount']
    assert plan(after,settings,'visits/detail')['tree']['rules'][0]['value']=='no'
    # A second override is preserved when restoring the first.
    amount=next(c for c in catalog(after) if c['rule']['field']=='amount')
    req=DependencyRequest(condition=amount['id'],action='ignore');result=preview(after,req)
    apply(store,pid,req.model_copy(update={'token':result['token']}))
    restored=action(store,pid,'restore')
    assert [r['field'] for r in leaves(plan(restored,settings,'optional_text')['tree'])]==['a']


def test_required_rules_remain_unchanged_and_reimport_preserves_matching_overrides(shared):
    store,pid,settings=shared;before=store.get(pid);after=action(store,pid)
    assert next(q for q in after['form']['questions'] if q['id']=='dynamic')['required']=="${a} = 'yes'"
    source,data=store.sources(pid)
    payload={k:v for k,v in before.items() if k not in {'id','name','settings','updated'}}
    payload.pop('sharedDependencyOverrides',None)
    store.repair(pid,payload,source,data,preserve_settings=True)
    assert not plan(store.get(pid),settings,'visits/detail')['enabled']


def test_changed_source_can_be_confirmed_with_ignored_dependency_restored(shared):
    from backend.kobo_connection_setup import confirm_connection,ConnectionSetupRequest
    store,pid,settings=shared;action(store,pid)
    with store.connect() as db:
        raw=json.loads(db.execute('SELECT payload FROM projects WHERE id=?',(pid,)).fetchone()[0])
        next(q for q in raw['form']['questions'] if q['id']=='a')['choices'].append({'name':'maybe','labels':{'en':'Maybe'}})
        db.execute('UPDATE projects SET payload=? WHERE id=?',(json.dumps(raw),pid))
    project=store.get(pid);q=next(q for q in project['form']['questions'] if q['id']=='visits/detail')
    assert q['dependencyReviewNeeded'] and q['connectionSetup']['pending']
    confirm_connection(store,pid,ConnectionSetupRequest(question=q['id'],fingerprint=q['connectionSetup']['fingerprint'],settings=settings.model_dump()))
    q=next(q for q in store.get(pid)['form']['questions'] if q['id']=='visits/detail')
    assert not q.get('connectionSetup') and not q.get('ignoredConnectionRules')
    assert plan(store.get(pid),settings,'visits/detail')['enabled']


def test_ignored_percentage_parent_falls_back_and_restores_without_settings_changes(shared):
    store,pid,settings=shared
    settings=KoboSettings(language='en',questions={'branch/required_followup':{'percentageBase':'parent','percentageParent':'a','connectedPercentageMode':'keep-original'}})
    with store.connect() as db: db.execute('UPDATE projects SET settings=? WHERE id=?',(settings.model_dump_json(),pid))
    before=store.get(pid)
    req=DependencyRequest(condition=chosen(store,pid)['id'],action='ignore')
    result=preview(before,req)
    row=next(r for r in result['rows'] if r['question']=='branch/required_followup')
    assert row['percentageBaseChange']=={'from':'Question A','to':'Required follow-up'}
    assert result['unchanged']==0 and result['needsReview']==0
    after=action(store,pid)
    effective=plan(after,settings,'branch/required_followup')
    assert effective['mode']=='adjust' and not effective['issue'] and not effective['parentId']
    assert after['settings']==before['settings']
    snapshot=analyze(after,settings)
    question=next(q for q in snapshot['questions'] if q['id']=='branch/required_followup')
    assert not question['respondentBasis']['issue'] and question['respondentBasis']['kind']=='question'
    assert question['respondentBasis']['denominator']==1
    assert question['connections']['percentageBaseChange']['from']=='a'
    config=query_config(after,snapshot,settings,[],response_layout(after,settings))
    exported=next(q for q in config['questions'] if q['id']=='branch/required_followup')
    assert not exported['percentageParent'] and not exported['connected']
    result=preview(after,req.model_copy(update={'action':'restore'}))
    assert next(r for r in result['rows'] if r['question']=='branch/required_followup')['percentageBaseChange']=={'from':'Required follow-up','to':'Question A'}
    restored=action(store,pid,'restore')
    assert plan(restored,settings,'branch/required_followup')['mode']=='keep-original'
    assert not plan(restored,settings,'branch/required_followup')['issue']


def test_shared_ignore_applies_to_review_despite_unrelated_unsupported_source(required_project,tmp_path):
    from backend.kobo import parse_form
    project,source=required_project;book=load_workbook(io.BytesIO(source))
    for row in book['survey'].iter_rows(min_row=2):
        if row[1].value=='required_followup':row[5].value="regex(${optional_text}, 'x')"
    buffer=io.BytesIO();book.save(buffer);source=buffer.getvalue();project['form']=parse_form(source)
    store=ProjectStore(tmp_path/'partial.sqlite3');settings=KoboSettings(language='en');pid=store.create('Partial rules',project,source,b'data',settings)['id']
    before=store.get(pid)
    assert not any(r['question']=='branch/required_followup' and r['record']=='r2' for r in scan(before,settings)['rows'])
    req=DependencyRequest(condition=chosen(store,pid)['id'],action='ignore');result=preview(before,req)
    row=next(r for r in result['rows'] if r['question']=='branch/required_followup')
    assert not row['reason'] and row['remainingIssues'] and 'could not be evaluated' in row['after']
    after=apply(store,pid,req.model_copy(update={'token':result['token']}))
    assert any(r['question']=='branch/required_followup' and r['record']=='r2' and r['outcome']=='uncheckable' for r in scan(after,settings)['rows'])
    q=next(q for q in after['form']['questions'] if q['id']=='branch/required_followup')
    assert next(c for c in q['conditionReview'] if c['source']=='branch')['status']=='ignored'
    assert next(c for c in q['conditionReview'] if c['source']==q['id'])['status']=='unchecked'


def test_shared_ignore_keeps_missing_reference_explicit(required_project,tmp_path):
    from backend.kobo import parse_form
    project,source=required_project;book=load_workbook(io.BytesIO(source))
    for row in book['survey'].iter_rows(min_row=2):
        if row[1].value=='branch':row[5].value="${a} = 'yes' and ${missing_status} = 'idp'"
    buffer=io.BytesIO();book.save(buffer);source=buffer.getvalue();project['form']=parse_form(source)
    store=ProjectStore(tmp_path/'missing.sqlite3');settings=KoboSettings(language='en');pid=store.create('Missing reference',project,source,b'data',settings)['id']
    after=action(store,pid)
    q=next(q for q in after['form']['questions'] if q['id']=='branch/required_followup')
    condition=next(c for c in q['conditionReview'] if c['source']=='branch')
    assert condition['status']=='missing' and condition['ignoredScope']=='project'
    assert condition['missingReferences']==['missing_status'] and condition['ignoredParts']
    effective=plan(after,settings,q['id']);assert 'a' not in effective['fields'] and effective['reviewIssues']
