import copy
import pytest
from pydantic import ValidationError
from backend.kobo import AnalysisViewSettings, SavedAnalysisView, KoboSettings, ProjectStore
from backend.kobo_saved_views import apply_saved_view, saved_view_issues
from backend.kobo_settings_share import export_settings, preview_settings
from backend.test_kobo import sample
from backend.test_kobo_preview import preview_client
from backend.test_kobo_indicators import definition


def test_default_view_uses_initial_defaults_and_preserves_shared_settings(sample):
    from backend.kobo import new_project_settings
    from backend.kobo_saved_views import apply_default_view
    project=sample[0]; item=view(project)
    settings=KoboSettings(**item.snapshot.model_dump(), savedViews=[item], activeViewId=item.id, indicators=[definition()], excelGroups=['group'])
    before=copy.deepcopy(settings.model_dump())
    result=apply_default_view(project,settings)
    assert AnalysisViewSettings.model_validate(result.model_dump()) == AnalysisViewSettings.model_validate(new_project_settings(project['form']).model_dump())
    assert result.activeViewId=='' and result.savedViews==settings.savedViews
    assert result.indicators==settings.indicators and result.excelGroups==settings.excelGroups
    assert settings.model_dump()==before
    assert set(result.hidden)=={q['id'] for q in project['form']['questions'] if q['identifying']}


def test_default_view_api_is_read_only_then_can_be_persisted(preview_client):
    client,store,pid=preview_client; project=store.get(pid); item=view(project)
    settings=KoboSettings(savedViews=[item], activeViewId=item.id, indicators=[definition()], excelGroups=['group'])
    url=f'/api/kobo/projects/{pid}'
    assert client.put(url+'/settings',json=settings.model_dump()).status_code==200
    before=store.get(pid)
    response=client.post(url+'/views/default',json={'settings':settings.model_dump()})
    assert response.status_code==200,response.text
    applied=response.json()
    assert applied['activeViewId']=='' and applied['filters']==[] and applied['viewMode']=='charts'
    assert applied['savedViews']==settings.model_dump()['savedViews']
    assert store.get(pid)==before
    assert client.put(url+'/settings',json=applied).status_code==200
    assert client.get(url).json()['settings']==applied


def view(project, **changes):
    return SavedAnalysisView(id='view-1',name='Female respondents',snapshot=AnalysisViewSettings(filters=[{'field':'group/gender','values':['f']}],hidden=['group/day'],viewMode='table',language='ar',questions={'group/needs':{'chart':'column','breakdownDisplay':'both'}}),questionKinds={q['id']:q['kind'] for q in project['form']['questions']},**changes)


def test_views_are_optional_nonrecursive_and_keep_project_indicators(sample):
    project=sample[0]; item=view(project)
    assert KoboSettings().savedViews==[] and KoboSettings().activeViewId==''
    settings=KoboSettings(savedViews=[item],indicators=[definition()],excelGroups=['group'])
    before=copy.deepcopy(project)
    applied=apply_saved_view(project,settings,item.id)
    assert applied.language=='ar' and applied.viewMode=='table'
    assert applied.filters[0].values==['f'] and applied.hidden==['group/day']
    assert applied.indicators==settings.indicators and applied.excelGroups==settings.excelGroups
    assert applied.savedViews==settings.savedViews and applied.activeViewId==item.id
    assert 'indicators' not in item.snapshot.model_dump() and 'savedViews' not in item.snapshot.model_dump()
    assert project==before and settings.activeViewId==''


@pytest.mark.parametrize('change',[
    {'filters':[{'field':'unknown','values':['f']}]},
    {'filters':[{'field':'group/gender','values':['unknown']}]},
    {'filters':[{'field':'group/age','kind':'date','minimum':'2026-01-01'}]},
    {'questions':{'group/gender':{'chart':'histogram'}}},
    {'questions':{'group/needs':{'breakdowns':['missing']}}},
    {'hidden':['missing']},
])
def test_invalid_views_cannot_be_opened(sample,change):
    item=view(sample[0]); item.snapshot=AnalysisViewSettings.model_validate({**item.snapshot.model_dump(),**change})
    assert saved_view_issues(sample[0],item)
    with pytest.raises(ValueError,match='Review'): apply_saved_view(sample[0],KoboSettings(savedViews=[item]),item.id)


def test_flagged_view_requires_explicit_correction_and_names_are_unique(sample):
    item=view(sample[0],reviewIssues=['Review imported filter selections.'])
    with pytest.raises(ValueError): apply_saved_view(sample[0],KoboSettings(savedViews=[item]),item.id)
    with pytest.raises(ValueError): apply_saved_view(sample[0],KoboSettings(),item.id)
    with pytest.raises(ValidationError): KoboSettings(savedViews=[item,item])
    with pytest.raises(ValidationError): KoboSettings(savedViews=[item,item.model_copy(update={'id':'other','name':item.name.upper()})])
    with pytest.raises(ValidationError): KoboSettings(activeViewId='missing')
    with pytest.raises(ValidationError): item.model_validate({**item.model_dump(),'name':' '})


