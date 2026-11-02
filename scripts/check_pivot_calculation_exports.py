import json,time,urllib.request,os
from pathlib import Path
from openpyxl import load_workbook
root=Path(__file__).resolve().parents[1]
f=json.loads((root/'output/analysis-features/fixture.json').read_text())
base='http://127.0.0.1:5397/api/'
def request(url,data=None):
    req=urllib.request.Request(url,data=None if data is None else json.dumps(data).encode(),headers={} if data is None else {'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=120) as r:return json.load(r)
for workspace,calc,mode,engine in [('kobo','count','grand-total','native'),('kobo','count','column-total','binary'),('custom','count','row-total','native'),('custom','count','grand-total','binary'),('kobo','sum','grand-total','native'),('kobo','sum','row-total','binary'),('custom','sum','column-total','native')]:
    if os.getenv('SUM_ONLY') and calc!='sum':continue
    p=request(base+workspace+'/projects/'+f[workspace]['id']);qid=f[workspace]['ids']['answer'];cfg=p['settings']['questions'][qid];cfg.update(percentageMode=mode,breakdownDisplay='both',calculation=None if calc=='count' else {'operation':'sum','field':f[workspace]['ids']['amount'],'decimals':2})
    job=request(base+workspace+'/projects/'+p['id']+'/exports',dict(settings=p['settings'],question=qid,excelMode=engine,chartMetric='both' if calc=='sum' and mode=='row-total' else 'percent' if calc=='sum' else 'count'))
    start=time.monotonic()
    while job['state'] not in ['complete','error','cancelled']:
        if time.monotonic()-start>180:raise RuntimeError('Export timed out')
        time.sleep(.25);job=request(base+workspace+'/exports/'+job['id'])
    assert job['state']=='complete',job
    with urllib.request.urlopen(base+workspace+'/exports/'+job['id']+'/download') as response:raw=response.read()
    out=root/'output/data-editing'/f'{workspace}-{calc}-{mode}-{engine}.xlsx';out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(raw)
    wb=load_workbook(out,data_only=False);values=load_workbook(out,data_only=True);assert any(ws._pivots for ws in wb)
    errors=[(ws.title,cell.coordinate,cell.value) for ws in values for row in ws for cell in row if cell.data_type=='e']
    assert not errors,errors[:8]
    formulas=[str(getattr(c.value,'text',c.value)) for ws in wb for row in ws for c in row if c.data_type=='f'];assert any('GETPIVOTDATA' in v for v in formulas)
    if calc=='sum':assert any('FILTER(' in v for v in formulas)
    report=next(ws for ws in values if ws.sheet_state=='visible' and ws.title!='Data');assert any(c.value in ['B','C'] for row in report for c in row),'Report values were not materialized'
    print('PASS',workspace,calc,mode,engine,'live pivots, formulas and zero Excel error cells',flush=True)
