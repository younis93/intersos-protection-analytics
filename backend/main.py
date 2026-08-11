from __future__ import annotations

import json
import os
import re
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
from .legal_platform import LegalStore, FILES, versioned_dataset_name
from .indicator_reporting import build_indicator_report, build_indicator_workbook, build_narrative_workbook
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
REMEMBERED_ANALYTICS_WORKBOOK = os.getenv("INTERSOS_ANALYTICS_WORKBOOK", "")
store: DataStore | None = None if (UPLOAD_ONLY and not REMEMBERED_ANALYTICS_WORKBOOK) or not workbook.exists() else DataStore.from_path(workbook)
LEGAL_SAMPLE = ROOT / "Legal Platform Data"
REMEMBERED_LEGAL_FOLDER = Path(os.getenv("INTERSOS_LEGAL_FOLDER", "")) if os.getenv("INTERSOS_LEGAL_FOLDER") else None
try:
    REMEMBERED_LEGAL_FILES = [Path(value) for value in json.loads(os.getenv("INTERSOS_LEGAL_FILES", "[]"))]
except (json.JSONDecodeError, TypeError):
    REMEMBERED_LEGAL_FILES = []
def remembered_legal_file_payload(paths: list[Path]) -> dict[str, bytes]:
    selected: dict[str, tuple[int, Path]] = {}
    for path in paths:
        parsed = versioned_dataset_name(path.name)
        if not parsed: continue
        name, version = parsed
        current = selected.get(name)
        if current is None or version > current[0]: selected[name] = (version, path)
    return {name: path.read_bytes() for name, (_, path) in selected.items()}


legal_store: LegalStore | None = (LegalStore.from_files(remembered_legal_file_payload(REMEMBERED_LEGAL_FILES), "Selected Legal Platform CSV files") if REMEMBERED_LEGAL_FILES and all(path.is_file() for path in REMEMBERED_LEGAL_FILES) else (LegalStore.from_folder(REMEMBERED_LEGAL_FOLDER) if REMEMBERED_LEGAL_FOLDER and REMEMBERED_LEGAL_FOLDER.is_dir() else (LegalStore.from_folder(LEGAL_SAMPLE) if LEGAL_SAMPLE.exists() else None)))

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


class ExplorerFilter(BaseModel):
    column: str
    operator: str
    value: str | float | None = None
    value2: str | float | None = None


class ExplorerRequest(BaseModel):
    sheetId: str
    search: str = ""
    filters: list[ExplorerFilter] = []
    sortColumn: str | None = None
    sortDirection: str = "asc"
    page: int = 1
    pageSize: int = 100
    columns: list[str] = []


class LegalQuery(BaseModel):
    dataset: str = "beneficiaries"
    search: str = ""
    rule: str = ""
    page: int = 1
    pageSize: int = 100
    nameCompareChars: int = 15
    allowNameVariations: bool = False
    filterColumn: str = ""
    filterValue: str = ""
    severity: str = ""
    lawyer: str = ""
    project: str = ""
    location: str = ""
    filters: dict[str, list[str]] = {}
    comparisonMonth: str = ""
    sortColumn: str = ""
    sortDirection: str = "asc"


class IndicatorReportRequest(BaseModel):
    fromDate: str = ""
    toDate: str = ""
    projects: list[str] = []
    projectLocations: list[str] = []
    years: list[str] = []
    quarters: list[str] = []
    months: list[str] = []


class CaseQuery(BaseModel):
    query: str
    filters: dict[str, list[str]] = {}
    viewMode: str = "cards"
    page: int = 1
    pageSize: int = 100
    sortColumn: str = ""
    sortDirection: str = "asc"
    columns: list[str] = []


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


@app.get("/api/legal/metadata")
def legal_metadata():
    return legal_store.metadata() if legal_store else {"ready": False, "source": None, "warnings": [], "availability": {name: False for name in FILES}, "sheets": [], "months": [], "reviewCounts": {}}


@app.post("/api/legal/upload")
async def legal_upload(files: list[UploadFile] = File(...)):
    global legal_store
    payload: dict[str, bytes] = {}
    versions: dict[str, int] = {}
    total = 0
    try:
        for file in files:
            filename = Path(file.filename or "").name
            parsed = versioned_dataset_name(filename)
            if not parsed: continue
            key, version = parsed
            raw = await file.read(MAX_UPLOAD_BYTES + 1)
            total += len(raw)
            if total > MAX_UPLOAD_BYTES: raise HTTPException(413, "Legal Platform files must total 100 MB or smaller.")
            if version >= versions.get(key, -1):payload[key]=raw;versions[key]=version
        candidate = await run_in_threadpool(LegalStore.from_files, payload, "Selected Legal Platform folder")
        legal_store = candidate
        return candidate.metadata()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        for file in files: await file.close()


