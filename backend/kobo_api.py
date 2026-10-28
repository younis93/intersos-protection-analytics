"""Local Kobo project API. Imports remain staged until mapping is confirmed."""
from __future__ import annotations

import threading
import time
import uuid
from typing import Any, Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from .project_encryption import ExportProtection, ProjectProtectionError, protect_backup, unlock_backup, MAX_UPLOAD
from fastapi.responses import Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .kobo import ChartAppearance, new_project_settings, KoboFilter, KoboSettings, ProjectStore, analyze, filtered_records, label, normalize, parse_data, parse_form, propose_mapping, question_result, data_worksheets
from .kobo_review_schema import ReviewConfig, effective_form, choice_comparison, choice_setting_impacts, validate_removed_answers
from .kobo_import_links import review_details, reuse_links, form_changes, suggest_links, question_matches
from .kobo_indicators import IndicatorDefinition, IndicatorResult, indicator_issues, calculate_indicator, filter_descriptions
from .kobo_settings_share import SettingsFile, export_settings, preview_settings
from .kobo_quality import QualityResult, quality_review
from .kobo_population import PopulationRequest, PopulationResult, compare_population
from .kobo_saved_views import saved_view_issues, apply_saved_view, apply_default_view
from .import_reuse import source_reuse_reasons, settings_reuse_reasons, reuse_result
from .export_recovery import ExportRecoveryStore, RecoveryTask
from .export_temp import cleanup_export_folders


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
    addedFromData: bool = False
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
    source: dict[str, str] = Field(default_factory=dict)
    customConfig: dict[str, Any] | None = None


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


class TrendPoint(BaseModel):
    count: int
    percent: float | None


class TrendSeries(BaseModel):
    id: str
    label: str
    points: list[TrendPoint]


class AnswerTrend(BaseModel):
    dateField: str
    unit: Literal['day', 'month', 'year']
    excluded: int
    periods: list[str]
    denominators: list[int]
    series: list[TrendSeries]


class QuestionResult(BaseModel):
    addedFromData: bool = False
    trend: AnswerTrend | None = None
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
    chart: Literal['bar', 'column', 'pie', 'donut', 'line', 'histogram', 'heatmap']
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
    reuseOnly: bool = False
    settingsPackage: SettingsFile | None = None
    reviewConfig: ReviewConfig = Field(default_factory=ReviewConfig)


class AnalysisRequest(BaseModel):
    settings: KoboSettings
    question: str = ''


class IndicatorRequest(BaseModel):
    settings: KoboSettings
    indicator: IndicatorDefinition


from .column_filters import ColumnFilter, model_record_page, indicator_record_frame, value_page


class QualityRequest(BaseModel):
    columnFilters: list[ColumnFilter] = Field(default_factory=list)
    settings: KoboSettings
    check: str = ''
    page: int = Field(1, ge=1)
    pageSize: int = Field(25, ge=1, le=100)


class SavedViewApplyRequest(BaseModel):
    settings: KoboSettings
    viewId: str


class IndicatorRecordsRequest(IndicatorRequest):
    columnFilters: list[ColumnFilter] = Field(default_factory=list)
    status: Literal['all', 'complete', 'incomplete'] = 'all'
    page: int = Field(1, ge=1)
    pageSize: int = Field(25, ge=1, le=100)


class QuestionPreviewRequest(AnalysisRequest):
    question: str = Field(min_length=1)


class CheckImport(BaseModel):
    reviewConfig: ReviewConfig = Field(default_factory=ReviewConfig)
    mappings: list[ColumnMapping]
    policies: dict[str, str] = Field(default_factory=dict)


class ChoiceReviewRequest(CheckImport):
    question: str
    separator: str = ''


class PreviewImportSettings(CheckImport):
    package: SettingsFile


class ResponseRequest(AnalysisRequest):
    columnFilters: list[ColumnFilter] = Field(default_factory=list)
    question: str
    search: str = ''
    page: int = Field(1, ge=1)
    pageSize: int = Field(50, ge=1, le=200)


