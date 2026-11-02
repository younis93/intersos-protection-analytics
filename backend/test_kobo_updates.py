import copy
import pytest
from backend.kobo_updates import UpdateMatching,compare_update,review_update,paged_review
from backend.test_kobo_answer_order import fixture


def previous():
    p=fixture();p['updated']='2026-11-01';p['settings']={};p['form']['questions'].append(dict(id='id',name='ID',kind='text',repeat=''))
    for i,r in enumerate(p['records']):r['values']['id']=f'{i:03d}'
    return p


def test_removed_own_filter_field_requires_repair_before_update():
    p=previous();new=copy.deepcopy(p)
    p['settings']={'questions':{'answer':{'filterMode':'own','ownFilters':[{'field':'region','kind':'category','values':['north']}]}}}
    new['form']['questions']=[q for q in new['form']['questions'] if q['id']!='region']
    matching=UpdateMatching(skip=True)
    review=compare_update(p,new,matching)
    assert review['blockingIssues'] and 'question filters' in review['blockingIssues'][0]
    matching.signature=review['signature']
    with pytest.raises(ValueError,match='question filters'):review_update(p,new,matching)


def test_reordering_is_unchanged_and_structural_columns_do_not_change_every_record():
    p=previous();new=copy.deepcopy(p);new['records'].reverse();new['form']['questions'].append(dict(id='extra',name='Extra',kind='text',repeat=''))
    for r in new['records']:r['values']['extra']='new'
    review=compare_update(p,new,UpdateMatching(keys={'':['id']}))
    assert review['reliable'] and review['scopes'][0]['unchanged']==7 and not review['details']
    assert review['structural'][0]['change']=='added'


def test_exact_added_removed_changed_and_pagination():
    p=previous();new=copy.deepcopy(p);new['records'].pop();new['records'][0]['values']['number']=50
    record=copy.deepcopy(new['records'][1]);record['id']='new';record['values']['id']='009';new['records'].append(record)
    matching=UpdateMatching(keys={'':['id']});review=compare_update(p,new,matching)
    assert {kind:review['scopes'][0][kind] for kind in ['added','removed','changed','unchanged']}=={'added':1,'removed':1,'changed':1,'unchanged':5}
    matching.signature=review['signature'];entry=review_update(p,new,matching)
    assert paged_review(entry,1,1,kind='changed')['rows'][0]['after']=={'number':50}
    new['records'][0]['values']['number']=51
    with pytest.raises(ValueError,match='latest'):review_update(p,new,matching)


def test_missing_duplicate_and_composite_keys_preserve_leading_zero_ids():
    p=previous();new=copy.deepcopy(p);new['records'][0]['values']['id']='0'
    review=compare_update(p,new,UpdateMatching(keys={'':['id']}))
    assert review['scopes'][0]['added']==1 and review['scopes'][0]['removed']==1
    new['records'][1]['values']['id']='0'
    assert not compare_update(p,new,UpdateMatching(keys={'':['id']}))['reliable']
    assert compare_update(p,new,UpdateMatching(keys={'':['id','answer']}))['reliable']
    new['records'][1]['values']['id']=None
    assert not compare_update(p,new,UpdateMatching(keys={'':['id','answer']}))['reliable']


def test_explicit_skip_never_publishes_guessed_counts():
    p=previous();matching=UpdateMatching(skip=True);preview=compare_update(p,p,matching);matching.signature=preview['signature']
    entry=review_update(p,p,matching)
    assert entry['skipped'] and entry['details']==[] and not entry['scopes'][0]['compared']


