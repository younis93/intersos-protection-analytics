import copy
import json

import pytest

from backend.kobo import KoboSettings
from backend.kobo_edits import EditRequest, edit_preview
from backend.test_kobo_required import required_api, required_project


def request(settings, *, field='required_text', value='Verified', record='r1', **filters):
    return {'revision':0,'operation':{'kind':'cells','language':'en',
        'cells':[{'record':record,'field':field,'value':value}],
        'reviewBlanks':{'settings':settings.model_dump(),'group':'required-missing:'+field,
            'question':field,**filters}}}


def test_bulk_blanks_include_whitespace_preserve_answers_and_undo_once(required_api):
    client,store,pid,settings=required_api;url=f'/api/kobo/projects/{pid}'
    body=request(settings)
    preview=client.post(url+'/edits/preview',json=body)
    assert preview.status_code==200,preview.text
    assert preview.json()['affectedRecords']==preview.json()['matchingRecords']==2
    assert client.post(url+'/edits/apply',json=body).status_code==409
    saved=client.post(url+'/edits/apply',json={**body,'signature':preview.json()['signature']})
    assert saved.status_code==200,saved.text
    effective=store.get(pid)
    assert [r['values']['required_text'] for r in effective['records'][:3]]==['Verified','Complete','Verified']
    history=store.get(pid,raw=True)['dataEdits']['history']
    assert len(history)==1 and history[0]['operation']['reviewBlanks'] is None
    assert len(history[0]['operation']['cells'])==2
    assert client.post(url+'/edits/undo',json={'revision':1,'operation':{'kind':'cells'}}).status_code==200
    assert [r['values']['required_text'] for r in store.get(pid)['records'][:3]]==[None,'Complete','   ']


@pytest.mark.parametrize('filters',[
    {'search':'4'},
    {'columnFilters':[{'column':'row','type':'number','values':['4']}]},
])
def test_bulk_respects_record_search_and_column_filters(required_api,filters):
    client,store,pid,settings=required_api;url=f'/api/kobo/projects/{pid}'
    body=request(settings,**filters)
    preview=client.post(url+'/edits/preview',json=body).json()
    assert preview['affectedRecords']==1
    assert client.post(url+'/edits/apply',json={**body,'signature':preview['signature']}).status_code==200
    assert store.get(pid)['records'][0]['values']['required_text'] is None
    assert store.get(pid)['records'][2]['values']['required_text']=='Verified'


def test_bulk_works_from_a_saved_resolved_anchor(required_api):
    client,store,pid,settings=required_api;url=f'/api/kobo/projects/{pid}'
    single={'revision':0,'operation':{'kind':'cells','cells':[{'record':'r1','field':'required_text','value':'Existing answer'}]}}
    assert client.post(url+'/edits/apply',json=single).status_code==200
    body={**request(settings),'revision':1}
    preview=client.post(url+'/edits/preview',json=body).json()
    assert preview['affectedRecords']==1
    assert client.post(url+'/edits/apply',json={**body,'signature':preview['signature']}).status_code==200
    assert store.get(pid)['records'][0]['values']['required_text']=='Existing answer'
    assert client.post(url+'/edits/undo',json={'revision':2,'operation':{'kind':'cells'}}).status_code==200
    assert store.get(pid)['records'][0]['values']['required_text']=='Existing answer'
    assert store.get(pid)['records'][2]['values']['required_text']=='   '


def test_false_and_uncheckable_applicability_are_skipped_and_zero_is_preserved(required_project):
    project,_=required_project
    settings=KoboSettings(language='en',questions={'required_text':{'connectionSource':'manual','connectionRules':{'type':'rule','field':'a','operator':'eq','value':'yes'}}})
    project['records'][1]['values']['required_text']=None  # a = no
    broken=copy.deepcopy(project['records'][0]);broken.update(id='broken',row=12)
    broken['values']['a']='invalid';project['records'].append(broken)
    project['records'][2]['values']['required_text']=0
    preview=edit_preview(project,EditRequest.model_validate(request(settings)))
    assert preview['affectedRecords']==1
    project['records'][0]['values']['required_text']=-1
    assert edit_preview(project,EditRequest.model_validate(request(settings)))['affectedRecords']==0


def test_repeat_uses_parent_applicability_and_scope(required_api):
    client,store,pid,settings=required_api;url=f'/api/kobo/projects/{pid}'
    body=request(settings,field='visits/detail',record='v1')
    preview=client.post(url+'/edits/preview',json=body).json()
    assert preview['affectedRecords']==1
    assert client.post(url+'/edits/apply',json={**body,'signature':preview['signature']}).status_code==200
    rows={r['id']:r for r in store.get(pid)['records']}
    assert rows['v1']['values']['visits/detail']=='Verified'
    assert rows['v2']['values']['visits/detail'] is None


def test_ignore_changes_preview_evidence_without_data_revision(required_api):
    client,store,pid,settings=required_api;url=f'/api/kobo/projects/{pid}'
    body=request(settings);preview=client.post(url+'/edits/preview',json=body).json()
    review=client.post(url+'/data-review',json={'settings':settings.model_dump(),'group':'required-missing:required_text'}).json()
    row=review['rows'][0]
    action={'revision':review['revision'],'settings':settings.model_dump(),'action':'ignore','items':[{k:row[k] for k in ['record','question','fingerprint']}]}
    assert client.post(url+'/conditional-review/actions',json=action).status_code==200
    assert client.post(url+'/edits/apply',json={**body,'signature':preview['signature']}).status_code==409
    assert client.post(url+'/edits/preview',json=request(settings,status='ignored')).json()['affectedRecords']==1
    assert client.post(url+'/edits/preview',json=request(settings,status='all')).json()['affectedRecords']==2
    assert not store.get(pid).get('dataEdits',{}).get('history')


