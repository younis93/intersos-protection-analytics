from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.import_progress import ImportOperation, ImportTracker, ImportBusyError, import_plan
from backend.legal_platform import LegalStore
from backend.test_legal_platform import required_payload

@pytest.fixture(autouse=True)
def isolate_saved_exclusions(monkeypatch,tmp_path):
    from backend import main
    from backend.duplicate_exclusions import DuplicateExclusionRegistry
    monkeypatch.setattr(main,"duplicate_exclusions",DuplicateExclusionRegistry(tmp_path/"saved-exclusions.json"))


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
    monkeypatch.setattr(main,"prepare_import_exclusions",lambda store:None)
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
    monkeypatch.setattr(main,"prepare_import_exclusions",lambda store:None)
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
    monkeypatch.setattr(main,"prepare_import_exclusions",reconcile)
    operation_id=str(uuid4())
    files=[('files',(name+'.csv',raw,'text/csv')) for name,raw in required_payload().items()]
    response=TestClient(main.app).post('/api/legal/upload?operationId='+operation_id,files=files)
    assert response.status_code==200
    assert len(observed)==1 and main.legal_store is observed[0]
    assert tracker.status(operation_id)["percent"]==100
    assert main.legal_store._review_cache
    with patch.object(main.legal_store,'_name_match_flags',side_effect=AssertionError('Review was not prepared')):
        main.legal_store.review('beneficiaries')

@pytest.mark.parametrize('stage', ['Reading:beneficiaries', 'Parsing:beneficiaries', 'Cleaning:beneficiaries', 'Validating:beneficiaries', 'Preparing review:beneficiaries', 'Finalizing metadata'])
def test_cancelled_upload_never_publishes_and_allows_retry(stage,monkeypatch,tmp_path):
    from backend import main
    from backend.duplicate_exclusions import DuplicateExclusionRegistry
    tracker=ImportTracker();monkeypatch.setattr(main,'legal_import_tracker',tracker)
    previous=LegalStore.from_files(required_payload(),'previous')
    monkeypatch.setattr(main,'legal_store',previous)
    registry=DuplicateExclusionRegistry(tmp_path/'exclusions.json')
    registry.exclude_record('beneficiaries','Possible duplicate name','caseId','B1')
    monkeypatch.setattr(main,'duplicate_exclusions',registry)
    saved=registry.path.read_bytes()
    original=ImportOperation.start
    def start(operation,name):
        if name==stage: operation.cancel()
        return original(operation,name)
    monkeypatch.setattr(ImportOperation,'start',start)
    operation_id=str(uuid4())
    files=[('files',(name+'.csv',raw,'text/csv')) for name,raw in required_payload().items()]
    # Reading for HTTP upload is completed inside from_files without start().
    if stage.startswith('Reading:'):
        monkeypatch.setattr(ImportOperation,'plan',lambda operation,names: (operation.cancel(), operation.check_cancelled()))
    response=TestClient(main.app).post('/api/legal/upload?operationId='+operation_id,files=files)
    assert response.status_code==409
    assert tracker.status()['state']=='cancelled'
    assert main.legal_store is previous and registry.path.read_bytes()==saved
    tracker.begin(str(uuid4()))


def test_cancellation_is_operation_scoped_and_publication_wins_atomically(monkeypatch):
    from backend import main
    from backend.import_progress import ImportCancelled
    tracker=ImportTracker();monkeypatch.setattr(main,'legal_import_tracker',tracker)
    client=TestClient(main.app)
    operation_id=str(uuid4());operation=tracker.begin(operation_id)
    operation.plan(['Publishing'])
    assert client.post('/api/legal/import/cancel?operationId=invalid').status_code==400
    old_id=str(uuid4())
    assert client.post('/api/legal/import/cancel?operationId='+old_id).json()['state']=='cancelled'
    assert not operation.cancel_requested
    assert client.post('/api/legal/import/cancel?operationId='+operation_id).json()['state']=='cancelling'
    with pytest.raises(ImportBusyError):tracker.begin()
    with pytest.raises(ImportCancelled):operation.begin_publication()
    next_operation=tracker.begin(str(uuid4()));next_operation.plan(['Publishing']);next_operation.begin_publication()
    assert next_operation.cancel()['canCancel'] is False
    assert not next_operation.cancel_requested
    next_operation.finish('Publishing');next_operation.complete()
    assert next_operation.snapshot()['state']=='complete'
    # Cancellation before upload registration prevents any subsequent work.
    with pytest.raises(ImportCancelled):tracker.begin(old_id)


