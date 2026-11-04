"""Synthetic conditional conflicts, isolated from user projects."""
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
from backend.test_kobo_conditional import conditional

root = Path(__file__).resolve().parents[1]
output = root / 'output' / 'kobo-conditional-review'
output.mkdir(parents=True, exist_ok=True)
store = ProjectStore(output / f'fixture-{os.getpid()}.sqlite3')
fixture = conditional.__wrapped__()
fixture['form']['questions'][0]['labels'] = {'en': 'Question A: Which protection concerns currently affect people like you in this area? Select up to three concerns and specify the relevant household members.', 'ar': 'السؤال أ: ما هي مخاوف الحماية التي تؤثر حالياً على الأشخاص مثلك في هذه المنطقة؟ اختر ما يصل إلى ثلاثة مخاوف وحدد أفراد الأسرة المعنيين.'}
for index in range(2):
    question = copy.deepcopy(fixture['form']['questions'][2])
    question.update(id=f'no/unchecked{index}', name=f'unchecked{index}', relevant="regex(${a}, 'no')", labels={'en':f'Uncheckable question {index+1}', 'ar':f'سؤال تعذّر فحصه {index+1}'})
    fixture['form']['questions'].append(question)
    for record in fixture['records'][:3]: record['values'][question['id']] = f'Preserved answer {record["row"]}'
saved = store.create('Conditional answer review', fixture, b'fixture', b'fixture', KoboSettings(language='en', hideEmpty=True, hideBlanks=False, hideZero=False))
(output / 'fixture.json').write_text(json.dumps({'id': saved['id']}))
app = FastAPI()
app.include_router(make_router(store))
app.mount('/', StaticFiles(directory=root / 'frontend/dist', html=True), name='frontend')
if __name__ == '__main__': uvicorn.run(app, host='127.0.0.1', port=5384, log_level='warning')
