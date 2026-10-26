import io
import json
import zipfile
from uuid import uuid4

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend import legal_workspace as workspace
from backend.duplicate_exclusions import DuplicateExclusionRegistry
from backend.import_progress import ImportTracker
from backend.legal_platform import LegalStore
from backend.test_legal_platform import csv, required_payload


def full_payload():
    return {**required_payload(),
        'followupslogbooks': csv(**{'Follow-ups & Logbook ID': ['F1'], 'Service ID': ['S1']}),
        'legalfees': csv(**{'Fee ID': ['L1'], 'Legal Service ID': ['S1']}),
        'awareness': csv(**{'Awareness ID': ['W1'], 'Name': ['شخص']}),
        'deportationrecords': csv(**{'PN ID': ['D1']}),
        'legalhotlines': csv(**{'Record Identifier': ['H1']})}


@pytest.fixture
def environment(monkeypatch, tmp_path):
    from backend import main
    monkeypatch.setenv('LOCALAPPDATA', str(tmp_path))
    registry = DuplicateExclusionRegistry(tmp_path / 'exclusions.json')
    monkeypatch.setattr(main, 'duplicate_exclusions', registry)
    monkeypatch.setattr(main, 'legal_import_tracker', ImportTracker())
    monkeypatch.setattr(main, 'legal_store', LegalStore.from_files(required_payload(), 'previous'))
    # Restore these module globals after tests, including assignments inside restore.
    for name in ('REMEMBERED_LEGAL_FOLDER', 'REMEMBERED_LEGAL_SOURCE', 'REMEMBERED_LEGAL_SOURCE_CONFIGURED'):
        monkeypatch.setattr(main, name, getattr(main, name))
    return main, TestClient(main.app), registry


def test_roundtrip_all_datasets_decisions_and_restart(environment, tmp_path):
    main, client, registry = environment
    payload = full_payload()
    decision = {'dataset': 'beneficiaries', 'rule': 'Possible duplicate name',
        'identifierType': 'caseId', 'identifierValue': 'B1', 'caseId': 'B1', 'pendingRecheck': False,
        'name': 'أحمد', 'source': 'Review'}
    original = LegalStore.from_files(payload, 'original', exclusions=[decision])
    main.legal_store = original
    registry._write([decision])
    root = workspace.app_data_dir()
    root.mkdir(parents=True)
    (root / 'settings.json').write_text(json.dumps({'startupPage': 'legal', 'indicatorMaster': 'keep.xlsx'}))
    response = client.get('/api/legal/backup?exportMonth=2026-Oct')
    assert response.status_code == 200, response.text
    assert response.headers['content-disposition'] == 'attachment; filename="Legal Platform export 2026-Oct.zip"'
    assert 'no-store' in response.headers['cache-control']
    assert workspace.read_backup(response.content) == (payload, [decision])
    registry._write([])
    operation_id = str(uuid4())
    master = main.indicator_master
    restored = client.post('/api/legal/backups/restore?operationId=' + operation_id,
        files={'file': ('project.zip', response.content)})
    assert restored.status_code == 200, restored.text
    assert restored.json()['revision'] != original.revision
    assert restored.json()['sheets'] == original.metadata()['sheets']
    assert restored.json()['reviewCounts'] == original.metadata()['reviewCounts']
    for name in payload:
        pd.testing.assert_frame_equal(main.legal_store.frames[name], original.frames[name])
    assert registry.exclusion_rows() == [decision]
    assert main.indicator_master is master
    assert main.legal_import_tracker.status(operation_id)['state'] == 'complete'
    settings = json.loads((root / 'settings.json').read_text())
    assert settings['startupPage'] == 'legal' and settings['indicatorMaster'] == 'keep.xlsx'
    folder = main.REMEMBERED_LEGAL_FOLDER
    assert settings['legalFolder'] == str(folder) and settings['legalSource'] == 'folder'
    assert {path.stem: path.read_bytes() for path in folder.iterdir()} == payload
    main.legal_store = None
    main.load_initial_legal_store()
    assert main.legal_store.source_files == payload
    assert main.legal_store.metadata()['reviewCounts'] == original.metadata()['reviewCounts']


