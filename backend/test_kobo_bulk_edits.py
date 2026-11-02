import copy
import pytest
from pydantic import ValidationError
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.kobo import ProjectStore, KoboSettings
from backend.kobo_api import make_router
from backend.kobo_edits import EditRequest, EditOperation, edit_preview, commit_edit, effective_project, carry_edits
from backend.kobo_updates import UpdateMatching
from backend.test_kobo_edits import saved


def request(p, field, original, replacement, record=None):
    return EditRequest(revision=p.get('dataEdits',{}).get('revision',0), operation=EditOperation(
        kind='cells', allMatches=True, originalValue=original,
        cells=[dict(record=record or p['records'][0]['id'],field=field,value=replacement)]))


def prepare(store, p, kind, values):
    raw=store.get(p['id'],raw=True)
    q=raw['form']['questions'][0];q['kind']=kind
    prototype=raw['records'][0]
    raw['records']=[{**copy.deepcopy(prototype),'id':str(i),'row':i+2,'values':{**prototype['values'],'answer':v}} for i,v in enumerate(values)]
    for k in ['id','name','updated','settings']:raw.pop(k,None)
    return store.create('Bulk',raw,b'form',b'source',KoboSettings())


@pytest.mark.parametrize('kind,values,replacement,expected',[
    ('category',['a','a','b'],'c',[0,1]),
    ('multiple',[['a','b'],['b','a'],['a'],['a','b','c']],['c'],[0,1]),
    ('text',['Yes','Yes','yes','Yes ',' Yes'],'Updated',[0,1]),
    ('number',[10,10.0,11],0,[0,1]),
    ('date',['2026-01-01','2026-01-01','2026-02-01'],'2026-03-01',[0,1]),
    ('text',[None,'','hello'], 'Filled',[0,1]),
    ('multiple',[None,[],['a']], ['b'],[0,1]),
])
def test_bulk_exact_matching_atomic_undo(saved,kind,values,replacement,expected):
    store,p=saved;p=prepare(store,p,kind,values)
    req=request(p,'answer',values[0],replacement)
    preview=edit_preview(store.get(p['id'],raw=True),req)
    assert preview['matchingRecords']==len(expected)
    with pytest.raises(ValueError,match='Preview'):commit_edit(store,p['id'],req)
    req.signature=preview['signature'];changed=commit_edit(store,p['id'],req)
    for i,r in enumerate(changed['records']):
        assert r['values']['answer']==(replacement if i in expected else values[i])
    raw=store.get(p['id'],raw=True)
    assert [r['values']['answer'] for r in raw['records']]==values
    assert raw['dataEdits']['history'][0]['operation']['allMatches'] is False
    assert store.sources(p['id'])==(b'form',b'source')
    undone=commit_edit(store,p['id'],EditRequest(revision=1,operation=EditOperation(kind='cells')),undo=True)
    assert [r['values']['answer'] for r in undone['records']]==values


def test_bulk_large_batch_and_request_limit(saved):
    store,p=saved;p=prepare(store,p,'text',['A']*1205+['B'])
    req=request(p,'answer','A','C');req.signature=edit_preview(store.get(p['id'],raw=True),req)['signature']
    changed=commit_edit(store,p['id'],req)
    assert sum(r['values']['answer']=='C' for r in changed['records'])==1205
    assert len(store.get(p['id'],raw=True)['dataEdits']['history'][0]['operation']['cells'])==1205
    with pytest.raises(ValidationError,match='1000'):
        EditRequest(revision=1,operation=EditOperation(kind='cells',cells=[dict(record='0',field='answer',value='X')]*1001))