def test_store_reopen_export_import_and_view_definitions(sample,tmp_path):
    project=sample[0]; item=view(project); settings=KoboSettings(savedViews=[item],activeViewId=item.id)
    path=tmp_path/'views.sqlite3'; store=ProjectStore(path); saved=store.create('Saved views',project,b'',b'',settings)
    reopened=ProjectStore(path).get(saved['id'])
    assert KoboSettings.model_validate(reopened['settings']).savedViews==[item]
    package=export_settings(project,settings)
    imported=preview_settings(project,KoboSettings(),package)['settings']
    assert len(imported['savedViews'])==1 and not imported['savedViews'][0]['reviewIssues']
    assert imported['savedViews'][0]['snapshot']==item.snapshot.model_dump()
    assert imported['activeViewId']==''


def test_import_remaps_view_question_ids_and_flags_unmatched_codes(sample):
    project=copy.deepcopy(sample[0]); item=view(project); package=export_settings(project,KoboSettings(savedViews=[item]))
    for q in project['form']['questions']:
        old=q['id']; q['id']='new/'+q['name']
        for record in project['records']:
            if old in record['values']: record['values'][q['id']]=record['values'].pop(old)
    imported=preview_settings(project,KoboSettings(),package)['settings']['savedViews'][0]
    assert imported['snapshot']['filters'][0]['field']=='new/gender'
    assert not imported['reviewIssues']
    assert 'new/needs' in imported['questionKinds']
    project['form']['questions'][0]['choices']=[c for c in project['form']['questions'][0]['choices'] if c['name']!='f']
    result=preview_settings(project,KoboSettings(),package)
    assert result['settings']['savedViews'][0]['reviewIssues']
    assert any('Saved view requires review' in note for note in result['warnings'])


def test_import_keeps_other_views_and_renames_name_collisions(sample):
    item=view(sample[0]); existing=item.model_copy(update={'id':'other'})
    result=preview_settings(sample[0],KoboSettings(savedViews=[existing]),export_settings(sample[0],KoboSettings(savedViews=[item])))
    views=result['settings']['savedViews']
    assert len(views)==2 and views[0]['id']=='other' and views[1]['id']==item.id
    assert views[0]['name']!=views[1]['name']


def test_reupload_retains_snapshots_flags_missing_questions_and_hides_added_fields(sample,tmp_path):
    project=copy.deepcopy(sample[0]); item=view(project)
    store=ProjectStore(tmp_path/'reupload.sqlite3'); saved=store.create('Views',project,b'',b'',KoboSettings(savedViews=[item],activeViewId=item.id))
    added=copy.deepcopy(project['form']['questions'][2]); added.update(id='group/new',name='new'); project['form']['questions'].append(added)
    repaired=store.repair(saved['id'],project,b'',b'')
    current=repaired['settings']['savedViews'][0]
    assert 'group/new' in current['snapshot']['hidden'] and not current['reviewIssues']
    project['form']['questions']=[q for q in project['form']['questions'] if q['id']!='group/gender']
    repaired=store.repair(saved['id'],project,b'',b'')
    assert repaired['settings']['savedViews'][0]['reviewIssues'] and repaired['settings']['activeViewId']==''
    assert repaired['settings']['savedViews'][0]['snapshot']['filters'][0]['field']=='group/gender'


def test_apply_api_is_read_only_and_save_rejects_invalid_unflagged_views(preview_client):
    client,store,pid=preview_client; project=store.get(pid); item=view(project)
    settings=KoboSettings(savedViews=[item],indicators=[definition()]); url=f'/api/kobo/projects/{pid}'
    assert client.put(url+'/settings',json=settings.model_dump()).status_code==200
    before=store.get(pid)
    result=client.post(url+'/views/apply',json={'settings':settings.model_dump(),'viewId':item.id})
    assert result.status_code==200,result.text
    assert result.json()['activeViewId']==item.id and result.json()['viewMode']=='table'
    assert store.get(pid)==before
    assert client.put(url+'/settings',json=result.json()).status_code==200
    assert client.get(url).json()['settings']['activeViewId']==item.id
    item.snapshot.filters[0].values=['removed']
    assert client.put(url+'/settings',json=settings.model_dump()).status_code==400
    assert client.post(url+'/views/apply',json={'settings':settings.model_dump(),'viewId':item.id}).status_code==400
