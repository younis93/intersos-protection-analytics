"""Serve synthetic governorate responses independently of user projects."""
import copy
import io
import openpyxl
from fastapi.responses import Response
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import uvicorn
from backend.kobo import ProjectStore, KoboSettings
from backend.kobo_api import make_router
from backend.test_kobo import sample
from backend.test_kobo_geography import locations
root=Path(__file__).resolve().parents[1]
out=root/'output'/'kobo-geography-report'
out.mkdir(parents=True,exist_ok=True)
payload,_=locations(sample.__wrapped__())
payload.update(mappings=[],policies={},warnings=[],issues=[])
for q in payload['form']['questions']:
    if q['id']=='loc': q['labels']={'en':'Governorate','ar':'المحافظة'}
    if q['id']=='fallback': q['labels']={'en':'Alternative location','ar':'الموقع البديل'}
gps={**copy.deepcopy(payload['form']['questions'][-1]),'id':'gps','name':'gps','labels':{'en':'Coordinates'},'type':'geopoint','kind':'text','choices':[]}
payload['form']['questions'].append(gps)
for i,r in enumerate(payload['records']):r['values']['gps']='33.31 44.36' if i<2 else '999 999' if i==2 else None
store=ProjectStore(out/'fixture.sqlite3')
settings=KoboSettings(geographyField='loc',filterFields=['loc'],hidden=[q['id'] for q in payload['form']['questions'] if q['identifying']],report={'title':'Protection monitoring report','findings':'Priority needs and access barriers.','questions':['loc']})
saved=store.create('Governorate assessment',payload,b'fixture-form',b'fixture-data',settings)
(out/'fixture.json').write_text(json.dumps({'id':saved['id']}),encoding='utf-8')
app=FastAPI();app.include_router(make_router(store))
@app.post('/api/table-workbook')
def fixture_table_workbook(body:dict):
    book=openpyxl.Workbook();sheet=book.active;sheet.append(body['columns'])
    for row in body['rows']:sheet.append([row.get(column,'') for column in body['columns']])
    stream=io.BytesIO();book.save(stream)
    return Response(stream.getvalue(),media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
app.mount('/',StaticFiles(directory=root/'frontend/dist',html=True))
if __name__=='__main__':uvicorn.run(app,host='127.0.0.1',port=int(sys.argv[1]) if len(sys.argv)>1 else 5208,log_level='warning')
