from __future__ import annotations

import json
import os
import secrets
import sys
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel

from .analytics import DataStore
from . import updater


ROOT = Path(__file__).resolve().parents[1]
BUNDLE_ROOT = Path(getattr(sys, "_MEIPASS", ROOT))
STATIC_DIR = Path(os.getenv("UNHCR_STATIC_DIR", BUNDLE_ROOT / "frontend" / "dist"))
DEFAULT_FILE = ROOT / "# Legal platform Analysis - share.xlsx"
UPLOAD_ONLY = os.getenv("UNHCR_UPLOAD_ONLY", "").lower() in {"1", "true", "yes"}
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
LOCAL_SESSION_TOKEN = os.getenv("INTERSOS_LOCAL_SESSION_TOKEN", "")
SESSION_COOKIE = "intersos_session"
workbook = Path(os.getenv("UNHCR_WORKBOOK", DEFAULT_FILE))
store: DataStore | None = None if UPLOAD_ONLY or not workbook.exists() else DataStore.from_path(workbook)

app = FastAPI(title="UNHCR CfP Analytics API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def prevent_stale_api_state(request, call_next):
    if request.url.path.startswith("/api/") and LOCAL_SESSION_TOKEN:
        supplied_token = request.cookies.get(SESSION_COOKIE, "")
        if not secrets.compare_digest(supplied_token, LOCAL_SESSION_TOKEN):
            return Response(status_code=403, content="Local application session required.")
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    elif LOCAL_SESSION_TOKEN:
        response.set_cookie(SESSION_COOKIE, LOCAL_SESSION_TOKEN, httponly=True, samesite="strict", path="/")
    return response


def require_store() -> DataStore:
    if store is None:
        raise HTTPException(409, "Upload an approved Excel workbook to begin analysis.")
    return store


class DashboardRequest(BaseModel):
    filters: dict[str, list[str]] = {}
    measure: str = "records"
    defaultYtd: bool = False


class StudioRequest(BaseModel):
    page: str = "assessment"
    rowDimension: str
    columnDimension: str | None = None
    filters: dict[str, list[str]] = {}
    measure: str = "records"
    defaultYtd: bool = False


@app.get("/api/health")
def health(): return {"status": "ready" if store else "awaiting_upload", "source": store.source_name if store else None}


@app.get("/api/update/check")
def update_check(): return updater.check()


@app.get("/api/update/status")
def update_status(): return updater.status()


@app.post("/api/update/install")
def update_install():
    try: return updater.install()
    except ValueError as exc: raise HTTPException(409, str(exc)) from exc


@app.get("/api/metadata")
def metadata():
    if store is None:
        return {"ready": False, "source": None, "loadedAt": None, "pages": {}}
    return {"ready": True, **store.metadata()}


@app.post("/api/dashboard/{page}")
def dashboard(page: str, request: DashboardRequest):
    active_store = require_store()
    if page != "executive" and page not in active_store.frames: raise HTTPException(404, "Unknown dashboard page")
    if request.measure not in {"records", "beneficiaries"}: raise HTTPException(400, "Invalid measure")
    return active_store.dashboard(page, request.filters, request.measure, request.defaultYtd)


@app.get("/api/quality")
def quality(): return require_store().quality_summary() if store else {"rows": [], "source": None, "loadedAt": None}


@app.post("/api/studio")
def studio(request: StudioRequest):
    try:
        return require_store().studio(request.page, request.rowDimension, request.columnDimension, request.filters, request.measure, request.defaultYtd)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    global store
    if not file.filename or not file.filename.lower().endswith(".xlsx"): raise HTTPException(400, "Upload an .xlsx workbook")
    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Workbook must be 100 MB or smaller.")
    try:
        chunks: list[bytes] = []
        total = 0
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                raise HTTPException(413, "Workbook must be 100 MB or smaller.")
            chunks.append(chunk)
        store = await run_in_threadpool(DataStore.from_bytes, b"".join(chunks), file.filename)
    except HTTPException:
        raise
    except Exception as exc: raise HTTPException(400, str(exc)) from exc
    finally:
        await file.close()
    return {"ready": True, **store.metadata()}


@app.get("/api/export/{page}")
def export(page: str, filters: str = Query("{}"), default_ytd: bool = False):
    active_store = require_store()
    if page not in active_store.frames: raise HTTPException(404, "Unknown dashboard page")
    try: parsed = json.loads(filters)
    except json.JSONDecodeError as exc: raise HTTPException(400, "Invalid filters JSON") from exc
    return Response(active_store.export_csv(page, parsed, default_ytd), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{page}-filtered.csv"'})


if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="dashboard")