@pytest.mark.parametrize('dataset', ['awareness', 'deportationrecords', 'legalhotlines'])
def test_independent_dataset_restores(environment, dataset):
    main, client, _ = environment
    payload = {dataset: full_payload()[dataset]}
    raw = workspace.backup_project(LegalStore.from_files(payload, 'independent'), [])
    restored = client.post('/api/legal/backups/restore', files={'file': ('project.zip', raw)})
    assert restored.status_code == 200, restored.text
    assert main.legal_store.source_files == payload
    assert restored.json()['availability'][dataset]


def rewrite(raw, change):
    with zipfile.ZipFile(io.BytesIO(raw)) as source:
        files = [(name, source.read(name)) for name in source.namelist()]
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as target:
        for name, value in change(files):
            target.writestr(name, value)
    return output.getvalue()


@pytest.mark.parametrize('mode', ['corrupt', 'checksum', 'version', 'format', 'duplicate', 'path', 'missing', 'malformed'])
def test_invalid_archives_preserve_workspace(environment, mode):
    main, client, registry = environment
    previous = main.legal_store
    registry._write([])
    before = registry.path.read_bytes()
    raw = workspace.backup_project(previous, [])
    if mode == 'corrupt': raw = b'not a ZIP'
    elif mode == 'checksum': raw = rewrite(raw, lambda files: [(name, b'changed' if name.endswith('.csv') else value) for name, value in files])
    elif mode in {'version', 'format', 'malformed'}:
        def change(files):
            for name, value in files:
                if name == 'manifest.json':
                    manifest = json.loads(value)
                    if mode == 'malformed': manifest = []
                    else: manifest[mode] = 99 if mode == 'version' else 'intersos-kobo-backup'
                    value = json.dumps(manifest).encode()
                yield name, value
        raw = rewrite(raw, change)
    elif mode == 'duplicate':
        with pytest.warns(UserWarning): raw = rewrite(raw, lambda files: files + [files[0]])
    elif mode == 'path': raw = rewrite(raw, lambda files: files + [('../outside.csv', b'x')])
    elif mode == 'missing': raw = rewrite(raw, lambda files: [(name, value) for name, value in files if name != 'exclusions.json'])
    response = client.post('/api/legal/backups/restore', files={'file': ('bad.zip', raw)})
    assert response.status_code == 400, response.text
    assert main.legal_store is previous and registry.path.read_bytes() == before
    assert not (workspace.app_data_dir() / 'settings.json').exists()


def test_invalid_csv_preserves_workspace(environment):
    main, client, _ = environment
    previous = main.legal_store
    # Valid manifest and checksums, but invalid source schema.
    previous.source_files = {name: b'Invalid\nvalue' for name in previous.frames}
    raw = workspace.backup_project(previous, [])
    response = client.post('/api/legal/backups/restore', files={'file': ('invalid.zip', raw)})
    assert response.status_code == 400 and main.legal_store is previous


def test_cancelled_and_busy_imports_preserve_workspace(environment, monkeypatch):
    main, client, registry = environment
    previous = main.legal_store
    raw = workspace.backup_project(previous, [])
    before = registry.exclusion_rows()
    original = LegalStore.from_files.__func__
    def cancel_before_publication(cls, *args, **kwargs):
        candidate = original(cls, *args, **kwargs)
        kwargs['operation'].cancel()
        return candidate
    monkeypatch.setattr(LegalStore, 'from_files', classmethod(cancel_before_publication))
    response = client.post('/api/legal/backups/restore', files={'file': ('project.zip', raw)})
    assert response.status_code == 409 and main.legal_store is previous
    assert main.legal_import_tracker.status()['state'] == 'cancelled'
    assert registry.exclusion_rows() == before and not workspace.app_data_dir().exists()
    main.legal_import_tracker.begin()
    assert client.post('/api/legal/backups/restore', files={'file': ('project.zip', raw)}).status_code == 409


def test_persistence_failure_rolls_back(environment, monkeypatch):
    main, client, registry = environment
    previous = main.legal_store
    registry._write([])
    before = registry.path.read_bytes()
    raw = workspace.backup_project(previous, [])
    atomic = workspace.atomic_bytes
    def fail_settings(path, value):
        if path.name == 'settings.json': raise OSError('Disk write failed')
        atomic(path, value)
    monkeypatch.setattr(workspace, 'atomic_bytes', fail_settings)
    response = client.post('/api/legal/backups/restore', files={'file': ('project.zip', raw)})
    assert response.status_code == 400 and main.legal_store is previous
    assert registry.path.read_bytes() == before
    assert not list((workspace.app_data_dir() / 'restored-projects').iterdir())


