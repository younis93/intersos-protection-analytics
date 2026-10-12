"""Temporary local-only server for production browser profiling. No active state is used."""
import os
import sys
import json
import tempfile
from pathlib import Path
from time import perf_counter

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

def main():
    with tempfile.TemporaryDirectory(prefix='intersos-browser-profile-') as temp:
        os.environ.update(INTERSOS_DEFER_LEGAL_LOAD='1',UNHCR_UPLOAD_ONLY='1',LOCALAPPDATA=temp,INTERSOS_LOCAL_SESSION_TOKEN='')
        from backend import main as api
        from backend.legal_platform import LegalStore
        from backend.import_progress import ImportOperation
        import uvicorn
        source=Path(temp)/'source';source.mkdir()
        for path in (ROOT/'Legal Platform Data').glob('*.csv'):(source/path.name).write_bytes(path.read_bytes())
        operation=ImportOperation();start=perf_counter();store=LegalStore.from_folder(source,operation=operation)
        imported=perf_counter()-start;start=perf_counter();api.publish_legal_candidate(store,operation)
        publication=perf_counter()-start
        (ROOT/'output/performance/local-publication.json').write_text(json.dumps({'import_seconds':imported,'publication_seconds':publication,'isolated':True}),encoding='utf-8')
        @api.app.middleware('http')
        async def timing(request,call_next):
            start=perf_counter();response=await call_next(request)
            response.headers['Server-Timing']=f'app;dur={(perf_counter()-start)*1000:.3f}'
            return response
        @api.app.post('/__benchmark/revision')
        def revision():
            # Exercise invalidation in this temporary server only.
            from uuid import uuid4
            store.revision=uuid4().hex;store._metadata_cache=None
            return {'revision':store.revision}
        uvicorn.run(api.app,host='127.0.0.1',port=5181,access_log=False,log_level='warning')

if __name__=='__main__':main()
