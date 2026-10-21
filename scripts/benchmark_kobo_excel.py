"""Compare Kobo exports with a saved backend baseline using synthetic records.

Example: python scripts/benchmark_kobo_excel.py --baseline-dir tmp/kobo-export-baseline
The baseline directory must contain the baseline kobo_excel*.py source files.
"""
import argparse
import copy
import importlib
import json
import queue
import sys
import time
import types
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.check_kobo_excel_improvements import fixture
from backend.kobo_excel import excel_worker


def source_metrics(target):
    ns = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with ZipFile(target) as archive:
        rows = {}
        for name in archive.namelist():
            if name.startswith('xl/tables/') and name.endswith('.xml'):
                table = ET.fromstring(archive.read(name))
                if table.get('name', '').startswith('KoboMulti'):
                    rows[table.get('name')] = int(''.join(c for c in table.get('ref').split(':')[-1] if c.isdigit()))-1
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        caches = workbook.find('x:pivotCaches', ns)
    return {'query_rows': rows, 'pivot_caches': len(caches) if caches is not None else 0}


def run(baseline_dir, output, responses=400, options=40):
    project, settings = fixture()
    roots = [r for r in project['records'] if not r['scope']]
    project['records'] = []
    for index in range(responses):
        record = copy.deepcopy(roots[index % len(roots)])
        record.update(id=f'synthetic-{index}', row=index+2)
        selected = [f'option-{index%options}', f'option-{(index+7)%options}']
        record['values'].update({'group/needs': selected, 'group/needs2': selected[:]})
        project['records'].append(record)
    for question in project['form']['questions']:
        if question['kind'] == 'multiple':
            question['choices'] = [{'name': f'option-{index}', 'labels': {'en': f'Selected answer {index+1:02}'}} for index in range(options)]
    settings.filters = []
    package = types.ModuleType('backend.kobo_export_baseline')
    package.__path__ = [str(baseline_dir), str(ROOT / 'backend')]
    sys.modules[package.__name__] = package
    old_worker = importlib.import_module(package.__name__ + '.kobo_excel').excel_worker
    output.mkdir(parents=True, exist_ok=True)
    results = {'responses': responses, 'options': options}
    for name, worker in [('baseline', old_worker), ('optimized', excel_worker)]:
        target = output / f'{name}-large.xlsx'
        messages = queue.Queue(); started = time.perf_counter()
        print(f'Starting {name}', flush=True)
        worker(project, None, settings.model_dump(), target, messages, chart_metric='both')
        while not messages.empty():
            message = messages.get()
            if 'error' in message: raise AssertionError(message['error'])
        results[name] = {'seconds': time.perf_counter()-started, 'bytes': target.stat().st_size, **source_metrics(target)}
        print(json.dumps({name: results[name]}), flush=True)
    (output / 'benchmark.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'output/kobo-excel-optimized')
    parser.add_argument('--responses', type=int, default=400)
    parser.add_argument('--options', type=int, default=40)
    args = parser.parse_args()
    if args.responses < 1 or args.options < 8: parser.error('Use at least 1 response and 8 answer options.')
    for name in ('kobo_excel.py', 'kobo_excel_source.py', 'kobo_excel_direct.py', 'kobo_excel_slicers.py'):
        if not (args.baseline_dir / name).is_file(): parser.error(f'Missing baseline source: {name}')
    run(args.baseline_dir.resolve(), args.output.resolve(), args.responses, args.options)
