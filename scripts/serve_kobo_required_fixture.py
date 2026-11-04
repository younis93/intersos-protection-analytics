"""Isolated synthetic grouped-review fixture, including pagination and repeats."""
import copy
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import uvicorn
from backend.kobo import ProjectStore, KoboSettings
from backend.kobo_api import make_router
from backend.test_kobo_required import required_project

root = Path(__file__).resolve().parents[1]
output = root/'output/kobo-required-review'
output.mkdir(parents=True, exist_ok=True)
project, raw = required_project.__wrapped__()
text = project['form']['questions'][1]
text['labels']={'en':'30. If you are living in an informal site or collective shelter, do you have a safe and secure place to stay for the next 6 months?', 'ar':'30. إذا كنت تعيش في موقع غير رسمي أو مأوى جماعي، هل لديك مكان آمن للإقامة خلال الأشهر الستة القادمة؟'}
specs = [
    ('unchecked', 'Unchecked question', 'سؤال تعذّر فحصه', 'text', "regex(${a}, 'yes')"),
    ('leftover', 'Leftover answer', 'إجابة غير منطبقة', 'text', "${a} = 'no'"),
    ('connected_multi', 'Connected required details', 'تفاصيل مطلوبة مرتبطة', 'text', "${a} = 'yes' and ${amount} = 0"),
    ('required_number', 'Required number', 'رقم مطلوب', 'number', ''),
    ('bad_choice', 'Unrecognized answer', 'إجابة غير معروفة', 'category', ''),
    ('_id', 'Submission ID', 'معرف الاستجابة', 'text', ''),
]
for qid, en, ar, kind, relevant in specs:
    q=copy.deepcopy(text)
    q.update(id=qid,name=qid,addedFromData=True,labels={'en':en,'ar':ar},required='',kind=kind,type='decimal' if kind=='number' else 'text',relevant=relevant,metadata=qid=='_id')
    if kind=='category':q.update(type='select_one things',choices=copy.deepcopy(project['form']['questions'][5]['choices']))
    if qid=='required_number':q.update(required='yes',type='integer')
    if qid=='connected_multi':q.update(required='yes')
    project['form']['questions'].append(q)
for record in project['records'][:3]:
    record['values'].update(required_number=None if record['id']=='r1' else 10,unchecked='Stored response',leftover=('Unexpected answer with a very long description of the current household situation and concerns. '*12) if record['id']=='r1' else 'Valid answer' if record['id']=='r2' else '',bad_choice='obsolete' if record['id']=='r1' else 'one',_id=record['sourceIdentity'])
duplicate=copy.deepcopy(project['records'][1]);duplicate.update(id='duplicate',row=8,sourceIdentity='different-uuid');duplicate['values']['_id']='different-id'
project['records'].append(duplicate)
for index in range(331):
    record=copy.deepcopy(project['records'][0]);record.update(id=f'extra-{index}',row=index+10,sourceIdentity=f'extra-uuid-{index}')
    record['values'].update(required_number=12,required_text=None,amount=index+20,dynamic='Filled',bad_choice='one',unchecked='Stored response',leftover='',_id=f'extra-{index}')
    record['values'].update({'branch/optional_followup':['two'],'branch/required_followup':'Filled'})
    project['records'].append(record)
if os.environ.get('KOBO_REVIEW_BLANK_FILL_FIXTURE')=='1':
    text.update(kind='category',type='select_one yesno',choices=[{'name':code,'labels':{'en':en,'ar':ar}} for code,en,ar in [('yes','Yes','نعم'),('no','No','لا'),('unsure','Unsure','غير متأكد')]])
    for record in project['records']:
        if record['values'].get('required_text')=='Complete':record['values']['required_text']='yes'
store=ProjectStore(output/f'fixture-{os.getpid()}.sqlite3')
saved=store.create('Required and connected review',project,raw,b'data',KoboSettings(language='en',hideEmpty=True,hideBlanks=False))
(output/'fixture.json').write_text(json.dumps({'id':saved['id']}))
app=FastAPI();app.include_router(make_router(store));app.mount('/',StaticFiles(directory=root/'frontend/dist',html=True),name='frontend')
if __name__=='__main__':uvicorn.run(app,host='127.0.0.1',port=5385,log_level='warning')
