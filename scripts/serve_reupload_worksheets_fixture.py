"""Run before check_reupload_worksheets.cjs. Uses temporary project databases only."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import uvicorn
from fastapi.testclient import TestClient
from scripts.serve_custom_analysis_fixture import app, root
from backend.test_kobo import workbook

output = root / 'output' / 'reupload-sheets'
output.mkdir(parents=True, exist_ok=True)
form = workbook({'survey': [['type', 'name', 'label'], ['text', 'Code', 'Code'], ['integer', 'Amount', 'Amount']]})
data = workbook({'Data': [['Code', 'Amount'], ['001', 10]], 'Other': [['Code', 'Amount'], ['002', 20]]})
reordered = workbook({'Other': [['Code', 'Amount'], ['003', 30]], 'Data': [['Code', 'Amount'], ['004', 40]]})
missing = workbook({'Other': [['Code', 'Amount'], ['005', 50]]})
for filename, raw in [('form.xlsx', form), ('data.xlsx', data), ('reordered.xlsx', reordered), ('missing.xlsx', missing)]:
    (output / filename).write_bytes(raw)
client = TestClient(app)
p = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form), 'data': ('data.xlsx', data)}, data={'worksheet': 'Data'}).json()
r = client.post('/api/kobo/imports/confirm', json={'token': p['token'], 'name': 'Kobo sheet test', 'mappings': p['mappings']})
r.raise_for_status()
kobo_id = r.json()['id']
p = client.post('/api/custom/columns/preview', files={'data': ('data.xlsx', data)}).json()
r = client.post('/api/custom/columns/confirm', json={'token': p['token'], 'name': 'Custom sheet test', 'config': p['config']})
r.raise_for_status()
(output / 'projects.json').write_text(json.dumps({'kobo': kobo_id, 'custom': r.json()['id']}))
if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=5399, log_level='warning')
