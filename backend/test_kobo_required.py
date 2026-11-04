import copy
import io
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.kobo import KoboSettings, ProjectStore, parse_form, analyze
from backend.kobo_api import make_router
from backend.kobo_conditional import scan, review, analysis_project
from backend.kobo_data import data_page
from backend.kobo_data_review import data_review
from backend.kobo_workspace import backup_project, read_backup
from backend.test_kobo import workbook


@pytest.fixture
def required_project():
    raw = workbook({
        'survey': [
            ['type','name','label::English (en)','label::العربية (ar)','required','relevant'],
            ['select_one yesno','a','Question A','السؤال أ','yes',''],
            ['text','required_text','Required text','نص مطلوب','true()',''],
            ['integer','amount','Amount','العدد','yes',''],
            ['text','optional_text','Optional text','نص اختياري','',''],
            ['text','dynamic','Dynamic requirement','إلزام شرطي',"${a} = 'yes'",''],
            ['begin_group','branch','Connected branch','فرع مرتبط','',"${a} = 'yes'"],
            ['select_multiple things','optional_followup','Optional follow-up','متابعة اختيارية','',''],
            ['text','required_followup','Required follow-up','متابعة مطلوبة','yes',''],
            ['end_group','','','','',''],
            ['begin_repeat','visits','Visits','زيارات','',''],
            ['text','detail','Visit detail','تفاصيل الزيارة','yes',"${a} = 'yes'"],
            ['end_repeat','','','','',''],
        ],
        'choices': [['list_name','name','label'],['yesno','yes','Yes'],['yesno','no','No'],['things','one','One'],['things','two','Two']],
    })
    form = parse_form(raw)
    records = [
        {'id':'r1','row':2,'scope':'','parent':'','sourceIdentity':'u1','values':{'a':'yes','required_text':None,'amount':0,'optional_text':'','dynamic':'','branch/optional_followup':[],'branch/required_followup':' '}},
        {'id':'r2','row':3,'scope':'','parent':'','sourceIdentity':'u2','values':{'a':'no','required_text':'Complete','amount':-1,'optional_text':None,'dynamic':None,'branch/optional_followup':None,'branch/required_followup':None}},
        {'id':'r3','row':4,'scope':'','parent':'','sourceIdentity':'u3','values':{'a':'yes','required_text':'   ','amount':4,'optional_text':'','dynamic':'Filled','branch/optional_followup':['one'],'branch/required_followup':'Filled'}},
        {'id':'v1','row':2,'scope':'visits','parent':'r1','sourceIdentity':'v-u1','values':{'visits/detail':None}},
        {'id':'v2','row':3,'scope':'visits','parent':'r2','sourceIdentity':'v-u2','values':{'visits/detail':None}},
    ]
    return {'form':form,'records':records,'warnings':[],'issues':[]}, raw


@pytest.fixture
def required_api(required_project, tmp_path):
    project, raw = required_project
    store = ProjectStore(tmp_path/'required.sqlite3')
    settings = KoboSettings(language='en', hideEmpty=True)
    saved = store.create('Required review',project,raw,b'data',settings)
    app = FastAPI(); app.include_router(make_router(store))
    return TestClient(app),store,saved['id'],settings


def hits(project, question):
    return [r for r in scan(project,KoboSettings(language='en'))['rows'] if r['question']==question]


def test_required_and_connected_blanks_applicability_and_zero(required_project):
    project,_ = required_project; before=copy.deepcopy(project)
    found = scan(project,KoboSettings(language='en'))['rows']
    assert len(found)==6
    assert sum(r['outcome']=='required-missing' for r in found)==5
    assert sum(r['outcome']=='connected-blank' for r in found)==1
    assert {r['record'] for r in hits(project,'required_text')}=={'r1','r3'}
    assert not hits(project,'amount') and not hits(project,'optional_text')
    assert [r['record'] for r in hits(project,'dynamic')]==['r1']
    assert [r['record'] for r in hits(project,'visits/detail')]==['v1']
    assert not any(r['record'] in {'r2','v2'} for r in found)
    assert project==before
    result=next(q for q in analyze(project,KoboSettings(language='en'))['questions'] if q['id']=='required_text')
    assert result['missingAnswers']['required']==2 and not result['conditionalWarnings']
    assert analysis_project(project,KoboSettings()) is project


@pytest.mark.parametrize('raw,expected',[('yes',True),('true()',True),('TRUE',True),('1',True),('',False),('no',False),('false()',False),('0',False)])
def test_constant_required_rules(required_project,raw,expected):
    project,_=required_project
    q=next(q for q in project['form']['questions'] if q['id']=='required_text');q['required']=raw
    assert bool(hits(project,'required_text'))==expected


