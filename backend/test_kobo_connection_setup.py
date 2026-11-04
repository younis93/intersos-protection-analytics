import copy
import io
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from backend.kobo import KoboSettings, ProjectStore, analyze
from backend.kobo_api import make_router
from backend.kobo_connection_setup import hydrate_connections
from backend.kobo_conditional import scan
from backend.kobo_workspace import backup_project, read_backup
from backend.test_kobo_required import required_project


@pytest.fixture
def setup_api(required_project,tmp_path):
    project,source=required_project
    q=next(q for q in project['form']['questions'] if q['id']=='branch/required_followup')
    q.update(relevant='',inheritedRelevant=[])
    next(g for g in project['form']['groups'] if g['id']=='branch').pop('relevant',None)
    store=ProjectStore(tmp_path/'setup.sqlite3');settings=KoboSettings(language='en')
    saved=store.create('Connection recovery',project,source,b'data',settings)
    app=FastAPI();app.include_router(make_router(store))
    return TestClient(app),store,saved['id'],settings


def question(project,qid='branch/required_followup'):
    return next(q for q in project['form']['questions'] if q['id']==qid)


def confirm_body(store,pid,settings,qid='branch/required_followup'):
    return {'question':qid,'fingerprint':question(store.get(pid),qid)['connectionSetup']['fingerprint'],'settings':settings.model_dump()}


def test_missing_group_connection_is_setup_only_with_no_answer_warnings(setup_api):
    client,store,pid,settings=setup_api;url=f'/api/kobo/projects/{pid}'
    project=store.get(pid);q=question(project)
    assert q['connectionSetup']['pending'] and q['inheritedRelevant']==[]
    assert q['connectionSetup']['recovered']['inheritedRelevant'][0]['expression']=="${a} = 'yes'"
    assert not any(r['question']==q['id'] for r in scan(project,settings)['rows'])
    result=client.post(url+'/data-review',json={'settings':settings.model_dump(),'group':'connection-setup:'+q['id']}).json()
    group=next(g for g in result['groups'] if g['question']==q['id'])
    assert group['findingType']=='connection-setup-needed' and group['count']==1
    assert not group['canIgnore'] and group['severity']=='check' and result['rows']==[]
    assert result['summary']['connectionSetupQuestions']==1
    assert not any(g['id']=='required-missing:'+q['id'] for g in result['groups'])
    api=client.get(url).json()
    assert question(api)['connectionSetup']['fingerprint']==q['connectionSetup']['fingerprint']
    result=next(q for q in analyze(project,settings)['questions'] if q['id']=='branch/required_followup')
    assert result['connectionSetup']['pending'] and not result['missingAnswers']
    cells=client.post(url+'/data',json={'settings':settings.model_dump(),'scope':'','columns':[q['id']]}).json()
    assert all(r['conditionalWarnings'][q['id']]['outcome']=='connection-setup-needed' for r in cells['rows'])


def test_preview_prefills_source_without_activating_it_then_save_resumes(setup_api):
    client,store,pid,settings=setup_api;url=f'/api/kobo/projects/{pid}'
    preview=client.post(url+'/analysis/preview',json={'settings':settings.model_dump(),'question':'branch/required_followup','connectionSetup':True})
    assert preview.status_code==200,preview.text
    assert preview.json()['connections']['effectiveTree']
    assert preview.json()['connections']['parents'][0]['id']=='a'
    assert question(store.get(pid))['inheritedRelevant']==[]
    response=client.post(url+'/connection-setup/confirm',json=confirm_body(store,pid,settings))
    assert response.status_code==200,response.text
    saved=store.get(pid)
    assert not question(saved).get('connectionSetup')
    assert question(saved)['inheritedRelevant'][0]['expression']=="${a} = 'yes'"
    rows=[r for r in scan(saved,settings)['rows'] if r['question']=='branch/required_followup']
    assert len(rows)==1 and rows[0]['record']=='r1' and rows[0]['outcome']=='required-missing'
    assert saved.get('dataEdits',{}).get('revision',0)==0
    assert 'branch/required_followup' in saved['connectionVerification']


