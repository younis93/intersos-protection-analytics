"""Synthetic native/binary multi-select, nested percentages, trends and heatmaps."""
import io,json,sys,time,csv
from pathlib import Path
import httpx
from openpyxl import load_workbook
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root))
from backend.test_kobo import workbook
client=httpx.Client(base_url='http://127.0.0.1:5397',timeout=180)
out=root/'output/analysis-features';fixture={}
rows=[('IDP','Men')]*4+[('IDP','Women')]*6+[('Refugee','Men')]*7+[('Refugee','Women')]*3
stream=io.StringIO();writer=csv.writer(stream);writer.writerow(['code','answer','multi','status','gender','amount','date'])
for i,(status,gender) in enumerate(rows):writer.writerow([f'{i+1:03d}','Yes',['a b','b c','a c'][i%3],status,gender,i-8,f'2026-0{1+i%2}-01'])
raw=stream.getvalue().encode()
def post(path,body=None,**kwargs):
    response=client.post(path,json=body,**kwargs) if body is not None else client.post(path,**kwargs)
    response.raise_for_status();return response.json()
for workspace in ('kobo','custom'):
    if workspace=='kobo':
        form=workbook({'survey':[['type','name','label'],['text','code','Code'],['select_one yn','answer','Answer'],['select_multiple options','multi','Multi'],['select_one statuses','status','Status'],['select_one genders','gender','Gender'],['decimal','amount','Amount'],['date','date','Date']], 'choices':[['list_name','name','label'],['yn','Yes','Yes'],*[['options',v,v] for v in ['a','b','c']],*[['statuses',v,v] for v in ['IDP','Refugee']],*[['genders',v,v] for v in ['Men','Women']]]})
        preview=post('/api/kobo/imports/preview',files={'form':('form.xlsx',form),'data':('responses.csv',raw)})
        project=post('/api/kobo/imports/confirm',dict(token=preview['token'],name='Extended question controls',mappings=preview['mappings']))
    else:
        preview=post('/api/custom/columns/preview',files={'data':('responses.csv',raw)})
        for column in preview['config']['columns']:
            column.update(kind='multiple' if column['header']=='multi' else 'number' if column['header']=='amount' else 'date' if column['header']=='date' else 'text' if column['header']=='code' else 'category',separator=' ' if column['header']=='multi' else '')
        project=post('/api/custom/columns/confirm',dict(token=preview['token'],name='Extended question controls',config=preview['config']))
    ids={q['name'].lower():q['id'] for q in project['form']['questions']}
    fixture[workspace]={'project':project,'ids':ids}
out.joinpath('extended-fixture.json').write_text(json.dumps(fixture),encoding='utf-8')
cases=[('kobo','answer','count','native','breakdown-group','bar'),('custom','answer','sum','native','breakdown-group','bar'),('kobo','multi','count','native','grand-total','line'),('kobo','multi','count','binary','row-total','line'),('custom','multi','count','binary','column-total','line'),('custom','multi','sum','native','row-total','line'),('kobo','multi','count','native','breakdown-group','heatmap'),('custom','multi','average','native','grand-total','heatmap'),('custom','multi','sum','binary','breakdown-group','heatmap')]
for workspace,field,operation,engine,basis,chart in cases:
    item=fixture[workspace];project=item['project'];ids=item['ids'];qid=ids[field]
    settings={**project['settings'],'hidden':[q['id'] for q in project['form']['questions'] if q['id']!=qid],'filters':[],'filterFields':[ids['status']]}
    cfg={**settings['questions'][qid], 'breakdowns':[ids['status'],ids['gender']], 'percentageMode':basis,'chart':chart,'chartTopN':1 if field=='multi' else None,'chartOther':True,'breakdownDisplay':'both','calculation':None if operation=='count' else dict(operation=operation,field=ids['amount'],decimals=2)}
    if chart=='line':
        cfg.update(trendDateField=ids['date'],trendUnit='month',filterMode='own',ownFilters=[dict(field=ids['status'],kind='category',values=['IDP'])]);settings['filters']=[dict(field=ids['status'],kind='category',values=['Refugee'])]
    settings['questions']={**settings['questions'],qid:cfg}
    snapshot=post(f'/api/{workspace}/projects/{project["id"]}/analysis',dict(settings=settings));q=snapshot['questions'][0]
    if workspace=='kobo' and field=='answer':assert [s['percent'] for s in q['rows'][0]['series']]==[40,60,70,30]
    job=post(f'/api/{workspace}/projects/{project["id"]}/exports',dict(settings=settings,question=qid,excelMode=engine,chartMetric='percent' if operation in {'count','sum'} else 'count'))
    started=time.monotonic()
    while job['state'] not in {'complete','error','cancelled'}:
        if time.monotonic()-started>300:raise TimeoutError(job)
        time.sleep(.4);job=client.get(f'/api/{workspace}/exports/{job["id"]}').json()
    assert job['state']=='complete',job
    response=client.get(f'/api/{workspace}/exports/{job["id"]}/download');response.raise_for_status()
    target=out/f'extended-{workspace}-{field}-{operation}-{engine}-{basis}-{chart}.xlsx';target.write_bytes(response.content)
    values=load_workbook(target,data_only=True)
    errors=[(ws.title,c.coordinate,c.value) for ws in values for row in ws for c in row if c.data_type=='e']
    assert not errors,errors[:10]
    print('PASS',workspace,field,operation,engine,basis,chart,flush=True)
