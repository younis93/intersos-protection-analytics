"""Exercise the production queue and cancellation using generated records only."""
import copy
import json
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.check_kobo_excel_improvements import fixture
from backend.kobo_excel import ExportJobs
from backend.kobo_excel_runtime import create_excel


def wait_for(jobs, key, predicate, limit=60):
    began = time.monotonic(); longest = 0
    while time.monotonic()-began < limit:
        tick = time.perf_counter(); status = jobs.status(key)
        longest = max(longest, time.perf_counter()-tick)
        if predicate(status): return status, longest
        if status['state'] == 'error': raise AssertionError(status['message'])
        time.sleep(.05)
    raise AssertionError('Production job did not reach expected state')


def main():
    import pythoncom
    import win32api
    import win32event
    import win32process
    pythoncom.CoInitialize()
    unrelated = create_excel(); unrelated.Visible = False; unrelated.DisplayAlerts = False
    unrelated_handle = win32api.OpenProcess(0x100001, False, win32process.GetWindowThreadProcessId(unrelated.Hwnd)[1])
    jobs = ExportJobs()
    try:
        project, settings = fixture()
        large = copy.deepcopy(project)
        root = next(r for r in large['records'] if not r['scope'])
        large['records'].extend({**copy.deepcopy(root), 'id': f'generated-{i}', 'row': i+100} for i in range(3000))
        first = jobs.start(large, None, settings)['id']
        second = jobs.start(project, None, settings)['id']
        assert jobs.status(second)['state'] == 'queued'
        jobs.cancel(second)
        wait_for(jobs, second, lambda s: s['state'] == 'cancelled')
        state, latency = wait_for(jobs, first, lambda s: s.get('stage') == 'preparation' and s.get('preparationWorkers', 0) > 0)
        worker = jobs.jobs[first]['processPid']
        worker_handle = win32api.OpenProcess(0x100000, False, worker)
        tick = time.monotonic(); jobs.cancel(first); jobs.jobs[first]['thread'].join(15)
        assert not jobs.jobs[first]['thread'].is_alive()
        assert jobs.status(first)['state'] == 'cancelled'
        assert not jobs.jobs[first]['folder'].exists()
        assert win32event.WaitForSingleObject(worker_handle, 0) == 0
        assert win32event.WaitForSingleObject(unrelated_handle, 0) == 258
        worker_handle.Close()
        cancelled_seconds = time.monotonic()-tick
        startup = jobs.start(project, None, settings)['id']
        wait_for(jobs, startup, lambda s: s.get('stage') == 'excel_start')
        jobs.cancel(startup); jobs.jobs[startup]['thread'].join(25)
        assert not jobs.jobs[startup]['thread'].is_alive()
        assert jobs.status(startup)['state'] == 'cancelled'
        assert win32event.WaitForSingleObject(unrelated_handle, 0) == 258
        active_excel = jobs.start(project, None, settings)['id']
        wait_for(jobs, active_excel, lambda _: bool(jobs.jobs[active_excel].get('excelPid')))
        own_excel = win32api.OpenProcess(0x100000, False, jobs.jobs[active_excel]['excelPid'])
        jobs.cancel(active_excel); jobs.jobs[active_excel]['thread'].join(15)
        assert not jobs.jobs[active_excel]['thread'].is_alive()
        assert jobs.status(active_excel)['state'] == 'cancelled'
        assert win32event.WaitForSingleObject(own_excel, 5000) == 0
        assert win32event.WaitForSingleObject(unrelated_handle, 0) == 258
        own_excel.Close()
        completed = jobs.start(project, None, settings, question='group/gender')['id']
        status, final_latency = wait_for(jobs, completed, lambda s: s['state'] == 'complete', 120)
        jobs.jobs[completed]['thread'].join(10)
        assert jobs.download(completed).startswith(b'PK')
        assert status['completedQuestions'] == status['totalQuestions'] == 1
        assert status['stage'] == 'complete' and status['elapsedSeconds'] > 0
        return {'queuedCancellation': True, 'preparationCancellation': True,
                'excelCancellation': True,
                'startupCancellation': True,
                'unrelatedExcelPreserved': True, 'successfulProductionJob': True,
                'cancellationSeconds': round(cancelled_seconds, 3),
                'maxStatusCallSeconds': round(max(latency, final_latency), 4),
                'preparationWorkers': state['preparationWorkers']}
    finally:
        jobs.close(); unrelated.Quit()
        # This idle Excel instance belongs to the test itself. Some Office
        # add-ins retain it after Quit; release it after the isolation assertion.
        if win32event.WaitForSingleObject(unrelated_handle, 5000) == 258:
            win32api.TerminateProcess(unrelated_handle, 0)
        unrelated_handle.Close(); pythoncom.CoUninitialize()


if __name__ == '__main__': print(json.dumps(main(), indent=2), flush=True)
