"""Generate real Excel files for independent filters and chart projections."""
import json,time,urllib.request
from pathlib import Path
from openpyxl import load_workbook
root=Path(__file__).resolve().parents[1]
fixtures=json.loads((root/'output/analysis-features/fixture.json').read_text())
base='http://127.0.0.1:5397/api/'
def request(url,data=None):
    req=urllib.request.Request(url,data=None if data is None else json.dumps(data).encode(),headers={} if data is None else {'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=120) as response:return json.load(response)
cases=[('kobo','count','native','grand-total'),('custom','count','binary','row-total'),('kobo','sum','native','grand-total'),('custom','sum','binary','row-total'),('kobo','average','native','grand-total'),('custom','median','native','grand-total'),('kobo','unique','native','grand-total'),('custom','count','native','breakdown-group')]
for workspace,operation,engine,basis in cases:
    item=fixtures[workspace];project=request(base+workspace+'/projects/'+item['id']);settings=project['settings'];ids=item['ids'];qid=ids['answer']
    settings.update(hidden=[ids['code'],ids['amount']],filterFields=[ids['region']],filters=[dict(field=ids['region'],kind='category',values=['north'])])
    settings['questions'][qid].update(filterMode='own',ownFilters=[dict(field=ids['region'],kind='category',values=['south'])],chartTopN=1,chartOther=True,percentageMode=basis,breakdownDisplay='both',calculation=None if operation=='count' else dict(operation=operation,field=ids['amount'],decimals=2))
    snapshot=request(base+workspace+'/projects/'+item['id']+'/analysis',dict(settings=settings));question=next(q for q in snapshot['questions'] if q['id']==qid)
    assert question['cohortCount']==2
    job=request(base+workspace+'/projects/'+item['id']+'/exports',dict(settings=settings,excelMode=engine,chartMetric='percent' if operation in {'count','sum'} else 'count'))
    started=time.monotonic()
    while job['state'] not in {'complete','error','cancelled'}:
        if time.monotonic()-started>240:raise RuntimeError('Export timed out')
        time.sleep(.3);job=request(base+workspace+'/exports/'+job['id'])
    assert job['state']=='complete',job
    with urllib.request.urlopen(base+workspace+'/exports/'+job['id']+'/download') as response:raw=response.read()
    out=root/'output/analysis-features'/f'controls-{workspace}-{operation}-{engine}-{basis}.xlsx';out.write_bytes(raw)
    book=load_workbook(out,data_only=False);values=load_workbook(out,data_only=True)
    errors=[(ws.title,c.coordinate,c.value) for ws in values for row in ws for c in row if c.data_type=='e']
    assert not errors,errors[:10]
    assert any(ws._pivots for ws in book)
    assert any(ws.title.startswith('_Kobo Top N') for ws in book)
    formulas=[str(getattr(c.value,'text',c.value)) for ws in book for row in ws for c in row if c.data_type=='f']
    assert any('GETPIVOTDATA' in formula for formula in formulas)
    print('PASS',workspace,operation,engine,basis,flush=True)
