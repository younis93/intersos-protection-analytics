"""Real import notes plus one independently editable required blank."""
import io
import json
import os
import sys
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient
from openpyxl import load_workbook
import uvicorn
from backend.kobo import ProjectStore,parse_form,KoboSettings
from backend.kobo_api import make_router
from backend.test_kobo_import_notes import stage,confirm
from backend.test_kobo import workbook

root=Path(__file__).resolve().parents[1]
output=root/'output/kobo-review-notes';output.mkdir(parents=True,exist_ok=True)
store=ProjectStore(output/f'fixture-{os.getpid()}.sqlite3')
app=FastAPI();app.include_router(make_router(store))
with TestClient(app) as client:
    _,body=stage(client,b'district,other\nShared,Hello\nShared,\n')
    body['name']='Review import notes'
    saved=confirm(client,body);pid=saved['id']
with store.connect() as db:
    row=db.execute('SELECT payload,form FROM projects WHERE id=?',(pid,)).fetchone()
    raw=json.loads(row[0])
    raw['warnings'].extend(['Review the imported column mappings before using the results.','Some source values were converted to blank during import.'])
    for form in [raw['form'],raw['baseForm']]:next(q for q in form['questions'] if q['id']=='other')['required']='yes'
    book=load_workbook(io.BytesIO(bytes(row[1])));book['survey'].cell(1,5,'required')
    for row in book['survey'].iter_rows(min_row=2):
        if row[1].value=='other':book['survey'].cell(row[0].row,5,'yes')
    buffer=io.BytesIO();book.save(buffer)
    db.execute('UPDATE projects SET payload=?,form=? WHERE id=?',(json.dumps(raw),buffer.getvalue(),pid))
empty_form=workbook({'survey':[['type','name','label'],['text','other','Other']], 'settings':[['default_language'],['English (en)']]})
empty=store.create('No import notes',{'form':parse_form(empty_form),'records':[{'id':'empty-row','row':2,'scope':'','parent':'','values':{'other':'Complete'}}],'warnings':[],'issues':[]},empty_form,b'other\nComplete\n',KoboSettings(language='en'))
(output/'fixture.json').write_text(json.dumps({'id':pid,'emptyId':empty['id']}))
app.mount('/',StaticFiles(directory=root/'frontend/dist',html=True),name='frontend')
if __name__=='__main__':uvicorn.run(app,host='127.0.0.1',port=5387,log_level='warning')
