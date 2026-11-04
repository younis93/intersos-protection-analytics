import copy
import io
import json
import zipfile

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.kobo import ProjectStore, KoboSettings, parse_data, parse_form, normalize
from backend.kobo_api import make_router
from backend.kobo_workspace import backup_project, read_backup
from backend.test_kobo import sample
from backend.test_custom_analysis import env, stage, confirm
from backend.custom_analysis import read_tables, Configuration, build


@pytest.fixture
def workspace(tmp_path, sample):
    store = ProjectStore(tmp_path/'transfer.sqlite3')
    payload = copy.deepcopy(sample[0])
    payload.update(mappings=sample[2], warnings=[], issues=[])
    project = store.create('Original', payload, b'form', b'data', KoboSettings(report={'title':'Saved report'}))
    app = FastAPI();app.include_router(make_router(store))
    with TestClient(app) as client:
        yield client,store,project


def preview(client, raw, password=None, prefix='/api/kobo'):
    result = client.post(prefix+'/backups/preview',files={'file':('project.zip',raw)},data={} if password is None else {'password':password})
    assert result.status_code==200,result.text
    return result.json()


def apply_new(client, staged, policy, prefix='/api/kobo'):
    result = client.post(f"{prefix}/backups/{staged['token']}/confirm",json={'settingsPolicy':policy})
    assert result.status_code==200,result.text
    return result.json()


@pytest.mark.parametrize('include_settings',[True,False])
@pytest.mark.parametrize('protected',[True,False])
def test_archive_content_and_staged_roundtrip(workspace,include_settings,protected):
    client,store,project=workspace
    password='transfer password' if protected else None
    response=client.post(f"/api/kobo/projects/{project['id']}/backup",json={'includeSettings':include_settings,'password':password})
    assert response.status_code==200,response.text
    staged=preview(client,response.content,password)
    assert staged['includesSettings']==include_settings
    assert staged['records']==len(project['records'])
    assert len(store.list())==1
    restored=apply_new(client,staged,'file' if include_settings else 'defaults')
    assert restored['settings']['report']['title']==('Saved report' if include_settings else '')
    assert store.get(restored['id'])['records']==project['records']
    assert len(store.list())==2


def test_data_only_materializes_corrections_and_rebuilds_kobo_sources(workspace):
    from backend.kobo_edits import EditRequest, commit_edit
    client,store,project=workspace
    record=next(r for r in project['records'] if not r['scope'])
    request=EditRequest.model_validate({'revision':0,'operation':{'kind':'cells','cells':[{'record':record['id'],'field':'group/age','value':99}]}})
    changed=commit_edit(store,project['id'],request)
    raw=backup_project(store,project['id'],False)
    _,payload,settings,form,data=read_backup(raw)
    assert settings is None and 'dataEdits' not in payload and 'updateHistory' not in payload
    assert payload['records']==changed['records']
    rebuilt,issues=normalize(parse_form(form),parse_data(data,'data.csv'),payload['mappings'],payload['policies'])
    assert not issues
    assert [r['values'] for r in rebuilt]==[r['values'] for r in changed['records']]
    assert all(r['parent'] for r in rebuilt if r['scope'])
    assert b'original-data' not in data


def test_update_keeps_or_replaces_settings_and_is_atomic(workspace):
    client,store,project=workspace
    original=copy.deepcopy(project)
    source=store.get(project['id'],raw=True)
    for k in ('id','name','settings','updated'):source.pop(k,None)
    source['records'][0]['values']['group/age']=88
    incoming=store.create('Incoming',source,b'form',b'data',KoboSettings(report={'title':'Incoming report'}))
    for policy,expected in [('keep','Saved report'),('file','Incoming report')]:
        staged=preview(client,backup_project(store,incoming['id']))
        current=store.get(project['id'])
        choice={'projectId':project['id'],'expectedUpdated':current['updated'],'settingsPolicy':policy}
        unreviewed=client.post(f"/api/kobo/backups/{staged['token']}/confirm",json=choice)
        assert unreviewed.status_code==400
        review=client.post(f"/api/kobo/backups/{staged['token']}/review",json={**choice,'matchingMode':'automatic'})
        assert review.status_code==200,review.text
        assert not review.json()['blockingIssues']
        result=client.post(f"/api/kobo/backups/{staged['token']}/confirm",json={**choice,'matching':review.json()['matching']})
        assert result.status_code==200,result.text
        updated=store.get(project['id'])
        assert updated['name']==original['name'] and updated['settings']['report']['title']==expected
        assert updated['records'][0]['values']['group/age']==88
        assert updated['updateHistory']


