"""Isolated synthetic API + current frontend for pivot-record browser verification."""
import copy,json,os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import uvicorn
from backend.kobo import KoboSettings,ProjectStore
from backend.kobo_api import make_router
from backend.test_kobo import sample
root=Path(__file__).resolve().parents[1]
output=root/'output/kobo-pivot-records';output.mkdir(parents=True,exist_ok=True)
project=copy.deepcopy(sample.__wrapped__()[0]);form=project['form'];template=project['records'][0]
location={**copy.deepcopy(form['questions'][0]),'id':'group/location','name':'location','labels':{'en':'Location','ar':'الموقع'},'choices':[{'name':'erbil','labels':{'en':'Erbil','ar':'أربيل'}},{'name':'baghdad','labels':{'en':'Baghdad','ar':'بغداد'}}]}
form['questions'].append(location)
form['questions'].append({**copy.deepcopy(form['questions'][4]),'id':'group/source_id','name':'source_id','labels':{'en':'Source ID','ar':'معرف المصدر'},'metadata':True,'identifying':False})
form['questions'].append({**copy.deepcopy(form['questions'][2]),'id':'visits/count','name':'visit_count','labels':{'en':'Visit count','ar':'عدد الزيارات'},'group':'visits','repeat':'visits'})
form['groups'].append({'id':'visits','name':'visits','labels':{'en':'Visits','ar':'الزيارات'},'parent':'','repeat':True})
form['questions'][1]['choices'].append({'name':'unused','labels':{'en':'Unused option','ar':'خيار دون إجابات'}})
project['records']=[{**template,'id':f'row{index}','row':index+2,'values':{'group/gender':'f' if index<80 else 'm','group/needs':None if index%5==0 else ['water']+(['food'] if index%2==0 else []),'group/age':index,'group/day':'2026-01-01','group/respondent_name':f'Respondent {index+1:03}','group/location':'erbil' if index%2==0 else 'baghdad'}} for index in range(120)]
for index, record in enumerate(project['records']): record['values']['group/source_id'] = f'SRC-{index+1:03}'
project['records'] += [{'id':f'visit{index}','row':index+2,'scope':'visits','parent':f'row{index}','values':{'visits/count':index}} for index in range(20)]
store=ProjectStore(output/f'fixture-{os.getpid()}.sqlite3')
saved=store.create('Pivot response verification',{**project,'mappings':[],'policies':{},'warnings':[],'issues':[]},b'fixture',b'fixture')
settings=KoboSettings.model_validate({**saved['settings'],'language':'en','hideZero':False,'hideBlanks':False,'hideEmpty':False,'filters':[{'field':'group/age','kind':'number','minimum':0,'maximum':119}],'questions':{'group/needs':{'breakdowns':['group/gender','group/location']},'visits/count':{'numericMode':'values','breakdowns':['group/gender']}}})
store.save(saved['id'],settings)
(output/'fixture.json').write_text(json.dumps({'id':saved['id']}),encoding='utf-8')
app=FastAPI();app.include_router(make_router(store));app.mount('/',StaticFiles(directory=root/'frontend/dist',html=True),name='frontend')
if __name__=='__main__':uvicorn.run(app,host='127.0.0.1',port=int(os.environ.get('KOBO_FIXTURE_PORT','5361')),log_level='warning')
