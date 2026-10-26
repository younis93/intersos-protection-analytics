"""Isolated real API and production UI for Custom Analysis acceptance checks."""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from backend.custom_analysis import make_custom_router
from backend.kobo import ProjectStore
from backend.kobo_api import make_router

root = Path(__file__).resolve().parents[1]
temporary = tempfile.TemporaryDirectory(prefix='custom-analysis-check-')
app = FastAPI()
store = ProjectStore(Path(temporary.name) / 'custom.sqlite3')
app.include_router(make_custom_router(store))
shared = make_router(store, prefix='/api/custom')
shared.routes = [r for r in shared.routes if '/imports/' not in r.path and not r.path.endswith('/review')]
app.include_router(shared)
app.include_router(make_router(ProjectStore(Path(temporary.name) / 'kobo.sqlite3')))
app.mount('/', StaticFiles(directory=root / 'frontend' / 'dist', html=True))
if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=5399, log_level='warning')
