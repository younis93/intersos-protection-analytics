"""Read-only saved-project benchmark. Generated workbooks contain project data.

Only aggregate timings/counts are printed; the saved project is never modified.
"""
import argparse
import json
import os
import sqlite3
import sys
import time
import hashlib
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.kobo import KoboSettings, analyze
from backend.kobo_excel import excel_worker
from backend.kobo_excel_runtime import create_process_job


class Monitor:
    def __init__(self):
        self.last = {}; self.error = None; self.excel_handle = None
        self.peak_excel = 0; self.last_count = -1

    def put(self, update):
        import win32api, win32process
        self.last.update(update)
        if update.get('excelPid'):
            self.excel_handle = win32api.OpenProcess(0x410, False, update['excelPid'])
        if self.excel_handle:
            try: self.peak_excel = max(self.peak_excel, win32process.GetProcessMemoryInfo(self.excel_handle)['PeakWorkingSetSize'])
            except Exception: pass
        if update.get('error'): self.error = update['error']
        count = update.get('completedQuestions', 0)
        if count != self.last_count and count % 10 == 0:
            print(json.dumps({'stage': update.get('stage'), 'completed': count, 'seconds': update.get('elapsedSeconds')}), flush=True)
            self.last_count = count

    def close(self):
        if self.excel_handle: self.excel_handle.Close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', default='Household Assessment 2026')
    parser.add_argument('--runs', type=int, default=3)
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--first-multi', action='store_true')
    parser.add_argument('--output', type=Path, default=ROOT/'output/kobo-project-performance')
    args = parser.parse_args()
    path = Path(os.getenv('INTERSOS_KOBO_DB', str(Path(os.environ['LOCALAPPDATA'])/'INTERSOS Legal Platform/kobo-projects.sqlite3')))
    with sqlite3.connect(path.as_uri()+'?mode=ro', uri=True) as db:
        row = db.execute('SELECT payload,settings FROM projects WHERE name=?', (args.project,)).fetchone()
    if row is None: raise ValueError('Project not found')
    project = {**json.loads(row[0]), 'name': args.project}
    settings = KoboSettings.model_validate(json.loads(row[1]))
    question = next(q['id'] for q in project['form']['questions'] if q['kind'] == 'multiple' and q['id'] not in settings.hidden) if args.first_multi else ''
    snapshot = analyze(project, settings.model_copy(update={'filters': [], 'hideZero': False, 'hideEmpty': False}), question)
    source_hash = hashlib.sha256((row[0]+row[1]+question).encode()).hexdigest()
    result = {'responses': len(project['records']), 'questions': len(snapshot['questions']), 'sourceHash': source_hash, 'runs': []}
    args.output.mkdir(parents=True, exist_ok=True)
    if args.resume and (args.output/'results.json').exists():
        result = json.loads((args.output/'results.json').read_text(encoding='utf-8'))
        if result.get('sourceHash', source_hash) != source_hash: raise ValueError('Saved project changed between benchmark runs.')
        result['sourceHash'] = source_hash
    for index in range(len(result['runs']), args.runs):
        monitor = Monitor(); started = time.perf_counter()
        target = (args.output/f'run-{index+1}.xlsx').resolve()
        job_name = 'Local\\IntersosKoboBenchmark-' + uuid.uuid4().hex
        process_job = create_process_job(job_name)
        try:
            excel_worker(project, None, settings.model_dump(), target, monitor, question=question, separate_groups=settings.excelGroups, process_job_name=job_name)
            if monitor.error: raise AssertionError(monitor.error)
            entry = {key: monitor.last.get(key) for key in ('stageSeconds', 'querySeconds', 'preparationWorkers', 'peakMemoryBytes')}
            entry.update(seconds=time.perf_counter()-started, bytes=target.stat().st_size, peakExcelMemoryBytes=monitor.peak_excel)
            result['runs'].append(entry)
            (args.output/'results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
            print(json.dumps({'run': index+1, **entry}), flush=True)
        finally:
            monitor.close()
            process_job.Close()


if __name__ == '__main__': main()
