import copy

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.project_encryption import (
    MAGIC, OVERHEAD, ExportProtection, ProjectProtectionError, protect_backup, unlock_backup,
)
from backend.kobo import ProjectStore, KoboSettings
from backend.kobo_api import make_router
from backend.test_kobo import sample
from backend.test_legal_workspace import environment
from backend.test_custom_analysis import env, stage, confirm

PASSWORD = 'A unique password 2026 🔐'


def test_envelope_confidentiality_authentication_and_randomness():
    raw = b'PK secret project names and personal records'
    encrypted = protect_backup(raw, PASSWORD)
    assert len(encrypted) == len(raw) + OVERHEAD
    assert raw not in encrypted and b'personal records' not in encrypted
    assert encrypted != protect_backup(raw, PASSWORD)
    assert unlock_backup(encrypted, PASSWORD) == raw
    assert protect_backup(raw) == raw == unlock_backup(raw)
    assert PASSWORD not in repr(ExportProtection(password=PASSWORD))
    for offset in [9, 25, 37, len(encrypted) - 1]:
        damaged = bytearray(encrypted)
        damaged[offset] ^= 1
        with pytest.raises(ProjectProtectionError) as error:
            unlock_backup(bytes(damaged), PASSWORD)
        assert error.value.detail['code'] == 'unlock_failed'


@pytest.mark.parametrize('password', ['', 'short', '1234567', '🔐' * 7, 'x' * 1025])
def test_export_password_validation(password):
    with pytest.raises(ProjectProtectionError) as error:
        protect_backup(b'PK data', password)
    assert error.value.detail['code'] == 'invalid_password'


@pytest.mark.parametrize('password', ['12345678', '🔐' * 8])
def test_eight_character_password_roundtrip(password):
    raw = b'PK project backup'
    assert unlock_backup(protect_backup(raw, password), password) == raw


@pytest.mark.parametrize('raw,code', [(MAGIC, 'invalid_backup'), (b'bad', 'invalid_backup'),
    (MAGIC + b'\x02' + b'0' * 44, 'unsupported_format')])
def test_invalid_envelopes(raw, code):
    with pytest.raises(ProjectProtectionError) as error:
        unlock_backup(raw, PASSWORD)
    assert error.value.detail['code'] == code


def test_size_limits_before_crypto(monkeypatch):
    from backend import project_encryption as encryption
    monkeypatch.setattr(encryption, 'MAX_BACKUP', 8)
    monkeypatch.setattr(encryption, 'MAX_UPLOAD', 8 + OVERHEAD)
    raw = b'PK123456'
    encrypted = protect_backup(raw, PASSWORD)
    assert unlock_backup(encrypted, PASSWORD) == raw
    for oversized in (raw + b'1', encrypted + b'1'):
        with pytest.raises(ProjectProtectionError):
            unlock_backup(oversized, PASSWORD)
    with pytest.raises(ProjectProtectionError):
        protect_backup(raw + b'1', PASSWORD)


def test_legal_encrypted_roundtrip_and_failures_preserve_workspace(environment):
    main, client, registry = environment
    original = main.legal_store
    files = copy.deepcopy(original.source_files)
    backup = client.post('/api/legal/backup?exportMonth=2026-Oct', json={'password': PASSWORD})
    assert backup.status_code == 200, backup.text
    assert backup.headers['content-disposition'].endswith('2026-Oct.intersos"')
    assert 'no-store' in backup.headers['cache-control']
    assert client.post('/api/legal/backup', json={}).content.startswith(b'PK')
    for data, code in [({}, 'password_required'), ({'password': 'wrong'}, 'unlock_failed')]:
        response = client.post('/api/legal/backups/restore', files={'file': ('backup.intersos', backup.content)}, data=data)
        assert response.status_code == 400, response.text
        assert response.json()['detail']['code'] == code
        assert main.legal_store is original and registry.exclusion_rows() == []
        assert not (main.REMEMBERED_LEGAL_FOLDER and main.REMEMBERED_LEGAL_FOLDER.name == 'backup.intersos')
    response = client.post('/api/legal/backups/restore', files={'file': ('renamed.zip', backup.content)}, data={'password': PASSWORD})
    assert response.status_code == 200, response.text
    assert main.legal_store.source_files == files
    assert main.legal_store is not original


