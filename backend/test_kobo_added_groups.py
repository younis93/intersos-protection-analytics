import pytest
from backend.kobo import parse_form, parse_data, normalize
from backend.kobo_review_schema import effective_form
from backend.test_kobo import workbook
from backend.test_kobo_import_links import client_store


def form_bytes(include_groups=True):
    survey=[['type','name','label']]
    if include_groups: survey += [['begin_group','assessment','Assessment'],['begin_group','section_a','Section A']]
    survey += [['text','status','4. What is your current status in Iraq?']]
    if include_groups: survey += [['end_group','',''],['end_group','','']]
    return workbook({'survey':survey})


def added(**changes):
    return {'id':'added_status','label':'Status with edited answers','kind':'text','sheet':0,'column':1,'repeat':'','group':'assessment/section_a','choices':[],**changes}


def test_group_validation_and_legacy_defaults():
    form=parse_form(form_bytes());sheets=parse_data(b'status,extra\nOne,Two\n','data.csv')
    assert effective_form(form,{'addedQuestions':[added()]},sheets)['questions'][-1]['group']=='assessment/section_a'
    assert effective_form(form,{'addedQuestions':[added(group=None)]},sheets)['questions'][-1]['group']==''
    with pytest.raises(ValueError,match='existing question group'): effective_form(form,{'addedQuestions':[added(group='absent')]},sheets)
    repeat={'id':'members','name':'members','labels':{'en':'Members'},'parent':'','repeat':True}
    nested={'id':'members/details','name':'details','labels':{'en':'Details'},'parent':'members','repeat':False}
    form['groups'] += [repeat,nested]
    for q in [added(group='members'),added(repeat='members',group=''),added(repeat='members',group='assessment')]:
        with pytest.raises(ValueError,match='repeat context'): effective_form(form,{'addedQuestions':[q]},sheets)
    result=effective_form(form,{'addedQuestions':[added(repeat='members',group='members/details')]},sheets)
    assert result['questions'][-1]['repeat']=='members'
    assert result['questions'][-1]['group']=='members/details'


def test_save_reopen_and_retain_group_on_replacement(client_store):
    client,store=client_store
    preview=client.post('/api/kobo/imports/preview',files={'form':('form.xlsx',form_bytes()),'data':('data.csv',b'status,extra\nOne,Two\n')}).json()
    maps=preview['mappings'];maps[1].update(question='added_status',status='matched')
    config={'addedQuestions':[added()]}
    body={'token':preview['token'],'name':'Grouped addition','mappings':maps,'reviewConfig':config}
    saved=client.post('/api/kobo/imports/confirm',json=body)
    assert saved.status_code==200,saved.text
    pid=saved.json()['id'];project=store.get(pid)
    assert project['form']['questions'][-1]['group']=='assessment/section_a'
    assert project['records'][0]['values']['added_status']=='Two'
    assert project['records'][0]['values']['assessment/section_a/status']=='One'
    assert project['settings']['filterFields']==['added_status']
    review=client.post(f'/api/kobo/projects/{pid}/review').json()
    assert review['reviewConfig']['addedQuestions'][0]['group']=='assessment/section_a'
    client.delete('/api/kobo/imports/'+review['token'])
    replacement=client.post(f'/api/kobo/projects/{pid}/review',files={'form':('replacement.xlsx',form_bytes(False))})
    assert replacement.status_code==200,replacement.text
    renewed=replacement.json()
    retained={g['id']:g for g in renewed['form']['groups']}
    assert retained['assessment/section_a']['analysisOnly'] and retained['assessment']['analysisOnly']
    checked=client.post(f"/api/kobo/imports/{renewed['token']}/check",json={'mappings':renewed['mappings'],'reviewConfig':renewed['reviewConfig']})
    assert checked.status_code==200,checked.text
    analysis=client.post(f'/api/kobo/projects/{pid}/analysis',json={'settings':saved.json()['settings']}).json()
    assert any(q['id']=='added_status' and q['group']=='assessment/section_a' for q in analysis['questions'])


def test_export_sections_follow_selected_group(client_store):
    from backend.kobo import KoboSettings, analyze
    from backend.kobo_excel_layout import group_sections
    form=parse_form(form_bytes());sheets=parse_data(b'status,extra\nOne,Two\n','data.csv')
    effective=effective_form(form,{'addedQuestions':[added()]},sheets)
    mappings=[{'sheet':0,'column':0,'question':'assessment/section_a/status','option':''},{'sheet':0,'column':1,'question':'added_status','option':''}]
    records,issues=normalize(effective,sheets,mappings)
    snapshot=analyze({'form':effective,'records':records},KoboSettings())
    sections=group_sections(snapshot,['assessment/section_a'])
    assert len(sections)==1 and sections[0]['id']=='assessment/section_a'
    assert {item['result']['id'] for item in sections[0]['questions']}=={'assessment/section_a/status','added_status'}