def require_legal_store() -> LegalStore:
    if legal_store is None: raise HTTPException(409, "Select a Legal Platform data folder to begin.")
    return legal_store


@app.post("/api/legal/review")
def legal_review(request: LegalQuery):
    if request.page < 1 or request.pageSize < 1 or request.pageSize > 500: raise HTTPException(400, "Invalid pagination")
    return require_legal_store().review(request.dataset, request.search, request.rule, request.page, request.pageSize, request.severity,request.lawyer,request.project,request.location,request.comparisonMonth,request.nameCompareChars,request.allowNameVariations)


@app.get("/api/legal/review-export/{dataset}")
def legal_review_export(dataset:str,comparison_month:str="",name_compare_chars:int=15,allow_name_variations:bool=False):
    payload=require_legal_store().review_export(dataset,comparison_month,name_compare_chars,allow_name_variations)
    return Response(payload,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",headers={"Content-Disposition":f'attachment; filename="{dataset}-review-findings.xlsx"'})


@app.post("/api/legal/explorer")
def legal_explorer(request: LegalQuery):
    if request.page < 1 or request.pageSize < 1 or request.pageSize > 500: raise HTTPException(400, "Invalid pagination")
    if request.sortDirection not in {"asc","desc"}: raise HTTPException(400,"Invalid sort direction")
    try: return require_legal_store().explorer(request.dataset, request.search, request.page, request.pageSize, request.filterColumn, request.filterValue,request.filters,request.sortColumn,request.sortDirection)
    except ValueError as exc: raise HTTPException(400, str(exc)) from exc


@app.get("/api/legal/explorer-filters/{dataset}")
def legal_explorer_filters(dataset:str):
    try:return require_legal_store().explorer_filters(dataset)
    except ValueError as exc:raise HTTPException(400,str(exc)) from exc


@app.post("/api/legal/explorer-export/{export_format}")
def legal_explorer_export(export_format:str,request:LegalQuery):
    try:payload=require_legal_store().explorer_export(request.dataset,request.search,request.filters,export_format)
    except ValueError as exc:raise HTTPException(400,str(exc)) from exc
    media="text/csv" if export_format=="csv" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return Response(payload,media_type=media,headers={"Content-Disposition":f'attachment; filename="{request.dataset}-filtered.{export_format}"'})


@app.post("/api/legal/case")
def legal_case(request: CaseQuery): return require_legal_store().case(request.query,request.filters,20,request.viewMode,request.page,request.pageSize,request.sortColumn,request.sortDirection,request.columns)


@app.get("/api/legal/case-filters")
def legal_case_filters(): return require_legal_store().case_filters()


@app.post("/api/legal/case-export")
def legal_case_export(request: CaseQuery):
    payload=require_legal_store().case_export(request.query,request.filters)
    name="beneficiary-case" if request.query else "filtered-beneficiary-cases"
    return Response(payload,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",headers={"Content-Disposition":f'attachment; filename="{name}.xlsx"'})


@app.post("/api/legal/lawyers")
def legal_lawyers(request:LegalQuery): return require_legal_store().lawyer_summary(request.filters)


@app.post("/api/legal/intelligence/{page}")
def legal_intelligence(page:str,request:LegalQuery):
    if page not in {"command-center","lawyer-intelligence","donor-impact"}:raise HTTPException(404,"Unknown intelligence page")
    return require_legal_store().intelligence(page,request.filters)


@app.post("/api/legal/indicators")
def legal_indicators(request:IndicatorReportRequest):
    store=require_legal_store()
    key=(request.fromDate,request.toDate,tuple(sorted(request.projects)),tuple(sorted(request.projectLocations)),tuple(sorted(request.years)),tuple(sorted(request.quarters)),tuple(sorted(request.months)))
    with store._cache_lock:
        cached=store._indicator_cache.get(key)
    if cached is not None:return cached
    try:result=build_indicator_report(store.frames,request.fromDate,request.toDate,request.projects,request.projectLocations,request.years,request.quarters,request.months)
    except ValueError as exc:raise HTTPException(400,str(exc)) from exc
    with store._cache_lock:
        store._indicator_cache[key]=result
    return result


@app.post("/api/legal/indicators/export")
def legal_indicators_export(request:IndicatorReportRequest):
    report=legal_indicators(request)
    # The detailed report is the export's primary deliverable. Generating every
    # monthly report and chart here can take several minutes on full datasets;
    # the interactive Analysis tab already prepares that view in the background.
    payload=build_indicator_workbook(report)
    return Response(payload,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",headers={"Content-Disposition":'attachment; filename="professional-indicator-report.xlsx"'})


@app.post("/api/legal/indicators/narrative-export")
def legal_indicators_narrative_export(request:IndicatorReportRequest):
    payload=build_narrative_workbook(legal_indicators(request))
    return Response(payload,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",headers={"Content-Disposition":'attachment; filename="indicator-narrative-report.xlsx"'})


@app.post("/api/legal/detention")
def legal_detention(request:LegalQuery):
    if request.page < 1 or request.pageSize < 1 or request.pageSize > 500: raise HTTPException(400,"Invalid pagination")
    if request.sortDirection not in {"asc","desc"}: raise HTTPException(400,"Invalid sort direction")
    return require_legal_store().detention_cases(request.search,request.page,request.pageSize,request.filters,request.sortColumn,request.sortDirection)


@app.post("/api/legal/detention/reconcile")
async def legal_detention_reconcile(month: str, project: list[str] = Query([]), sheet: str = "", file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".xlsx"): raise HTTPException(400,"Upload an .xlsx comparison workbook")
    if file.size is not None and file.size > MAX_UPLOAD_BYTES: raise HTTPException(413,"Workbook must be 100 MB or smaller.")
    try:
        chunks:list[bytes]=[];total=0
        while chunk:=await file.read(1024*1024):
            total+=len(chunk)
            if total>MAX_UPLOAD_BYTES: raise HTTPException(413,"Workbook must be 100 MB or smaller.")
            chunks.append(chunk)
        return await run_in_threadpool(require_legal_store().detention_reconciliation,b"".join(chunks),file.filename,month,project,sheet)
    except HTTPException: raise
    except ValueError as exc: raise HTTPException(400,str(exc)) from exc
    finally: await file.close()


@app.post("/api/legal/detention/reconcile-export")
async def legal_detention_reconcile_export(month: str, project: list[str] = Query([]), sheet: str = "", file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".xlsx"): raise HTTPException(400,"Upload an .xlsx comparison workbook")
    try:
        raw=await file.read()
        if len(raw)>MAX_UPLOAD_BYTES: raise HTTPException(413,"Workbook must be 100 MB or smaller.")
        payload=await run_in_threadpool(require_legal_store().detention_reconciliation_export,raw,file.filename,month,project,sheet)
        return Response(payload,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",headers={"Content-Disposition":'attachment; filename="detention-comparison-issues.xlsx"'})
    except HTTPException: raise
    except ValueError as exc: raise HTTPException(400,str(exc)) from exc
    finally: await file.close()


@app.post("/api/legal/detention/reconcile-sheets")
async def legal_detention_reconcile_sheets(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".xlsx"): raise HTTPException(400,"Upload an .xlsx comparison workbook")
    try:
        raw=await file.read()
        if len(raw)>MAX_UPLOAD_BYTES:raise HTTPException(413,"Workbook must be 100 MB or smaller.")
        sheets=await run_in_threadpool(LegalStore.detention_workbook_sheets,raw)
        if not sheets:raise HTTPException(400,"The workbook does not contain any worksheets.")
        return {"sheets":sheets,"selected":sheets[0]}
    except HTTPException:raise
    except ValueError as exc:raise HTTPException(400,str(exc)) from exc
    finally:await file.close()


@app.get("/api/legal/export/{dataset}")
def legal_export(dataset: str):
    try: payload=require_legal_store().export(dataset)
    except ValueError as exc: raise HTTPException(400, str(exc)) from exc
    return Response(payload, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{dataset}-filtered.xlsx"'})


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


@app.post("/api/data-explorer/query")
def data_explorer_query(request: ExplorerRequest):
    if request.page < 1 or request.pageSize < 1 or request.pageSize > 500:
        raise HTTPException(400, "Invalid pagination")
    if request.sortDirection not in {"asc", "desc"}:
        raise HTTPException(400, "Invalid sort direction")
    try:
        return require_store().explorer_query(request.sheetId, request.search, [item.model_dump() for item in request.filters], request.sortColumn, request.sortDirection, request.page, request.pageSize, request.columns)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/data-explorer/export/{export_format}")
def data_explorer_export(export_format: str, request: ExplorerRequest):
    if export_format not in {"csv", "xlsx"}:
        raise HTTPException(400, "Unsupported export format")
    try:
        active_store = require_store()
        payload = active_store.explorer_export(request.sheetId, request.search, [item.model_dump() for item in request.filters], request.sortColumn, request.sortDirection, request.columns, export_format)
        sheet_name = active_store.raw_sheet_names[request.sheetId]
        safe_name = re.sub(r'[^A-Za-z0-9._-]+', '-', sheet_name).strip('-') or "data"
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if export_format == "xlsx" else "text/csv"
        return Response(payload, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{safe_name}-filtered.{export_format}"'})
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
    return Response(active_store.export_xlsx(page, parsed, default_ytd), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{page}-filtered.xlsx"'})


if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="dashboard")
