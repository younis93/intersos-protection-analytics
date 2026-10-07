import io
from itertools import combinations

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.hotline import dashboard
from backend.import_progress import ImportOperation, ImportTracker, import_plan
from backend.legal_platform import INDEPENDENT, MANDATORY, LegalStore
from backend.send_issues import collect_findings
from backend.test_legal_platform import csv, required_payload

CONFIGURATIONS = [subset for size in range(1, 4) for subset in combinations(INDEPENDENT, size)]


def independent_payload():
    return {
        'awareness': csv(**{'Awareness ID': ['W1', 'W2'], 'Participant Name': ['Same Person'] * 2,
                            'Session Topic': ['Documentation'] * 2, 'Phone Number': ['123'] * 2,
                            'Date of Session': ['05/01/2026', '06/02/2026'], 'Project': ['Other Project'] * 2}),
        'deportationrecords': csv(**{'PN ID': ['D1', 'D2'], 'Date of deporting': ['05/01/2026', '06/02/2026'],
                                     'Nationality': ['Syrian', 'Iraqi']}),
        'legalhotlines': csv(**{'Hotline ID': ['H1', 'H2'], 'Contact Date': ['1/5/2026', '2/6/2026'],
                                'Priority': ['Low', 'High']}),
    }


@pytest.mark.parametrize('datasets', CONFIGURATIONS)
@pytest.mark.parametrize('mode', ['files', 'folder'])
def test_independent_imports_and_exports(datasets, mode, tmp_path):
    payload = {name: independent_payload()[name] for name in datasets}
    if mode == 'folder':
        for name, raw in payload.items():
            (tmp_path / f'{name}.csv').write_bytes(raw)
        store = LegalStore.from_folder(tmp_path)
    else:
        store = LegalStore.from_files(payload, 'standalone')
    metadata = store.metadata()
    assert metadata['ready'] and metadata['overview'] is None
    assert not any(metadata['availability'][name] for name in MANDATORY)
    assert metadata['features']['awareness'] == ('awareness' in datasets)
    assert metadata['features']['deportation'] == ('deportationrecords' in datasets)
    assert metadata['features']['detention'] is False
    for name in datasets:
        assert store.explorer(name)['total'] == 2
        assert len(pd.read_excel(io.BytesIO(store.explorer_export(name)))) == 2
        identifier = {'awareness': 'W1', 'deportationrecords': 'D1', 'legalhotlines': 'H1'}[name]
        assert store.explorer(name, search=identifier)['total'] == 1
        assert len(pd.read_excel(io.BytesIO(store.explorer_export(name, search=identifier)))) == 1
    if 'awareness' in datasets:
        assert store.review('awareness')['ruleCounts']['Duplicate participant in session'] == 2
        assert store.review('awareness', rule='Duplicate participant in session', date='2026-01')['total'] == 1
        assert metadata['reviewCounts']['awareness'] > 0
    if 'deportationrecords' in datasets:
        assert store.deportation_dashboard({'Nationality': ['Syrian']})['total'] == 1
        assert store.explorer('deportationrecords', search='D1')['total'] == 1
    if 'legalhotlines' in datasets:
        assert dashboard(store.frames['legalhotlines'], {'Priority': ['Low']})['total'] == 1
    collect_findings(store)


@pytest.mark.parametrize('core_subset', [subset for size in (1, 2) for subset in combinations(MANDATORY, size)])
def test_partial_core_does_not_prepare_core_reviews(core_subset, monkeypatch):
    original = LegalStore.review
    reviewed = []

    def review(self, dataset, *args, **kwargs):
        reviewed.append(dataset)
        assert dataset not in MANDATORY
        return original(self, dataset, *args, **kwargs)

    monkeypatch.setattr(LegalStore, 'review', review)
    payload = independent_payload()
    payload.update({name: required_payload()[name] for name in core_subset})
    operation = ImportOperation()
    store = LegalStore.from_files(payload, 'partial', operation=operation)
    collect_findings(store)
    assert 'awareness' in reviewed
    for task in operation.tasks:
        if task.startswith(('Reading:', 'Parsing:', 'Cleaning:', 'Validating:', 'Preparing review:')) or task in {'Applying exclusions', 'Preparing metadata'}:
            assert operation.tasks[task] == 1
    assert not any(f'Preparing review:{name}' in import_plan(payload) for name in MANDATORY)