def test_verification_survives_backup_reload_and_reopens_for_changed_source(setup_api):
    client,store,pid,settings=setup_api;url=f'/api/kobo/projects/{pid}'
    assert client.post(url+'/connection-setup/confirm',json=confirm_body(store,pid,settings)).status_code==200
    _,payload,restored_settings,form,data=read_backup(backup_project(store,pid))
    restored=store.create('Restored',payload,form,data,restored_settings)
    assert not question(restored).get('connectionSetup')
    book=load_workbook(io.BytesIO(form));sheet=book['survey']
    for row in sheet.iter_rows(min_row=2):
        if row[1].value=='branch':row[5].value="${a} = 'no'"
    output=io.BytesIO();book.save(output)
    with store.connect() as db:db.execute('UPDATE projects SET form=? WHERE id=?',(output.getvalue(),pid))
    reopened=question(store.get(pid))['connectionSetup']
    assert reopened['pending'] and reopened['reason']=='source-condition-changed'
    assert reopened['recovered']['inheritedRelevant'][0]['expression']=="${a} = 'no'"


def test_stale_condition_evidence_is_rejected_atomically(setup_api):
    client,store,pid,settings=setup_api;url=f'/api/kobo/projects/{pid}'
    body=confirm_body(store,pid,settings)
    with store.connect() as db:
        raw=json.loads(db.execute('SELECT payload FROM projects WHERE id=?',(pid,)).fetchone()[0])
        question(raw)['relevant']="${a} = 'no'"
        db.execute('UPDATE projects SET payload=? WHERE id=?',(json.dumps(raw),pid))
    response=client.post(url+'/connection-setup/confirm',json=body)
    assert response.status_code==409
    assert not store.get(pid).get('connectionVerification')


def test_pending_cells_cannot_be_review_filled_or_acknowledged(setup_api):
    client,store,pid,settings=setup_api;url=f'/api/kobo/projects/{pid}'
    operation={'kind':'cells','cells':[{'record':'r1','field':'branch/required_followup','value':'Filled'}]}
    # Ordinary correction history remains valid; Review offers no record editor.
    assert not any(r['question']=='branch/required_followup' for r in scan(store.get(pid),settings)['rows'])
    operation['reviewBlanks']={'settings':settings.model_dump(),'group':'required-missing:branch/required_followup','question':'branch/required_followup'}
    assert client.post(url+'/edits/preview',json={'revision':0,'operation':operation}).status_code==409
    result=client.post(url+'/conditional-review',json={'settings':settings.model_dump()}).json()
    action={'revision':result['revision'],'settings':settings.model_dump(),'action':'ignore','items':[{'record':'r1','question':'branch/required_followup','fingerprint':'fake'}]}
    assert client.post(url+'/conditional-review/actions',json=action).status_code==409
    assert not store.get(pid).get('dataEdits',{}).get('history')


def test_valid_manual_override_is_preserved_without_false_setup(required_project,tmp_path):
    project,source=required_project;q=question(project);q['inheritedRelevant']=[]
    settings=KoboSettings(language='en',questions={q['id']:{'connectionSource':'manual','connectionRules':{'type':'rule','field':'a','operator':'eq','value':'no'}}})
    saved=ProjectStore(tmp_path/'manual.sqlite3').create('Manual override',project,source,b'data',settings)
    assert not question(saved).get('connectionSetup')
    rows=[r for r in scan(saved,settings)['rows'] if r['question']==q['id'] and r['outcome']=='required-missing']
    assert [r['record'] for r in rows]==['r2']


def test_verified_unconditional_question_keeps_normal_required_checks(setup_api):
    _,store,pid,settings=setup_api
    saved=store.get(pid)
    assert not question(saved,'required_text').get('connectionSetup')
    assert {r['record'] for r in scan(saved,settings)['rows'] if r['question']=='required_text'}=={'r1','r3'}