def test_stale_cancelled_and_wrong_workspace_imports_do_not_write(workspace):
    client,store,project=workspace
    staged=preview(client,backup_project(store,project['id'],False))
    choice={'projectId':project['id'],'expectedUpdated':project['updated'],'settingsPolicy':'keep'}
    review=client.post(f"/api/kobo/backups/{staged['token']}/review",json={**choice,'matchingMode':'automatic'}).json()
    store.rename(project['id'],'Renamed')
    before=store.get(project['id'],raw=True)
    result=client.post(f"/api/kobo/backups/{staged['token']}/confirm",json={**choice,'matching':review['matching']})
    assert result.status_code==409
    assert store.get(project['id'],raw=True)==before
    assert client.delete(f"/api/kobo/backups/{staged['token']}").status_code==200
    assert client.post(f"/api/kobo/backups/{staged['token']}/confirm",json={'settingsPolicy':'defaults'}).status_code==410
    assert len(store.list())==1


def test_data_only_custom_cleaning_and_calculations_do_not_run_twice(env):
    client,store=env
    staged=stage(client,b'Amount,Tags\n"1.250,50",A;B\n')
    amount,tags=staged['config']['columns']
    amount.update(kind='number',preparation={'numberFormat':'comma'})
    tags.update(kind='multiple',separator=';')
    staged['config']['calculatedColumns']=[{'id':'calc_total','label':'Total','operation':'multiply','left':amount['id'],'useLiteral':True,'literal':'2'}]
    project=confirm(client,staged)
    raw=backup_project(store,project['id'],False)
    imported=apply_new(client,preview(client,raw,prefix='/api/custom'),'defaults',prefix='/api/custom')
    payload=store.get(imported['id'])
    assert payload['records'][0]['values'][amount['id']]==1250.5
    assert payload['records'][0]['values']['calc_total']==2501
    assert not payload['customConfig']['calculatedColumns']
    assert not payload['customConfig']['validationRules']
    config=Configuration.model_validate(payload['customConfig'])
    rebuilt,review=build(read_tables(store.sources(imported['id'])[1],'source.csv'),config,config.columns)
    assert not review['issues']
    assert rebuilt['records'][0]['values']==payload['records'][0]['values']
    wrong=client.post('/api/kobo/backups/preview',files={'file':('custom.zip',raw)})
    assert wrong.status_code==400


def test_data_only_file_rejects_file_settings(workspace):
    client,store,project=workspace
    staged=preview(client,backup_project(store,project['id'],False))
    response=client.post(f"/api/kobo/backups/{staged['token']}/confirm",json={'settingsPolicy':'file'})
    assert response.status_code==400
    assert len(store.list())==1


def test_legacy_archive_and_data_only_with_active_filters(workspace):
    client,store,project=workspace
    store.save(project['id'],KoboSettings(hidden=['group/age'],filters=[{'field':'group/gender','values':['f']}]))
    staged=preview(client,backup_project(store,project['id'],False))
    restored=apply_new(client,staged,'defaults')
    assert len(store.get(restored['id'])['records'])==len(project['records'])
    assert not restored['settings']['filters']
    assert 'group/age' not in restored['settings']['hidden']
    raw=backup_project(store,project['id'])
    output=io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(raw)) as source,zipfile.ZipFile(output,'w') as target:
        for name in source.namelist():
            value=source.read(name)
            if name=='manifest.json':
                manifest=json.loads(value);manifest['version']=1;manifest.pop('includesSettings')
                value=json.dumps(manifest).encode()
            target.writestr(name,value)
    imported=apply_new(client,preview(client,output.getvalue()),'file')
    assert imported['settings']['filters']


