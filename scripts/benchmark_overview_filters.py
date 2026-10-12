"""Read-only, isolated local import/filter timings. No record values in output."""
import argparse
import cProfile
import hashlib
import json
import pstats
import statistics
import sys
import tempfile
from pathlib import Path
from time import perf_counter

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from backend.legal_platform import LegalStore
from scripts.benchmark_legal_performance import peak_memory_mb

def fingerprint(source):
    return hashlib.sha256(b''.join(hashlib.sha256(p.read_bytes()).digest() for p in sorted(source.glob('*.csv')))).hexdigest()

def scenarios(store):
    options=store.overview()['filterOptions']
    first=lambda name:options.get(name,[])[:1]
    queries={'single':{'projects':first('projects')},'combined':{'projects':first('projects'),'locations':first('locations'),'months':first('months')},'empty':{'projects':['__benchmark_missing__']},'reset':{}}
    cases={}
    for name,query in queries.items():
        cases['overview_'+name]=lambda query=query:store.overview(**query)
        cases['options_'+name]=lambda query=query:store.overview_filters(**query)
    dataset='beneficiaries' if 'beneficiaries' in store.frames else next(iter(store.frames))
    frame=store.frames[dataset];column=str(frame.columns[0]);value=str(frame.iloc[0,0]) if len(frame) else '__missing__'
    dimension=next((str(c) for c in frame.columns if 'project' in str(c).lower()),column)
    for name,filters,search in [('single',{column:[value]},''),('empty',{column:['__benchmark_missing__']},''),('search',{},value[:4]),('reset',{},'')]:
        cases['explorer_'+name]=lambda filters=filters,search=search:store.explorer(dataset,filters=filters,search=search)
        cases['review_'+name]=lambda filters=filters,search=search:store.review(dataset,filters=filters,search=search)
        cases['studio_'+name]=lambda filters=filters:store.studio(dataset,dimension,filters=filters)
    cases['high_cardinality_options']=lambda:store.explorer_filters(dataset,search=value[:4])
    return cases

def main():
    parser=argparse.ArgumentParser();parser.add_argument('output',type=Path)
    parser.add_argument('--source',type=Path,default=ROOT/'Legal Platform Data')
    parser.add_argument('--repeats',type=int,default=5);parser.add_argument('--profile',action='store_true')
    args=parser.parse_args();before=fingerprint(args.source)
    results={};imports=[];profiler=cProfile.Profile() if args.profile else None
    with tempfile.TemporaryDirectory(prefix='intersos-profile-') as temp:
        source=Path(temp)/'source';source.mkdir()
        for path in args.source.glob('*.csv'):(source/path.name).write_bytes(path.read_bytes())
        if profiler:profiler.enable()
        for repetition in range(args.repeats):
            start=perf_counter();store=LegalStore.from_folder(source)
            imports.append({'seconds':perf_counter()-start,'stages':store.import_timings,'rows':{k:len(v) for k,v in store.frames.items()}})
            for name,call in scenarios(store).items():
                # Clear only this isolated store's response caches, retaining import-prepared indexes.
                for attr,value in vars(store).items():
                    if attr in {'_review_cache','_explorer_filter_cache','_analytics_results','_intelligence_cache','_lawyer_cache','_indicator_cache'} and isinstance(value,dict):value.clear()
                for temperature in ('cold','warm'):
                    start=perf_counter();response=call();elapsed=(perf_counter()-start)*1000
                    encoded=json.dumps(response,sort_keys=True,default=str,ensure_ascii=False).encode()
                    results.setdefault(name,{}).setdefault(temperature,[]).append({'ms':elapsed,'bytes':len(encoded),'digest':hashlib.sha256(encoded).hexdigest()})
            print(f'Completed local repetition {repetition+1}',flush=True)
        if profiler:profiler.disable()
    assert fingerprint(args.source)==before,'Source data changed'
    profiles=[]
    if profiler:
        for (filename,line,function),(_,calls,self_time,cumulative,_) in sorted(pstats.Stats(profiler).stats.items(),key=lambda pair:pair[1][3],reverse=True)[:40]:
            profiles.append({'module':Path(filename).name,'function':function,'line':line,'calls':calls,'self_seconds':self_time,'cumulative_seconds':cumulative})
    summary={name:{temperature:{'median_ms':statistics.median(s['ms'] for s in samples),'min_ms':min(s['ms'] for s in samples),'max_ms':max(s['ms'] for s in samples),'response_bytes':samples[0]['bytes'],'result_consistent':len({s['digest'] for s in samples})==1} for temperature,samples in temperatures.items()} for name,temperatures in results.items()}
    for temperatures in results.values():
        assert {s['digest'] for s in temperatures['cold']}=={s['digest'] for s in temperatures['warm']},'Cold/warm results differ'
    report={'isolated':True,'source_unchanged':True,'repeats':args.repeats,'profiled':args.profile,'actual_bytes':sum(p.stat().st_size for p in args.source.glob('*.csv')),'imports':imports,'peak_process_mb':peak_memory_mb(),'queries':summary,'profiles':profiles}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2),encoding='utf-8')

if __name__=='__main__':main()