@pytest.mark.parametrize('payload', [{}, {'unknown': b'x\n1'}, {'legalfees': b'x\n1'}, {'beneficiaries': required_payload()['beneficiaries']}])
def test_import_requires_independent_dataset_or_complete_core(payload):
    with pytest.raises(ValueError, match='Missing mandatory files'):
        LegalStore.from_files(payload, 'invalid')


def test_partial_core_still_validates_required_columns():
    payload = independent_payload()
    payload['beneficiaries'] = b'Case ID\nB1'
    with pytest.raises(ValueError, match='missing required columns'):
        LegalStore.from_files(payload, 'invalid')


@pytest.mark.parametrize('include_partial_core', [False, True])
def test_saved_core_exclusions_do_not_require_absent_relationships(include_partial_core):
    payload = independent_payload()
    if include_partial_core:
        payload.update({name: required_payload()[name] for name in ('beneficiaries', 'assessments')})
    exclusions = [
        {'dataset': 'beneficiaries', 'rule': 'Possible duplicate name', 'identifierType': 'caseId', 'identifierValue': 'B1'},
        {'dataset': 'assessments', 'rule': 'Selected month with previous assessment', 'identifierType': 'assessmentId', 'identifierValue': 'A1'},
        {'dataset': 'legalservices', 'rule': 'Current and previous month duplicate', 'identifierType': 'serviceId', 'identifierValue': 'S1'},
    ]
    store = LegalStore.from_files(payload, 'restored', exclusions=exclusions,
                                reconcile_exclusions=lambda candidate: candidate.duplicate_contexts_for_exclusions(exclusions))
    assert store.duplicate_contexts_for_exclusions(exclusions) == {}


@pytest.mark.parametrize('datasets', CONFIGURATIONS)
def test_browser_upload_replaces_core_source_and_completes_progress(datasets, monkeypatch):
    from backend import main
    tracker = ImportTracker()
    monkeypatch.setattr(main, 'legal_import_tracker', tracker)
    monkeypatch.setattr(main, 'legal_store', LegalStore.from_files(required_payload(), 'previous'))
    monkeypatch.setattr(main, 'synchronize_duplicate_exclusions', lambda store: None)
    files = [('files', (name + '.csv', independent_payload()[name], 'text/csv')) for name in datasets]
    client = TestClient(main.app)
    response = client.post('/api/legal/upload', files=files)
    assert response.status_code == 200, response.text
    assert response.json()['ready'] and response.json()['overview'] is None
    assert tracker.status()['state'] == 'complete' and tracker.status()['percent'] == 100
    assert set(main.legal_store.frames) == set(datasets)
    assert client.get('/api/legal/metadata').json()['availability'] == response.json()['availability']


@pytest.mark.parametrize('datasets', CONFIGURATIONS)
def test_native_import_and_startup_restore(datasets, monkeypatch, tmp_path):
    from backend import main
    import desktop_launcher
    tracker = ImportTracker()
    monkeypatch.setattr(main, 'legal_import_tracker', tracker)
    monkeypatch.setattr('backend.import_progress.legal_import_tracker', tracker)
    monkeypatch.setattr(main, 'legal_store', None)
    monkeypatch.setattr(main, 'synchronize_duplicate_exclusions', lambda store: None)
    monkeypatch.setattr(desktop_launcher, 'save_legal_folder', lambda path: None)
    monkeypatch.setattr(desktop_launcher, 'save_legal_files', lambda paths: None)
    for name in datasets:
        (tmp_path / f'{name}.csv').write_bytes(independent_payload()[name])
    api = desktop_launcher.DesktopApi(None)
    api.process_legal_folder(str(tmp_path))
    assert tracker.status()['percent'] == 100 and tracker.status()['state'] == 'complete'
    api.process_legal_files([str(path) for path in tmp_path.glob('*.csv')])
    assert tracker.status()['percent'] == 100 and tracker.status()['state'] == 'complete'
    monkeypatch.setattr(main, 'REMEMBERED_LEGAL_SOURCE_CONFIGURED', True)
    monkeypatch.setattr(main, 'REMEMBERED_LEGAL_SOURCE', 'folder')
    monkeypatch.setattr(main, 'REMEMBERED_LEGAL_FOLDER', tmp_path)
    main.load_initial_legal_store()
    assert main.legal_store.metadata()['ready'] and not main.legal_store_loading
    assert set(main.legal_store.frames) == set(datasets)
    assert tracker.status()['percent'] == 100
