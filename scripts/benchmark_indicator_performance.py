"""Synthetic report parity and uncached-filter benchmark; never reads case files.

Run with --baseline pointing to a saved pre-change indicator_reporting.py.
Preparation and first-report cost are measured separately from subsequent filters.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import statistics
import sys
import tracemalloc
from pathlib import Path
from time import perf_counter

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.indicator_reporting import PreparedIndicatorData, build_indicator_report


def synthetic_frames(count: int = 120) -> dict[str, pd.DataFrame]:
    assessments, services, awareness, deportation, beneficiaries = [], [], [], [], []
    for i in range(count):
        month = i % 12 + 1
        date = f"15/{month:02}/2026"
        community = ("Syrian Refugee", "Non-Syrian Refugee", "IDP")[i % 3]
        pair = (("UNHCR 2026 - Gov", "Anbar أنبار"), ("UNHCR 2026 - SULI", "Rania"),
                ("UNHCR 2026 - AMAL CAMP", "AMAL Camp"))[i % 3]
        # Adjacent records deliberately reuse IDs across months and locations.
        common = {"Projects": pair[0], "Project Location": pair[1], "Community Type": community,
                  "Gender": "Male" if i % 2 else "Female", "UNHCR Age Group": "(18-39)" if i % 19 else "unknown",
                  "Beneficiary ID": f"B{i // 3}", "Assessment ID": f"A{i // 2}"}
        assessments.append({**common, "Date of Assessment": date if i % 23 else "",
                            "Date of the released or deported": date if i % 29 else "invalid",
                            "Type of Legal Service Needed": "Legal Representation" if i % 2 else "Legal Counselling",
                            "Type of Service Provided": "Legal Assistance" if i % 2 else "Legal Counselling",
                            "Is the beneficiary detained": "Yes" if i % 4 else "No",
                            "Is it an immigration related charge": "Yes", "Detainee current status": "Released"})
        services.append({**common, "Service ID": f"S{i}", "Date of Service Provision": "15/06/2025",
                         "Date Service Completed": date if i % 31 else None,
                         "Type of Service Provided": "Legal Representation", "Service Status": "Completed اكتملت",
                         "Is the beneficiary detained": "Yes" if i % 4 else "No",
                         "Is Civil Documents": "Yes", "Type of Document": "Unified National Card"})
        awareness.append({**common, "Date of Session": date, "Awareness ID": f"W{i // 2}",
                          "Participant Name": f"Synthetic {i}", "Session Topic": "Civil documentation"})
        deportation.append({**common, "Date of Deportation Knowledge": date, "PN ID": f"P{i // 2}"})
        beneficiaries.append({"Case ID": f"B{i // 3}", "Name": f"Synthetic {i}", "Community Type": community})
    return {name: pd.DataFrame(rows) for name, rows in (
        ("assessments", assessments), ("legalservices", services), ("awareness", awareness),
        ("deportationrecords", deportation), ("beneficiaries", beneficiaries))}


def filter_scenarios():
    months = [f"2026-{month:02}" for month in range(1, 13)]
    return [{"months": months[:size]} for size in (1, 3, 6, 12)] + [
        {"quarters": ["2026-Q1", "2026-Q3"]},
        {"months": months[:6], "quarters": ["2026-Q1", "2026-Q2"], "years": ["2026"]},
        {"months": months[:3], "quarters": ["2026-Q4"]},
        {"months": months[:6], "projects": ["UNHCR 2026 - Gov", "UNHCR 2026 - SULI"],
         "locations": ["Anbar أنبار", "Pshdar Urban (Refugees) + Rania"],
         "community_types": ["Syrian Refugee", "Non-Syrian Refugee"]},
        {"months": months, "projects": ["UNHCR 2026 - AMAL CAMP"], "community_types": ["IDP"]},
        {}, {"to_date": "2026-06-30"}, {"from_date": "2026-02-01", "to_date": "2026-08-31"},
    ]


def digest(report):
    return hashlib.sha256(json.dumps(report, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--rows", type=int, default=3000)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location("backend.indicator_baseline", args.baseline)
    baseline = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(baseline)
    frames = synthetic_frames(args.rows)
    tracemalloc.start()
    start = perf_counter()
    prepared = PreparedIndicatorData(frames)
    preparation_seconds = perf_counter() - start
    start = perf_counter()
    build_indicator_report(frames, prepared=prepared)
    first_report_seconds = perf_counter() - start
    retained, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    results = []
    for filters in filter_scenarios():
        before, after = [], []
        for _ in range(args.repeats):
            start = perf_counter()
            expected = baseline.build_indicator_report(frames, **filters)
            before.append(perf_counter() - start)
            start = perf_counter()
            actual = build_indicator_report(frames, prepared=prepared, **filters)
            after.append(perf_counter() - start)
            assert actual == expected, f"Report differs: {filters}"
        old, new = statistics.median(before), statistics.median(after)
        result = {"filters": filters, "baseline_seconds": round(old, 4), "optimized_seconds": round(new, 4),
                  "reduction_percent": round((1 - new / old) * 100, 1), "parity": True}
        results.append(result)
        print(json.dumps(result), flush=True)
    payload = {"rows_per_source": args.rows, "repeats": args.repeats,
               "preparation_seconds_traced": round(preparation_seconds, 4),
               "first_report_seconds_traced": round(first_report_seconds, 4),
               "prepared_retained_mb": round(retained / 1e6, 2), "preparation_peak_mb": round(peak / 1e6, 2),
               "results": results}
    if args.output:
        args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in payload.items() if key != "results"}), flush=True)


if __name__ == "__main__":
    main()