def test_kobo_encrypted_roundtrip_preserves_sources_settings_and_failed_imports(tmp_path, sample):
    store = ProjectStore(tmp_path / 'encrypted.sqlite3')
    settings = KoboSettings(report={'title': 'Sensitive narrative', 'findings': 'Saved findings'})
    project = store.create('Confidential project', sample[0], b'original form', b'original source', settings)
    app = FastAPI()
    app.include_router(make_router(store))
    with TestClient(app) as client:
        backup = client.post(f'/api/kobo/projects/{project["id"]}/backup', json={'password': PASSWORD})
        assert backup.status_code == 200, backup.text
        assert b'Confidential project' not in backup.content
        assert client.get(f'/api/kobo/projects/{project["id"]}/backup').content.startswith(b'PK')
        for password, code in [(None, 'password_required'), ('wrong', 'unlock_failed')]:
            response = client.post('/api/kobo/backups/restore', files={'file': ('project.intersos', backup.content)}, data={} if password is None else {'password': password})
            assert response.json()['detail']['code'] == code
            assert len(store.list()) == 1
        response = client.post('/api/kobo/backups/restore', files={'file': ('project.intersos', backup.content)}, data={'password': PASSWORD})
        assert response.status_code == 200, response.text
        restored = store.get(response.json()['id'])
        assert restored['settings'] == project['settings']
        assert restored['records'] == project['records']
        assert store.sources(restored['id']) == (b'original form', b'original source')


def test_custom_encrypted_roundtrip_and_workspace_type_rejection(env):
    client, store = env
    project = confirm(client, stage(client, raw=b'Code,Age,City\n001,20,Mosul\n002,30,Baghdad\n'))
    original = store.get(project['id'])
    backup = client.post(f'/api/custom/projects/{project["id"]}/backup', json={'password': PASSWORD})
    assert backup.status_code == 200, backup.text
    bad = client.post('/api/kobo/backups/restore', files={'file': ('project.intersos', backup.content)}, data={'password': PASSWORD})
    assert bad.status_code == 400
    assert bad.json()['detail']['code'] == 'invalid_backup'
    assert len(store.list()) == 1
    response = client.post('/api/custom/backups/restore', files={'file': ('project.intersos', backup.content)}, data={'password': PASSWORD})
    assert response.status_code == 200, response.text
    restored = store.get(response.json()['id'])
    assert restored['customConfig'] == original['customConfig']
    assert restored['settings'] == original['settings']
    assert restored['records'] == original['records']
    assert store.sources(restored['id']) == store.sources(original['id'])


def test_cancelled_encrypted_legal_import_preserves_workspace(environment, monkeypatch):
    from backend.legal_platform import LegalStore
    from backend.legal_workspace import app_data_dir
    main, client, registry = environment
    previous = main.legal_store
    raw = client.post('/api/legal/backup', json={'password': PASSWORD}).content
    original = LegalStore.from_files.__func__

    def cancel_before_publication(cls, *args, **kwargs):
        candidate = original(cls, *args, **kwargs)
        kwargs['operation'].cancel()
        return candidate

    monkeypatch.setattr(LegalStore, 'from_files', classmethod(cancel_before_publication))
    response = client.post('/api/legal/backups/restore', files={'file': ('project.intersos', raw)}, data={'password': PASSWORD})
    assert response.status_code == 409
    assert main.legal_store is previous
    assert main.legal_import_tracker.status()['state'] == 'cancelled'
    assert registry.exclusion_rows() == [] and not app_data_dir().exists()
