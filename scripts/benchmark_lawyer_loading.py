"""Isolated Lawyer overview timing and full response parity, without record output."""
import argparse
import ast
import hashlib
import json
import statistics
import sys
import tempfile
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import legal_platform
from scripts.benchmark_overview_filters import fingerprint


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--source', type=Path, default=ROOT/'Legal Platform Data')
    parser.add_argument('--output', type=Path, default=ROOT/'output/performance/lawyer-loading.json')
    args = parser.parse_args()
    tree = ast.parse(args.baseline.read_text(encoding='utf-8-sig'))
    cls = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'LegalStore')
    method = next(node for node in cls.body if isinstance(node, ast.FunctionDef) and node.name == 'intelligence')
    scope = dict(vars(legal_platform))
    exec(compile(ast.Module(body=[method], type_ignores=[]), '<baseline>', 'exec'), scope)
    before = fingerprint(args.source)
    report = {'isolated': True, 'repeats': 5, 'timings': {}, 'parity_scenarios': 0}
    with tempfile.TemporaryDirectory(prefix='intersos-lawyer-profile-') as temporary:
        source = Path(temporary)
        for path in args.source.glob('*.csv'):
            (source/path.name).write_bytes(path.read_bytes())
        store = legal_platform.LegalStore.from_folder(source)
        digest = lambda value: hashlib.sha256(json.dumps(value, sort_keys=True, default=str, ensure_ascii=False).encode()).hexdigest()
        def clear():
            store._intelligence_cache.clear()
            store._lawyer_cache.clear()
        expected = None
        for label, call in [('before', scope['intelligence']), ('after', legal_platform.LegalStore.intelligence)]:
            cold, warm = [], []
            for _ in range(5):
                clear()
                for samples in [cold, warm]:
                    start = perf_counter()
                    result = call(store, 'lawyer-intelligence', {})
                    samples.append((perf_counter()-start)*1000)
                    current = digest(result)
                    if expected is None: expected = current
                    assert expected == current, 'Overview response changed'
            summary = lambda samples: {'median_ms': statistics.median(samples), 'min_ms': min(samples), 'max_ms': max(samples)}
            report['timings'][label] = {'cold': summary(cold), 'warm': summary(warm)}
            print(label+' timings complete', flush=True)
        options = result['filterOptions']
        first = lambda key: options.get(key, [])[:1]
        for filters in [{'project': first('project')}, {'lawyer': first('lawyer')}, {'project': first('project'), 'assessmentMonth': first('assessmentMonth')}, {'lawyer': ['__missing_benchmark__']}]:
            clear(); baseline = scope['intelligence'](store, 'lawyer-intelligence', filters)
            clear(); updated = store.intelligence('lawyer-intelligence', filters)
            assert digest(baseline) == digest(updated), 'Filtered response changed'
            report['parity_scenarios'] += 1
    assert fingerprint(args.source) == before
    report.update(source_unchanged=True, results_identical=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__': main()
