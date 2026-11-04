from copy import deepcopy
import pytest
from backend.kobo_placement import place_questions, validate_group

def q(key, group='g', position=None, reference=''):
    return dict(id=key,group=group,repeat='',**({'placement':dict(position=position,reference=reference)} if position else {}))

def test_ordering_matches_frontend_and_preserves_legacy_slots():
    questions=[q('a'),q('other','h'),q('b'),q('x',position='after',reference='a'),q('y',position='first'),q('z',position='last')]
    result=place_questions(questions)
    assert [v['id'] for v in result]==['y','other','a','x','b','z']
    assert [v['order'] for v in result]==list(range(6))
    assert [v['id'] for v in place_questions([q('a'),q('other','h'),q('b')])]==['a','other','b']

@pytest.mark.parametrize('questions,match',[
    ([q('a',position='after',reference='b'),q('b',position='after',reference='a')],'cycle'),
    ([q('a'),q('x',position='before',reference='missing')],'unavailable'),
    ([q('a','h'),q('x',position='before',reference='a')],'selected group')])
def test_invalid_positions(questions,match):
    with pytest.raises(ValueError,match=match):place_questions(questions)

def test_repeat_scope_validation():
    form={'groups':[dict(id='repeat',parent='',repeat=True),dict(id='nested',parent='repeat',repeat=False)]}
    validate_group(form,'nested','repeat')
    validate_group(form,'','')
    with pytest.raises(ValueError,match='repeat scope'):validate_group(form,'','repeat')


from backend.test_kobo_import_links import client_store
from backend.test_kobo_review_schema import preview, added

def test_api_move_reload_undo_and_replacement_preserve_values(client_store):
    client,store=client_store
    staged=preview(client,b'gender,status\nf,Returnee\nm,IDP\n')
    mappings=staged['mappings'];mappings[1].update(question='added_status',status='matched')
    config={'excludedQuestionIds':['age','needs','new_field'],'addedQuestions':[added('text')],'choiceOverrides':{}}
    saved=client.post('/api/kobo/imports/confirm',json={'token':staged['token'],'name':'Placement','mappings':mappings,'reviewConfig':config})
    assert saved.status_code==200,saved.text
    saved=saved.json();pid=saved['id'];original=deepcopy(store.get(pid)['records']);sources=store.sources(pid)
    moved=client.post(f'/api/kobo/projects/{pid}/placement',json={'updated':saved['updated'],'field':'added_status','group':'','placement':{'position':'before','reference':'gender'}})
    assert moved.status_code==200,moved.text
    moved=moved.json()
    assert [q['id'] for q in moved['form']['questions']]==['added_status','gender']
    assert client.get(f'/api/kobo/projects/{pid}').json()['form']['questions'][0]['placement']['reference']=='gender'
    assert store.get(pid)['records']==original
    assert store.sources(pid)==sources
    review=client.post(f'/api/kobo/projects/{pid}/review')
    assert review.status_code==200,review.text
    assert review.json()['reviewConfig']['addedQuestions'][0]['placement']['reference']=='gender'
    stale=client.post(f'/api/kobo/projects/{pid}/placement',json={'updated':saved['updated'],'field':'added_status','group':'','placement':{'position':'last'}})
    assert stale.status_code==409
    undo=client.post(f'/api/kobo/projects/{pid}/placement',json={'updated':moved['updated'],'field':'added_status','group':'','placement':{'position':'last'}})
    assert undo.status_code==200,undo.text
    assert [q['id'] for q in undo.json()['form']['questions']]==['gender','added_status']
    invalid=client.post(f'/api/kobo/projects/{pid}/placement',json={'updated':undo.json()['updated'],'field':'missing','group':'','placement':{'position':'last'}})
    assert invalid.status_code==409


def test_effective_form_placement_handles_group_change_and_missing_saved_anchor():
    from backend.kobo_review_schema import effective_form
    base={'questions':[dict(id='a',name='a',group='g',repeat='',kind='text',choices=[]),dict(id='b',name='b',group='h',repeat='',kind='text',choices=[])], 'groups':[dict(id='g',repeat=False,parent=''),dict(id='h',repeat=False,parent='')]}
    item=added('text',group='h',placement={'position':'before','reference':'b'})
    config={'addedQuestions':[item]}
    form=effective_form(base,config,[])
    assert [q['id'] for q in form['questions']]==['a','added_status','b']
    item['placement']['reference']='removed'
    with pytest.raises(ValueError,match='unavailable'):effective_form(base,config,[])
    review=effective_form(base,config,[],allow_invalid_placement=True)
    assert 'unavailable' in review['warnings'][0]
    assert review['questions'][-1]['placement']['reference']=='removed'


