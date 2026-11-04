import io,json
import pytest
from openpyxl import load_workbook
from backend.kobo import ProjectStore,KoboSettings,parse_form,resolved_question_settings,analyze
from backend.kobo_question_conditions import preview,apply,QuestionConditionsRequest
from backend.kobo_connections import form_question_index,connection_plan
from backend.kobo_conditional import scan
from backend.kobo_workspace import backup_project,read_backup
from backend.test_kobo_required import required_project

@pytest.fixture
def local(required_project,tmp_path):
    project,source=required_project
    book=load_workbook(io.BytesIO(source))
    for row in book['survey'].iter_rows(min_row=2):
        if row[1].value=='branch':row[5].value="(${missing_status} = 'idp' or ${missing_status} = 'returnee') and ${a} = 'yes'"
        if row[1].value=='required_followup':row[5].value='${amount} > 0'
    buffer=io.BytesIO();book.save(buffer);source=buffer.getvalue();project['form']=parse_form(source)
    for q in project['form']['questions']:
        if q['id'].startswith('branch/'):q.update(relevant='',inheritedRelevant=[])
    next(g for g in project['form']['groups'] if g['id']=='branch').pop('relevant',None)
    store=ProjectStore(tmp_path/'local.sqlite3');settings=KoboSettings(language='en');pid=store.create('Local conditions',project,source,b'data',settings)['id']
    return store,pid,settings

def plan(project,settings,qid='branch/required_followup'):
    questions=form_question_index(project['form']);q=questions[qid]
    return connection_plan(q,resolved_question_settings(q,settings),questions)

def test_ignore_multiple_source_conditions_is_question_only_and_reversible(local):
    store,pid,settings=local;before=store.get(pid);req=QuestionConditionsRequest(question='branch/required_followup')
    initial=preview(before,req);assert len(initial['conditions'])==2
    assert any(c['readable'] is None for c in initial['conditions'])
    req=req.model_copy(update={'ignored':[c['id'] for c in initial['conditions']]});result=preview(before,req)
    assert not result['issues'] and not result['after']
    after=apply(store,pid,req.model_copy(update={'token':result['token']}))
    assert after['records']==before['records'] and after['settings']==before['settings']
    assert not plan(after,settings)['enabled'] and not plan(after,settings)['reviewIssues']
    target=next(q for q in after['form']['questions'] if q['id']==req.question)
    assert len(target['ignoredSourceConditions'])==2 and not target.get('connectionSetup')
    other=next(q for q in after['form']['questions'] if q['id']=='branch/optional_followup')
    assert not other.get('ignoredSourceConditions') and other['connectionSetup']['pending']
    assert any(r['question']==req.question and r['record']=='r2' and r['outcome']=='required-missing' for r in scan(after,settings)['rows'])
    question=next(q for q in analyze(after,settings)['questions'] if q['id']==req.question)
    assert len(question['connections']['ignoredSourceConditions'])==2 and not question['connections']['reviewIssues']
    restore=req.model_copy(update={'ignored':[]});result=preview(after,restore);assert result['issues']
    restored=apply(store,pid,restore.model_copy(update={'token':result['token']}))
    assert not next(q for q in restored['form']['questions'] if q['id']==req.question).get('ignoredSourceConditions')
    assert plan(restored,settings)['reviewIssues']

def test_ignoring_unresolved_group_preserves_supported_own_rule(local):
    store,pid,settings=local;req=QuestionConditionsRequest(question='branch/required_followup');result=preview(store.get(pid),req)
    group=next(c['id'] for c in result['conditions'] if c['kind']=='group');req=req.model_copy(update={'ignored':[group]});result=preview(store.get(pid),req)
    after=apply(store,pid,req.model_copy(update={'token':result['token']}))
    effective=plan(after,settings);assert effective['fields']==['amount'] and not effective['reviewIssues']
    assert not any(r['question']==req.question and r['record']=='r1' for r in scan(after,settings)['rows'])
    assert before_zero(after)==0

def before_zero(project):return project['records'][0]['values']['amount']

def test_stale_preview_is_rejected_and_backup_preserves_local_decisions(local):
    store,pid,settings=local;req=QuestionConditionsRequest(question='branch/required_followup');initial=preview(store.get(pid),req)
    req=req.model_copy(update={'ignored':[c['id'] for c in initial['conditions']]});result=preview(store.get(pid),req)
    with store.connect() as db:
        raw=json.loads(db.execute('SELECT payload FROM projects WHERE id=?',(pid,)).fetchone()[0]);raw['records'][0]['values']['a']='no';db.execute('UPDATE projects SET payload=? WHERE id=?',(json.dumps(raw),pid))
    with pytest.raises(ValueError,match='changed'):apply(store,pid,req.model_copy(update={'token':result['token']}))
    result=preview(store.get(pid),req);apply(store,pid,req.model_copy(update={'token':result['token']}))
    name,payload,saved_settings,source,data=read_backup(backup_project(store,pid));saved=store.create(name,payload,source,data,saved_settings)
    assert not plan(saved,settings)['enabled']


def test_local_ignore_percentage_parent_preview_and_export(local):
    from backend.kobo_excel_source import response_layout,query_config
    store,pid,settings=local
    settings=KoboSettings(language='en',questions={'branch/required_followup':{'percentageBase':'parent','percentageParent':'a','connectedPercentageMode':'keep-original'}})
    with store.connect() as db:db.execute('UPDATE projects SET settings=? WHERE id=?',(settings.model_dump_json(),pid))
    req=QuestionConditionsRequest(question='branch/required_followup');initial=preview(store.get(pid),req)
    group=next(c['id'] for c in initial['conditions'] if c['kind']=='group');req=req.model_copy(update={'ignored':[group]});result=preview(store.get(pid),req)
    assert result['percentageBaseChange']=={'from':'a','to':req.question}
    after=apply(store,pid,req.model_copy(update={'token':result['token']}));snapshot=analyze(after,settings)
    config=query_config(after,snapshot,settings,[],response_layout(after,settings));question=next(q for q in config['questions'] if q['id']==req.question)
    assert question['connected'] and not question['percentageParent']
    assert not plan(after,settings)['issue']


def test_review_acknowledgment_and_bulk_fill_use_effective_ignored_conditions(local):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.kobo_api import make_router
    from backend.test_kobo_review_blank_fill import request as blank_request
    store,pid,settings=local;req=QuestionConditionsRequest(question='branch/required_followup');initial=preview(store.get(pid),req)
    req=req.model_copy(update={'ignored':[c['id'] for c in initial['conditions']]});result=preview(store.get(pid),req);apply(store,pid,req.model_copy(update={'token':result['token']}))
    app=FastAPI();app.include_router(make_router(store));client=TestClient(app);url=f'/api/kobo/projects/{pid}'
    reviewed=client.post(url+'/conditional-review',json={'settings':settings.model_dump(),'category':'missing','question':req.question}).json();row=reviewed['rows'][0]
    response=client.post(url+'/conditional-review/actions',json={'settings':settings.model_dump(),'revision':reviewed['revision'],'action':'ignore','items':[{key:row[key] for key in ['record','question','fingerprint']}]})
    assert response.status_code==200,response.text
    body=blank_request(settings,field=req.question,status='all');checked=client.post(url+'/edits/preview',json=body)
    assert checked.status_code==200 and checked.json()['affectedRecords']==2,checked.text
    saved=client.post(url+'/edits/apply',json={**body,'signature':checked.json()['signature']})
    assert saved.status_code==200,saved.text
    assert [r['values'][req.question] for r in store.get(pid)['records'][:2]]==['Verified','Verified']