def test_custom_update_review_history_backup_and_stale_preview(tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.kobo import ProjectStore,KoboSettings
    from backend.kobo_api import make_router
    from backend.custom_analysis import make_custom_router
    from backend.kobo_workspace import backup_project,read_backup
    store=ProjectStore(tmp_path/'updates.sqlite3');app=FastAPI()
    shared=make_router(store,prefix='/api/custom');shared.routes=[r for r in shared.routes if '/imports/' not in r.path and not r.path.endswith('/review')]
    app.include_router(shared);app.include_router(make_custom_router(store));client=TestClient(app)
    def stage(raw,pid=''):
        response=client.post('/api/custom/columns/preview',files={'data':('source.csv',raw)},data={'projectId':pid});assert response.status_code==200,response.text
        return response.json()
    original=stage(b'Code,Amount\n001,10\n002,20\n003,30\n')
    response=client.post('/api/custom/columns/confirm',json={'token':original['token'],'name':'Updates','config':original['config']});assert response.status_code==200,response.text
    saved=response.json();pid=saved['id'];before=store.get(pid)
    replacement=stage(b'Code,Amount\n002,25\n001,10\n004,40\n',pid)
    code=next(c['id'] for c in replacement['config']['columns'] if c['header']=='Code')
    body={'config':replacement['config'],'matching':{'keys':{'':[code]}}}
    review=client.post(f"/api/custom/columns/{replacement['token']}/update-preview",json=body);assert review.status_code==200,review.text
    value=review.json();assert value['reliable'] and value['scopes'][0]['changed']==1
    assert store.get(pid)==before
    confirm={'token':replacement['token'],'name':'Updates','config':replacement['config'],'matching':{**body['matching'],'signature':value['signature']}}
    updated=client.post('/api/custom/columns/confirm',json=confirm);assert updated.status_code==200,updated.text
    history=client.get(f'/api/custom/projects/{pid}/updates').json();assert len(history)==1
    detail=client.get(f"/api/custom/projects/{pid}/updates/{history[0]['id']}?kind=changed").json();assert detail['total']==1
    _,payload,_,_,_=read_backup(backup_project(store,pid));assert payload['updateHistory'][0]['id']==history[0]['id']
    pending=stage(b'Code,Amount\n001,50\n',pid);body={'config':pending['config'],'matching':{'skip':True}}
    value=client.post(f"/api/custom/columns/{pending['token']}/update-preview",json=body).json()
    store.save(pid,KoboSettings.model_validate(store.get(pid)['settings']))
    response=client.post('/api/custom/columns/confirm',json={'token':pending['token'],'name':'Updates','config':pending['config'],'matching':{'skip':True,'signature':value['signature']}})
    assert response.status_code==400 and 'changed' in response.text
    assert len(store.get(pid)['updateHistory'])==1


def test_kobo_update_review_requires_explicit_comparison(tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.kobo import ProjectStore,parse_form,parse_data,propose_mapping,normalize
    from backend.kobo_api import make_router
    from backend.test_kobo import workbook
    raw=workbook({'survey':[['type','name','label'],['text','code','Code'],['integer','amount','Amount']]})
    form=parse_form(raw);data=b'code,amount\n001,10\n002,20\n';sheets=parse_data(data,'source.csv');mappings,_=propose_mapping(form,sheets);records,issues=normalize(form,sheets,mappings)
    store=ProjectStore(tmp_path/'kobo-updates.sqlite3');saved=store.create('Updates',{'form':form,'records':records,'mappings':mappings,'policies':{},'warnings':[],'issues':issues},raw,data)
    app=FastAPI();app.include_router(make_router(store));client=TestClient(app);pid=saved['id']
    response=client.post(f'/api/kobo/projects/{pid}/review',files={'data':('new.csv',b'code,amount\n002,25\n003,30\n')});assert response.status_code==200,response.text
    staged=response.json();body={'mappings':staged['mappings'],'policies':staged['policies'],'reviewConfig':staged['reviewConfig'],'matching':{'keys':{'':['code']}}}
    review=client.post(f"/api/kobo/imports/{staged['token']}/update-preview",json=body);assert review.status_code==200,review.text
    comparison=review.json();assert comparison['reliable'] and comparison['scopes'][0]['changed']==1
    confirm={**body,'token':staged['token'],'name':'Updates','matching':{**body['matching'],'signature':comparison['signature']}}
    applied=client.post('/api/kobo/imports/confirm',json=confirm);assert applied.status_code==200,applied.text
    assert len(client.get(f'/api/kobo/projects/{pid}/updates').json())==1


def test_history_retains_latest_twenty_and_deletes_with_project(tmp_path):
    from backend.kobo import ProjectStore
    store=ProjectStore(tmp_path/'retention.sqlite3');project=fixture()
    payload={'form':project['form'],'records':project['records'],'warnings':[],'issues':[]}
    saved=store.create('History',payload,b'form',b'data')
    for index in range(22):
        before=store.get(saved['id'])
        store.repair(saved['id'],copy.deepcopy(payload),b'form',b'data',expected_updated=before['updated'],update_entry={'id':str(index),'details':[]})
    history=store.get(saved['id'])['updateHistory']
    assert len(history)==20 and history[0]['id']=='21' and history[-1]['id']=='2'
    store.delete(saved['id'])
    with pytest.raises(KeyError):store.get(saved['id'])


@pytest.mark.parametrize('history', [False, True])
def test_automatic_preview_returns_ready_decision_without_manual_skip(history):
    from backend.kobo_updates import preview_update
    p = previous()
    if history: p['updateHistory'] = [{'keys': {'': ['id']}}]
    new = copy.deepcopy(p)
    new['records'].reverse()
    review = preview_update(p, new, {'matchingMode': 'automatic'})
    assert review['matching']['skip'] is (not history)
    assert review['matching']['keys'] == ({'': ['id']} if history else {})
    matching = UpdateMatching.model_validate(review['matching'])
    assert review_update(p, new, matching)['skipped'] is (not history)


@pytest.mark.parametrize('invalid', ['', 'duplicate', 'type'])
def test_automatic_uuid_rejects_missing_duplicate_and_changed_type(invalid):
    from backend.kobo_updates import preview_update
    p = previous(); p['form']['questions'][-1]['name'] = '_uuid'
    new = copy.deepcopy(p)
    if invalid == 'duplicate': new['records'][1]['values']['id'] = new['records'][0]['values']['id']
    elif invalid == 'type': new['form']['questions'][-1]['kind'] = 'number'
    else: new['records'][0]['values']['id'] = ''
    review = preview_update(p, new, {'matchingMode': 'automatic'})
    assert review['matching']['skip'] and not review['matching']['keys']


@pytest.mark.parametrize('kind', ['text', 'category'])
def test_automatic_uuid_compares_reordered_responses_and_rejects_stale_signature(kind):
    from backend.kobo_updates import preview_update
    p = previous(); p['form']['questions'][-1].update(name='uuid', kind=kind)
    new = copy.deepcopy(p); new['records'].reverse()
    review = preview_update(p, new, {'matchingMode': 'automatic'})
    assert review['matching']['keys'] == {'': ['id']}
    assert review['scopes'][0]['unchanged'] == len(p['records'])
    matching = UpdateMatching.model_validate(review['matching'])
    new['records'][0]['values']['answer'] = 'changed'
    with pytest.raises(ValueError, match='latest'): review_update(p, new, matching)


def test_automatic_matching_reuses_confirmed_ids_before_a_skipped_update():
    from backend.kobo_updates import preview_update
    p = previous(); p['updateHistory'] = [{'skipped': True, 'keys': {}}, {'skipped': False, 'keys': {'': ['id']}}]
    review = preview_update(p, copy.deepcopy(p), {'matchingMode': 'automatic'})
    assert review['matching']['keys'] == {'': ['id']}
    assert not review['matching']['skip']


def test_automatic_repeat_uuid_matching_requires_matched_parent():
    from backend.kobo_updates import preview_update
    p = previous(); p['form']['questions'][-1]['name'] = '_uuid'
    p['form']['groups'].append({'id': 'members', 'name': 'members', 'labels': {'en': 'Members'}, 'repeat': True, 'parent': ''})
    p['form']['questions'].append({'id': 'child_uuid', 'name': '_uuid', 'kind': 'text', 'repeat': 'members'})
    p['records'] += [{'id': 'child'+r['id'], 'scope': 'members', 'parent': r['id'], 'row': 2, 'values': {'child_uuid': 'same-within-each-parent'}} for r in p['records'][:2]]
    new = copy.deepcopy(p); new['records'].reverse()
    review = preview_update(p, new, {'matchingMode': 'automatic'})
    assert review['matching']['keys'] == {'': ['id'], 'members': ['child_uuid']}
    assert all(s['compared'] for s in review['scopes'])
    new['records'][-1]['values']['id'] = ''
    review = preview_update(p, new, {'matchingMode': 'automatic'})
    assert review['matching']['skip']
    assert not review['matching']['keys']