def test_condition_change_rejects_old_preview_without_changing_data(required_api):
    client,store,pid,settings=required_api;url=f'/api/kobo/projects/{pid}'
    body=request(settings);preview=client.post(url+'/edits/preview',json=body).json()
    changed={**settings.model_dump(),'questions':{'required_text':{'connectionSource':'manual','connectionRules':{'type':'rule','field':'a','operator':'eq','value':'no'}}}}
    assert client.put(url+'/settings',json=changed).status_code==200
    assert client.post(url+'/edits/apply',json={**body,'signature':preview['signature']}).status_code==409
    assert store.get(pid)['records'][0]['values']['required_text'] is None


def test_response_scope_and_zero_match_preview(required_api):
    client,store,pid,settings=required_api;url=f'/api/kobo/projects/{pid}'
    scoped=settings.model_copy(update={'filters':KoboSettings(filters=[{'field':'a','kind':'category','values':['no']}]).filters})
    body=request(scoped);preview=client.post(url+'/edits/preview',json=body).json()
    assert preview['affectedRecords']==0
    assert client.post(url+'/edits/apply',json={**body,'signature':preview['signature']}).status_code==409
    assert not store.get(pid).get('dataEdits',{}).get('history')


@pytest.mark.parametrize('value',[None,'','   ',[]])
def test_blank_replacement_is_not_a_bulk_remedy(required_api,value):
    client,_,pid,settings=required_api
    assert client.post(f'/api/kobo/projects/{pid}/edits/preview',json=request(settings,value=value)).status_code==409


def test_more_than_1000_rows_resolve_on_server_as_one_undoable_operation(required_api):
    client,store,pid,settings=required_api;url=f'/api/kobo/projects/{pid}'
    with store.connect() as db:
        raw=json.loads(db.execute('SELECT payload FROM projects WHERE id=?',(pid,)).fetchone()[0])
        template=raw['records'][0]
        for index in range(1001):
            row=copy.deepcopy(template);row.update(id=f'extra-{index}',row=index+10,sourceIdentity=f'uuid-{index}')
            raw['records'].append(row)
        db.execute('UPDATE projects SET payload=? WHERE id=?',(json.dumps(raw),pid))
    body=request(settings);preview=client.post(url+'/edits/preview',json=body).json()
    assert preview['affectedRecords']==1003
    assert client.post(url+'/edits/apply',json={**body,'signature':preview['signature']}).status_code==200
    assert len(store.get(pid,raw=True)['dataEdits']['history'])==1
    assert client.post(url+'/edits/undo',json={'revision':1,'operation':{'kind':'cells'}}).status_code==200
    assert store.get(pid)['records'][-1]['values']['required_text'] is None


def test_existing_form_required_metadata_is_recovered_during_commit(required_api):
    client,store,pid,settings=required_api;url=f'/api/kobo/projects/{pid}'
    with store.connect() as db:
        raw=json.loads(db.execute('SELECT payload FROM projects WHERE id=?',(pid,)).fetchone()[0])
        for q in raw['form']['questions']:q.pop('required',None)
        db.execute('UPDATE projects SET payload=? WHERE id=?',(json.dumps(raw),pid))
    body=request(settings);preview=client.post(url+'/edits/preview',json=body).json()
    assert preview['affectedRecords']==2
    response=client.post(url+'/edits/apply',json={**body,'signature':preview['signature']})
    assert response.status_code==200,response.text


@pytest.mark.parametrize('kind,value,valid',[
    ('number',0,True),('number','not a number',False),
    ('date','2026-11-04',True),('date','2026-99-04',False),
])
def test_shared_scalar_validation_and_numeric_zero(required_project,kind,value,valid):
    project,_=required_project
    q=next(q for q in project['form']['questions'] if q['id']=='optional_text')
    q.update(required='yes',kind=kind,type='decimal' if kind=='number' else 'date')
    body=EditRequest.model_validate(request(KoboSettings(language='en'),field='optional_text',value=value))
    if valid:assert edit_preview(project,body)['affectedRecords']==3
    else:
        with pytest.raises(ValueError):edit_preview(project,body)


def test_empty_multi_selection_fills_only_applicable_blanks(required_api):
    client,store,pid,settings=required_api;url=f'/api/kobo/projects/{pid}'
    body=request(settings,field='branch/optional_followup',value=['two'])
    body['operation']['reviewBlanks']['group']='connected-blank:branch/optional_followup'
    preview=client.post(url+'/edits/preview',json=body).json()
    assert preview['affectedRecords']==1
    assert client.post(url+'/edits/apply',json={**body,'signature':preview['signature']}).status_code==200
    assert store.get(pid)['records'][0]['values']['branch/optional_followup']==['two']
    assert store.get(pid)['records'][1]['values']['branch/optional_followup'] is None


def test_stale_revision_and_mismatched_question_are_rejected(required_api):
    client,store,pid,settings=required_api;url=f'/api/kobo/projects/{pid}'
    body=request(settings);preview=client.post(url+'/edits/preview',json=body).json()
    single={'revision':0,'operation':{'kind':'cells','cells':[{'record':'r1','field':'a','value':'no'}]}}
    assert client.post(url+'/edits/apply',json=single).status_code==200
    assert client.post(url+'/edits/apply',json={**body,'signature':preview['signature']}).status_code==409
    body['revision']=1;body['operation']['reviewBlanks']['question']='amount'
    assert client.post(url+'/edits/preview',json=body).status_code==409
