import copy
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.kobo import ProjectStore,KoboSettings,QuestionSettings,analyze
from backend.kobo_edits import EditRequest,EditOperation,edit_preview,commit_edit,effective_project,carry_edits
from backend.kobo_api import make_router
from backend.kobo_updates import UpdateMatching,compare_update,review_update
from backend.test_kobo_answer_order import fixture

@pytest.fixture
def saved(tmp_path):
    store=ProjectStore(tmp_path/'edits.sqlite3');p=fixture()
    for q in p['form']['questions']:q.setdefault('metadata',False);q.setdefault('identifying',False);q.setdefault('type','text');q.setdefault('labels',{'en':q['name']});q.setdefault('choices',[]);q.setdefault('group','')
    for key in ['id','name','updated','settings']:p.pop(key,None)
    p['warnings']=[];p['issues']=[]
    return store,store.create('Edits',p,b'form',b'source',KoboSettings())

def apply(store,p,op):
    request=EditRequest(revision=p.get('dataEdits',{}).get('revision',0),operation=EditOperation.model_validate(op))
    if op['kind']=='answers':request.signature=edit_preview(store.get(p['id'],raw=True),request)['signature']
    return commit_edit(store,p['id'],request)

def test_cells_update_analysis_and_original_sources_undo_and_stale(saved):
    store,p=saved;r=p['records'][0];before=r['values']['number']
    changed=apply(store,p,dict(kind='cells',cells=[dict(record=r['id'],field='number',value=-5)]))
    assert changed['records'][0]['values']['number']==-5
    assert store.get(p['id'],raw=True)['records'][0]['values']['number']==before
    assert store.sources(p['id'])==(b'form',b'source')
    with pytest.raises(ValueError,match='changed'):apply(store,p,dict(kind='cells',cells=[dict(record=r['id'],field='number',value=2)]))
    request=EditRequest(revision=1,operation=EditOperation(kind='cells'))
    undone=commit_edit(store,p['id'],request,undo=True)
    assert undone['records'][0]['values']['number']==before

def test_new_option_and_merge_same_and_new_field(saved):
    store,p=saved;record=p['records'][0]
    changed=apply(store,p,dict(kind='cells',cells=[dict(record=record['id'],field='answer',value='New answer')]))
    q=changed['form']['questions'][0];new=next(c for c in q['choices'] if c['labels'].get('en')=='New answer')
    assert new['name'].startswith('local_')
    same=apply(store,changed,dict(kind='answers',field='answer',sources=[new['name'],'b'],label='Merged',destination='same'))
    rows=analyze(same,KoboSettings())['questions'][0]['rows'];assert sum(row['label']=='Merged' for row in rows)==1
    derived=apply(store,same,dict(kind='answers',field='answer',sources=['c'],label='Combined',destination='new',name='Recoded answer'))
    created=next(q for q in derived['form']['questions'] if q.get('localDerived'))
    assert created['derivedFrom']=='answer' and derived['settings']['questions'][created['id']]['percentageMode']=='grand-total'
    assert len(derived['form']['questions'])==len(p['form']['questions'])+1
    with pytest.raises(ValueError,match='read-only'):apply(store,derived,dict(kind='cells',cells=[dict(record=record['id'],field=created['id'],value='a')]))

def test_multiple_merge_deduplicates_records(saved):
    store,p=saved;raw=store.get(p['id'],raw=True);raw['form']['questions'][0]['kind']='multiple'
    for r in raw['records']:r['values']['answer']=['a','b','c']
    from backend.kobo_edits import apply_operation
    apply_operation(raw,dict(kind='answers',field='answer',sources=['a','b'],label='B',target='b',destination='same'))
    assert all(r['values']['answer']==['b','c'] for r in raw['records'])

@pytest.mark.parametrize('value',[float('inf'),'NaN','bad',True])
def test_invalid_numeric_values_are_atomic(saved,value):
    store,p=saved
    with pytest.raises(ValueError):apply(store,p,dict(kind='cells',cells=[dict(record=p['records'][0]['id'],field='number',value=value)]))
    assert 'dataEdits' not in store.get(p['id'],raw=True)

