"""Audit project ZIP round trips using temporary copies, never live imports.

Only counts and preservation checks are written to the report.
"""
import argparse
import gc
import hashlib
import json
import os
import sqlite3
import sys
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend import legal_processing_cache, legal_workspace, kobo_workspace
from backend.duplicate_exclusions import DuplicateExclusionRegistry
from backend.kobo import ProjectStore
from backend.kobo_api import make_router
from backend.legal_platform import LegalStore


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def project_rows(db):
    return db.execute('SELECT id,name,payload,settings,form,data FROM projects ORDER BY id').fetchall()


def audit_saved_projects(path, temporary, prefix):
    if not path.exists():
        return {'available': False, 'projects_checked': 0}
    copy_path = temporary / (prefix.rsplit('/', 1)[-1] + '.sqlite3')
    with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)) as source:
        before = project_rows(source)
        with closing(sqlite3.connect(copy_path)) as destination:
            source.backup(destination)
    store = ProjectStore(copy_path)
    app = FastAPI()
    with patch('backend.kobo_api.cleanup_export_folders'):
        app.include_router(make_router(store, prefix=prefix))
    records = values = identifying = hidden = 0
    with TestClient(app) as client:
        for pid, name, payload_raw, settings_raw, form_raw, data_raw in before:
            payload = json.loads(payload_raw)
            settings = json.loads(settings_raw)
            response = client.get(f'{prefix}/projects/{pid}/backup')
            assert response.status_code == 200, 'Project export failed'
            restored_response = client.post(f'{prefix}/backups/restore', files={'file': ('project.zip', response.content)})
            assert restored_response.status_code == 200, 'Project import failed'
            restored_id = restored_response.json()['id']
            assert restored_id != pid
            with store.connect() as db:
                restored_name, restored_payload, restored_form, restored_data = db.execute(
                    'SELECT name,payload,form,data FROM projects WHERE id=?', (restored_id,)).fetchone()
                original = db.execute('SELECT id,name,payload,settings,form,data FROM projects WHERE id=?', (pid,)).fetchone()
            assert original == (pid, name, payload_raw, settings_raw, form_raw, data_raw), 'Import changed an existing project'
            assert restored_name == name
            assert json.loads(restored_payload) == payload, 'Import changed saved data'
            assert bytes(restored_form) == bytes(form_raw) and bytes(restored_data) == bytes(data_raw), 'Import changed original uploads'
            records += len(payload['records'])
            values += sum(len(record['values']) for record in payload['records'])
            identifying += sum(bool(question.get('identifying')) for question in payload['form']['questions'])
            hidden += len(settings.get('hidden', []))
        assert len(store.list()) == len(before) * 2
    with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)) as source:
        assert project_rows(source) == before, 'Saved project database changed during audit'
    return {'available': True, 'projects_checked': len(before), 'records_checked': records,
            'field_values_checked': values, 'identifying_fields_checked': identifying,
            'hidden_fields_checked': hidden, 'all_payload_fields_preserved': True,
            'original_upload_bytes_preserved': True, 'existing_projects_unchanged': True,
            'live_database_unchanged': True}


def audit_legal(folder, temporary):
    if not folder.is_dir():
        return {'available': False}
    original_hashes = {path.name: digest(path.read_bytes()) for path in folder.glob('*.csv')}
    legal_processing_cache.cache_directory = lambda: temporary / 'processing-cache'
    original = LegalStore.from_folder(folder)
    archive = legal_workspace.backup_project(original, [])
    payload, exclusions = legal_workspace.read_backup(archive)
    assert payload == original.source_files, 'Backup changed original CSV bytes'
    restored = LegalStore.from_files(payload, 'Temporary imported project', exclusions=exclusions)
    for dataset in original.frames:
        pd.testing.assert_frame_equal(original.frames[dataset], restored.frames[dataset])
    # Exercise the managed-folder persistence used by a real Legal import.
    with patch.object(legal_workspace, 'app_data_dir', return_value=temporary / 'legal-workspace'):
        registry = DuplicateExclusionRegistry(temporary / 'decisions.json')
        imported_folder = legal_workspace.persist_restored_project(payload, exclusions, registry)
        restarted = LegalStore.from_folder(imported_folder)
        for dataset in original.frames:
            pd.testing.assert_frame_equal(original.frames[dataset], restarted.frames[dataset])
        assert restarted.source_files == original.source_files
    for path in folder.glob('*.csv'):
        assert digest(path.read_bytes()) == original_hashes[path.name], 'Original source changed'
    assert set(original_hashes) == {path.name for path in folder.glob('*.csv')}
    return {'available': True, 'datasets_checked': len(original.frames),
            'rows_checked': sum(len(frame) for frame in original.frames.values()),
            'all_csv_bytes_preserved': True, 'all_processed_fields_preserved': True,
            'all_fields_preserved_after_restart': True, 'original_folder_unchanged': True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--legal-source', type=Path, default=Path('C:/Legal Platform'))
    parser.add_argument('--output', type=Path, default=Path('output/performance/project-backup-integrity.json'))
    args = parser.parse_args()
    root = Path(os.getenv('LOCALAPPDATA', str(Path.home()))) / 'INTERSOS Legal Platform'
    settings = root / 'settings.json'
    settings_before = settings.read_bytes() if settings.exists() else None
    with TemporaryDirectory(prefix='project-backup-audit-') as directory:
        temporary = Path(directory)
        report = {'legal': audit_legal(args.legal_source, temporary),
                  'kobo': audit_saved_projects(root / 'kobo-projects.sqlite3', temporary, '/api/kobo'),
                  'custom': audit_saved_projects(root / 'custom-projects.sqlite3', temporary, '/api/custom')}
        # sqlite3 transaction contexts do not close their connections. Release
        # temporary store connection cycles before Windows removes the files.
        gc.collect()
    assert (settings.read_bytes() if settings.exists() else None) == settings_before
    report['live_source_preferences_unchanged'] = True
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
