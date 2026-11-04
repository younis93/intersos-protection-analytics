"""Isolated synthetic project for shared-dependency browser acceptance."""
import io,json,os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from openpyxl import load_workbook
import uvicorn
from backend.kobo import KoboSettings,ProjectStore,parse_form
from backend.kobo_api import make_router
from backend.test_kobo_required import required_project
root=Path(__file__).resolve().parents[1]
out=root/'output/kobo-shared-dependencies';out.mkdir(parents=True,exist_ok=True)
project,source=required_project.__wrapped__()
book=load_workbook(io.BytesIO(source))
expressions={'required_text':"${a} = 'yes' and ${amount} > 0",'optional_text':"${a} = 'yes' or ${amount} > 0",'dynamic':"${a} = 'yes' and regex(${optional_text}, 'x')"}
for row in book['survey'].iter_rows(min_row=2):
    if row[1].value in expressions:row[5].value=expressions[row[1].value]
buf=io.BytesIO();book.save(buf);source=buf.getvalue();project['form']=parse_form(source)
for q in project['form']['questions']:
    if q['id'].startswith('branch/'):q.update(relevant='',inheritedRelevant=[])
next(g for g in project['form']['groups'] if g['id']=='branch').pop('relevant',None)
store=ProjectStore(out/f'fixture-{os.getpid()}.sqlite3')
saved=store.create('Shared dependency review',project,source,b'data',KoboSettings(language='en',hideEmpty=True))
(out/'fixture.json').write_text(json.dumps({'id':saved['id']}))
app=FastAPI();app.include_router(make_router(store));app.mount('/',StaticFiles(directory=root/'frontend/dist',html=True),name='frontend')
if __name__=='__main__':uvicorn.run(app,host='127.0.0.1',port=5388,log_level='warning')
