"""Local Kobo project API. Imports remain staged until mapping is confirmed."""
from __future__ import annotations

import threading
import time
import uuid
from typing import Any, Literal

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .kobo import ChartAppearance, new_project_settings, KoboSettings, ProjectStore, analyze, filtered_records, label, normalize, parse_data, parse_form, propose_mapping, question_result
from .kobo_import_links import review_details, reuse_links, form_changes, suggest_links, question_matches
from .kobo_settings_share import SettingsFile, export_settings, preview_settings


class ColumnMapping(BaseModel):
    sheet: int = Field(ge=0)
    column: int = Field(ge=0)
    header: str = ''
    question: str = ''
    option: str = ''
    answerMap: dict[str, str] = Field(default_factory=dict)
    mergeMode: Literal['', 'coalesce', 'priority', 'blank'] = ''
    priority: int = Field(default=0, ge=0)
    sourceKind: str = ''
    sourceRepeat: str | None = None
    status: Literal['matched', 'unmatched', 'ambiguous', 'ignored', 'excluded'] = 'matched'


class FormChoice(BaseModel):
    name: str
    labels: dict[str, str]


class FormQuestion(BaseModel):
    id: str
    name: str
    type: str
    kind: Literal['category', 'multiple', 'number', 'date', 'text']
    labels: dict[str, str]
    group: str
    repeat: str
    metadata: bool
    identifying: bool
    choices: list[FormChoice]


class FormGroup(BaseModel):
    id: str
    name: str
    labels: dict[str, str]
    parent: str
    repeat: bool
    label: str = ''


class FormSchema(BaseModel):
    questions: list[FormQuestion]
    groups: list[FormGroup]
    language: Literal['en', 'ar']
    settings: dict[str, Any]
    warnings: list[str]


class ImportIssue(BaseModel):
    question: str
    message: str
    count: int


class ProjectResponse(BaseModel):
    id: str
    name: str
    updated: str
    form: FormSchema
    settings: KoboSettings
    warnings: list[str] = Field(default_factory=list)
    issues: list[ImportIssue] = Field(default_factory=list)


class BreakdownCount(BaseModel):
    id: str
    count: int
    percent: float | None
    displayPercent: float | None = None


class PivotRow(BaseModel):
    id: str
    label: str
    count: int
    percent: float | None
    displayPercent: float | None = None
    series: list[BreakdownCount] = Field(default_factory=list)


class QuestionResult(BaseModel):
    appearance: ChartAppearance = Field(default_factory=ChartAppearance)
    id: str
    name: str
    label: str
    group: str
    kind: Literal['category', 'multiple', 'number', 'date', 'text']
    repeat: str
    denominator: int
    missing: int
    total: int
    rows: list[PivotRow]
    statistics: dict[str, float]
    bins: list[dict[str, Any]]
    breakdowns: list[dict[str, Any]]
    breakdownFields: list[dict[str, str]] = Field(default_factory=list)
    breakdownDisplay: Literal['count', 'percent', 'both'] = 'both'
    percentageDecimals: Literal[0, 1, 2] = 0
    percentageBasis: str
    chart: Literal['bar', 'column', 'pie', 'donut', 'line']
    colors: dict[str, str]
    pointColors: dict[str, str] = Field(default_factory=dict)


class AnalysisResponse(BaseModel):
    total: int
    filtered: int
    questions: list[QuestionResult]
    filterSummary: list[str]
    groups: list[FormGroup]
    settings: KoboSettings


class ExportStatus(BaseModel):
    id: str
    state: Literal['queued', 'running', 'complete', 'error', 'cancelled']
    progress: int
    message: str


class ConfirmImport(BaseModel):
    token: str
    name: str = Field(min_length=1, max_length=200)
    mappings: list[ColumnMapping]
    policies: dict[str, str] = Field(default_factory=dict)
    acceptInvalid: bool = False
    settingsPackage: SettingsFile | None = None


class AnalysisRequest(BaseModel):
    settings: KoboSettings
    question: str = ''


class QuestionPreviewRequest(AnalysisRequest):
    question: str = Field(min_length=1)


class CheckImport(BaseModel):
    mappings: list[ColumnMapping]
    policies: dict[str, str] = Field(default_factory=dict)


class PreviewImportSettings(CheckImport):
    package: SettingsFile


class ResponseRequest(AnalysisRequest):
    question: str
    search: str = ''
    page: int = Field(1, ge=1)
    pageSize: int = Field(50, ge=1, le=200)