def test_hidden_questions_and_manual_connection_override(required_project):
    project,_=required_project
    settings=KoboSettings(language='en',hidden=['required_text'],questions={'branch/required_followup':{'connectionSource':'manual','connectionRules':{'type':'rule','field':'a','operator':'eq','value':'no'}}})
    found=scan(project,settings)['rows']
    assert len([r for r in found if r['question']=='required_text'])==2
    assert [r['record'] for r in found if r['question']=='branch/required_followup' and r['outcome']=='required-missing']==['r2']


def test_uncheckable_required_and_relevance_do_not_claim_missing(required_project):
    project,_=required_project
    q=next(q for q in project['form']['questions'] if q['id']=='dynamic');q['required']="regex(${a}, 'yes')"
    assert all(r['outcome']=='uncheckable' for r in hits(project,'dynamic'))
    q=next(q for q in project['form']['questions'] if q['id']=='branch/required_followup');q['relevant']="regex(${a}, 'yes')"
    found=hits(project,'branch/required_followup')
    assert all(r['outcome']=='uncheckable' for r in found)
    assert 'r2' not in {r['record'] for r in found}  # Known false inherited relevance.


def test_broken_repeat_dependencies_and_exact_row_inspection(required_project):
    project,_=required_project
    project['records'] += [{'id':'orphan','scope':'visits','parent':'absent','row':9,'values':{'visits/detail':None}}, {'id':'cycle','scope':'visits','parent':'cycle','row':10,'values':{'visits/detail':None}}]
    found=hits(project,'visits/detail')
    assert {r['record'] for r in found if r['outcome']=='uncheckable'}=={'orphan','cycle'}
    data=data_page(project,KoboSettings(), 'visits',['visits/detail'],record_ids=['orphan','cycle'])
    assert {r['id'] for r in data['rows']}=={'orphan','cycle'}


def test_recover_required_metadata_existing_project_and_backup(required_project,tmp_path):
    project,raw=required_project
    for q in project['form']['questions']:q.pop('required')
    before=copy.deepcopy(project)
    store=ProjectStore(tmp_path/'old.sqlite3');saved=store.create('Old project',project,raw,b'data')
    assert project==before
    q=next(q for q in saved['form']['questions'] if q['id']=='required_text')
    assert q['required']=='true()' and len(hits(saved,'required_text'))==2
    _,payload,settings,form_raw,data_raw=read_backup(backup_project(store,saved['id']))
    restored=store.create('Restored',payload,form_raw,data_raw,settings)
    assert len(hits(restored,'required_text'))==2
    # Recovery changes neither source bytes nor imported records.
    assert store.sources(saved['id'])==(raw,b'data')
    assert store.get(saved['id'],raw=True)['records']==project['records']
    app=FastAPI();app.include_router(make_router(store));client=TestClient(app)
    settings=KoboSettings(language='en');url=f"/api/kobo/projects/{saved['id']}"
    result=client.post(url+'/data-review',json={'settings':settings.model_dump(),'group':'required-missing:required_text'}).json()
    row=result['rows'][0]
    response=client.post(url+'/conditional-review/actions',json={'settings':settings.model_dump(),'revision':result['revision'],'action':'ignore','items':[{k:row[k] for k in ['record','question','fingerprint']}]})
    assert response.status_code==200,response.text
    assert review(store.get(saved['id']),settings,category='missing',status='ignored')['matched']==1


def test_unavailable_form_does_not_assume_required(required_project,tmp_path):
    project,_=required_project
    for q in project['form']['questions']:q.pop('required')
    store=ProjectStore(tmp_path/'no-form.sqlite3');saved=store.create('Unknown required',project,b'not-a-form',b'data')
    found=hits(saved,'required_text')
    assert len(found)==2 and all(r['outcome']=='uncheckable' and 'required-metadata-unavailable' in r['issues'] for r in found)


