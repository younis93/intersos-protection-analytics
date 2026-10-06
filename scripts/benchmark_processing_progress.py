"""Uncached synthetic imports in isolated processes, with complete-result digests."""
import argparse
import gc
import hashlib
import io
import json
import os
from pathlib import Path
import statistics
import subprocess
import sys
from time import perf_counter

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ["INTERSOS_DEFER_LEGAL_LOAD"]="1"

import pandas as pd
from scripts.benchmark_legal_performance import synthetic_payload,peak_memory_mb
from scripts.benchmark_excel_performance import load_baseline
from backend.legal_platform import LegalStore
from backend.import_progress import ImportOperation


class SilentOperation(ImportOperation):
    def advance(self,*args): pass
    def start(self,*args): pass


def result_digest(store):
    metadata={key:value for key,value in store.metadata().items() if key!="revision"}
    value={"metadata":metadata,"flags":store.flags,
           "reviews":{name:store.review(name) for name in store.frames if name in {"beneficiaries","assessments","legalservices","awareness"}},
           "explorer":{name:store.explorer(name,search="000",sort_column=store.frames[name].columns[0]) for name in store.frames}}
    return hashlib.sha256(json.dumps(value,sort_keys=True,default=str,ensure_ascii=False).encode()).hexdigest()


def worker(args):
    payload=synthetic_payload(args.mb)
    if args.duplicates:
        frame=pd.read_csv(io.BytesIO(payload["beneficiaries"]),dtype=object)
        # Many small groups exercise duplicate contexts without a giant quadratic output.
        frame["Name (Filter Color Red)"]=[f"{index//4:08d} اسم تجريبي" for index in range(len(frame))]
        payload["beneficiaries"]=frame.to_csv(index=False).encode("utf-8-sig")
    baseline=load_baseline(args.baseline_dir)
    implementation=baseline["legal_platform"].LegalStore if args.worker=="before" else LegalStore
    operation=SilentOperation() if args.worker=="silent" else ImportOperation()
    gc.collect();start=perf_counter()
    store=implementation.from_files(payload,"synthetic",**({} if args.worker=="before" else {"operation":operation}))
    elapsed=perf_counter()-start
    peak=peak_memory_mb()
    print(json.dumps({"seconds":elapsed,"stages":store.import_timings,"peak_process_mb":peak,"digest":result_digest(store)}))


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--baseline-dir",type=Path,required=True)
    parser.add_argument("--sizes",type=float,nargs="+",default=[10,50])
    parser.add_argument("--repeats",type=int,default=3)
    parser.add_argument("--output",type=Path,default=ROOT/"output/performance/processing-progress.json")
    parser.add_argument("--worker",choices=["before","after","silent"])
    parser.add_argument("--mb",type=float,default=10)
    parser.add_argument("--duplicates",action="store_true")
    args=parser.parse_args()
    if args.worker: return worker(args)
    results=[]
    for size,duplicates in [*((size,False) for size in args.sizes),(10,True)]:
        samples={mode:[] for mode in ("before","after","silent")}
        for _ in range(args.repeats):
            for mode in samples:
                command=[sys.executable,__file__,"--baseline-dir",str(args.baseline_dir),"--worker",mode,"--mb",str(size)]
                if duplicates:command.append("--duplicates")
                result=subprocess.run(command,capture_output=True,text=True,check=True)
                samples[mode].append(json.loads(result.stdout.strip().splitlines()[-1]))
        digests={sample["digest"] for values in samples.values() for sample in values}
        assert len(digests)==1,"Import results differ"
        before,after,silent=[statistics.median(sample["seconds"] for sample in samples[mode]) for mode in samples]
        stages={mode:{key:round(statistics.median(sample["stages"][key] for sample in values),5) for key in values[0]["stages"]} for mode,values in samples.items()}
        row={"csv_mb_target":size,"duplicate_heavy":duplicates,"before_seconds":round(before,5),"after_seconds":round(after,5),
             "reduction_percent":round((1-after/before)*100,1),"counter_overhead_percent":round((after/silent-1)*100,1),
             "stages":stages,"peak_process_mb":{mode:round(max(sample["peak_process_mb"] for sample in values),1) for mode,values in samples.items()},
             "full_result_digest":next(iter(digests))}
        results.append(row);print(json.dumps(row),flush=True)
        args.output.write_text(json.dumps({"synthetic_only":True,"repeats":args.repeats,"results":results},indent=2),encoding="utf-8")


if __name__=="__main__":main()
