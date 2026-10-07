"""Synthetic-only comparison against a saved pre-change backend directory."""
import argparse
import gc
import json
import os
from pathlib import Path
import statistics
import sys
from time import perf_counter
import tracemalloc
from types import SimpleNamespace

os.environ["INTERSOS_DEFER_LEGAL_LOAD"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pandas as pd
from backend import legal_platform as legal, indicator_reporting as reporting
from backend import indicator_reconciliation as reconciliation
from scripts.benchmark_excel_performance import load_baseline, assert_workbooks_equal
from scripts.benchmark_indicator_performance import synthetic_frames, digest
from scripts.benchmark_legal_performance import synthetic_payload


def compare(name, before, after, repeats, results):
    old_times, new_times = [], []
    for _ in range(repeats):
        gc.collect()
        start = perf_counter(); old = before(); old_times.append(perf_counter()-start)
        gc.collect()
        start = perf_counter(); new = after(); new_times.append(perf_counter()-start)
        assert old == new, name
    old, new = statistics.median(old_times), statistics.median(new_times)
    result = {"scenario": name, "before_seconds": round(old, 5), "after_seconds": round(new, 5),
              "reduction_percent": round((1-new/old)*100, 1), "full_result_parity": True}
    results.append(result); print(json.dumps(result), flush=True)


def preparation(name, function, preparations):
    gc.collect(); tracemalloc.start(); start = perf_counter()
    value = function()
    elapsed = perf_counter()-start
    current, peak = tracemalloc.get_traced_memory(); tracemalloc.stop()
    preparations.append({"stage": name, "seconds_with_tracemalloc": round(elapsed, 5),
                         "retained_python_mb": round(current/1e6, 3), "peak_python_mb": round(peak/1e6, 3)})
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-dir", type=Path, required=True)
    parser.add_argument("--rows", type=int, default=3000)
    parser.add_argument("--explorer-rows", type=int, default=30000)
    parser.add_argument("--validation-mb", type=float, default=3)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    baseline = load_baseline(args.baseline_dir)
    old_reporting, old_legal = baseline["indicator_reporting"], baseline["legal_platform"]
    frames = synthetic_frames(args.rows)
    preparations, results = [], []
    old_prepared = preparation("old_indicator_preparation", lambda: old_reporting.PreparedIndicatorData(frames), preparations)
    prepared = preparation("new_indicator_preparation", lambda: reporting.PreparedIndicatorData(frames), preparations)
    old_reporting.build_indicator_report(frames, prepared=old_prepared)
    reporting.build_indicator_report(frames, prepared=prepared)
    def legacy_monthly(options):
        months = sorted(set(options.get("months") or [f"2026-{month:02}" for month in range(1,13)]))
        if options.get("quarters"): months = [month for month in months if f"{month[:4]}-Q{(int(month[5:7])-1)//3+1}" in options["quarters"]]
        kwargs = {key:value for key,value in options.items() if key not in {"months", "quarters"}}
        return {"months": months, "reports": [{"month": month, "report": old_reporting.build_indicator_report(frames, **kwargs, quarters=[], months=[month], prepared=old_prepared)} for month in months]}
    scenarios = [(f"monthly_{count}", {"months": [f"2026-{month:02}" for month in range(1,count+1)]}) for count in (1,3,6,12)]
    scenarios += [("monthly_combined", {"months": [f"2026-{month:02}" for month in range(1,13)], "quarters": ["2026-Q1","2026-Q2"], "projects": ["UNHCR 2026 - Gov"], "locations": ["Anbar أنبار"], "community_types": ["Syrian Refugee"]})]
    for name, options in scenarios:
        compare(name, lambda: legacy_monthly(options), lambda: reporting.build_monthly_reports(frames, **options, prepared=prepared), args.repeats, results)
    request = SimpleNamespace(fromDate="", toDate="", projects=[], projectLocations=[], years=[], quarters=[], months=[f"2026-{month:02}" for month in range(1,13)], communityTypes=[])
    master = SimpleNamespace(months=request.months, values={}, warnings=[], metadata=lambda: {"filename":"synthetic.xlsx", "sheet":"Reporting Tool"})
    compare("reporting_check_12", lambda: baseline["indicator_reconciliation"].reconcile(master, frames, request, prepared=old_prepared), lambda: reconciliation.reconcile(master, frames, request, prepared=prepared), args.repeats, results)

    count = args.explorer_rows
    explorer_frame = pd.DataFrame({"Case ID": [f"{index:08}" for index in range(count)],
        "Date": [f"15/{index%12+1:02}/2026" for index in range(count)],
        "Project": [f"Project {index%4}" for index in range(count)],
        "Name": [f"Synthetic اسم {index}" for index in range(count)],
        "Count": [index%13 for index in range(count)], **{f"Notes {column}": ["Synthetic notes only"]*count for column in range(8)}})
    old_store = old_legal.LegalStore({"beneficiaries": explorer_frame}, "synthetic", [])
    store = legal.LegalStore({"beneficiaries": explorer_frame}, "synthetic", [])
    old_store.explorer("beneficiaries", search="synthetic")
    def prepare_explorer():
        context=store.explorer_preparation("beneficiaries")
        context.select("synthetic", {"Date":["2026-01","2026-02","2026-03"]}, sort_column="Date")
        context.select("", {"Project":["Project 0"]}, sort_column="Count")
        return context
    preparation("new_explorer_preparation", prepare_explorer, preparations)
    for name, query in (("explorer_dates", {"filters":{"Date":["2026-01","2026-02","2026-03"]},"sort_column":"Date"}),
                        ("explorer_combined", {"search":"synthetic", "filters":{"Project":["Project 0","Project 1"],"Date":["2026-01","2026-02","2026-03"]},"sort_column":"Date", "sort_direction":"desc"}),
                        ("explorer_pagination", {"filters":{"Project":["Project 0"]}, "page":5, "sort_column":"Count"})):
        compare(name, lambda: old_store.explorer("beneficiaries", **query), lambda: store.explorer("beneficiaries", **query), args.repeats, results)
    mixed = explorer_frame.iloc[:8].copy()
    mixed["Date"] = ["2026-10-01","02/10/2026","",None,"invalid","2026-10-03","04/10/2026","2026-11-01"]
    old_mixed, new_mixed = old_legal.LegalStore({"beneficiaries":mixed}, "synthetic", []), legal.LegalStore({"beneficiaries":mixed}, "synthetic", [])
    for filters in ({}, {"Project":["Project 1"], "Date":["2026-10"]}, {"Date":["2026-10"], "Project":["Project 1"]}):
        for sort in ("Date","Count","Name"):
            assert old_mixed.explorer("beneficiaries", filters=filters, sort_column=sort) == new_mixed.explorer("beneficiaries", filters=filters, sort_column=sort)

    payload = synthetic_payload(args.validation_mb)
    old_import = old_legal.LegalStore.from_files(payload,"synthetic")
    new_import = legal.LegalStore.from_files(payload,"synthetic")
    assert digest(old_import.flags) == digest(new_import.flags)
    compare("import_validation", old_import._build_flags, new_import._build_flags, args.repeats, results)
    output={"synthetic_only":True,"rows_per_reporting_dataset":args.rows,"explorer_rows":count,
            "validation_csv_mb":sum(map(len,payload.values()))/1e6,"repeats":args.repeats,
            "notes":"No response caches. Reporting eligibility warmed equally; monthly scopes are partitioned afresh. Source preparation and tracemalloc memory are measured separately. Garbage collection runs before timed requests.",
            "preparation":preparations,"results":results,"mixed_date_order_parity":True,
            "validation_finding_digest":digest(new_import.flags)}
    args.output.write_text(json.dumps(output,indent=2),encoding="utf-8")


if __name__ == "__main__": main()