def test_backup_preserves_corrections(saved):
    from backend.kobo_workspace import backup_project,read_backup
    store,p=saved;changed=apply(store,p,dict(kind='cells',cells=[dict(record=p['records'][0]['id'],field='number',value=0)]))
    name,payload,settings,form,data=read_backup(backup_project(store,p['id']))
    restored=store.create(name,payload,form,data,settings)
    assert restored['records'][0]['values']['number']==0 and restored['dataEdits']['revision']==1

def test_update_matching_preserves_only_reliable_ids_and_requires_conflict_choices(saved):
    store,p=saved
    # A scalar stable key distinct from the edited value, preserving text identity.
    raw=store.get(p['id'],raw=True)
    q=copy.deepcopy(raw['form']['questions'][0]);q.update(id='key',name='Key',kind='text',choices=[]);raw['form']['questions'].append(q)
    for i,r in enumerate(raw['records']):r['values']['key']=f'{i:03d}'
    for key in ['id','name','updated','settings']:raw.pop(key,None)
    p=store.create('Keys',raw,b'form',b'source',KoboSettings())
    changed=apply(store,p,dict(kind='cells',cells=[dict(record=p['records'][0]['id'],field='number',value=99)]))
    incoming=copy.deepcopy(store.get(p['id'],raw=True));incoming.pop('dataEdits');incoming['records'].reverse();incoming['records'][-1]['values']['number']=20
    matching=UpdateMatching(keys={'':['key']});review=carry_edits(changed,incoming,matching)
    assert len(review['conflicts'])==1 and review['lostCells']==0
    with pytest.raises(ValueError,match='every edit conflict'):carry_edits(changed,incoming,matching,True)
    matching.editResolutions={review['conflicts'][0]['id']:'local'};carry_edits(changed,incoming,matching,True)
    assert effective_project(incoming)['records'][-1]['values']['number']==99
    unmatched=copy.deepcopy(store.get(p['id'],raw=True));unmatched.pop('dataEdits');review=carry_edits(changed,unmatched,UpdateMatching(skip=True));assert review['lostCells']==1
    with pytest.raises(ValueError,match='Acknowledge'):carry_edits(changed,unmatched,UpdateMatching(skip=True),True)

def test_shared_api_edits_and_raw_values(saved):
    store,p=saved;app=FastAPI();app.include_router(make_router(store));client=TestClient(app)
    body=dict(revision=0,operation=dict(kind='cells',cells=[dict(record=p['records'][0]['id'],field='number',value=12)]))
    result=client.post(f"/api/kobo/projects/{p['id']}/edits/apply",json=body)
    assert result.status_code==200,result.text
    assert result.json()['dataRevision']==1 and result.json()['canUndoEdit']
    page=client.post(f"/api/kobo/projects/{p['id']}/data",json=dict(settings={},columns=['number'])).json()
    assert page['rows'][0]['rawValues']['number']==12
    assert client.post(f"/api/kobo/projects/{p['id']}/edits/apply",json=body).status_code==409

def test_merge_filters_follow_canonical_options_and_undo_preserves_later_filter_changes(saved):
    from backend.kobo import AnalysisViewSettings,SavedAnalysisView
    store,p=saved
    settings=KoboSettings(filters=[dict(field='answer',kind='category',values=['a'])],savedViews=[SavedAnalysisView(id='v',name='Saved',snapshot=AnalysisViewSettings(filters=[dict(field='answer',kind='category',values=['a'])]))])
    store.save(p['id'],settings);p=store.get(p['id'])
    changed=apply(store,p,dict(kind='answers',field='answer',sources=['a'],label='b',destination='same'))
    assert changed['settings']['filters'][0]['values']==['b']
    assert changed['settings']['savedViews'][0]['snapshot']['filters'][0]['values']==['b']
    settings=KoboSettings.model_validate(changed['settings']);settings.filters[0].values=['c'];store.save(p['id'],settings)
    undone=commit_edit(store,p['id'],EditRequest(revision=1,operation=EditOperation(kind='cells')),undo=True)
    assert undone['settings']['filters'][0]['values']==['c']
    assert undone['settings']['savedViews'][0]['snapshot']['filters'][0]['values']==['a']


