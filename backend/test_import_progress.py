from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.import_progress import ImportOperation, ImportTracker, ImportBusyError, import_plan
from backend.legal_platform import LegalStore
from backend.test_legal_platform import required_payload


def test_progress_counts_real_work_and_reserves_publication():
    operation=ImportOperation()
    assert operation.snapshot()["percent"] is None
    operation.plan(["Reading:beneficiaries","Validating:beneficiaries","Publishing"])
    operation.start("Reading:beneficiaries")
    operation.finish("Reading:beneficiaries")
    operation.advance("Validating:beneficiaries",2,4)
    snapshot=operation.snapshot()
    assert snapshot["completedWork"]==1.5 and snapshot["totalWork"]==3 and snapshot["percent"]==50
    operation.advance("Validating:beneficiaries",1,4)
    assert operation.tasks["Validating:beneficiaries"]==.5
    with pytest.raises(ValueError,match="incomplete"):operation.complete()
    operation.finish("Validating:beneficiaries");operation.finish("Publishing")
    operation.complete()
    assert operation.snapshot()["percent"]==100


def test_progress_updates_are_throttled_and_errors_are_immediate():
    operation=ImportOperation();operation.plan(["Reading","Publishing"])
    with patch("backend.import_progress.monotonic",return_value=1):
        first=operation.snapshot();operation.finish("Reading")
        assert operation.snapshot()==first
    with patch("backend.import_progress.monotonic",return_value=1.21):
        assert operation.snapshot()["percent"]==50
        operation.fail("Invalid file")
        assert operation.snapshot()["error"]=="Invalid file"


def test_import_guard_and_operation_isolation():
    tracker=ImportTracker()
    first=tracker.begin(str(uuid4()))
    with pytest.raises(ImportBusyError,match="already in progress"):tracker.begin()
    with ThreadPoolExecutor(max_workers=3) as pool:
        assert all(result["operationId"]==first.operation_id for result in pool.map(lambda _:tracker.status(),range(3)))
    first.fail("Invalid file")
    second=tracker.begin(str(uuid4()))
    assert tracker.status(first.operation_id)["state"]=="idle"
    assert tracker.status()["operationId"]==second.operation_id


def test_native_folder_and_files_use_same_progress_plan(tmp_path,monkeypatch):
    from backend import main
    import desktop_launcher
    tracker=ImportTracker()
    monkeypatch.setattr(main,"legal_import_tracker",tracker)
    monkeypatch.setattr("backend.import_progress.legal_import_tracker",tracker)
    monkeypatch.setattr(main,"synchronize_duplicate_exclusions",lambda store:None)
    monkeypatch.setattr(desktop_launcher,"save_legal_folder",lambda path:None)
    monkeypatch.setattr(desktop_launcher,"save_legal_files",lambda paths:None)
    for name,raw in required_payload().items():(tmp_path/f"{name}.csv").write_bytes(raw)
    api=desktop_launcher.DesktopApi(None)
    first_id=str(uuid4());api.process_legal_folder(str(tmp_path),first_id)
    first=tracker.status(first_id)
    second_id=str(uuid4());api.process_legal_files([str(path) for path in tmp_path.glob('*.csv')],second_id)
    second=tracker.status(second_id)
    assert first["state"]==second["state"]=="complete"
    assert first["percent"]==second["percent"]==100
    assert first["totalWork"]==second["totalWork"]
    assert api.get_legal_import_progress()==100


def test_upload_status_failure_preserves_previous_store_and_is_uncached(monkeypatch):
    from backend import main
    tracker=ImportTracker();monkeypatch.setattr(main,"legal_import_tracker",tracker)
    previous=LegalStore.from_files(required_payload(),"previous")
    monkeypatch.setattr(main,"legal_store",previous)
    client=TestClient(main.app);operation_id=str(uuid4())
    response=client.post('/api/legal/upload?operationId='+operation_id,files=[('files',('beneficiaries.csv',b'Invalid\nvalue'))])
    assert response.status_code==400 and main.legal_store is previous
    status=client.get('/api/legal/import/status?operationId='+operation_id)
    assert 'no-store' in status.headers['cache-control']
    assert status.json()['state']=='error' and status.json()['percent']!=100
    tracker.begin()
    assert client.post('/api/legal/upload',files=[('files',('beneficiaries.csv',b'x'))]).status_code==409


def test_startup_restore_is_tracked_and_ready_only_after_publication(monkeypatch,tmp_path):
    from backend import main
    for name,raw in required_payload().items():(tmp_path/f"{name}.csv").write_bytes(raw)
    tracker=ImportTracker();monkeypatch.setattr(main,"legal_import_tracker",tracker)
    monkeypatch.setattr(main,"REMEMBERED_LEGAL_SOURCE_CONFIGURED",True)
    monkeypatch.setattr(main,"REMEMBERED_LEGAL_SOURCE","folder")
    monkeypatch.setattr(main,"REMEMBERED_LEGAL_FOLDER",tmp_path)
    monkeypatch.setattr(main,"legal_store",None)
    monkeypatch.setattr(main,"synchronize_duplicate_exclusions",lambda store:None)
    main.load_initial_legal_store()
    assert main.legal_store.metadata()["ready"] and not main.legal_store_loading
    assert tracker.status()["source"]=="startup" and tracker.status()["percent"]==100


def test_relationship_record_counts_and_empty_tasks():
    operation=ImportOperation();payload=required_payload()
    store=LegalStore.from_files(payload,'synthetic',operation=operation)
    assert operation.tasks['Checking relationships:assessments']==1
    assert operation.tasks['Preparing metadata']==1
    assert operation.tasks['Publishing']==0
    assert store._import_operation is None
    assert operation.snapshot()['percent']<100


def test_browser_upload_reconciles_before_preparation_and_publishes_once(monkeypatch):
    from backend import main
    tracker=ImportTracker();monkeypatch.setattr(main,"legal_import_tracker",tracker)
    previous=LegalStore.from_files(required_payload(),"previous")
    monkeypatch.setattr(main,"legal_store",previous)
    observed=[]
    def reconcile(candidate):
        assert main.legal_store is previous
        assert candidate._review_cache=={}
        assert tracker.status()["percent"]!=100
        candidate.set_review_exclusions([("Invalid age","B2")])
        observed.append(candidate)
    monkeypatch.setattr(main,"synchronize_duplicate_exclusions",reconcile)
    operation_id=str(uuid4())
    files=[('files',(name+'.csv',raw,'text/csv')) for name,raw in required_payload().items()]
    response=TestClient(main.app).post('/api/legal/upload?operationId='+operation_id,files=files)
    assert response.status_code==200
    assert len(observed)==1 and main.legal_store is observed[0]
    assert tracker.status(operation_id)["percent"]==100
    assert main.legal_store._review_cache
    with patch.object(main.legal_store,'_name_match_flags',side_effect=AssertionError('Review was not prepared')):
        main.legal_store.review('beneficiaries')
