"""Repeatable, synthetic-only import benchmark. Run each size in a fresh process.

Example: .venv/Scripts/python scripts/benchmark_legal_performance.py --mb 10
Use --baseline PATH to compare a saved pre-change legal_platform.py.
No source case files are read or written.
"""
from __future__ import annotations

import argparse
import ctypes
import hashlib
import importlib.util
import io
import json
import cProfile
import pstats
import statistics
import subprocess
import sys
from tempfile import TemporaryDirectory
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import pandas as pd


def synthetic_payload(mb: float) -> dict[str, bytes]:
    def generate(count: int) -> dict[str, bytes]:
        ids = [f"{i:08d}" for i in range(count)]
        projects = ["UNHCR 2026 - Erbil" if i % 2 else "UNHCR 2026 - Baghdad" for i in range(count)]
        dates = [f"15/{i % 6 + 1:02d}/2026" for i in range(count)]
        common = {"Project": projects, "Project Location": ["Erbil"] * count,
                  "Lawyers": [f"Synthetic lawyer {i % 12}" for i in range(count)],
                  "Notes": ["Synthetic benchmark text only. " * 5] * count}
        frames = {
            "beneficiaries": pd.DataFrame({**common, "Case ID": ids,
                "Name (Filter Color Red)": [f"{i:08d} اسم تجريبي" for i in range(count)],
                "Age": [30] * count, "Contact Number": [f"075{i:08d}" for i in range(count)],
                "# total assessments": [1] * count, "Date of Identification": dates}),
            "assessments": pd.DataFrame({**common, "Assessment ID": [f"A{i}" for i in ids],
                "Beneficiary ID": ids, "# Total Services": [1] * count,
                "Date of Assessment": dates, "Assessment Status": ["Closed"] * count,
                "Type of Legal Service": ["Legal Assistance - مساعدة"] * count}),
            "legalservices": pd.DataFrame({**common, "Service ID": [f"S{i}" for i in ids],
                "Assessment ID": [f"A{i}" for i in ids], "Beneficiary ID": ids,
                "Date of Service Provision": dates, "Type of Service Provided": ["Legal Assistance"] * count,
                "Type of Document": ["ID Card"] * count, "Service Status": ["Completed"] * count}),
        }
        return {name: frame.to_csv(index=False).encode("utf-8-sig") for name, frame in frames.items()}
    sample = generate(100)
    return generate(max(2, round(mb * 1_000_000 / sum(map(len, sample.values())) * 100)))