def test_missing_direct_repeat_condition_uses_correct_parent_after_confirm(required_project,tmp_path):
    project,source=required_project;q=question(project,'visits/detail');q.pop('relevant')
    store=ProjectStore(tmp_path/'repeat.sqlite3');settings=KoboSettings(language='en')
    saved=store.create('Repeat connection',project,source,b'data',settings);pid=saved['id']
    app=FastAPI();app.include_router(make_router(store));client=TestClient(app)
    assert question(saved,'visits/detail')['connectionSetup']['recovered']['relevant']=="${a} = 'yes'"
    assert client.post(f'/api/kobo/projects/{pid}/connection-setup/confirm',json=confirm_body(store,pid,settings,'visits/detail')).status_code==200
    rows=[r for r in scan(store.get(pid),settings)['rows'] if r['question']=='visits/detail']
    assert [r['record'] for r in rows]==['v1']


def test_unverifiable_source_is_a_setup_limitation_not_unconditional(required_project,tmp_path):
    project,_=required_project;q=question(project);q.pop('relevant');q.pop('inheritedRelevant');q.pop('relevanceMetadataVersion')
    store=ProjectStore(tmp_path/'unavailable.sqlite3');settings=KoboSettings(language='en')
    saved=store.create('Unavailable form',project,b'old unavailable source',b'data',settings)
    assert question(saved)['connectionSetup']['reason']=='source-form-unavailable'
    assert not any(r['question']==q['id'] for r in scan(saved,settings)['rows'])


def test_ambiguous_identity_requires_repair_and_cannot_confirm(required_project,tmp_path):
    project,source=required_project;project['form']['questions'].append(copy.deepcopy(question(project)))
    store=ProjectStore(tmp_path/'ambiguous.sqlite3');settings=KoboSettings(language='en')
    saved=store.create('Ambiguous',project,source,b'data',settings);pid=saved['id']
    assert question(saved)['connectionSetup']['reason']=='ambiguous-question-identity'
    app=FastAPI();app.include_router(make_router(store));client=TestClient(app)
    assert client.post(f'/api/kobo/projects/{pid}/connection-setup/confirm',json=confirm_body(store,pid,settings)).status_code==409


def test_bad_manual_rule_cannot_confirm(setup_api):
    client,store,pid,settings=setup_api;body=confirm_body(store,pid,settings)
    body['settings']['questions']={'branch/required_followup':{'connectionSource':'manual','connectionRules':{'type':'rule','field':'absent','operator':'eq','value':'yes'}}}
    assert client.post(f'/api/kobo/projects/{pid}/connection-setup/confirm',json=body).status_code==409
    assert question(store.get(pid))['connectionSetup']['pending']


def test_confirmed_manual_rule_is_persisted_and_changed_configuration_reopens(setup_api):
    client,store,pid,settings=setup_api;url=f'/api/kobo/projects/{pid}'
    body=confirm_body(store,pid,settings)
    body['settings']['questions']={'branch/required_followup':{'connectionSource':'manual','connectionRules':{'type':'rule','field':'a','operator':'eq','value':'no'}}}
    response=client.post(url+'/connection-setup/confirm',json=body)
    assert response.status_code==200,response.text
    saved=store.get(pid);assert not question(saved).get('connectionSetup')
    manual=KoboSettings.model_validate(saved['settings'])
    assert [r['record'] for r in scan(saved,manual)['rows'] if r['question']=='branch/required_followup' and r['outcome']=='required-missing']==['r2']
    changed=copy.deepcopy(saved['settings'])
    changed['questions']['branch/required_followup']['connectionRules']['value']='yes'
    assert client.put(url+'/settings',json=changed).status_code==200
    assert question(store.get(pid))['connectionSetup']['reason']=='configured-connection-changed'


def test_analysis_values_unchanged_until_confirm(setup_api):
    _,store,pid,settings=setup_api
    project=store.get(pid);before=copy.deepcopy(project['records'])
    analyze(project,settings)
    assert project['records']==before and question(project)['inheritedRelevant']==[]


