"""Isolated synthetic projects for portable transfer browser checks."""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from backend.kobo import ProjectStore, KoboSettings
from backend.kobo_api import make_router
from backend.test_kobo import sample
from backend.project_snapshot import materialize
from backend.custom_analysis import make_custom_router, read_tables, initial_columns, Configuration, build

root = Path(__file__).resolve().parents[1]
temporary = tempfile.TemporaryDirectory(prefix='project-transfer-')
output = root/'output'/'project-transfer'
output.mkdir(parents=True, exist_ok=True)
app = FastAPI()
store = ProjectStore(Path(temporary.name)/'kobo.sqlite3')
payload, form, data = materialize(sample.__wrapped__()[0])
project = store.create('Transfer assessment',payload,form,data,KoboSettings(report={'title':'Saved setup'}))
app.include_router(make_router(store))
custom = ProjectStore(Path(temporary.name)/'custom.sqlite3')
raw = b'Code,Amount\n001,20\n002,30\n'
tables = read_tables(raw,'data.csv')
config = Configuration(worksheet='CSV',columns=initial_columns(tables['CSV'][0],list(enumerate(tables['CSV'][1:],2))))
custom_payload, _ = build(tables,config,config.columns)
custom_project = custom.create('Transfer custom',custom_payload,b'',raw)
app.include_router(make_custom_router(custom))
shared = make_router(custom,prefix='/api/custom')
shared.routes = [r for r in shared.routes if '/imports/' not in r.path and r.path != '/api/custom/projects/{pid}/review']
app.include_router(shared)
(output/'fixture.json').write_text(json.dumps({'kobo':project['id'],'custom':custom_project['id']}),encoding='utf-8')
app.mount('/',StaticFiles(directory=root/'frontend'/'dist',html=True),name='frontend')
if __name__=='__main__':
    uvicorn.run(app,host='127.0.0.1',port=int(sys.argv[1]) if len(sys.argv)>1 else 5218,log_level='warning')