def test_groups_record_filters_and_cell_markers(required_api):
    client,store,pid,settings=required_api
    body={'settings':settings.model_dump(),'category':'missing'};url=f'/api/kobo/projects/{pid}'
    result=client.post(url+'/data-review',json=body)
    assert result.status_code==200,result.text
    data=result.json();assert len(data['groups'])==5 and data['summary']['requiredMissing']==5
    assert data['affected']==3  # r1, r3 and the repeat entry v1.
    group='required-missing:required_text'
    records=client.post(url+'/data-review',json={**body,'group':group,'pageSize':1}).json()
    assert records['matched']==2 and len(records['rows'])==1
    assert records['rows'][0]['answer']=='' and records['rows'][0]['value'] is None
    search=client.post(url+'/data-review',json={**body,'group':group,'search':'4'}).json()
    assert search['matched']==1 and search['rows'][0]['record']=='r3'
    marked=client.post(url+'/data',json={'settings':settings.model_dump(),'scope':'','columns':['required_text','branch/optional_followup','amount']}).json()
    row=next(r for r in marked['rows'] if r['id']=='r1')
    assert row['conditionalWarnings']['required_text']['outcome']=='required-missing'
    assert row['conditionalWarnings']['branch/optional_followup']['outcome']=='connected-blank'
    assert 'amount' not in row['conditionalWarnings']
    values=client.post(url+'/data-review/values',json={**body,'group':group,'column':'row'}).json()
    assert set(str(v) for v in values['values'])=={'2','4'}
    filtered=client.post(url+'/data-review',json={**body,'group':group,'columnFilters':[{'column':'row','type':'number','values':['4']}]}).json()
    assert filtered['matched']==1 and filtered['rows'][0]['record']=='r3'
    api_form=client.get(url).json()['form']
    assert next(q for q in api_form['questions'] if q['id']=='dynamic')['required']=="${a} = 'yes'"


def test_missing_ignore_reopen_edit_undo_and_no_exclusion(required_api):
    client,store,pid,settings=required_api;url=f'/api/kobo/projects/{pid}'
    query={'settings':settings.model_dump(),'group':'required-missing:required_text'}
    result=client.post(url+'/data-review',json=query).json();row=result['rows'][0]
    action={'settings':settings.model_dump(),'revision':result['revision'],'items':[{k:row[k] for k in ['record','question','fingerprint']}]}
    assert client.post(url+'/conditional-review/actions',json={**action,'action':'exclude'}).status_code==409
    assert client.post(url+'/conditional-review/actions',json={**action,'action':'ignore'}).status_code==200
    ignored=client.post(url+'/data-review',json={**query,'status':'ignored'}).json()
    assert ignored['matched']==1 and ignored['rows'][0]['record']=='r1'
    # The same answer remains blank in raw data and analysis.
    assert store.get(pid)['records'][0]['values']['required_text'] is None
    operation={'kind':'cells','cells':[{'record':'r1','field':'required_text','value':'Now answered'}]}
    assert client.post(url+'/edits/apply',json={'revision':0,'operation':operation}).status_code==200
    assert client.post(url+'/data-review',json={**query,'status':'ignored'}).json()['matched']==0
    assert client.post(url+'/edits/undo',json={'revision':1,'operation':{'kind':'cells'}}).status_code==200
    assert client.post(url+'/data-review',json={**query,'status':'ignored'}).json()['matched']==1


def test_changed_required_rule_reopens_and_applicability_removes_finding(required_api):
    client,store,pid,settings=required_api;url=f'/api/kobo/projects/{pid}'
    query={'settings':settings.model_dump(),'group':'required-missing:branch/required_followup'}
    result=client.post(url+'/data-review',json=query).json();row=result['rows'][0]
    assert client.post(url+'/conditional-review/actions',json={'settings':settings.model_dump(),'revision':result['revision'],'action':'ignore','items':[{k:row[k] for k in ['record','question','fingerprint']}]}).status_code==200
    operation={'kind':'cells','cells':[{'record':'r1','field':'a','value':'no'}]}
    assert client.post(url+'/edits/apply',json={'revision':0,'operation':operation}).status_code==200
    result=client.post(url+'/data-review',json={**query,'status':'all'}).json()
    assert result['matched']==0


def test_generic_quality_groups_also_have_editable_record_metadata(required_project):
    project,_=required_project;project['records'][0]['values']['amount']='invalid number'
    result=data_review(project,KoboSettings(language='en'),group='invalid:amount',category='other')
    assert any(g['id']=='invalid:amount' for g in result['groups'])
    assert result['rows'][0]['question']=='amount' and result['rows'][0]['record']=='r1'
    assert result['rows'][0]['value']=='invalid number' and not result['rows'][0]['canIgnore']


def test_required_rule_change_invalidates_acknowledgment(required_api):
    client,store,pid,settings=required_api;url=f'/api/kobo/projects/{pid}'
    query={'settings':settings.model_dump(),'group':'required-missing:required_text'}
    result=client.post(url+'/data-review',json=query).json();row=result['rows'][0]
    action={'settings':settings.model_dump(),'revision':result['revision'],'action':'ignore','items':[{k:row[k] for k in ['record','question','fingerprint']}]}
    assert client.post(url+'/conditional-review/actions',json=action).status_code==200
    with store.connect() as db:
        payload=json.loads(db.execute('SELECT payload FROM projects WHERE id=?',(pid,)).fetchone()[0])
        next(q for q in payload['form']['questions'] if q['id']=='required_text')['required']="${a} = 'yes'"
        db.execute('UPDATE projects SET payload=? WHERE id=?',(json.dumps(payload),pid))
    assert client.post(url+'/data-review',json={**query,'status':'ignored'}).json()['matched']==0
    reopened=client.post(url+'/data-review',json=query).json()
    assert any(r['record']=='r1' and r['status']=='open' for r in reopened['rows'])


