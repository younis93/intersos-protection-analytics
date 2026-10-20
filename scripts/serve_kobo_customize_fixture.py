"""Serve an isolated synthetic Kobo project for browser acceptance checks."""
import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import uvicorn
from backend.kobo import KoboSettings, ProjectStore
from backend.kobo_api import make_router
from backend.test_kobo import sample

root = Path(__file__).resolve().parents[1]
output = root / 'output' / 'kobo-customize'
output.mkdir(parents=True, exist_ok=True)
project = copy.deepcopy(sample.__wrapped__()[0])
form = project['form']
form['groups'].append({'id': 'group/details', 'name': 'details', 'labels': {'en': 'Details', 'ar': 'التفاصيل'}, 'parent': 'group', 'repeat': False})
for question in form['questions']:
    if question['name'] in {'age', 'day'}: question['group'] = 'group/details'
form['questions'].append({**copy.deepcopy(form['questions'][0]), 'id': 'group/location', 'name': 'location', 'labels': {'en': 'Location'}})
form['questions'].append({**copy.deepcopy(form['questions'][0]), 'id': 'empty', 'name': 'empty', 'labels': {'en': 'Empty question'}, 'group': ''})
for record in project['records']:
    record['values']['group/location'] = record['values']['group/gender']
store = ProjectStore(output / 'fixture.sqlite3')
saved = store.create('Community assessment - Customize preview', {**project, 'mappings': [], 'policies': {}, 'warnings': [], 'issues': []}, b'fixture-form', b'fixture-data')
settings = KoboSettings.model_validate({**saved['settings'], 'filterFields': ['group/gender'], 'filters': [{'field': 'group/gender', 'kind': 'category', 'values': ['f']}], 'questions': {'group/needs': {'chart': 'bar', 'colors': {'water': '#007733'}}, 'group/gender': {'chart': 'column', 'colors': {'f': '#445566'}}}})
store.save(saved['id'], settings)
(output / 'fixture.json').write_text(json.dumps({'id': saved['id'], 'settings': settings.model_dump()}), encoding='utf-8')
app = FastAPI(); app.include_router(make_router(store))
app.mount('/', StaticFiles(directory=root / 'frontend' / 'dist', html=True), name='frontend')
if __name__ == '__main__': uvicorn.run(app, host='127.0.0.1', port=int(sys.argv[1]) if len(sys.argv)>1 else 5199, log_level='warning')
