"""Export stage telemetry and progress-aware deadlines."""
import os
import time
import json

EXPORT_IDLE_SECONDS = 600
EXPORT_MAX_SECONDS = 3600


def create_process_job(name):
    import win32job
    handle = win32job.CreateJobObject(None, name)
    limits = win32job.QueryInformationJobObject(handle, win32job.JobObjectExtendedLimitInformation)
    limits['BasicLimitInformation']['LimitFlags'] |= win32job.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    win32job.SetInformationJobObject(handle, win32job.JobObjectExtendedLimitInformation, limits)
    return handle


def assign_to_job(job, pid):
    import win32api, win32job
    handle = win32api.OpenProcess(0x101, False, pid)
    try: win32job.AssignProcessToJobObject(job, handle)
    finally: handle.Close()


def create_excel():
    """Use generated dispatch to avoid repeated remote type discovery per cell."""
    import win32com.client
    excel = win32com.client.DispatchEx('Excel.Application')
    try:
        library, _ = excel._oleobj_.GetTypeInfo().GetContainingTypeLib()
        guid, lcid, _, major, minor, _ = library.GetLibAttr()
        win32com.client.gencache.EnsureModule(guid, lcid, major, minor)
        return win32com.client.Dispatch(excel._oleobj_)
    except (AttributeError, ImportError, OSError, RuntimeError):
        import win32com.client.dynamic
        return win32com.client.dynamic.Dispatch(excel._oleobj_)


def peak_memory_bytes():
    if os.name != 'nt': return 0
    import win32api
    import win32process
    return int(win32process.GetProcessMemoryInfo(win32api.GetCurrentProcess()).get('PeakWorkingSetSize', 0))


class ExportProgress:
    def __init__(self, messages, diagnostics=None):
        self.messages = messages; self.started = self.changed = time.monotonic()
        self.current = 'analysis'; self.timings = {}; self.completed = 0; self.total = 0
        self.query_timings = {}
        self.diagnostics = diagnostics

    def begin(self, stage, progress=None, message=None, **extra):
        now = time.monotonic()
        self.timings[self.current] = self.timings.get(self.current, 0) + now-self.changed
        self.current = stage; self.changed = now
        self.put({**extra, **({'progress': progress} if progress is not None else {}), **({'message': message} if message else {})})

    def put(self, update):
        if 'querySeconds' in update: self.query_timings = dict(update['querySeconds'])
        now = time.monotonic()
        timing = dict(self.timings); timing[self.current] = timing.get(self.current, 0)+now-self.changed
        value = {'stage': self.current, 'elapsedSeconds': round(now-self.started, 2),
                           'stageSeconds': {key: round(value, 3) for key, value in timing.items()},
                           'completedQuestions': self.completed, 'totalQuestions': self.total,
                           'peakMemoryBytes': peak_memory_bytes(), **update}
        if self.diagnostics:
            # Only aggregate timing and resource metadata is persisted here.
            self.diagnostics.write_text(json.dumps({key: value[key] for key in
                ('stage', 'elapsedSeconds', 'stageSeconds', 'completedQuestions', 'totalQuestions', 'peakMemoryBytes')}, indent=2), encoding='utf-8')
        self.messages.put(value)


def timeout_message(now, began, last_progress, stage):
    if now-began > EXPORT_MAX_SECONDS:
        return f'Excel export exceeded the sixty-minute limit during {stage}.'
    if now-last_progress > EXPORT_IDLE_SECONDS:
        return f'Excel export made no progress for ten minutes during {stage}. Retry the export or review the stage timings.'
    return None