def test_update_correction_conflicts_require_resolution(workspace):
    from backend.kobo_edits import EditRequest,commit_edit
    client,store,project=workspace
    incoming=store.get(project['id'],raw=True)
    for key in ('id','name','settings','updated'):incoming.pop(key,None)
    incoming['records'][0]['values']['group/age']=50
    source=store.create('Incoming',incoming,b'form',b'data')
    current=commit_edit(store,project['id'],EditRequest.model_validate({'revision':0,'operation':{'kind':'cells','cells':[{'record':project['records'][0]['id'],'field':'group/age','value':99}]}}))
    staged=preview(client,backup_project(store,source['id'],False))
    choice={'projectId':current['id'],'expectedUpdated':current['updated'],'settingsPolicy':'keep','matchingMode':'manual','matching':{'keys':{'':['group/respondent_name']},'skip':False}}
    review=client.post(f"/api/kobo/backups/{staged['token']}/review",json=choice)
    assert review.status_code==200,review.text
    comparison=review.json();conflict=comparison['localEdits']['conflicts'][0]
    before=store.get(current['id'],raw=True)
    unresolved=client.post(f"/api/kobo/backups/{staged['token']}/confirm",json={**choice,'matching':comparison['matching']})
    assert unresolved.status_code==400
    assert store.get(current['id'],raw=True)==before
    matching={**comparison['matching'],'editResolutions':{conflict['id']:'incoming'}}
    result=client.post(f"/api/kobo/backups/{staged['token']}/confirm",json={**choice,'matching':matching})
    assert result.status_code==200,result.text
    assert store.get(current['id'])['records'][0]['values']['group/age']==50


def test_custom_update_with_file_settings_preserves_recipes_and_incoming_corrections(env):
    from backend.kobo_edits import EditRequest,commit_edit
    client,store=env
    staged=stage(client,b'Amount\n"1.250,50"\n')
    amount=staged['config']['columns'][0]
    amount.update(kind='number',preparation={'numberFormat':'comma'})
    incoming=confirm(client,staged)
    corrected=commit_edit(store,incoming['id'],EditRequest.model_validate({'revision':0,'operation':{'kind':'cells','cells':[{'record':'row_2','field':amount['id'],'value':1234}]}}))
    source=store.get(incoming['id'],raw=True)
    for key in ('id','name','settings','updated'):source.pop(key,None)
    destination=store.create('Destination',source,*store.sources(incoming['id']))
    archive=preview(client,backup_project(store,corrected['id']),prefix='/api/custom')
    choice={'projectId':destination['id'],'expectedUpdated':destination['updated'],'settingsPolicy':'file','matchingMode':'automatic'}
    response=client.post(f"/api/custom/backups/{archive['token']}/review",json=choice)
    assert response.status_code==200,response.text
    matching=response.json()['matching'];matching['discardEdits']=True
    applied=client.post(f"/api/custom/backups/{archive['token']}/confirm",json={**choice,'matching':matching})
    assert applied.status_code==200,applied.text
    result=store.get(destination['id'])
    assert result['customConfig']['columns'][0]['preparation']['numberFormat']=='comma'
    assert result['records'][0]['values'][amount['id']]==1234
    assert store.sources(destination['id'])==store.sources(incoming['id'])


def test_data_only_custom_includes_excluded_fields_with_clean_values(env):
    client,store=env
    staged=stage(client,b'Code,Hidden\n001,  value  \n')
    hidden=staged['config']['columns'][1]
    hidden.update(included=False,preparation={'trim':True})
    project=confirm(client,staged)
    _,payload,_,_,data=read_backup(backup_project(store,project['id'],False))
    assert hidden['id'] in {q['id'] for q in payload['form']['questions']}
    assert all(c['included'] for c in payload['customConfig']['columns'])
    config=Configuration.model_validate(payload['customConfig'])
    rebuilt,review=build(read_tables(data,'source.csv'),config,config.columns)
    assert not review['issues']
    assert rebuilt['records'][0]['values']==payload['records'][0]['values']
