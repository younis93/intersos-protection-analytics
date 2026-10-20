"""Isolated real-API fixture for field-link creation and re-upload checks."""
import os
import sys
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ['INTERSOS_DEFER_LEGAL_LOAD'] = '1'
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import uvicorn
from backend.kobo import ProjectStore
from backend.kobo_api import make_router
from backend.test_kobo_import_links import form_bytes
root = Path(__file__).resolve().parents[1]
output = root / 'output' / 'kobo-import-links'
output.mkdir(parents=True, exist_ok=True)
(output / 'form-v1.xlsx').write_bytes(form_bytes('1'))
(output / 'form-v2.xlsx').write_bytes(form_bytes('2', 'female'))
(output / 'responses.csv').write_text('old_gender,gender,age,unused\nf,Female,1,z\nf,m,2,z\n,m,3,z\n', encoding='utf-8')
(output / 'responses-reordered.csv').write_text('age,gender,unused,old_gender\n1,f,z,Female\n2,m,z,f\n', encoding='utf-8')
with tempfile.TemporaryDirectory(prefix='kobo-links-') as directory:
    app=FastAPI();app.include_router(make_router(ProjectStore(Path(directory)/'fixture.sqlite3')))
    app.mount('/', StaticFiles(directory=root/'frontend'/'dist',html=True),name='frontend')
    uvicorn.run(app,host='127.0.0.1',port=5189,log_level='warning')
