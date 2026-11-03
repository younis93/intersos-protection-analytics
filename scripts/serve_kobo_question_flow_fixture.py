"""Isolated synthetic questionnaire for question-flow browser verification."""
import json
import os
import sys
from copy import deepcopy
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if __name__ == '__main__':
    import uvicorn
    from fastapi import FastAPI
    from fastapi.staticfiles import StaticFiles
    from backend.kobo import ProjectStore, KoboSettings
    from backend.kobo_api import make_router
    from backend.test_kobo_question_flow import grouped_project

    root = Path(__file__).resolve().parents[1]
    folder = root / 'output/question-flow'
    folder.mkdir(parents=True, exist_ok=True)
    p = grouped_project()
    p.pop('id')
    p.pop('name')
    p['form']['questions'][0]['labels'] = {'en': 'Do you need protection assistance?', 'ar': 'هل تحتاج إلى مساعدة في الحماية؟'}
    p['form']['questions'][1]['labels'] = {'en': 'What type of assistance do you need?', 'ar': 'ما نوع المساعدة التي تحتاجها؟'}
    p['form']['questions'][1]['choices'] = [{'name': f'choice-{i}', 'labels': {'en': f'Assistance option {i}', 'ar': f'خيار المساعدة {i}'}} for i in range(1, 16)]
    p['form']['groups'][1]['labels']['ar'] = 'أفراد الأسرة'
    original = deepcopy(p['form']['questions'][0])
    p['form']['questions'].extend([
        {**deepcopy(original), 'id': 'age', 'name': 'age', 'type': 'integer', 'kind': 'number', 'labels': {'en': 'Age of household member', 'ar': 'عمر فرد الأسرة'}, 'group': 'details/members', 'repeat': 'details/members', 'choices': []},
        {**deepcopy(original), 'id': 'complex', 'name': 'complex', 'labels': {'en': 'Additional support needs', 'ar': 'احتياجات الدعم الإضافية'}, 'relevant': "(${main} = 'yes' or ${region} = 'north') and ${age} >= 18"},
        {**deepcopy(original), 'id': 'unsupported', 'name': 'unsupported', 'labels': {'en': 'Condition requiring review', 'ar': 'شرط يحتاج إلى مراجعة'}, 'relevant': "regex(${main}, 'yes') and ${missing} = 1"},
        {**deepcopy(original), 'id': 'calculated', 'name': 'calculated', 'labels': {'en': 'Calculated field', 'ar': 'حقل محسوب'}, 'type': 'calculate', 'metadata': True},
    ])
    store = ProjectStore(folder / f'fixture-{os.getpid()}.sqlite3')
    saved = store.create('Protection questionnaire', {**p, 'mappings': [], 'policies': {}, 'warnings': [], 'issues': []}, b'form', b'data')
    store.save(saved['id'], KoboSettings(hideEmpty=False))
    (folder / 'fixture.json').write_text(json.dumps({'id': saved['id']}), encoding='utf-8')
    app = FastAPI()
    app.include_router(make_router(store))
    app.mount('/', StaticFiles(directory=root / 'frontend/dist', html=True), name='frontend')
    uvicorn.run(app, host='127.0.0.1', port=5797, log_level='warning')
