"""Synthetic source workbook contains a condition omitted from stored metadata."""
import io
import json
import os
import sys
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from openpyxl import load_workbook
import uvicorn
from backend.kobo import KoboSettings,ProjectStore
from backend.kobo_api import make_router
from backend.test_kobo_required import required_project

root=Path(__file__).resolve().parents[1]
output=root/'output/kobo-connection-setup';output.mkdir(parents=True,exist_ok=True)
project,source=required_project.__wrapped__()
target=next(q for q in project['form']['questions'] if q['id']=='required_text')
label='30. If you are living in an informal site or collective shelter, do you have a safe and secure place to stay for the next 6 months?'
target['labels']={'en':label,'ar':'30. إذا كنت تعيش في موقع غير رسمي أو مأوى جماعي، هل لديك مكان آمن للإقامة خلال الأشهر الستة القادمة؟'}
book=load_workbook(io.BytesIO(source))
for row in book['survey'].iter_rows(min_row=2):
    if row[1].value=='required_text':row[2].value=label;row[5].value="${a} = 'yes'"
    if os.environ.get('KOBO_SHARED_FIXTURE') and row[1].value=='optional_text':row[5].value="${a} = 'yes'"
buffer=io.BytesIO();book.save(buffer);source=buffer.getvalue()
project['records']=[{'id':f'r{i}','row':i+2,'scope':'','parent':'','sourceIdentity':f'uuid-{i}',
    'values':{'a':'yes' if i<30 else 'no','required_text':'Leftover' if i==30 else None,'amount':i,
    'optional_text':'Context','dynamic':'Filled' if i<30 else None,'branch/optional_followup':['one'] if i<30 else [],
    'branch/required_followup':'Filled' if i<30 else None}} for i in range(60)]
store=ProjectStore(output/f'fixture-{os.getpid()}.sqlite3')
saved=store.create('Missing Kobo connection',project,source,b'synthetic data',KoboSettings(language='en',hideEmpty=True))
(output/'fixture.json').write_text(json.dumps({'id':saved['id']}))
app=FastAPI();app.include_router(make_router(store));app.mount('/',StaticFiles(directory=root/'frontend/dist',html=True),name='frontend')
if __name__=='__main__':uvicorn.run(app,host='127.0.0.1',port=5386,log_level='warning')
