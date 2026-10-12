from pathlib import Path
from tempfile import TemporaryDirectory
import json
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from fastapi.staticfiles import StaticFiles
from backend.static_cache import static_cache_policy

def test_static_cache_and_updates():
    with TemporaryDirectory() as temp:
        root=Path(temp); (root/'assets').mkdir()
        (root/'assets/page-AbCd1234.js').write_text('old')
        (root/'assets/page-EfGh5678.js').write_text('new')
        (root/'logo.png').write_bytes(b'image')
        (root/'index.html').write_text('<html>current assets</html>')
        (root/'.vite').mkdir()
        manifest=root/'.vite/manifest.json'
        manifest.write_text(json.dumps({'page':{'file':'assets/page-AbCd1234.js'}}))
        app=FastAPI()
        @app.middleware('http')
        async def cache(request:Request,call_next):
            response=await call_next(request)
            response.headers['Cache-Control']=static_cache_policy(request.url.path,response.status_code,response.headers.get('content-type',''),root)
            return response
        @app.get('/api/example')
        def api(): return {'value':1}
        app.mount('/',StaticFiles(directory=root,html=True))
        client=TestClient(app)
        old=client.get('/assets/page-AbCd1234.js')
        assert old.headers['cache-control']=='public, max-age=31536000, immutable'
        conditional=client.get('/assets/page-AbCd1234.js',headers={'If-None-Match':old.headers['etag']})
        assert conditional.status_code==304
        assert 'immutable' in conditional.headers['cache-control']
        assert 'immutable' not in client.get('/assets/page-EfGh5678.js').headers['cache-control']
        manifest.write_text(json.dumps({'page':{'file':'assets/page-EfGh5678.js'},'old':{'file':'assets/page-AbCd1234.js'}}))
        assert client.get('/assets/page-EfGh5678.js').text=='new'
        assert 'immutable' in client.get('/assets/page-EfGh5678.js').headers['cache-control']
        for path in ('/','/index.html','/api/example','/assets/missing-AbCd1234.js'):
            assert 'no-store' in client.get(path).headers['cache-control']
        html=client.get('/index.html')
        assert 'no-store' in client.get('/index.html',headers={'If-None-Match':html.headers['etag']}).headers['cache-control']
        assert client.get('/logo.png').headers['cache-control']=='no-cache, must-revalidate'
        assert 'immutable' not in static_cache_policy('/assets/../logo-AbCd1234.js',200,'image/png',root)
        manifest.unlink()
        assert 'immutable' not in client.get('/assets/page-AbCd1234.js').headers['cache-control']