def test_reimport_preserves_confirmation_and_reopens_when_source_changes(setup_api,required_project):
    client,store,pid,settings=setup_api;url=f'/api/kobo/projects/{pid}'
    assert client.post(url+'/connection-setup/confirm',json=confirm_body(store,pid,settings)).status_code==200
    replacement,source=required_project
    from backend.kobo import parse_form
    replacement=copy.deepcopy(replacement);replacement['form']=parse_form(source)
    store.repair(pid,replacement,source,b'new data',preserve_settings=True)
    assert not question(store.get(pid)).get('connectionSetup')
    book=load_workbook(io.BytesIO(source))
    for row in book['survey'].iter_rows(min_row=2):
        if row[1].value=='branch':row[5].value="${a} = 'no'"
    buffer=io.BytesIO();book.save(buffer)
    changed=copy.deepcopy(replacement);changed['form']=parse_form(buffer.getvalue())
    store.repair(pid,changed,buffer.getvalue(),b'newer data',preserve_settings=True)
    assert question(store.get(pid))['connectionSetup']['reason']=='source-condition-changed'


def test_existing_corrections_remain_replayable_and_undoable_through_setup(required_project,tmp_path):
    project,source=required_project;settings=KoboSettings(language='en')
    store=ProjectStore(tmp_path/'history.sqlite3');saved=store.create('History',project,source,b'data',settings);pid=saved['id']
    app=FastAPI();app.include_router(make_router(store));client=TestClient(app);url=f'/api/kobo/projects/{pid}'
    body={'revision':0,'operation':{'kind':'cells','cells':[{'record':'r1','field':'branch/required_followup','value':'Corrected earlier'}]}}
    assert client.post(url+'/edits/apply',json=body).status_code==200
    with store.connect() as db:
        raw=json.loads(db.execute('SELECT payload FROM projects WHERE id=?',(pid,)).fetchone()[0])
        question(raw)['inheritedRelevant']=[]
        question(raw).pop('connectionVerifiedInheritance',None)
        next(g for g in raw['form']['groups'] if g['id']=='branch').pop('relevant',None)
        db.execute('UPDATE projects SET payload=? WHERE id=?',(json.dumps(raw),pid))
    pending=store.get(pid)
    assert question(pending)['connectionSetup']['pending']
    assert pending['records'][0]['values']['branch/required_followup']=='Corrected earlier'
    assert client.post(url+'/connection-setup/confirm',json=confirm_body(store,pid,settings)).status_code==200
    assert store.get(pid)['dataEdits']['revision']==1
    assert client.post(url+'/edits/undo',json={'revision':1,'operation':{'kind':'cells'}}).status_code==200
    assert store.get(pid)['records'][0]['values']['branch/required_followup']==' '


def test_bulk_preview_is_rejected_if_source_connection_changes_without_data_revision(required_project,tmp_path):
    project,source=required_project;settings=KoboSettings(language='en')
    store=ProjectStore(tmp_path/'bulk-source.sqlite3');saved=store.create('Bulk source',project,source,b'data',settings);pid=saved['id']
    app=FastAPI();app.include_router(make_router(store));client=TestClient(app);url=f'/api/kobo/projects/{pid}'
    body={'revision':0,'operation':{'kind':'cells','cells':[{'record':'r1','field':'branch/required_followup','value':'Bulk answer'}],
        'reviewBlanks':{'settings':settings.model_dump(),'group':'required-missing:branch/required_followup','question':'branch/required_followup'}}}
    preview=client.post(url+'/edits/preview',json=body)
    assert preview.status_code==200,preview.text
    book=load_workbook(io.BytesIO(source))
    for row in book['survey'].iter_rows(min_row=2):
        if row[1].value=='branch':row[5].value="${a} = 'no'"
    output=io.BytesIO();book.save(output)
    with store.connect() as db:db.execute('UPDATE projects SET form=? WHERE id=?',(output.getvalue(),pid))
    response=client.post(url+'/edits/apply',json={**body,'signature':preview.json()['signature']})
    assert response.status_code==409
    assert store.get(pid)['records'][0]['values']['branch/required_followup']==' '