def test_own_filters_follow_merges_and_undo_and_new_fields_inherit_percentage_default(saved):
    store,p=saved
    settings=KoboSettings(percentageDefault='column-total',questions={'answer':QuestionSettings(filterMode='own',ownFilters=[dict(field='answer',kind='category',values=['a'])])})
    store.save(p['id'],settings);p=store.get(p['id'])
    changed=apply(store,p,dict(kind='answers',field='answer',sources=['a'],label='b',destination='same'))
    assert changed['settings']['questions']['answer']['ownFilters'][0]['values']==['b']
    undone=commit_edit(store,p['id'],EditRequest(revision=1,operation=EditOperation(kind='cells')),undo=True)
    assert undone['settings']['questions']['answer']['ownFilters'][0]['values']==['a']
    created=apply(store,undone,dict(kind='answers',field='answer',sources=['a','b'],label='Combined',destination='new',name='Derived'))
    qid=next(q['id'] for q in created['form']['questions'] if q.get('localDerived'))
    assert created['settings']['questions'][qid]['percentageMode']=='column-total'


def test_dependent_calculated_columns_recompute_and_date_validation_is_atomic(saved):
    store,p=saved;raw=store.get(p['id'],raw=True)
    raw['customConfig']={'worksheet':'CSV','columns':[],'calculatedColumns':[{'id':'calc_double','label':'Double','operation':'multiply','left':'number','useLiteral':True,'literal':'2'}]}
    for key in ['id','name','updated','settings']:raw.pop(key,None)
    p=store.create('Calculated',raw,b'',b'source',KoboSettings())
    changed=apply(store,p,dict(kind='cells',cells=[dict(record=p['records'][0]['id'],field='number',value=-3)]))
    assert changed['records'][0]['values']['calc_double']==-6
    with pytest.raises(ValueError,match='valid date'):apply(store,changed,dict(kind='cells',cells=[dict(record=p['records'][0]['id'],field='date',value='2026-02-30')]))
    assert store.get(p['id'])['dataEdits']['revision']==1



def test_automatic_matching_keeps_corrections_and_requires_conflict_or_loss_choices(saved):
    from backend.kobo_updates import preview_update
    store, p = saved
    raw = store.get(p['id'], raw=True)
    raw['form']['questions'].append({'id': 'uuid', 'name': '_uuid', 'kind': 'text', 'repeat': '', 'type': 'text', 'labels': {'en': 'UUID'}, 'choices': [], 'group': ''})
    for i, record in enumerate(raw['records']): record['values']['uuid'] = str(i)
    for key in ['id', 'name', 'updated', 'settings']: raw.pop(key, None)
    p = store.create('Automatic corrections', raw, b'form', b'data', KoboSettings())
    record = p['records'][0]
    changed = apply(store, p, {'kind': 'cells', 'cells': [{'record': record['id'], 'field': 'number', 'value': 123}]})
    incoming = copy.deepcopy(store.get(p['id'], raw=True)); incoming.pop('dataEdits', None)
    review = preview_update(changed, incoming, {'matchingMode': 'automatic'})
    assert review['localEdits']['lostCells'] == 0 and not review['localEdits']['conflicts']
    candidate = copy.deepcopy(incoming)
    review_update(changed, candidate, UpdateMatching.model_validate(review['matching']))
    assert effective_project(candidate)['records'][0]['values']['number'] == 123
    incoming['records'][0]['values']['number'] = 456
    review = preview_update(changed, incoming, {'matchingMode': 'automatic'})
    conflict = review['localEdits']['conflicts'][0]['id']
    with pytest.raises(ValueError, match='every edit conflict'): review_update(changed, copy.deepcopy(incoming), UpdateMatching.model_validate(review['matching']))
    reviewed = preview_update(changed, incoming, {'matchingMode': 'automatic', 'matching': {'editResolutions': {conflict: 'incoming'}}})
    candidate = copy.deepcopy(incoming); review_update(changed, candidate, UpdateMatching.model_validate(reviewed['matching']))
    assert effective_project(candidate)['records'][0]['values']['number'] == 456
    incoming['records'][0]['values']['uuid'] = ''
    review = preview_update(changed, incoming, {'matchingMode': 'automatic'})
    assert review['localEdits']['lostCells'] == 1
    with pytest.raises(ValueError, match='Acknowledge'): review_update(changed, copy.deepcopy(incoming), UpdateMatching.model_validate(review['matching']))