class ExportRequest(AnalysisRequest):
    question: str = ''
    separateGroups: list[str] | None = None
    chartMetric: Literal['count', 'percent', 'both'] = 'count'


class RenameProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class SettingsImportRequest(BaseModel):
    settings: KoboSettings
    package: SettingsFile


class PivotDrilldown(BaseModel):
    question: str = Field(min_length=1)
    answer: str | None = None
    breakdown: str | None = None


class DataRequest(BaseModel):
    drilldown: PivotDrilldown | None = None
    settings: KoboSettings
    scope: str = ''
    columns: list[str] = Field(default_factory=list, max_length=1000)
    search: str = Field('', max_length=1000)
    sortColumn: str = ''
    sortDirection: Literal['asc', 'desc'] = 'asc'
    page: int = Field(1, ge=1)
    pageSize: int = Field(50, ge=1, le=100)


class DataExportRequest(DataRequest):
    selectedIds: list[str] | None = None


def answer_examples(sheets, mappings, issues):
    """Attach bounded source examples without repeating normalization."""
    columns = {}
    for mapping in mappings:
        columns.setdefault((mapping['question'], mapping['sheet']), []).append(mapping['column'])
    examples = {}
    for qid in {issue['question'] for issue in issues}:
        examples[qid] = []
        for si, sheet in enumerate(sheets):
            selected = columns.get((qid, si), [])
            if not selected: continue
            for ri, row in enumerate(sheet['rows']):
                values = [{'column': sheet['headers'][ci], 'value': row[ci]} for ci in selected if ci < len(row) and row[ci] is not None and str(row[ci]).strip()]
                if values: examples[qid].append({'sheet': sheet['name'], 'row': ri + 2, 'values': values})
                if len(examples[qid]) >= 10: break
            if len(examples[qid]) >= 10: break
    return examples


