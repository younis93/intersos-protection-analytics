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
import sys
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
    args = parser.parse_args()
    if args.baseline:
        spec = importlib.util.spec_from_file_location("backend.performance_baseline", args.baseline)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
    else:
        from backend import legal_platform as module
    payload = synthetic_payload(args.mb)
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
    result = {"mode": "baseline" if args.baseline else "optimized", "csv_mb": round(sum(map(len, payload.values())) / 1_000_000, 2),
              "rows": {key: len(frame) for key, frame in store.frames.items()}, **timings,
              "stages_seconds": {key: round(value, 4) for key, value in getattr(store, "import_timings", stages).items()}, "peak_process_mb": round(peak_memory_mb(), 2), "result_sha256": digest}
    print(json.dumps(result, indent=2))
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