def test_bulk_stale_signature_original_and_validation(saved):
    store,p=saved;p=prepare(store,p,'number',[1,1,2])
    raw=store.get(p['id'],raw=True)
    with pytest.raises(ValueError,match='response changed'):edit_preview(raw,request(p,'answer',2,3))
    with pytest.raises(ValueError,match='finite number'):edit_preview(raw,request(p,'answer',1,'bad'))
    req=request(p,'answer',1,3);req.signature=edit_preview(raw,req)['signature']
    req.operation.cells[0].value=4
    with pytest.raises(ValueError,match='Review this edit'):commit_edit(store,p['id'],req)
    req.operation.cells[0].value=3;commit_edit(store,p['id'],req)
    with pytest.raises(ValueError,match='data changed'):commit_edit(store,p['id'],req)


@pytest.mark.parametrize('workspace',['kobo','custom'])
def test_bulk_api_includes_filtered_rows_and_clear(saved,workspace):
    store,p=saved;p=prepare(store,p,'category',['a','a','b'])
    settings=KoboSettings(filters=[dict(field='region',kind='category',values=['south'])]);store.save(p['id'],settings)
    app=FastAPI();app.include_router(make_router(store,prefix='/api/'+workspace));client=TestClient(app)
    req=request(p,'answer','a',None).model_dump();base=f'/api/{workspace}/projects/{p["id"]}/edits'
    preview=client.post(base+'/preview',json=req);assert preview.status_code==200,preview.text
    assert preview.json()['matchingRecords']==2
    assert client.post(base+'/apply',json=req).status_code==409
    req['signature']=preview.json()['signature']
    result=client.post(base+'/apply',json=req);assert result.status_code==200,result.text
    assert [r['values']['answer'] for r in store.get(p['id'])['records']]==[None,None,'b']


def test_bulk_repeat_scope_codes_and_read_only(saved):
    store,p=saved;p=prepare(store,p,'category',['a','a','b'])
    raw=store.get(p['id'],raw=True);q=raw['form']['questions'][0];q['repeat']='members'
    for c in q['choices']:c['labels']['en']='Same label'
    raw['records'][0]['scope']='members';raw['records'][1]['scope']='members'
    req=request(p,'answer','a','b')
    assert edit_preview(raw,req)['matchingRecords']==2
    raw['records'][1]['scope']='other';assert edit_preview(raw,req)['matchingRecords']==1
    q['metadata']=True
    with pytest.raises(ValueError,match='read-only'):edit_preview(raw,req)


def test_bulk_carry_snapshot_and_new_import_rows(saved):
    store,p=saved;p=prepare(store,p,'text',['A','A','B'])
    raw=store.get(p['id'],raw=True)
    q=copy.deepcopy(raw['form']['questions'][0]);q.update(id='key',name='Key',kind='text',choices=[]);raw['form']['questions'].append(q)
    for i,r in enumerate(raw['records']):r['values']['key']=str(i)
    for k in ['id','name','updated','settings']:raw.pop(k,None)
    p=store.create('Keys',raw,b'form',b'source',KoboSettings())
    req=request(p,'answer','A','C');req.signature=edit_preview(store.get(p['id'],raw=True),req)['signature']
    changed=commit_edit(store,p['id'],req)
    incoming=copy.deepcopy(store.get(p['id'],raw=True));incoming.pop('dataEdits')
    extra=copy.deepcopy(incoming['records'][0]);extra['id']='new';extra['values']['key']='new';incoming['records'].append(extra)
    incoming['records'][0]['values']['answer']='Incoming'
    matching=UpdateMatching(keys={'':['key']});review=carry_edits(changed,incoming,matching)
    assert len(review['conflicts'])==1
    matching.editResolutions={review['conflicts'][0]['id']:'local'}
    carry_edits(changed,incoming,matching,True)
    assert [r['values']['answer'] for r in effective_project(incoming)['records']]==['C','C','B','A']


def test_bulk_rejects_invalid_multiple_original(saved):
    store,p=saved;p=prepare(store,p,'multiple',[['a'],['a']])
    with pytest.raises(ValueError,match='option codes'):
        edit_preview(store.get(p['id'],raw=True),request(p,'answer',[['a']],['b']))