def make_router(store: ProjectStore | None = None):
    router = APIRouter(prefix='/api/kobo', tags=['Kobo Analysis'])
    store = store or ProjectStore()
    staged: dict[str, dict] = {}
    lock = threading.Lock()

    def get(pid):
        try: return store.get(pid)
        except KeyError as exc: raise HTTPException(404, str(exc)) from exc

    def mapping_payload(item, links):
        original = {(m['sheet'], m['column']): m for m in item['mappings']}
        result = []
        for link in links:
            m = link.model_dump()
            source = original.get((m['sheet'], m['column']))
            if source is None: raise ValueError('Mapping column is outside its worksheet.')
            m['header'] = source['header']
            # Source type/context come from the staged files, never the client.
            for field in ['sourceKind', 'sourceRepeat']:
                if field in source: m[field] = source[field]
            result.append(m)
        return result

    @router.get('/projects')
    def projects(): return store.list()

    @router.get('/projects/{pid}', response_model=ProjectResponse)
    def project(pid: str):
        p = get(pid)
        return {k: v for k, v in p.items() if k not in {'records', 'sheets'}}

    @router.put('/projects/{pid}/settings')
    def save(pid: str, settings: KoboSettings):
        p = get(pid)
        try:
            filtered_records(p, settings)
            store.save(pid, settings)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc
        return {'saved': True}

    @router.post('/projects/{pid}/settings/export')
    def settings_export(pid: str, settings: KoboSettings):
        return export_settings(get(pid), settings)

    @router.post('/projects/{pid}/settings/import-preview')
    def settings_import_preview(pid: str, body: SettingsImportRequest):
        try: return preview_settings(get(pid), body.settings, body.package)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.patch('/projects/{pid}')
    def rename_project(pid: str, body: RenameProjectRequest):
        try: return store.rename(pid, body.name)
        except KeyError as exc: raise HTTPException(404, 'Project not found.') from exc
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.delete('/projects/{pid}')
    def delete(pid: str):
        get(pid); store.delete(pid)
        return {'deleted': True}

    @router.post('/imports/preview')
    async def preview(form: UploadFile = File(...), data: UploadFile = File(...)):
        from .main import read_upload_limited
        try:
            if not (form.filename or '').lower().endswith('.xlsx'): raise ValueError('Form must be an XLSForm .xlsx file.')
            form_raw = await read_upload_limited(form); data_raw = await read_upload_limited(data)
            parsed_form = await run_in_threadpool(parse_form, form_raw)
            sheets = await run_in_threadpool(parse_data, data_raw, data.filename or '')
            # Export metadata is available only through the metadata visibility toggle.
            for si, sheet in enumerate(sheets):
                if si: continue
                for ci, header in enumerate(sheet['headers']):
                    if header.startswith('_') or header.startswith('meta/'):
                        parsed_form['questions'].append({'id': header, 'name': header, 'labels': {'en': header}, 'type': 'text', 'kind': 'date' if header == '_submission_time' else 'text', 'group': '', 'repeat': '', 'metadata': True, 'identifying': False, 'choices': [], 'order': len(parsed_form['questions'])})
            mappings, warnings = await run_in_threadpool(propose_mapping, parsed_form, sheets)
            mappings = await run_in_threadpool(suggest_links, parsed_form, sheets, mappings)
            issues, link_review = await run_in_threadpool(review_details, parsed_form, sheets, mappings)
            token = uuid.uuid4().hex
            with lock:
                for key in list(staged):
                    if time.monotonic() - staged[key]['created'] > 1800: del staged[key]
                if len(staged) >= 3: raise HTTPException(409, 'Finish or cancel an existing import before starting another.')
                staged[token] = {'created': time.monotonic(), 'form': parsed_form, 'sheets': sheets, 'formRaw': form_raw, 'dataRaw': data_raw, 'mappings': mappings, 'warnings': warnings}
            return {'token': token, 'form': parsed_form, 'sheets': [{'name': s['name'], 'rows': len(s['rows']), 'columns': len(s['headers'])} for s in sheets], 'mappings': mappings, 'issues': issues, 'linkReview': link_review, 'expectedVersion': str(parsed_form.get('settings', {}).get('version') or ''), 'warnings': parsed_form['warnings'] + warnings}
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc
        except (OSError, KeyError, TypeError) as exc: raise HTTPException(400, 'Unable to read this workbook. Check that it is a valid Kobo XLSX export.') from exc
        finally: await form.close(); await data.close()

    @router.delete('/imports/{token}')
    def cancel_import(token: str):
        with lock: staged.pop(token, None)
        return {'cancelled': True}

    @router.post('/projects/{pid}/review')
    async def review_project(pid: str, form: UploadFile | None = File(None), data: UploadFile | None = File(None)):
        p = await run_in_threadpool(get, pid)
        try:
            form_raw, data_raw = await run_in_threadpool(store.sources, pid)
            original_data_raw = data_raw
            filename = 'data.xlsx' if data_raw.startswith(b'PK') else 'data.csv'
            if data:
                from .main import read_upload_limited
                filename = data.filename or ''
                data_raw = await read_upload_limited(data)
            sheets = await run_in_threadpool(parse_data, data_raw, filename)
            parsed_form = p['form']
            if form:
                from .main import read_upload_limited
                if not (form.filename or '').lower().endswith('.xlsx'): raise ValueError('Form must be an XLSForm .xlsx file.')
                form_raw = await read_upload_limited(form)
                parsed_form = await run_in_threadpool(parse_form, form_raw)
                for header in sheets[0]['headers']:
                    if header.startswith('_') or header.startswith('meta/'):
                        parsed_form['questions'].append({'id': header, 'name': header, 'labels': {'en': header}, 'type': 'text', 'kind': 'date' if header == '_submission_time' else 'text', 'group': '', 'repeat': '', 'metadata': True, 'identifying': False, 'choices': [], 'order': len(parsed_form['questions'])})
            proposed, warnings = await run_in_threadpool(propose_mapping, parsed_form, sheets)
            old_sheets = await run_in_threadpool(parse_data, original_data_raw, 'data.xlsx' if original_data_raw.startswith(b'PK') else 'data.csv') if data else sheets
            mappings, reuse_warnings = await run_in_threadpool(reuse_links, p, parsed_form, sheets, old_sheets, proposed)
            warnings += reuse_warnings
            mappings = await run_in_threadpool(suggest_links, parsed_form, sheets, mappings)
            question_links = question_matches(p['form'], parsed_form)
            policies = {question_links[qid]: value for qid, value in p.get('policies', {}).items() if qid in question_links and any(q['id'] == question_links[qid] and q['kind'] == 'multiple' for q in parsed_form['questions'])}
            issues, link_review = await run_in_threadpool(review_details, parsed_form, sheets, mappings, policies)
            examples = await run_in_threadpool(answer_examples, sheets, mappings, issues)
            token = uuid.uuid4().hex
            with lock:
                for key in list(staged):
                    if time.monotonic() - staged[key]['created'] > 1800: del staged[key]
                if len(staged) >= 3: raise HTTPException(409, 'Finish or cancel an existing import before starting another.')
                staged[token] = {'created': time.monotonic(), 'projectId': pid, 'form': parsed_form, 'sheets': sheets, 'formRaw': form_raw, 'dataRaw': data_raw, 'mappings': mappings, 'warnings': warnings}
            version_counts = {}
            for sheet in sheets:
                for index, header in enumerate(sheet['headers']):
                    if header in {'__version__', '_version', 'version'}:
                        for row in sheet['rows']:
                            value = str(row[index]) if index < len(row) and row[index] is not None else ''
                            if value: version_counts[value] = version_counts.get(value, 0) + 1
            return {'token': token, 'form': parsed_form, 'sheets': [{'name': s['name'], 'rows': len(s['rows']), 'columns': len(s['headers'])} for s in sheets], 'mappings': mappings, 'policies': policies, 'issues': issues, 'examples': examples, 'warnings': parsed_form['warnings'] + warnings, 'linkReview': link_review, 'formChanges': form_changes(p['form'], parsed_form), 'sourceVersions': version_counts, 'expectedVersion': str(parsed_form.get('settings', {}).get('version', ''))}
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc
        finally:
            if form: await form.close()
            if data: await data.close()

    @router.post('/imports/{token}/check')
    def check_import(token: str, body: CheckImport):
        with lock: item = staged.get(token)
        if not item or time.monotonic() - item['created'] > 1800: raise HTTPException(410, 'Import preview expired. Open the review again.')
        try:
            mappings = mapping_payload(item, body.mappings)
            issues, link_review = review_details(item['form'], item['sheets'], mappings, body.policies)
            examples = answer_examples(item['sheets'], mappings, issues)
            return {'issues': issues, 'examples': examples, 'linkReview': link_review}
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.post('/imports/{token}/settings-preview')
    def preview_import_settings(token: str, body: PreviewImportSettings):
        with lock: item = staged.get(token)
        if not item or time.monotonic() - item['created'] > 1800: raise HTTPException(410, 'Import preview expired. Upload both files again.')
        try:
            records, _ = normalize(item['form'], item['sheets'], mapping_payload(item, body.mappings), body.policies)
            defaults = new_project_settings(item['form'])
            return preview_settings({'form': item['form'], 'records': records}, defaults, body.package)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.post('/imports/confirm', response_model=ProjectResponse)
    def confirm(body: ConfirmImport):
        with lock: item = staged.get(body.token)
        if not item or time.monotonic() - item['created'] > 1800: raise HTTPException(410, 'Import preview expired. Upload both files again.')
        try: mappings = mapping_payload(item, body.mappings)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc
        if len({(m['sheet'], m['column']) for m in mappings}) != len(mappings): raise HTTPException(400, 'Each source column must appear only once.')
        expected = {(si, ci) for si, sheet in enumerate(item['sheets']) for ci in range(len(sheet['headers']))}
        if {(m['sheet'], m['column']) for m in mappings} != expected: raise HTTPException(400, 'Review every source column before confirming the import.')
        if any(m['status'] in {'unmatched', 'ambiguous'} for m in mappings): raise HTTPException(400, 'Resolve or explicitly exclude every unmatched/ambiguous column.')
        if any((m['status'] == 'matched') != bool(m['question']) for m in mappings): raise HTTPException(400, 'Matched columns require a question; excluded columns must not have one.')
        for m in mappings:
            m['header'] = item['sheets'][m['sheet']]['headers'][m['column']]
        try: records, issues = normalize(item['form'], item['sheets'], mappings, body.policies)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc
        if any('conflicting mapped columns' in issue['message'] for issue in issues):
            raise HTTPException(422, {'message': 'Choose a source priority or explicitly leave conflicting merged answers blank before applying.', 'issues': issues})
        if issues and not body.acceptInvalid: raise HTTPException(422, {'message': 'Review normalization issues. Choose an encoding or explicitly accept invalid answers as blank.', 'issues': issues})
        payload = {'form': item['form'], 'records': records, 'mappings': mappings, 'policies': body.policies, 'warnings': item['warnings'] + item['form']['warnings'], 'issues': issues}
        initial_settings = None
        if body.settingsPackage is not None:
            if item.get('projectId'): raise HTTPException(400, 'Import shared settings from the project Settings menu after reviewing your data.')
            defaults = new_project_settings(item['form'])
            try: initial_settings = KoboSettings.model_validate(preview_settings(payload, defaults, body.settingsPackage)['settings'])
            except ValueError as exc: raise HTTPException(400, str(exc)) from exc
        try:
            p = store.repair(item['projectId'], payload, item['formRaw'], item['dataRaw']) if item.get('projectId') else store.create(body.name, payload, item['formRaw'], item['dataRaw'], settings=initial_settings)
        except KeyError as exc: raise HTTPException(404, 'Project not found.') from exc
        with lock: staged.pop(body.token, None)
        return {k: v for k, v in p.items() if k != 'records'}

    @router.post('/projects/{pid}/analysis', response_model=AnalysisResponse)
    def analysis(pid: str, body: AnalysisRequest):
        try: return analyze(get(pid), body.settings, body.question)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.post('/projects/{pid}/analysis/preview', response_model=QuestionResult)
    def preview_question(pid: str, body: QuestionPreviewRequest):
        project = get(pid)
        questions = {q['id']: q for q in project['form']['questions']}
        question = questions.get(body.question)
        if question is None: raise HTTPException(404, 'Question not found.')
        try:
            records = filtered_records(project, body.settings)
            lookup = {record['id']: record for record in project['records']}
            return question_result(question, records, body.settings, questions, lookup)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.post('/projects/{pid}/responses')
    def responses(pid: str, body: ResponseRequest):
        p = get(pid)
        q = next((q for q in p['form']['questions'] if q['id'] == body.question), None)
        if not q: raise HTTPException(404, 'Question not found.')
        try: records = filtered_records(p, body.settings)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc
        captions = {choice['name']: label(choice, body.settings.language) for choice in q['choices']}
        query = body.search.strip().casefold()
        rows = []
        for record in records:
            value = record['values'].get(body.question)
            if record['scope'] != q['repeat'] or value is None: continue
            values = value if isinstance(value, list) else [value]
            searchable = str(value) + ' ' + ' '.join(captions.get(str(item), str(item)) for item in values)
            if query in searchable.casefold(): rows.append({'id': record['id'], 'row': record['row'], 'value': value})
        start = (body.page - 1) * body.pageSize
        return {'total': len(rows), 'rows': rows[start:start + body.pageSize]}

    @router.post('/projects/{pid}/data')
    def data(pid: str, body: DataRequest):
        from .kobo_data import data_page
        try:
            return data_page(get(pid), body.settings, body.scope, body.columns, body.search, body.sortColumn, body.sortDirection, body.page, body.pageSize, drilldown=body.drilldown.model_dump() if body.drilldown else None)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.post('/projects/{pid}/data/export')
    def export_data(pid: str, body: DataExportRequest):
        from .kobo_data import data_workbook
        try:
            content = data_workbook(get(pid), body.settings, body.scope, body.columns, body.search, body.sortColumn, body.sortDirection, body.selectedIds, drilldown=body.drilldown.model_dump() if body.drilldown else None)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return Response(content, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={'Content-Disposition': 'attachment; filename="kobo-response-data.xlsx"'})

    @router.get('/projects/{pid}/filter-options/{question:path}')
    def filter_options(pid: str, question: str):
        p = get(pid)
        values = set()
        for r in p['records']:
            if question not in r['values']: continue
            v = r['values'][question]
            values.update(v if isinstance(v, list) else [str(v) if v is not None else '__blank__'])
        return sorted(values)

    @router.post('/projects/{pid}/exports', response_model=ExportStatus)
    def export(pid: str, body: ExportRequest):
        from .kobo_excel import jobs
        p = get(pid)
        try:
            selected_groups = body.separateGroups if body.separateGroups is not None else body.settings.excelGroups
            if selected_groups is not None and set(selected_groups) - {group['id'] for group in p['form']['groups']}:
                raise ValueError('A selected export group no longer exists. Reopen Excel export options.')
            return jobs.start(p, None, body.settings, body.question, separate_groups=selected_groups, chart_metric=body.chartMetric)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.get('/exports/{job}', response_model=ExportStatus)
    def export_status(job: str):
        from .kobo_excel import jobs
        try: return jobs.status(job)
        except KeyError as exc: raise HTTPException(404, 'Export job not found.') from exc

    @router.delete('/exports/{job}')
    def export_cancel(job: str):
        from .kobo_excel import jobs
        jobs.cancel(job)
        return {'cancelled': True}

    @router.get('/exports/{job}/download')
    def export_download(job: str):
        from .kobo_excel import jobs
        try: payload = jobs.download(job)
        except (ValueError, KeyError) as exc: raise HTTPException(409, 'Export is not ready or has expired.') from exc
        return Response(payload, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={'Content-Disposition': 'attachment; filename="kobo-analysis.xlsx"'})

    return router
