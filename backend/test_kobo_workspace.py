import copy
import io
import zipfile
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.kobo import KoboSettings, ProjectStore
from backend.kobo_api import make_router
from backend.kobo_workspace import backup_project, read_backup, geography
from backend.test_kobo import sample


def test_backup_restore_roundtrip(tmp_path, sample):
    payload = {**sample[0], 'mappings': sample[2], 'policies': {'x': 'priority'}, 'warnings': [], 'issues': []}
    store = ProjectStore(tmp_path / 'projects.sqlite3')
    settings = KoboSettings(dashboardQuestions=['group/gender'], report={'title': 'Protection report', 'findings': 'Findings', 'questions': ['group/gender']})
    original = store.create('Assessment', payload, b'original-form', b'original-data', settings)
    app = FastAPI(); app.include_router(make_router(store))
    with TestClient(app) as client:
        backup = client.get(f'/api/kobo/projects/{original["id"]}/backup')
        assert backup.status_code == 200
        restored = client.post('/api/kobo/backups/restore', files={'file': ('backup.zip', backup.content, 'application/zip')})
        assert restored.status_code == 200, restored.text
        result = restored.json()
        assert result['id'] != original['id']
        assert result['settings']['report']['findings'] == 'Findings'
        assert result['settings']['dashboardQuestions'] == ['group/gender']
        assert store.get(result['id'])['records'] == payload['records']
        assert store.get(result['id'])['mappings'] == payload['mappings']
        assert store.sources(result['id']) == (b'original-form', b'original-data')
        assert len(store.list()) == 2
        corrupt = client.post('/api/kobo/backups/restore', files={'file': ('bad.zip', b'bad')})
        assert corrupt.status_code == 400
        assert len(store.list()) == 2


def test_backup_tampering_and_extra_files(tmp_path, sample):
    store = ProjectStore(tmp_path / 'projects.sqlite3')
    saved = store.create('Assessment', sample[0], b'form', b'data')
    raw = backup_project(store, saved['id'])
    for extra in [False, True]:
        out = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(raw)) as source, zipfile.ZipFile(out, 'w') as dest:
            for name in source.namelist():
                dest.writestr(name, b'changed' if name == 'data.bin' and not extra else source.read(name))
            if extra: dest.writestr('../unexpected', b'bad')
        with pytest.raises(ValueError): read_backup(out.getvalue())


def test_backup_keeps_hidden_identity_contacts_and_filtered_out_records(tmp_path, sample):
    payload = copy.deepcopy(sample[0])
    name_id = 'group/respondent_name'
    name_question = next(question for question in payload['form']['questions'] if question['id'] == name_id)
    for index, field in enumerate(['primary_phone', 'secondary_phone']):
        payload['form']['questions'].append({**copy.deepcopy(name_question), 'id': 'group/' + field,
            'name': field, 'labels': {'en': field}, 'order': 100 + index})
    for index, record in enumerate(payload['records']):
        record['values'].update({name_id: 'اسم تجريبي ' + str(index),
            'group/primary_phone': '07501234567', 'group/secondary_phone': '07701234567'})
    hidden = [name_id, 'group/primary_phone', 'group/secondary_phone']
    settings = KoboSettings(hidden=hidden, filters=[{'field': 'group/gender', 'values': ['f']}])
    store = ProjectStore(tmp_path / 'projects.sqlite3')
    original = store.create('Identity preservation fixture', payload, b'original-form', b'original-contact-data', settings)
    app = FastAPI(); app.include_router(make_router(store))
    with TestClient(app) as client:
        backup = client.get(f'/api/kobo/projects/{original["id"]}/backup')
        restored = client.post('/api/kobo/backups/restore', files={'file': ('project.zip', backup.content)})
    assert restored.status_code == 200, restored.text
    imported = store.get(restored.json()['id'])
    assert imported['records'] == payload['records']
    assert imported['settings']['hidden'] == hidden
    assert store.sources(imported['id']) == (b'original-form', b'original-contact-data')
    assert store.get(original['id']) == original
    assert len(store.list()) == 2


def test_geography_filters_and_privacy(sample):
    project = copy.deepcopy(sample[0])
    field = 'group/gender'
    project['form']['questions'][0]['choices'] = [{'name':'f','labels':{'en':'Baghdad'}},{'name':'m','labels':{'en':'Erbil'}}]
    settings = KoboSettings(filters=[{'field':field,'kind':'category','values':['f']}])
    result = geography(project, settings, field)
    assert result['total'] == 2
    assert [(row['label'], row['count'], row['status']) for row in result['rows']] == [('Baghdad', 2, 'Matched')]
    assert result['governorates'] == {'Baghdad':2}
    with pytest.raises(ValueError): geography(project, KoboSettings(hidden=[field]), field)
    with pytest.raises(ValueError): geography(project, KoboSettings(), 'group/respondent_name')
    with pytest.raises(ValueError): geography(project, KoboSettings(), 'missing')


def test_geopoints_missing_invalid_and_cells(sample):
    project = copy.deepcopy(sample[0]); field = 'group/gender'
    project['form']['questions'][0].update(type='geopoint',kind='text',choices=[])
    for record,value in zip(project['records'], ['33.31 44.36 0 5','200 44',None]): record['values'][field] = value
    result = geography(project, KoboSettings(), field)
    assert result['missing'] == 1 and result['invalid'] == 1
    assert result['cells'] == [{'lat':33.35,'lon':44.35,'count':1}]
    assert 'values' not in result and 'records' not in result