def test_import_review_repairs_multiple_missing_positions_individually(client_store):
    client,_=client_store
    staged=preview(client,b'gender,one,two\nf,A,B\n')
    mappings=staged['mappings']
    for index in [1,2]:mappings[index].update(question='added_'+str(index),status='matched')
    config={'excludedQuestionIds':['age','needs','new_field'],'addedQuestions':[added('text',id='added_'+str(index),column=index,placement={'position':'after','reference':'removed_'+str(index)}) for index in [1,2]],'choiceOverrides':{}}
    body={'mappings':mappings,'reviewConfig':config}
    checked=client.post(f"/api/kobo/imports/{staged['token']}/check",json=body)
    assert checked.status_code==200,checked.text
    assert {issue['question'] for issue in checked.json()['issues']}=={'added_1','added_2'}
    config['addedQuestions'][0]['placement']={'position':'after','reference':'gender'}
    checked=client.post(f"/api/kobo/imports/{staged['token']}/check",json=body)
    assert checked.status_code==200,checked.text
    assert {issue['question'] for issue in checked.json()['issues']}=={'added_2'}
    blocked=client.post('/api/kobo/imports/confirm',json={**body,'token':staged['token'],'name':'Blocked','acceptInvalid':True})
    assert blocked.status_code==400


def test_original_question_can_reorder_move_group_and_survive_review(client_store):
    client, store = client_store
    staged = preview(client, b'gender,age\nf,20\nm,30\n')
    saved = client.post('/api/kobo/imports/confirm', json={
        'token': staged['token'], 'name': 'Original placement', 'mappings': staged['mappings'],
        'reviewConfig': {'excludedQuestionIds': ['needs', 'new_field']}, 'acceptInvalid': True,
    }).json()
    pid = saved['id']
    records = deepcopy(store.get(pid)['records'])
    moved = client.post(f'/api/kobo/projects/{pid}/placement', json={
        'updated': saved['updated'], 'field': 'age', 'group': '',
        'placement': {'position': 'before', 'reference': 'gender'},
    })
    assert moved.status_code == 200, moved.text
    assert [item['id'] for item in moved.json()['form']['questions']] == ['age', 'gender']
    review = client.post(f'/api/kobo/projects/{pid}/review')
    assert review.status_code == 200, review.text
    from backend.kobo_review_schema import effective_form
    rebuilt = effective_form(review.json()['form'], review.json()['reviewConfig'], [])
    assert [item['id'] for item in rebuilt['questions']] == ['age', 'gender']
    assert store.get(pid)['records'] == records


def test_moving_anchor_keeps_dependent_in_its_group(client_store):
    client, store = client_store
    staged = preview(client, b'gender,status\nf,Returnee\n')
    mappings = staged['mappings']; mappings[1].update(question='added_status', status='matched')
    config = {'excludedQuestionIds': ['age', 'needs', 'new_field'],
              'addedQuestions': [added('text', placement={'position': 'after', 'reference': 'gender'})]}
    saved = client.post('/api/kobo/imports/confirm', json={
        'token': staged['token'], 'name': 'Anchor', 'mappings': mappings, 'reviewConfig': config,
    }).json()
    pid = saved['id']
    with store.connect() as db:
        import json
        raw = json.loads(db.execute('SELECT payload FROM projects WHERE id=?', (pid,)).fetchone()[0])
        group = dict(id='destination', name='destination', labels={'en': 'Destination'}, parent='', repeat=False)
        raw['form']['groups'].append(group); raw['baseForm']['groups'].append(group)
        db.execute('UPDATE projects SET payload=? WHERE id=?', (json.dumps(raw), pid))
    moved = client.post(f'/api/kobo/projects/{pid}/placement', json={
        'updated': saved['updated'], 'field': 'gender', 'group': 'destination', 'placement': {'position': 'first'},
    })
    assert moved.status_code == 200, moved.text
    by_id = {item['id']: item for item in moved.json()['form']['questions']}
    assert by_id['gender']['group'] == 'destination'
    assert by_id['added_status']['group'] == ''
    assert by_id['added_status']['placement'] is None