def peak_memory_mb() -> float:
    if sys.platform == "win32":
        from ctypes import wintypes
        class Counters(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + [
                (name, ctypes.c_size_t) for name in ("PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage",
                "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage", "QuotaNonPagedPoolUsage", "PagefileUsage", "PeakPagefileUsage")]
        counters = Counters()
        counters.cb = ctypes.sizeof(counters)
        ctypes.windll.psapi.GetProcessMemoryInfo(ctypes.c_void_p(-1), ctypes.byref(counters), counters.cb)
        return counters.PeakWorkingSetSize / 1_000_000
    import resource
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1_000_000 if sys.platform == "darwin" else 1000)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mb", type=float, default=10)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--duplicates", action="store_true")
    parser.add_argument("--profile", action="store_true", help="Separate CPU run; no record values are saved")
    parser.add_argument("--suite", action="store_true")
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--cache-comparison", action="store_true", help="Compare cold and cached imports in fresh processes")
    parser.add_argument("--cache-dir", type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.cache_comparison:
        if args.baseline or args.suite or args.profile:
            parser.error('--cache-comparison cannot be combined with baseline, suite or profile')
        with TemporaryDirectory(prefix="legal-cache-benchmark-") as directory:
            command = [sys.executable, __file__, "--mb", str(args.mb), "--cache-dir", directory]
            if args.duplicates: command.append("--duplicates")
            cold, cached = [json.loads(subprocess.run(command, capture_output=True, text=True, check=True).stdout) for _ in range(2)]
        assert cold['result_sha256'] == cached['result_sha256'], 'Cached results differ'
        assert cold['stages_seconds']['cache_miss'] == cached['stages_seconds']['cache_hit'] == 1
        result = {'cold': cold, 'cached': cached, 'speedup': round(cold['import_ready_seconds'] / max(cached['import_ready_seconds'], .0001), 2)}
        print(json.dumps(result, indent=2))
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(result, indent=2), encoding='utf-8')
        return
    if args.suite:
        if args.output is None or args.profile or args.repeats<1:
            parser.error('--suite requires --output and positive repeats; run --profile separately')
        results=[]
        for size in (10,50,100):
            for duplicates in (False,True):
                samples=[]
                for _ in range(args.repeats):
                    command=[sys.executable,__file__,"--mb",str(size)]
                    if args.baseline:command.extend(['--baseline',str(args.baseline)])
                    if duplicates: command.append("--duplicates")
                    samples.append(json.loads(subprocess.run(command,capture_output=True,text=True,check=True).stdout))
                    print(f'{size} MB duplicates={duplicates}: run {_+1}/{args.repeats}',flush=True)
                assert len({sample['result_sha256'] for sample in samples})==1
                keys=[key for key,value in samples[0].items() if isinstance(value,(int,float))]
                results.append({'target_mb':size,'duplicates':duplicates,'samples':samples,'summary':{key:{'median':statistics.median(s[key] for s in samples),'min':min(s[key] for s in samples),'max':max(s[key] for s in samples)} for key in keys}})
                args.output.parent.mkdir(parents=True,exist_ok=True)
                args.output.write_text(json.dumps({'repeats':args.repeats,'results':results},indent=2),encoding='utf-8')
                print(f'Completed {size} MB duplicates={duplicates}',flush=True)
        return
    if args.baseline:
        spec = importlib.util.spec_from_file_location("backend.performance_baseline", args.baseline)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
    else:
        from backend import legal_platform as module
        # Every ordinary benchmark stays cold and cannot replace the user's cache.
        cache_workspace = TemporaryDirectory(prefix="legal-import-benchmark-") if args.cache_dir is None else None
        directory = args.cache_dir or Path(cache_workspace.name)
        module.legal_processing_cache.cache_directory = lambda: directory
    payload = synthetic_payload(args.mb)
    if args.duplicates:
        frame=pd.read_csv(io.BytesIO(payload['beneficiaries']),dtype=object)
        frame['Name (Filter Color Red)']=[f'{index//4:08d} اسم تجريبي' for index in range(len(frame))]
        payload['beneficiaries']=frame.to_csv(index=False).encode('utf-8-sig')
    profiler=cProfile.Profile() if args.profile else None
    if profiler: profiler.enable()
    stages = {}
    collecting = True
    if args.baseline:
        def instrument(name, function):
            def wrapped(*args, **kwargs):
                start = perf_counter()
                try:
                    return function(*args, **kwargs)
                finally:
                    if collecting: stages[name] = stages.get(name, 0.0) + perf_counter() - start
            return wrapped
        module.pd.read_csv = instrument("csv_read", module.pd.read_csv)
        module.LegalStore._build_flags = instrument("validation", module.LegalStore._build_flags)
        module.LegalStore.review = instrument("review_preparation", module.LegalStore.review)
    exclusions = [("Possible duplicate name", "00000000")]
    timings = {}
    def timed(name, fn):
        start = perf_counter()
        result = fn()
        timings[name] = round(perf_counter() - start, 4)
        return result
    start = perf_counter()
    if args.baseline:
        store = module.LegalStore.from_files(payload, "Synthetic benchmark")
        collecting = False
        stages["cleaning"] = perf_counter() - start - sum(stages.values())
        store.set_review_exclusions(exclusions)
    else:
        store = module.LegalStore.from_files(payload, "Synthetic benchmark", exclusions=exclusions)
    metadata = timed("metadata_seconds", store.metadata)
    timings["import_ready_seconds"] = round(perf_counter() - start, 4)
    if args.baseline:
        stages["metadata"] = timings["metadata_seconds"]
        stages["total"] = timings["import_ready_seconds"]
    checks = [metadata]
    for name, fn in (
        ("review_first_seconds", lambda: store.review("beneficiaries")),
        ("review_repeat_seconds", lambda: store.review("beneficiaries")),
        ("explorer_first_seconds", lambda: store.explorer("beneficiaries")),
        ("search_first_seconds", lambda: store.explorer("beneficiaries", search="000001")),
        ("search_repeat_seconds", lambda: store.explorer("beneficiaries", search="000001")),
    ):
        checks.append(timed(name, fn))
    # Revision is deliberately different per import; all other output must match.
    checks[0] = {key: value for key, value in checks[0].items() if key != "revision"}
    digest = hashlib.sha256(json.dumps(checks, sort_keys=True, default=str, ensure_ascii=False).encode()).hexdigest()
    profile=[]
    if profiler:
        profiler.disable()
        for (filename,line,function),(primitive,calls,self_seconds,cumulative,callers) in sorted(pstats.Stats(profiler).stats.items(),key=lambda item:item[1][3],reverse=True)[:40]:
            profile.append({'module':Path(filename).name,'line':line,'function':function,'calls':calls,'self_seconds':self_seconds,'cumulative_seconds':cumulative})
    result = {"mode": "baseline" if args.baseline else "optimized", "csv_mb": round(sum(map(len, payload.values())) / 1_000_000, 2),
              "rows": {key: len(frame) for key, frame in store.frames.items()}, **timings,
              "stages_seconds": {key: round(value, 4) for key, value in getattr(store, "import_timings", stages).items()}, "peak_process_mb": round(peak_memory_mb(), 2), "result_sha256": digest,
              "profile":profile,"profiled":args.profile,"actual_bytes":sum(map(len,payload.values()))}
    print(json.dumps(result, indent=2))
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    if not args.baseline and cache_workspace is not None:
        cache_workspace.cleanup()


if __name__ == "__main__":
    main()