def test_removed_source_condition_can_be_confirmed_as_unconditional(setup_api):
    client,store,pid,settings=setup_api;url=f'/api/kobo/projects/{pid}'
    assert client.post(url+'/connection-setup/confirm',json=confirm_body(store,pid,settings)).status_code==200
    source=store.sources(pid)[0];book=load_workbook(io.BytesIO(source))
    for row in book['survey'].iter_rows(min_row=2):
        if row[1].value=='branch':row[5].value=None
    output=io.BytesIO();book.save(output)
    with store.connect() as db:db.execute('UPDATE projects SET form=? WHERE id=?',(output.getvalue(),pid))
    assert question(store.get(pid))['connectionSetup']['pending']
    response=client.post(url+'/connection-setup/confirm',json=confirm_body(store,pid,settings))
    assert response.status_code==200,response.text
    saved=store.get(pid)
    assert not question(saved).get('connectionSetup')
    assert question(saved)['inheritedRelevant']==[]
    assert {r['record'] for r in scan(saved,settings)['rows'] if r['question']=='branch/required_followup'}=={'r1','r2'}


def test_legacy_snapshot_recovers_inheritance_from_original_group_metadata(required_project,tmp_path):
    from backend.project_snapshot import encode
    project,_=required_project
    for q in project['form']['questions']:
        q.pop('relevanceMetadataVersion',None)
        q.pop('inheritedRelevant',None)
    source=encode({'kind':'form','value':copy.deepcopy(project['form'])})
    store=ProjectStore(tmp_path/'legacy-snapshot.sqlite3')
    saved=store.create('Legacy snapshot',project,source,b'data',KoboSettings(language='en'));pid=saved['id']
    assert not question(saved).get('connectionSetup')
    with store.connect() as db:
        raw=json.loads(db.execute('SELECT payload FROM projects WHERE id=?',(pid,)).fetchone()[0])
        next(g for g in raw['form']['groups'] if g['id']=='branch').pop('relevant')
        db.execute('UPDATE projects SET payload=? WHERE id=?',(json.dumps(raw),pid))
    setup=question(store.get(pid))['connectionSetup']
    assert setup['pending']
    assert setup['recovered']['inheritedRelevant']==[{'source':'branch','expression':"${a} = 'yes'"}]


@pytest.fixture
def shared_api(required_project, tmp_path):
    project, source = required_project
    for q in project['form']['questions']:
        if q['id'].startswith('branch/'):
            q.update(relevant='', inheritedRelevant=[])
    next(g for g in project['form']['groups'] if g['id']=='branch').pop('relevant', None)
    store=ProjectStore(tmp_path/'shared.sqlite3'); settings=KoboSettings(language='en')
    saved=store.create('Shared recovery',project,source,b'data',settings)
    app=FastAPI(); app.include_router(make_router(store))
    return TestClient(app),store,saved['id'],settings


def test_shared_source_confirmation_restores_all_and_preserves_answers(shared_api):
    client,store,pid,settings=shared_api; url=f'/api/kobo/projects/{pid}'
    before=store.get(pid)
    shared=question(before)['connectionSetup']['shared']
    assert set(shared['questions'])=={'branch/optional_followup','branch/required_followup'}
    review=client.post(url+'/data-review',json={'settings':settings.model_dump()}).json()
    groups=[g for g in review['groups'] if g['findingType']=='connection-setup-needed']
    assert len(groups)==1 and groups[0]['count']==2
    body=confirm_body(store,pid,settings); body['sharedFingerprint']=shared['fingerprint']
    response=client.post(url+'/connection-setup/confirm',json=body)
    assert response.status_code==200,response.text
    after=store.get(pid)
    assert after['records']==before['records']
    for qid in shared['questions']:
        assert not question(after,qid).get('connectionSetup')
        assert question(after,qid)['inheritedRelevant']==question(before,qid)['connectionSetup']['recovered']['inheritedRelevant']
    assert client.post(url+'/connection-setup/confirm',json=body).status_code==409


def test_shared_confirmation_rejects_stale_or_manual_changes(shared_api):
    client,store,pid,settings=shared_api; url=f'/api/kobo/projects/{pid}'
    body=confirm_body(store,pid,settings); body['sharedFingerprint']='stale'
    assert client.post(url+'/connection-setup/confirm',json=body).status_code==409
    body['sharedFingerprint']=question(store.get(pid))['connectionSetup']['shared']['fingerprint']
    body['settings']['questions']={body['question']:{'connectionSource':'manual'}}
    assert client.post(url+'/connection-setup/confirm',json=body).status_code==409
    assert question(store.get(pid))['connectionSetup']['pending']