def test_original_bytes_survive_source_changes(tmp_path):
    payload = required_payload()
    for name, raw in payload.items(): (tmp_path / f'{name}.csv').write_bytes(raw)
    store = LegalStore.from_folder(tmp_path)
    (tmp_path / 'beneficiaries.csv').write_bytes(b'changed')
    assert workspace.read_backup(workspace.backup_project(store, []))[0] == payload


def test_backup_restore_preserves_beneficiary_identity_and_both_contacts(environment):
    main, client, _ = environment
    payload = full_payload()
    beneficiaries = pd.read_csv(io.BytesIO(payload['beneficiaries']), dtype=object)
    beneficiaries.loc[0, 'Name (Filter Color Red)'] = 'اسم تجريبي للحفظ'
    beneficiaries.loc[0, 'Contact Number / رقم الاتصال'] = '07501234567'
    beneficiaries.loc[0, 'Secondary Contact Number / رقم الاتصال الثانوي'] = '07701234567'
    beneficiaries.loc[0, 'ID Number'] = '00001234'
    payload['beneficiaries'] = beneficiaries.to_csv(index=False).encode('utf-8-sig')
    original = LegalStore.from_files(payload, 'Identity preservation fixture')
    main.legal_store = original
    backup = client.get('/api/legal/backup')
    assert backup.status_code == 200
    assert main.legal_store is original
    assert workspace.read_backup(backup.content)[0] == payload
    restored = client.post('/api/legal/backups/restore', files={'file': ('project.zip', backup.content)})
    assert restored.status_code == 200, restored.text
    assert main.legal_store.source_files == payload
    pd.testing.assert_frame_equal(main.legal_store.frames['beneficiaries'], original.frames['beneficiaries'])
    main.load_initial_legal_store()
    pd.testing.assert_frame_equal(main.legal_store.frames['beneficiaries'], original.frames['beneficiaries'])


def test_archive_and_csv_size_limits(environment, monkeypatch):
    main, client, _ = environment
    previous = main.legal_store
    raw = workspace.backup_project(previous, [])
    monkeypatch.setattr(workspace, 'MAX_BACKUP', len(raw) - 1)
    with pytest.raises(ValueError, match='200 MB'): workspace.read_backup(raw)
    assert client.post('/api/legal/backups/restore', files={'file': ('large.zip', raw)}).status_code == 413
    monkeypatch.setattr(workspace, 'MAX_BACKUP', 200 * 1024 * 1024)
    monkeypatch.setattr(workspace, 'MAX_CSV', 1)
    with pytest.raises(ValueError, match='100 MB'): workspace.read_backup(raw)
    assert main.legal_store is previous


def test_export_requires_workspace_and_valid_month(environment):
    main, client, _ = environment
    assert client.get('/api/legal/backup?exportMonth=2026-October').status_code == 422
    main.legal_store = None
    assert client.get('/api/legal/backup').status_code == 409


def test_expanded_archive_size_limit(environment, monkeypatch):
    main, _, _ = environment
    main.legal_store.source_files['beneficiaries'] = b'a' * 50000
    raw = workspace.backup_project(main.legal_store, [])
    monkeypatch.setattr(workspace, 'MAX_BACKUP', len(raw) + 1)
    with pytest.raises(ValueError, match='expanded size'): workspace.read_backup(raw)


def test_invalid_exclusions_with_valid_checksums(environment):
    import hashlib
    main, client, _ = environment
    previous = main.legal_store
    raw = workspace.backup_project(previous, [])
    def change(files):
        files = dict(files)
        files['exclusions.json'] = b'[{"dataset":"unknown"}]'
        manifest = json.loads(files['manifest.json'])
        manifest['checksums']['exclusions.json'] = hashlib.sha256(files['exclusions.json']).hexdigest()
        files['manifest.json'] = json.dumps(manifest).encode()
        return files.items()
    response = client.post('/api/legal/backups/restore', files={'file': ('project.zip', rewrite(raw, change))})
    assert response.status_code == 400 and main.legal_store is previous
