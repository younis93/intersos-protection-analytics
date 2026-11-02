"""Top N must be applied before Excel's 255-series trend chart limit."""
import io,json,sys,time,os
from pathlib import Path
import httpx
from openpyxl import load_workbook
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root))
from backend.test_kobo import workbook
client=httpx.Client(base_url='http://127.0.0.1:5397',timeout=180)
def post(path,**kwargs):
    response=client.post(path,**kwargs);response.raise_for_status();return response.json()
form=workbook({'survey':[['type','name','label'],['select_one options','answer','Answer'],['decimal','amount','Amount'],['date','day','Day']], 'choices':[['list_name','name','label'],*[['options',str(i),'Answer '+str(i)] for i in range(300)]]})
raw=('answer,amount,day\n'+'\n'.join(f'{i},{i},2026-0{1+i%2}-01' for i in range(300))+'\n').encode()
preview=post('/api/kobo/imports/preview',files={'form':('form.xlsx',form),'data':('data.csv',raw)})
project=post('/api/kobo/imports/confirm',json=dict(token=preview['token'],name='Large Top N trend',mappings=preview['mappings']))
operation=os.getenv('TOP_N_OPERATION','average')
settings=project['settings'];settings['hidden']=['amount','day'];settings['questions']['answer'].update(chart='line',trendDateField='day',chartTopN=5,chartOther=False,calculation=None if operation=='count' else dict(operation='average',field='amount',decimals=2))
job=post(f'/api/kobo/projects/{project["id"]}/exports',json=dict(settings=settings,question='answer',chartMetric='count'))
started=time.monotonic()
while job['state'] not in {'complete','error','cancelled'}:
    if time.monotonic()-started>300:raise TimeoutError(job)
    time.sleep(.4);job=client.get(f'/api/kobo/exports/{job["id"]}').json()
assert job['state']=='complete',job
raw=client.get(f'/api/kobo/exports/{job["id"]}/download').content
path=root/'output/analysis-features'/f'large-top-n-{operation}-trend.xlsx';path.write_bytes(raw)
book=load_workbook(path,data_only=True)
charts=[chart for ws in book for chart in ws._charts]
assert len(charts)==1 and len(charts[0].ser)==5
assert not [(ws.title,c.coordinate,c.value) for ws in book for row in ws for c in row if c.data_type=='e']
print('PASS 300 answer rows,',operation,'live formulas, five Excel trend series, zero Excel error cells')
