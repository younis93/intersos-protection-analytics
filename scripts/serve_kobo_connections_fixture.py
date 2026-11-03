"""Isolated synthetic workspace for connection UI and live-export checks."""
import json
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


if __name__ == '__main__':
    from fastapi import FastAPI
    from fastapi.staticfiles import StaticFiles
    import uvicorn
    from backend.kobo import ProjectStore, KoboSettings, QuestionSettings
    from backend.kobo_api import make_router
    from backend.test_kobo_connection_modes import example as project
    root = Path(__file__).resolve().parents[1]
    folder = root/'output/conditional-questions'
    folder.mkdir(parents=True, exist_ok=True)
    store = ProjectStore(folder/f'fixture-{os.getpid()}.sqlite3')
    p = project()
    p.pop('id'); p.pop('name')
    p['form']['groups'] = [dict(id='main-group',name='main-group',labels={'en':'Main questions','ar':'الأسئلة الرئيسية'},parent='',repeat=False),dict(id='details',name='details',labels={'en':'Follow-up questions','ar':'أسئلة المتابعة'},parent='',repeat=False)]
    for question in p['form']['questions']:question['group']='main-group'
    follow=p['form']['questions'][1]
    follow['group']='details'
    follow['labels']={'en':'Please specify the other protection concern reported by the respondent','ar':'يرجى توضيح مخاوف الحماية الأخرى التي أبلغ عنها المستجيب'}
    follow['relevant']="(${main} = 'other' or selected(${main}, 'yes')) and ${region} = 'north'"
    follow['choices'][0]['labels']={'en':'Access to documentation','ar':'الوصول إلى الوثائق'}
    follow['choices'][1]['labels']={'en':'Access to essential services','ar':'الوصول إلى الخدمات الأساسية'}
    from copy import deepcopy
    unlinked=deepcopy(follow);unlinked.update(id='unlinked',name='unlinked',relevant='',labels={'en':'Unlinked follow-up','ar':'سؤال متابعة دون ارتباط'})
    p['form']['questions'].append(unlinked)
    for record in p['records']:record['values']['unlinked']=record['values']['follow']
    missing=deepcopy(unlinked);missing.update(id='missing',name='missing',relevant="${removed_parent} = 'other'",labels={'en':'Follow-up with missing original question','ar':'متابعة بسؤال أصل مفقود'})
    p['form']['questions'].append(missing)
    for record in p['records']:record['values']['missing']=record['values']['follow']
    saved=store.create('Connected questions verification',{**p,'mappings':[],'policies':{},'warnings':[],'issues':[]},b'fixture',b'fixture')
    settings=KoboSettings(questions={'follow':QuestionSettings(chart='bar',percentageParent='main',connectedPercentageMode='adjust')},hideEmpty=False)
    store.save(saved['id'],settings)
    (folder/'fixture.json').write_text(json.dumps({'id':saved['id'],'settings':settings.model_dump()}),encoding='utf-8')
    app=FastAPI();app.include_router(make_router(store));app.mount('/',StaticFiles(directory=root/'frontend/dist',html=True),name='frontend')
    uvicorn.run(app,host='127.0.0.1',port=5796,log_level='warning')