def test_native_cancel_preserves_remembered_source_and_startup_clears_loading(monkeypatch,tmp_path):
    from backend import main
    from backend.import_progress import ImportCancelled
    import desktop_launcher
    for name,raw in required_payload().items():(tmp_path/f'{name}.csv').write_bytes(raw)
    tracker=ImportTracker()
    monkeypatch.setattr(main,'legal_import_tracker',tracker)
    monkeypatch.setattr('backend.import_progress.legal_import_tracker',tracker)
    previous=LegalStore.from_files(required_payload(),'previous');monkeypatch.setattr(main,'legal_store',previous)
    remembered=[];monkeypatch.setattr(desktop_launcher,'save_legal_folder',lambda path:remembered.append(path))
    original=ImportOperation.start
    def start(operation,name):
        if name=='Preparing review:beneficiaries':operation.cancel()
        original(operation,name)
    monkeypatch.setattr(ImportOperation,'start',start)
    with pytest.raises(ImportCancelled):desktop_launcher.DesktopApi(None).process_legal_folder(str(tmp_path),str(uuid4()))
    assert remembered==[] and main.legal_store is previous
    monkeypatch.setattr(main,'REMEMBERED_LEGAL_SOURCE_CONFIGURED',True)
    monkeypatch.setattr(main,'REMEMBERED_LEGAL_SOURCE','folder')
    monkeypatch.setattr(main,'REMEMBERED_LEGAL_FOLDER',tmp_path)
    main.load_initial_legal_store()
    assert tracker.status()['state']=='cancelled' and not main.legal_store_loading
    assert main.legal_store is previous and main.legal_store_restore_error==''


def test_exclusion_reconciliation_is_deferred_until_commit(monkeypatch,tmp_path):
    from backend import main
    from backend.duplicate_exclusions import DuplicateExclusionRegistry
    registry=DuplicateExclusionRegistry(tmp_path/'exclusions.json')
    registry.exclude_record('beneficiaries','Possible duplicate name','caseId','B1')
    monkeypatch.setattr(main,'duplicate_exclusions',registry)
    saved=registry.path.read_bytes()
    class Candidate:
        def duplicate_contexts_for_exclusions(self,rows):
            return {('beneficiaries','Possible duplicate name','caseId','B1'):{'members':['B1','B2'],'settings':{}}}
        def set_review_exclusions(self,rows):self.rows=rows
    candidate=Candidate();main.prepare_import_exclusions(candidate)
    assert registry.path.read_bytes()==saved
    assert candidate.rows[0]['duplicateContext']['members']==['B1','B2']
    candidate._commit_import_exclusions()
    assert registry.path.read_bytes()!=saved


def test_cancellation_interrupts_record_batches_without_affecting_other_queries():
    import pandas as pd
    from backend.legal_platform import cancellable_import, source_records
    from backend.import_progress import ImportCancelled
    operation=ImportOperation();visited=[]
    @cancellable_import
    def consume(*,operation):
        for index,_row in source_records(pd.DataFrame({'ID':range(600)})):
            visited.append(index)
            if index==10:operation.cancel()
    with pytest.raises(ImportCancelled):consume(operation=operation)
    assert visited[-1]==255
    assert len(list(source_records(pd.DataFrame({'ID':[1,2]}))))==2