class ResponseValuesRequest(ResponseRequest):
    column: str
    valueSearch: str = ''
    offset: int = Field(0, ge=0)


class ExportRequest(AnalysisRequest):
    question: str = ''
    separateGroups: list[str] | None = None
    chartMetric: Literal['count', 'percent', 'both'] = 'count'
    excelMode: Literal['native', 'binary'] = 'native'


class RenameProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class SettingsImportRequest(BaseModel):
    settings: KoboSettings
    package: SettingsFile


class PivotDrilldown(BaseModel):
    baseFilters: list[KoboFilter] | None = None
    question: str = Field(min_length=1)
    answer: str | None = None
    breakdown: str | None = None




class DataRequest(BaseModel):
    columnFilters: list[ColumnFilter] = Field(default_factory=list)
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


class DataValuesRequest(DataRequest):
    column: str
    valueSearch: str = ''
    offset: int = Field(0, ge=0)


class QualityValuesRequest(QualityRequest):
    column: str
    valueSearch: str = ''
    offset: int = Field(0, ge=0)


class IndicatorValuesRequest(IndicatorRecordsRequest):
    column: str
    valueSearch: str = ''
    offset: int = Field(0, ge=0)


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


def make_router(store: ProjectStore | None = None, prefix='/api/kobo'):
    router = APIRouter(prefix=prefix, tags=['Custom Analysis' if prefix == '/api/custom' else 'Kobo Analysis'])
    store = store or ProjectStore()
    recovery = ExportRecoveryStore(store.path.parent / ('custom-export-tasks.sqlite3' if prefix == '/api/custom' else 'export-tasks.sqlite3'))
    cleanup_export_folders()

    @router.get('/export-recovery')
    def export_recovery():
        return recovery.list()

    @router.put('/export-recovery/{task_id}')
    def save_export_recovery(task_id: uuid.UUID, task: RecoveryTask):
        task.input.workspace = 'custom' if prefix == '/api/custom' else 'kobo'
        recovery.save(str(task_id), task)
        return {'saved': True}

    @router.delete('/export-recovery/{task_id}')
    def remove_export_recovery(task_id: uuid.UUID):
        recovery.remove(str(task_id))
        return {'removed': True}
    staged: dict[str, dict] = {}
    lock = threading.Lock()

    def get(pid):
        try: return store.get(pid)
        except KeyError as exc: raise HTTPException(404, str(exc)) from exc

    def mapping_payload(item, links, config=None):
        retained = {q['id'] for q in item.get('reviewConfig', {}).get('addedQuestions', [])}
        for question in (config or {}).get('addedQuestions', []):
            if question['id'] in retained: continue
            si, ci = question['sheet'], question['column']
            if not 0 <= si < len(item['sheets']) or not 0 <= ci < len(item['sheets'][si]['headers']):
                raise ValueError('Add a question from an existing source column.')
            from .kobo import aliases, norm
            group = next((g for g in item['form']['groups'] if g['id'] == question.get('repeat') and g['repeat']), None)
            if si == 0 and question.get('repeat') or si > 0 and (not group or not any(norm(item['sheets'][si]['name']) == a or norm(item['sheets'][si]['name']).endswith('/' + a) for a in aliases(group))):
                raise ValueError('The added question must use its source worksheet repeat context.')
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
            added = next((q for q in (config or {}).get('addedQuestions', []) if q['id'] == m['question']), None)
            if added:
                m['sourceKind'] = ''
                m['sourceRepeat'] = added.get('repeat', '')
            result.append(m)
        if any(m.get('question') in (config or {}).get('excludedQuestionIds', []) for m in result):
            raise ValueError('Ignored questions must not have active source mappings.')
        return result

    @router.get('/projects')
    def projects(): return store.list()

    @router.post('/backups/restore', response_model=ProjectResponse)
    async def restore_backup(file: UploadFile = File(...), password: str | None = Form(None)):
        from .kobo_workspace import read_backup
        try:
            raw = await file.read(MAX_UPLOAD + 1)
        finally:
            await file.close()
        try:
            raw = await run_in_threadpool(unlock_backup, raw, password)
            name, payload, settings, form_raw, data_raw = await run_in_threadpool(read_backup, raw)
            if bool(payload.get('customConfig')) != (prefix == '/api/custom'):
                raise ValueError('Choose a backup from this workspace.')
            if prefix == '/api/custom':
                from .custom_analysis import Configuration
                Configuration.model_validate(payload['customConfig'])
            FormSchema.model_validate(payload['form'])
            question_ids = [q['id'] for q in payload['form']['questions']]
            if len(set(question_ids)) != len(question_ids):
                raise ValueError('Duplicate question identifiers in backup.')
            filtered_records(payload, settings)
            return await run_in_threadpool(store.create, name, payload, form_raw, data_raw, settings)
        except ProjectProtectionError as exc:
            raise HTTPException(400, exc.detail) from None
        except (ValueError, KeyError, TypeError) as exc:
            raise HTTPException(400, {'code': 'invalid_backup', 'message': str(exc)}) from None

    @router.get('/projects/{pid}/backup')
    def download_backup(pid: str):
        return backup_response(pid)

    @router.post('/projects/{pid}/backup')
    def download_protected_backup(pid: str, body: ExportProtection):
        return backup_response(pid, body.value())

    def backup_response(pid, password=None):
        from .kobo_workspace import backup_project
        get(pid)
        try:
            raw = protect_backup(backup_project(store, pid), password)
            extension = 'intersos' if password is not None else 'zip'
            workspace = 'custom' if prefix == '/api/custom' else 'kobo'
            return Response(raw, media_type='application/octet-stream' if password is not None else 'application/zip', headers={
                'Content-Disposition': f'attachment; filename="project.{workspace}-backup.{extension}"', 'Cache-Control': 'no-store'})
        except ProjectProtectionError as exc:
            raise HTTPException(400, exc.detail) from None
        except ValueError as exc:
            raise HTTPException(400, {'code': 'invalid_backup', 'message': str(exc)}) from None

    @router.post('/projects/{pid}/geography')
    def geographic_analysis(pid: str, body: dict):
        from .kobo_workspace import geography
        try:
            return geography(get(pid), KoboSettings.model_validate(body.get('settings', {})), body.get('field', ''))
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.get('/projects/{pid}', response_model=ProjectResponse)
    def project(pid: str):
        p = get(pid)
        return {k: v for k, v in p.items() if k not in {'records', 'sheets'}}

    @router.put('/projects/{pid}/settings')
    def save(pid: str, settings: KoboSettings):
        p = get(pid)
        try:
            filtered_records(p, settings)
            for definition in settings.indicators:
                issues = indicator_issues(p, definition)
                if issues and not definition.reviewIssues: raise ValueError(f'{definition.name}: ' + '\n'.join(issues))
            for view in settings.savedViews:
                issues = saved_view_issues(p, view)
                if issues and not view.reviewIssues: raise ValueError(f'{view.name}: '+'\n'.join(issues))
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

    @router.post('/imports/worksheets')
    async def worksheets(data: UploadFile = File(...)):
        from .main import read_upload_limited
        try:
            raw = await read_upload_limited(data)
            names = await run_in_threadpool(data_worksheets, raw, data.filename or '')
            return {'worksheets': names}
        except HTTPException: raise
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc
        except Exception as exc: raise HTTPException(400, 'Unable to read this workbook. Choose a valid XLSX response workbook.') from exc
        finally: await data.close()

    @router.post('/imports/preview')
    async def preview(form: UploadFile = File(...), data: UploadFile = File(...), worksheet: str = Form('')):
        from .main import read_upload_limited
        try:
            if not (form.filename or '').lower().endswith('.xlsx'): raise ValueError('Form must be an XLSForm .xlsx file.')
            form_raw = await read_upload_limited(form); data_raw = await read_upload_limited(data)
            parsed_form = await run_in_threadpool(parse_form, form_raw)
            sheets = await run_in_threadpool(parse_data, data_raw, data.filename or '', worksheet)
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
                staged[token] = {'created': time.monotonic(), 'form': parsed_form, 'sheets': sheets, 'formRaw': form_raw, 'dataRaw': data_raw, 'mappings': mappings, 'warnings': warnings, 'source': {'worksheet': worksheet}}
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
            worksheet = p.get('source', {}).get('worksheet', '') if not filename.lower().endswith('.csv') else ''
            if data and worksheet:
                available = await run_in_threadpool(data_worksheets, data_raw, filename)
                if worksheet not in available: worksheet = available[0] if available else ''
            sheets = await run_in_threadpool(parse_data, data_raw, filename, worksheet)
            parsed_form = p.get('baseForm', p['form'])
            review_config = ReviewConfig.model_validate(p.get('reviewConfig', {})).model_dump()
            if form:
                from .main import read_upload_limited
                if not (form.filename or '').lower().endswith('.xlsx'): raise ValueError('Form must be an XLSForm .xlsx file.')
                form_raw = await read_upload_limited(form)
                parsed_form = await run_in_threadpool(parse_form, form_raw)
                for header in sheets[0]['headers']:
                    if header.startswith('_') or header.startswith('meta/'):
                        parsed_form['questions'].append({'id': header, 'name': header, 'labels': {'en': header}, 'type': 'text', 'kind': 'date' if header == '_submission_time' else 'text', 'group': '', 'repeat': '', 'metadata': True, 'identifying': False, 'choices': [], 'order': len(parsed_form['questions'])})
            base_form = parsed_form
            retained_groups = {g['id']: g for g in p['form']['groups']}
            present_groups = {g['id'] for g in base_form['groups']}
            def retain_group(gid):
                if gid and gid not in present_groups and gid in retained_groups:
                    group = retained_groups[gid]
                    retain_group(group.get('parent', ''))
                    base_form['groups'].append({**group, 'analysisOnly': True})
                    present_groups.add(gid)
            for added in review_config['addedQuestions']:
                retain_group(added.get('repeat', ''))
                retain_group(added.get('group') or '')
            matches = question_matches(p.get('baseForm', p['form']), base_form)
            review_config['choiceOverrides'] = {matches.get(k, k): v for k, v in review_config['choiceOverrides'].items() if k in matches or any(q['id'] == k for q in review_config['addedQuestions'])}
            known = {q['id'] for q in base_form['questions']} | {q['id'] for q in review_config['addedQuestions']}
            review_config['choiceOverrides'] = {k: v for k, v in review_config['choiceOverrides'].items() if k in known}
            review_config['excludedQuestionIds'] = list(dict.fromkeys(matches.get(qid, qid) for qid in review_config.get('excludedQuestionIds', []) if (qid in matches or any(q['id'] == qid for q in review_config['addedQuestions'])) and matches.get(qid, qid) in known))
            parsed_form = effective_form(base_form, review_config, sheets)
            proposed, warnings = await run_in_threadpool(propose_mapping, parsed_form, sheets)
            old_sheets = await run_in_threadpool(parse_data, original_data_raw, 'data.xlsx' if original_data_raw.startswith(b'PK') else 'data.csv', p.get('source', {}).get('worksheet', '')) if data else sheets
            mappings, reuse_warnings = await run_in_threadpool(reuse_links, p, parsed_form, sheets, old_sheets, proposed)
            warnings += reuse_warnings
            mappings = await run_in_threadpool(suggest_links, parsed_form, sheets, mappings)
            question_links = question_matches(p['form'], parsed_form)
            policies = {question_links[qid]: value for qid, value in p.get('policies', {}).items() if qid in question_links and any(q['id'] == question_links[qid] and q['kind'] == 'multiple' for q in parsed_form['questions'])}
            issues, link_review = await run_in_threadpool(review_details, parsed_form, sheets, mappings, policies)
            examples = await run_in_threadpool(answer_examples, sheets, mappings, issues)
            reuse_reasons = source_reuse_reasons(old_sheets, sheets)
            if form: reuse_reasons.append('A replacement form needs review before applying.')
            if reuse_warnings: reuse_reasons.extend(reuse_warnings)
            if issues: reuse_reasons.extend(issue['message'] for issue in issues)
            if any(m['status'] in {'unmatched', 'ambiguous'} for m in mappings): reuse_reasons.append('Some columns need a confirmed mapping.')
            if link_review.get('noSource'): reuse_reasons.append('Some questions no longer have a data source.')
            reuse_reasons.extend(settings_reuse_reasons(p, {'form': parsed_form, 'records': []}))
            reuse = reuse_result(reuse_reasons)
            token = uuid.uuid4().hex
            with lock:
                for key in list(staged):
                    if time.monotonic() - staged[key]['created'] > 1800: del staged[key]
                if len(staged) >= 3: raise HTTPException(409, 'Finish or cancel an existing import before starting another.')
                staged[token] = {'created': time.monotonic(), 'projectId': pid, 'projectUpdated': p['updated'], 'reuse': reuse, 'policies': policies, 'form': base_form, 'reviewConfig': review_config, 'settings': p['settings'], 'sheets': sheets, 'formRaw': form_raw, 'dataRaw': data_raw, 'mappings': mappings, 'warnings': warnings, 'source': {'worksheet': worksheet}}
            version_counts = {}
            for sheet in sheets:
                for index, header in enumerate(sheet['headers']):
                    if header in {'__version__', '_version', 'version'}:
                        for row in sheet['rows']:
                            value = str(row[index]) if index < len(row) and row[index] is not None else ''
                            if value: version_counts[value] = version_counts.get(value, 0) + 1
            return {'token': token, 'reuse': reuse, 'form': base_form, 'reviewConfig': review_config, 'sheets': [{'name': s['name'], 'rows': len(s['rows']), 'columns': len(s['headers'])} for s in sheets], 'mappings': mappings, 'policies': policies, 'issues': issues, 'examples': examples, 'warnings': parsed_form['warnings'] + warnings, 'linkReview': link_review, 'formChanges': form_changes(p['form'], parsed_form), 'sourceVersions': version_counts, 'expectedVersion': str(parsed_form.get('settings', {}).get('version', ''))}
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc
        finally:
            if form: await form.close()
            if data: await data.close()

    @router.post('/imports/{token}/check')
    def check_import(token: str, body: CheckImport):
        with lock: item = staged.get(token)
        if not item or time.monotonic() - item['created'] > 1800: raise HTTPException(410, 'Import preview expired. Open the review again.')
        try:
            mappings = mapping_payload(item, body.mappings, body.reviewConfig.model_dump())
            form = effective_form(item['form'], body.reviewConfig.model_dump(), item['sheets'])
            issues, link_review = review_details(form, item['sheets'], mappings, body.policies)
            examples = answer_examples(item['sheets'], mappings, issues)
            impacts = []
            settings = item.get('settings') or {}
            context = {'form': form, 'records': []}
            for definition in settings.get('indicators', []):
                problems = indicator_issues(context, IndicatorDefinition.model_validate(definition))
                if problems: impacts.append({'name': definition['name'], 'issues': problems})
            from .kobo import SavedAnalysisView, AnalysisViewSettings
            from .kobo_saved_views import snapshot_issues
            problems = snapshot_issues(context, AnalysisViewSettings.model_validate(settings))
            if problems: impacts.append({'name': 'Current analysis settings', 'issues': problems})
            for view in settings.get('savedViews', []):
                problems = saved_view_issues(context, SavedAnalysisView.model_validate(view))
                if problems: impacts.append({'name': view['name'], 'issues': problems})
            return {'issues': issues, 'examples': examples, 'linkReview': link_review, 'questionImpacts': impacts, 'choiceImpacts': choice_setting_impacts(item.get('settings'), item['form'], form)}
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.post('/imports/{token}/choices')
    def review_choices(token: str, body: ChoiceReviewRequest):
        with lock: item = staged.get(token)
        if not item or time.monotonic() - item['created'] > 1800: raise HTTPException(410, 'Import preview expired. Open the review again.')
        try:
            config = body.reviewConfig.model_dump()
            form = effective_form(item['form'], config, item['sheets'], allow_empty=True)
            mappings = mapping_payload(item, body.mappings, body.reviewConfig.model_dump())
            from .kobo_import_links import validate_links
            validate_links(form, item['sheets'], [{**m, 'answerMap': {}} for m in mappings])
            return choice_comparison(form, item['sheets'], mappings, body.question, body.separator, item.get('settings'))
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.post('/imports/{token}/settings-preview')
    def preview_import_settings(token: str, body: PreviewImportSettings):
        with lock: item = staged.get(token)
        if not item or time.monotonic() - item['created'] > 1800: raise HTTPException(410, 'Import preview expired. Upload both files again.')
        try:
            form = effective_form(item['form'], body.reviewConfig.model_dump(), item['sheets'])
            records, _ = normalize(form, item['sheets'], mapping_payload(item, body.mappings, body.reviewConfig.model_dump()), body.policies)
            defaults = new_project_settings(form, records)
            return preview_settings({'form': form, 'records': records}, defaults, body.package)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.post('/imports/confirm', response_model=ProjectResponse)
    def confirm(body: ConfirmImport):
        with lock: item = staged.get(body.token)
        if not item or time.monotonic() - item['created'] > 1800: raise HTTPException(410, 'Import preview expired. Upload both files again.')
        if body.reuseOnly:
            reasons = list(item.get('reuse', {}).get('reasons', []))
            if not item.get('projectId') or not item.get('reuse', {}).get('eligible'): reasons.append('This upload requires review before settings can be reused.')
            if [m.model_dump() for m in body.mappings] != [ColumnMapping.model_validate(m).model_dump() for m in item['mappings']] or body.policies != item.get('policies', {}) or body.reviewConfig.model_dump() != item.get('reviewConfig') or body.acceptInvalid:
                reasons.append('The import decisions changed. Review before applying.')
            if reasons: raise HTTPException(409, {'message': 'Review is needed before updating data.', 'issues': [{'question': '', 'message': reason, 'count': 1} for reason in reasons]})
        try: mappings = mapping_payload(item, body.mappings, body.reviewConfig.model_dump())
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc
        if len({(m['sheet'], m['column']) for m in mappings}) != len(mappings): raise HTTPException(400, 'Each source column must appear only once.')
        expected = {(si, ci) for si, sheet in enumerate(item['sheets']) for ci in range(len(sheet['headers']))}
        if {(m['sheet'], m['column']) for m in mappings} != expected: raise HTTPException(400, 'Review every source column before confirming the import.')
        if any(m['status'] in {'unmatched', 'ambiguous'} for m in mappings): raise HTTPException(400, 'Resolve or explicitly exclude every unmatched/ambiguous column.')
        if any((m['status'] == 'matched') != bool(m['question']) for m in mappings): raise HTTPException(400, 'Matched columns require a question; excluded columns must not have one.')
        for m in mappings:
            m['header'] = item['sheets'][m['sheet']]['headers'][m['column']]
        try:
            form = effective_form(item['form'], body.reviewConfig.model_dump(), item['sheets'])
            missing_questions = [q['id'] for q in form['questions'] if not q.get('metadata') and not any(m['question'] == q['id'] and m['status'] == 'matched' for m in mappings)]
            if missing_questions: raise ValueError('Link a data column or explicitly ignore every question without data: ' + ', '.join(missing_questions))
            records, issues = normalize(form, item['sheets'], mappings, body.policies)
            validate_removed_answers(item['form'], form, item['sheets'], mappings)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc
        if any('conflicting mapped columns' in issue['message'] for issue in issues):
            raise HTTPException(422, {'message': 'Choose a source priority or explicitly leave conflicting merged answers blank before applying.', 'issues': issues})
        if issues and not body.acceptInvalid: raise HTTPException(422, {'message': 'Review normalization issues. Choose an encoding or explicitly accept invalid answers as blank.', 'issues': issues})
        payload = {'form': form, 'baseForm': item['form'], 'reviewConfig': body.reviewConfig.model_dump(), 'records': records, 'mappings': mappings, 'policies': body.policies, 'warnings': item['warnings'] + item['form']['warnings'], 'issues': issues, 'source': item.get('source', {})}
        if body.reuseOnly:
            reasons = settings_reuse_reasons(get(item['projectId']), payload)
            if reasons: raise HTTPException(409, '; '.join(reasons))
        initial_settings = None
        if body.settingsPackage is not None:
            if item.get('projectId'): raise HTTPException(400, 'Import shared settings from the project Settings menu after reviewing your data.')
            defaults = new_project_settings(form, records)
            try: initial_settings = KoboSettings.model_validate(preview_settings(payload, defaults, body.settingsPackage)['settings'])
            except ValueError as exc: raise HTTPException(400, str(exc)) from exc
        try:
            p = store.repair(item['projectId'], payload, item['formRaw'], item['dataRaw'], preserve_settings=body.reuseOnly, expected_updated=item.get('projectUpdated') if body.reuseOnly else None) if item.get('projectId') else store.create(body.name, payload, item['formRaw'], item['dataRaw'], settings=initial_settings)
        except KeyError as exc: raise HTTPException(404, 'Project not found.') from exc
        except ValueError as exc: raise HTTPException(409, str(exc)) from exc
        with lock: staged.pop(body.token, None)
        return {k: v for k, v in p.items() if k != 'records'}

    @router.post('/projects/{pid}/views/apply', response_model=KoboSettings)
    def open_saved_view(pid: str, body: SavedViewApplyRequest):
        try: return apply_saved_view(get(pid), body.settings, body.viewId)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.post('/projects/{pid}/views/default', response_model=KoboSettings)
    def open_default_view(pid: str, body: AnalysisRequest):
        return apply_default_view(get(pid), body.settings)

    @router.post('/projects/{pid}/population-comparison', response_model=PopulationResult)
    def population_comparison(pid: str, body: PopulationRequest):
        try: return compare_population(get(pid), body.settings, group_field=body.groupField, groups=body.groups, question_id=body.question, indicator=body.indicator)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.post('/projects/{pid}/quality-review', response_model=QualityResult)
    def review_quality(pid: str, body: QualityRequest):
        try:
            result = quality_review(get(pid), body.settings, check_id=body.check, page=1 if body.columnFilters else body.page, page_size=10**9 if body.columnFilters else body.pageSize)
            return model_record_page(result,body.columnFilters,body.page,body.pageSize)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.post('/projects/{pid}/quality-review/values')
    def quality_values(pid: str, body: QualityValuesRequest):
        import pandas as pd
        try:
            result = quality_review(get(pid),body.settings,check_id=body.check,page=1,page_size=10**9)
            frame = pd.DataFrame([row.model_dump() for row in result.rows],columns=['row','scope','answer','reason'])
            return value_page(frame,body.column,body.columnFilters,body.valueSearch,body.offset)
        except ValueError as exc: raise HTTPException(400,str(exc)) from exc

    @router.post('/projects/{pid}/indicators/results', response_model=list[IndicatorResult])
    def indicator_results(pid: str, body: AnalysisRequest):
        project = get(pid)
        try: records = filtered_records(project, body.settings)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc
        results = []
        for definition in body.settings.indicators:
            issues = indicator_issues(project, definition)
            if issues:
                results.append(IndicatorResult(id=definition.id, name=definition.name, issues=issues, filterSummary=filter_descriptions(project, body.settings)))
            else:
                results.append(calculate_indicator(project, body.settings, definition, page_size=0, records=records))
        return results

    @router.post('/projects/{pid}/indicators/preview', response_model=IndicatorResult)
    def indicator_preview(pid: str, body: IndicatorRequest):
        try: return calculate_indicator(get(pid), body.settings, body.indicator, page_size=5)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.post('/projects/{pid}/indicators/records', response_model=IndicatorResult)
    def indicator_records(pid: str, body: IndicatorRecordsRequest):
        try:
            result = calculate_indicator(get(pid),body.settings,body.indicator,status=body.status,page=1 if body.columnFilters else body.page,page_size=10**9 if body.columnFilters else body.pageSize)
            return model_record_page(result,body.columnFilters,body.page,body.pageSize,indicator_record_frame(result))
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.post('/projects/{pid}/indicators/records/values')
    def indicator_values(pid: str, body: IndicatorValuesRequest):
        try:
            result = calculate_indicator(get(pid),body.settings,body.indicator,status=body.status,page=1,page_size=10**9)
            return value_page(indicator_record_frame(result),body.column,body.columnFilters,body.valueSearch,body.offset)
        except ValueError as exc: raise HTTPException(400,str(exc)) from exc

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

    def response_rows(pid, body):
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
        def answer(value):
            return ', '.join(captions.get(str(item),str(item)) for item in value) if isinstance(value,list) else captions.get(str(value),str(value))
        import pandas as pd
        frame = pd.DataFrame([{'row':row['row'],'answer':answer(row['value'])} for row in rows],columns=['row','answer'])
        return rows, frame

    @router.post('/projects/{pid}/responses')
    def responses(pid: str, body: ResponseRequest):
        from .column_filters import apply_column_filters
        rows, frame = response_rows(pid,body)
        try: indexes=apply_column_filters(frame,body.columnFilters).index
        except ValueError as exc: raise HTTPException(400,str(exc)) from exc
        start=(body.page-1)*body.pageSize
        return {'total':len(indexes),'rows':[rows[index] for index in indexes[start:start+body.pageSize]]}

    @router.post('/projects/{pid}/responses/values')
    def response_values(pid: str, body: ResponseValuesRequest):
        _, frame = response_rows(pid,body)
        try: return value_page(frame,body.column,body.columnFilters,body.valueSearch,body.offset)
        except ValueError as exc: raise HTTPException(400,str(exc)) from exc

    @router.post('/projects/{pid}/data')
    def data(pid: str, body: DataRequest):
        from .kobo_data import data_page
        try:
            return data_page(get(pid), body.settings, body.scope, body.columns, body.search, body.sortColumn, body.sortDirection, body.page, body.pageSize, drilldown=body.drilldown.model_dump() if body.drilldown else None, column_filters=body.columnFilters)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.post('/projects/{pid}/data/export')
    def export_data(pid: str, body: DataExportRequest):
        from .kobo_data import data_workbook
        try:
            content = data_workbook(get(pid), body.settings, body.scope, body.columns, body.search, body.sortColumn, body.sortDirection, body.selectedIds, drilldown=body.drilldown.model_dump() if body.drilldown else None, column_filters=body.columnFilters)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return Response(content, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={'Content-Disposition': 'attachment; filename="kobo-response-data.xlsx"'})

    @router.post('/projects/{pid}/data/values')
    def data_values(pid: str, body: DataValuesRequest):
        import pandas as pd
        from .kobo_data import data_rows
        from .column_filters import value_page
        try:
            project = get(pid)
            result = data_rows(project,body.settings,body.scope,body.columns,body.search,drilldown=body.drilldown.model_dump() if body.drilldown else None)
            frame = pd.DataFrame([{'__row__':row['row'],**row['values']} for row in result['rows']],columns=['__row__',*body.columns])
            result = value_page(frame,body.column,body.columnFilters,body.valueSearch,body.offset)
            question = next((q for q in project['form']['questions'] if q['id']==body.column), {})
            kind='number' if body.column=='__row__' or question.get('kind')=='number' else 'date' if question.get('kind')=='date' else 'text'
            import re
            identifier=bool(re.search(r'\b(id|identifier|phone|code)\b',re.sub(r'[_/]+',' ',question.get('name','')),re.I))
            result['type']='text' if identifier else kind
            return result
        except ValueError as exc: raise HTTPException(400,str(exc)) from exc

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
            return jobs.start(p, None, body.settings, body.question, separate_groups=selected_groups, chart_metric=body.chartMetric, excel_mode=body.excelMode)
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