def test_added_questions_default_to_optional_without_source_form(required_project,tmp_path):
    project,_=required_project
    q=copy.deepcopy(project['form']['questions'][1]);q.update(id='added',name='added',addedFromData=True)
    q.pop('required');project['form']['questions'].append(q)
    for record in project['records']:record['values']['added']=None
    store=ProjectStore(tmp_path/'added.sqlite3');saved=store.create('Added',project,b'no form',b'data')
    assert next(q for q in saved['form']['questions'] if q['id']=='added')['required']==''
    assert not hits(saved,'added')


def test_review_rule_summaries_use_configured_rules_not_question_wording(required_project):
    project,_=required_project
    question=next(q for q in project['form']['questions'] if q['id']=='required_text')
    question['labels']['en']='30. If you are living in an informal site or collective shelter, do you have a safe and secure place to stay for the next 6 months?'
    result=data_review(project,KoboSettings(language='en'))
    groups={g['id']:g for g in result['groups']}
    unconditional=groups['required-missing:required_text']['rule']
    assert unconditional['problem']=='No answer was recorded.'
    assert unconditional['required']=={'mode':'always','label':'Always'}
    assert unconditional['applies']['mode']=='all'
    assert 'All submissions' in unconditional['applies']['label']
    dynamic=groups['required-missing:dynamic']['rule']
    assert dynamic['required']['mode']=='conditional' and 'Question A' in dynamic['required']['label']
    connected=groups['connected-blank:branch/optional_followup']['rule']
    assert connected['required']['mode']=='optional'
    assert connected['applies']['mode']=='conditional' and 'Question A' in connected['applies']['label']
    manual=KoboSettings(language='en',questions={'required_text':{'connectionSource':'manual','connectionRules':{'type':'rule','field':'a','operator':'eq','value':'yes'}}})
    rule=next(g for g in data_review(project,manual)['groups'] if g['id']=='required-missing:required_text')['rule']
    assert rule['applies']['source']=='manual' and rule['applies']['mode']=='conditional'


def test_review_unknown_rule_and_arabic_summary(required_project):
    project,_=required_project
    q=next(q for q in project['form']['questions'] if q['id']=='required_text')
    q['required']="regex(${a}, 'yes')"
    result=data_review(project,KoboSettings(language='ar'))
    rule=next(g for g in result['groups'] if g['question']=='required_text')['rule']
    assert rule['required']['mode']=='unknown'
    assert rule['required']['label']=='تعذّر تحديده'
    assert rule['applies']['mode']=='all'


def test_review_focus_navigation_across_pages_and_resolved_records(required_api):
    client,store,pid,settings=required_api;url=f'/api/kobo/projects/{pid}'
    query={'settings':settings.model_dump(),'group':'required-missing:required_text','pageSize':1}
    result=client.post(url+'/data-review',json={**query,'focusRecord':'r3'}).json()
    assert result['page']==2 and result['focusedRow']['record']=='r3'
    assert result['navigation']=={'previous':'r1','next':None,'position':2,'total':2}
    result=client.post(url+'/data-review',json={**query,'focusRecord':'r1'}).json()
    assert result['navigation']['next']=='r3'
    operation={'kind':'cells','cells':[{'record':'r1','field':'required_text','value':'Answered'}]}
    assert client.post(url+'/edits/apply',json={'revision':0,'operation':operation}).status_code==200
    result=client.post(url+'/data-review',json={**query,'focusRecord':'r1'}).json()
    assert result['focusedRow'] is None
    assert result['navigation']=={'previous':None,'next':'r3','position':None,'total':1}
    # A focused record never bypasses a search or column filter.
    result=client.post(url+'/data-review',json={**query,'focusRecord':'r3','search':'not present'}).json()
    assert result['focusedRow'] is None and result['navigation']['next'] is None
    assert result['matched']==0


def test_review_focus_preserves_revision_and_record_fingerprints(required_project):
    project,_=required_project;settings=KoboSettings(language='en')
    query={'group':'required-missing:required_text'}
    original=data_review(project,settings,**query)
    focused=data_review(project,settings,**query,focus_record='r3',page_size=1)
    assert original['revision']==focused['revision']
    assert original['rows'][1]['fingerprint']==focused['focusedRow']['fingerprint']
    assert focused['focusedRow']['rule']==next(g for g in focused['groups'] if g['id']==query['group'])['rule']
