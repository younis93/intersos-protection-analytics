"""Flat-table imports with explicit, reproducible column conversions."""
from __future__ import annotations

import csv
import io
import math
import os
import re
import threading
import time
import uuid
import zipfile
from collections import Counter
from datetime import date, datetime, time as datetime_time
from pathlib import Path
from typing import Literal

import openpyxl
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .custom_preparation import Preparation, CalculatedColumn, ValidationRule, active_preparation, clean_value, prepared_number, calculated_columns, validate_rules
from .custom_duplicates import DuplicateReview, review_duplicates
from .file_security import validate_xlsx_archive
from .kobo import ProjectStore, scalar, missing, new_project_settings
from .import_reuse import source_reuse_reasons, settings_reuse_reasons, reuse_result


class Column(BaseModel):
    id: str
    index: int = Field(ge=0)
    header: str = ''
    label: str = Field(min_length=1, max_length=1000)
    kind: Literal['text', 'number', 'date', 'category', 'multiple'] = 'text'
    included: bool = True
    group: str = Field('', max_length=200)
    dateFormat: Literal['auto', 'uk', 'us', 'iso'] = 'auto'
    separator: str = Field('', max_length=20)
    categories: dict[str, str] = Field(default_factory=dict)
    invalidAsMissing: bool = False
    includeTime: bool = False
    timeLabel: str = Field('', max_length=1000)
    preparation: Preparation = Field(default_factory=Preparation)


class Configuration(BaseModel):
    worksheet: str = ''
    headerRow: int = Field(1, ge=1, le=100000)
    dateFormat: Literal['auto', 'uk', 'us', 'iso'] = 'auto'
    columns: list[Column] = Field(default_factory=list, max_length=1000)
    filterFields: list[str] = Field(default_factory=list, max_length=2000)
    dateFilterModes: dict[str, Literal['range', 'month', 'both']] = Field(default_factory=dict)
    calculatedColumns: list[CalculatedColumn] = Field(default_factory=list, max_length=100)
    duplicateReview: DuplicateReview = Field(default_factory=DuplicateReview)
    validationRules: list[ValidationRule] = Field(default_factory=list, max_length=100)


class Confirm(BaseModel):
    token: str
    name: str = Field(min_length=1, max_length=200)
    config: Configuration
    reuseOnly: bool = False


def custom_store():
    path = os.getenv('INTERSOS_CUSTOM_DB')
    return ProjectStore(Path(path) if path else ProjectStore().path.with_name('custom-projects.sqlite3'))


def read_tables(raw, filename):
    if filename.lower().endswith('.csv'):
        try:
            text = raw.decode('utf-8-sig')
        except UnicodeDecodeError:
            try: text = raw.decode('utf-16')
            except UnicodeDecodeError as exc: raise ValueError('CSV must use UTF-8 or UTF-16 encoding.') from exc
        try: dialect = csv.Sniffer().sniff(text[:8192], delimiters=',;\t')
        except csv.Error: dialect = csv.excel
        rows = list(csv.reader(io.StringIO(text), dialect))
        if not rows: raise ValueError('The CSV file is empty.')
        tables = {'CSV': rows}
    elif filename.lower().endswith('.xlsx'):
        validate_xlsx_archive(raw)
        try: book = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        except (KeyError, OSError, SyntaxError, zipfile.BadZipFile, openpyxl.utils.exceptions.InvalidFileException) as exc:
            raise ValueError('Unable to read this workbook. Choose a valid XLSX file.') from exc
        try: tables = {sheet.title: [[scalar(v) for v in row] for row in sheet.iter_rows(values_only=True)] for sheet in book.worksheets}
        finally: book.close()
    else: raise ValueError('Choose an XLSX or CSV file.')
    if not any(any(any(not missing(v) for v in row) for row in rows) for rows in tables.values()):
        raise ValueError('The file contains no data.')
    return tables


def table_data(tables, config):
    if config.worksheet not in tables: raise ValueError('Choose an available worksheet.')
    rows = tables[config.worksheet]
    if config.headerRow > len(rows): raise ValueError('The header row is outside the worksheet.')
    header = rows[config.headerRow - 1]
    data = [(i + 1, row) for i, row in enumerate(rows) if i >= config.headerRow and any(not missing(v) for v in row)]
    if not data: raise ValueError('Choose a header row followed by data records.')
    width = max([len(header), *(len(row) for _, row in data)])
    if width > 1000: raise ValueError('A dataset can contain up to 1,000 columns.')
    headers = [str(header[i]).strip() if i < len(header) and not missing(header[i]) else '' for i in range(width)]
    return headers, data


def parse_date(value, convention='auto'):
    if isinstance(value, (date, datetime)): return value.isoformat()[:10]
    text = str(value).strip()
    # ISO values are unambiguous, regardless of the selected regional convention.
    if re.match(r'^\d{4}-\d{2}-\d{2}(?:$|[T ])', text):
        return (datetime.fromisoformat(text.replace('Z', '+00:00')).date() if len(text) > 10 else date.fromisoformat(text)).isoformat()
    match = re.fullmatch(r'(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?', text)
    if not match: raise ValueError('Invalid date')
    a, b, year = map(int, match.groups()[:3])
    if match[4] is not None:
        datetime(2000, 1, 1, int(match[4]), int(match[5]), int(match[6] or 0))
    if convention == 'iso': raise ValueError('Expected ISO date')
    if convention == 'auto':
        if a <= 12 and b <= 12 and a != b: raise ValueError('Ambiguous UK/US date')
        convention = 'uk' if a > 12 or a == b else 'us'
    return date(year, b if convention == 'uk' else a, a if convention == 'uk' else b).isoformat()


def number(value):
    if isinstance(value, bool): raise ValueError('Invalid number')
    result = float(value)
    if not math.isfinite(result): raise ValueError('Invalid number')
    return result


def extract_time(value, convention='auto'):
    """Return the source clock time without converting timezones or inventing midnight."""
    parse_date(value, convention)
    if isinstance(value, datetime): return value.time().isoformat()
    if isinstance(value, date): return None
    text = str(value).strip()
    if re.match(r'^\d{4}-\d{2}-\d{2}[T ]', text):
        return datetime.fromisoformat(text.replace('Z', '+00:00')).time().isoformat()
    match = re.search(r'[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?', text)
    if not match: return None
    hour, minute, second, fraction = match.groups()
    return datetime_time(int(hour), int(minute), int(second or 0), int(((fraction or '') + '000000')[:6])).isoformat()


def infer(header, values):
    filled = [v for v in values if not missing(v)]
    if not filled: return 'text'
    if re.search(r'(^|[ _-])(id|code|phone|telephone|zip|postcode)([ _-]|$)', header, re.I) or any(re.fullmatch(r'0\d+', str(v).strip()) for v in filled): return 'text'
    def succeeds(fn, v):
        try: fn(v); return True
        except (ValueError, TypeError, OverflowError): return False
    def looks_date(v):
        if succeeds(parse_date, v): return True
        return succeeds(lambda x: parse_date(x, 'uk'), v) or succeeds(lambda x: parse_date(x, 'us'), v)
    if all(looks_date(v) for v in filled): return 'date'
    if all(succeeds(number, v) for v in filled): return 'number'
    # Mixed date/number columns remain text until the user selects a type.
    if any(looks_date(v) or succeeds(number, v) for v in filled): return 'text'
    unique = len({str(v) for v in filled})
    return 'category' if unique <= 30 and (len(filled) < 20 or unique <= len(filled) / 2) else 'text'


def initial_columns(headers, data, previous=None):
    old = (previous or {}).get('columns', [])
    counts = Counter(headers)
    old_counts = Counter(c['header'] for c in old)
    result = []
    for i, header in enumerate(headers):
        # Reuse only unique exact headers, or the same duplicate occurrence by position.
        saved = next((c for c in old if c['header'] == header and ((counts[header] == old_counts[header] == 1) or c['index'] == i)), None)
        values = [row[i] if i < len(row) else None for _, row in data]
        result.append(Column.model_validate({**(saved or {}), 'id': saved['id'] if saved else 'col_' + uuid.uuid4().hex, 'index': i, 'header': header,
            'label': saved['label'] if saved else header or f'Column {i + 1}', 'kind': saved['kind'] if saved else infer(header, values)}))
    return result


def available_filter_ids(config):
    return {qid for c in config.columns if c.included for qid in ([c.id, c.id + '__time'] if c.kind == 'date' and c.includeTime else [c.id])} | {c.id for c in config.calculatedColumns if c.included}


def build(tables, config, baseline):
    headers, data = table_data(tables, config)
    expected = {(c.id, c.index, c.header) for c in baseline}
    if {(c.id, c.index, c.header) for c in config.columns} != expected or len(config.columns) != len(expected):
        raise ValueError('Review every original column exactly once. Source identifiers cannot be changed.')
    if not any(c.included for c in config.columns): raise ValueError('Include at least one column.')
    records = [{'id': f'row_{ri}', 'row': ri, 'sheet': 0, 'scope': '', 'parent': '', 'values': {}} for ri, _ in data]
    questions, profiles, issues, groups = [], [], [], {}
    for column in config.columns:
        if not column.label.strip(): raise ValueError('Enter a display label for every column.')
        values = [row[column.index] if column.index < len(row) else None for _, row in data]
        originals = values
        active_prep = active_preparation(column.kind, column.preparation)
        values = [clean_value(v, active_prep) for v in originals]
        changed = sum(a != b for a, b in zip(originals, values))
        unique = list(dict.fromkeys(str(v) for v in values if not missing(v)))
        bad, converted, ambiguous, choices, time_count = [], [], False, {}, 0
        convention = column.dateFormat if column.dateFormat != 'auto' else config.dateFormat
        if column.included and column.kind == 'multiple' and not column.separator:
            issues.append({'question': column.id, 'message': 'Choose a multiple-choice separator.', 'count': 1})
        for record, value, original in zip(records, values, originals):
            parsed = clock = None
            try:
                if not missing(value):
                    if column.kind == 'number': parsed = prepared_number(value, active_prep)
                    elif column.kind == 'date':
                        parsed = parse_date(value, convention)
                        clock = extract_time(value, convention)
                        if clock is not None: time_count += 1
                    elif column.kind in {'category', 'multiple'}:
                        parts = str(value).split(column.separator) if column.kind == 'multiple' and column.separator else [str(value)]
                        labels = [column.categories.get(part.strip(), part.strip()) for part in parts if part.strip()]
                        labels = list(dict.fromkeys(v for v in labels if v))
                        for v in labels: choices[v] = {'name': v, 'labels': {'en': v}}
                        parsed = labels or None if column.kind == 'multiple' else (labels[0] if labels else None)
                    else: parsed = str(value)
            except (ValueError, TypeError, OverflowError) as exc:
                parsed = clock = None
                is_ambiguous = 'Ambiguous' in str(exc)
                ambiguous |= is_ambiguous
                bad.append({'row': record['row'], 'value': str(value), 'reason': str(exc)})
            record['values'][column.id] = parsed
            if column.included and column.kind == 'date' and column.includeTime:
                record['values'][column.id + '__time'] = clock
            if len(converted) < 8 and (not missing(original) or not missing(value)): converted.append({'original': str(original) if original is not None else '', 'prepared': value, 'value': parsed, 'time': clock})
        if column.included and bad and (ambiguous or not column.invalidAsMissing):
            issues.append({'question': column.id, 'message': 'Choose UK or US for ambiguous dates.' if ambiguous else 'Review invalid values or accept them as missing.', 'count': len(bad)})
        editable = list(dict.fromkeys(part.strip() for v in unique for part in v.split(column.separator) if part.strip())) if column.kind == 'multiple' and column.separator else unique
        profiles.append({'id': column.id, 'detected': 'number' if column.kind == 'number' and not bad and any(not missing(v) for v in values) else infer(column.header, values), 'missing': sum(missing(v) for v in values), 'distinct': len(unique), 'values': editable[:200], 'valuesTruncated': len(editable) > 200, 'samples': unique[:8], 'invalid': len(bad), 'examples': bad[:15], 'preview': converted, 'ambiguous': ambiguous, 'timeCount': time_count, 'changed': changed})
        if not column.included: continue
        group = ''
        if column.group.strip():
            group = 'group_' + column.group.strip()
            groups[group] = {'id': group, 'name': column.group.strip(), 'labels': {'en': column.group.strip()}, 'parent': '', 'repeat': False}
        questions.append({'customColumn': True, 'id': column.id, 'name': column.label.strip(), 'labels': {'en': column.label.strip()}, 'kind': column.kind, 'type': {'number': 'decimal', 'category': 'select_one custom', 'multiple': 'select_multiple custom'}.get(column.kind, column.kind), 'choices': list(choices.values()), 'group': group, 'repeat': '', 'metadata': False, 'identifying': False, 'order': column.index})
        if column.kind == 'date' and column.includeTime:
            time_label = column.timeLabel.strip() or column.label.strip() + ' - Time'
            questions.append({**questions[-1], 'id': column.id + '__time', 'name': time_label, 'labels': {'en': time_label}, 'kind': 'text', 'type': 'text', 'choices': [], 'derivedFrom': column.id})
    calc_profiles, calc_issues = calculated_columns(config, records, questions)
    profiles.extend(calc_profiles); issues.extend(calc_issues)
    records, duplicate_result, duplicate_issues = review_duplicates(config, records, questions, data)
    issues.extend(duplicate_issues)
    validation_results, rule_issues = validate_rules(config, records, questions)
    issues.extend(rule_issues)
    question_ids = {q['id'] for q in questions}
    if len(question_ids) != len(questions): raise ValueError('Column identifiers must be unique, including generated time columns.')
    if len(set(config.filterFields)) != len(config.filterFields) or set(config.filterFields) - question_ids:
        raise ValueError('Select filters only from included columns and their enabled time columns.')
    date_ids = {q['id'] for q in questions if q['kind'] == 'date'} & set(config.filterFields)
    config.dateFilterModes = {qid: mode for qid, mode in config.dateFilterModes.items() if qid in date_ids}
    form = {'questions': questions, 'groups': list(groups.values()), 'language': 'en', 'settings': {}, 'warnings': []}
    warnings = [f'{p["invalid"]} invalid values in {c.label} were treated as missing.' for c, p in zip(config.columns, profiles) if c.included and p['invalid'] and c.invalidAsMissing and not p['ambiguous']]
    warnings += [f"{p['invalid']} calculation errors in {c.label} were treated as missing." for c, p in zip(config.calculatedColumns, calc_profiles) if c.included and p['invalid'] and c.invalidAsMissing and not p['ambiguous']]
    warnings += [f"Accepted validation warning: {r['label']} ({r['matched']} records)." for r in validation_results if r['matched'] and r['acknowledged']]
    if duplicate_result['excluded']: warnings.append(f"{duplicate_result['excluded']} duplicate records were excluded by explicit review.")
    payload = {'form': form, 'records': records, 'customConfig': config.model_dump(), 'source': {'worksheet': config.worksheet}, 'warnings': warnings, 'issues': [], 'mappings': [], 'policies': {}}
    return payload, {'profiles': profiles, 'issues': issues, 'rows': len(data), 'validationResults': validation_results, 'duplicateResult': duplicate_result, 'preview': [{'row': ri, 'values': [scalar(v) for v in row]} for ri, row in data[:8]]}



def reconcile_settings(previous, payload, stored):
    """Keep current analysis usable; repair flags saved definitions separately."""
    from .kobo import KoboSettings, QuestionSettings
    settings = KoboSettings.model_validate(stored)
    old_kinds = {q['id']: q['kind'] for q in previous['form']['questions']}
    questions = {q['id']: q for q in payload['form']['questions']}
    changed = {qid for qid, q in questions.items() if old_kinds.get(qid) != q['kind']}
    settings.filters = [f for f in settings.filters if f.field in questions and f.field not in changed and (f.kind != 'category' or questions[f.field]['kind'] not in {'category', 'multiple'} or set(f.values) <= {c['name'] for c in questions[f.field]['choices']} | {'__blank__'})]
    for qid, cfg in settings.questions.items():
        if qid in changed:
            settings.questions[qid] = QuestionSettings(palette=cfg.palette)
            continue
        cfg.breakdowns = [field for field in cfg.breakdowns if field in questions and questions[field]['kind'] in {'category', 'text'}]
        if cfg.breakdown not in questions or questions[cfg.breakdown]['kind'] not in {'category', 'text'}: cfg.breakdown = ''
        if cfg.trendDateField not in questions or questions[cfg.trendDateField]['kind'] != 'date':
            cfg.trendDateField = ''
            if cfg.chart == 'line' and questions[qid]['kind'] in {'category', 'multiple'}: cfg.chart = None
        if cfg.chart == 'heatmap' and not (cfg.breakdowns or cfg.breakdown): cfg.chart = None
    settings.filterFields = payload['customConfig'].get('filterFields', settings.filterFields)
    settings.filters = [f for f in settings.filters if f.field in settings.filterFields]
    settings.dateFilterModes = dict(payload['customConfig'].get('dateFilterModes', {}))
    for rule in settings.filters:
        if rule.kind == 'date':
            mode = settings.dateFilterModes.get(rule.field, 'range')
            if mode == 'range': rule.months = []
            if mode == 'month': rule.minimum = rule.maximum = None
    settings.filters = [f for f in settings.filters if f.values or f.months or f.minimum is not None or f.maximum is not None]
    for qid in questions:
        if qid not in settings.questions: settings.questions[qid] = QuestionSettings(palette='Blue')
    settings.dashboardQuestions = [qid for qid in settings.dashboardQuestions if qid in questions]
    settings.report.questions = [qid for qid in settings.report.questions if qid in questions]
    if settings.geographyField not in questions or settings.geographyField in changed: settings.geographyField = ''
    settings.geographyConfigs = {key: value for key, value in settings.geographyConfigs.items() if key in questions}
    known_groups = {g['id'] for g in payload['form']['groups']}
    if settings.excelGroups is not None: settings.excelGroups = [g for g in settings.excelGroups if g in known_groups]
    return settings.model_dump()


def make_custom_router(store=None):
    store = store or custom_store()
    router = APIRouter(prefix='/api/custom', tags=['Custom Analysis'])
    staged, lock = {}, threading.RLock()

    def get_project(pid):
        try: return store.get(pid)
        except KeyError as exc: raise HTTPException(404, 'Project not found.') from exc

    def stage(raw, filename, pid='', project=None):
        tables = read_tables(raw, filename)
        project = project if project is not None else get_project(pid) if pid else None
        previous = {**project.get('customConfig', {}), 'filterFields': project['settings'].get('filterFields', []), 'dateFilterModes': project['settings'].get('dateFilterModes', {})} if project else {}
        config = Configuration(worksheet=previous.get('worksheet') if previous.get('worksheet') in tables else next(iter(tables)), headerRow=previous.get('headerRow', 1), dateFormat=previous.get('dateFormat', 'auto'), calculatedColumns=previous.get('calculatedColumns', []), validationRules=previous.get('validationRules', []), duplicateReview=previous.get('duplicateReview', {}))
        try: headers, data = table_data(tables, config)
        except ValueError:
            config.headerRow = 1
            headers = []; data = []
        config.columns = initial_columns(headers, data, previous) if data else []
        config.filterFields = [qid for qid in previous.get('filterFields', []) if qid in available_filter_ids(config)]
        date_ids = {c.id for c in config.columns if c.included and c.kind == 'date'} & set(config.filterFields)
        config.dateFilterModes = {qid: mode for qid, mode in previous.get('dateFilterModes', {}).items() if qid in date_ids}
        token = uuid.uuid4().hex
        with lock:
            for key in list(staged):
                if time.monotonic() - staged[key]['created'] > 1800: del staged[key]
            if len(staged) >= 3: raise ValueError('Finish or cancel an existing import first.')
            staged[token] = {'raw': raw, 'filename': filename, 'tables': tables, 'config': config, 'reuseConfig': config.model_dump(), 'previous': previous, 'project': project, 'pid': pid, 'created': time.monotonic()}
        return describe(token, staged[token], config)

    def reuse_check(item, config, payload, review):
        project = item['project']
        if not project: return reuse_result(['Previous settings are available only for an existing project.'])
        previous = item['previous']
        reasons = source_reuse_reasons(
            [{'name': previous.get('worksheet', ''), 'headers': [c['header'] for c in previous.get('columns', [])]}],
            [{'name': config.worksheet, 'headers': [c.header for c in config.columns]}])
        if config.headerRow != previous.get('headerRow', 1): reasons.append('The header row changed.')
        if config.model_dump() != item['reuseConfig']: reasons.append('The saved import settings were adjusted. Review before applying.')
        reasons.extend(issue['message'] for issue in review['issues'])
        if payload:
            reasons.extend(settings_reuse_reasons(project, payload))
        else:
            reasons.append('Select a worksheet and header row with data before updating.')
        if payload and not reasons:
            from .kobo import KoboSettings
            reconciled = reconcile_settings(project, payload, project['settings'])
            before = KoboSettings.model_validate(project['settings']).model_dump()
            # Defaults for previously uncustomized questions do not discard saved settings.
            reconciled['questions'] = {key: value for key, value in reconciled['questions'].items() if key in before['questions']}
            if reconciled != before: reasons.append('Some saved analysis settings would need to be removed or reset.')
        return reuse_result(reasons)

    def describe(token, item, config):
        headers, data = table_data(item['tables'], config) if config.columns else ([], [])
        payload, review = build(item['tables'], config, item['config'].columns) if config.columns else (None, {'profiles': [], 'issues': [], 'rows': 0, 'preview': []})
        previous = item['previous'].get('columns', [])
        before = {c['id']: c for c in previous}
        current = {c.id: c.model_dump() for c in config.columns}
        changes = [{'label': c['label'], 'change': 'removed'} for key, c in before.items() if key not in current]
        changes += [{'label': c['label'], 'change': 'added' if key not in before else 'changed'} for key, c in current.items() if key not in before or c != before[key]]
        return {'token': token, 'config': config.model_dump(), 'reuse': reuse_check(item, config, payload, review), 'worksheets': list(item['tables']), 'sourcePreview': [[scalar(v) for v in row] for row in item['tables'][config.worksheet][:20]], 'changes': changes if previous else [], **review}

    def item_for(token):
        item = staged.get(token)
        if not item or time.monotonic() - item['created'] > 1800: raise HTTPException(410, 'Import preview expired. Open the file again.')
        return item

    @router.post('/columns/preview')
    async def preview(data: UploadFile = File(...), projectId: str = Form('')):
        from .main import read_upload_limited
        try: return await run_in_threadpool(stage, await read_upload_limited(data), data.filename or '', projectId)
        except ValueError as exc: raise HTTPException(400, str(exc)) from exc
        finally: await data.close()

    @router.post('/projects/{pid}/columns')
    def edit_columns(pid: str):
        project = get_project(pid)
        _, raw = store.sources(pid)
        return stage(raw, 'source.xlsx' if raw.startswith(b'PK') else 'source.csv', pid, project=project)

    @router.post('/columns/{token}/configure')
    def configure(token: str, config: Configuration):
        with lock:
            item = item_for(token)
            try:
                if (config.worksheet, config.headerRow) != (item['config'].worksheet, item['config'].headerRow) or not item['config'].columns:
                    headers, data = table_data(item['tables'], config)
                    config.columns = initial_columns(headers, data, item['previous'])
                    config.filterFields = [qid for qid in config.filterFields if qid in available_filter_ids(config)]
                    item['config'] = config
                return describe(token, item, config)
            except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    @router.delete('/columns/{token}')
    def cancel(token: str):
        with lock: staged.pop(token, None)
        return {'cancelled': True}

    @router.post('/columns/confirm')
    def confirm(body: Confirm):
        with lock:
            item = item_for(body.token)
            try:
                if not body.name.strip(): raise ValueError('Enter a project name.')
                if (body.config.worksheet, body.config.headerRow) != (item['config'].worksheet, item['config'].headerRow): raise ValueError('Preview the selected worksheet and header before saving.')
                payload, review = build(item['tables'], body.config, item['config'].columns)
                if body.reuseOnly:
                    reuse = reuse_check(item, body.config, payload, review)
                    if not reuse['eligible']: raise HTTPException(409, {'message': 'Review is needed before updating data.', 'issues': [{'question': '', 'message': reason, 'count': 1} for reason in reuse['reasons']]})
                if review['issues']: raise HTTPException(422, {'message': 'Resolve column setup issues before saving.', 'issues': review['issues']})
                if item['pid']:
                    p = store.repair(item['pid'], payload, b'', item['raw'], preserve_settings=body.reuseOnly, expected_updated=item['project']['updated'] if body.reuseOnly else None)
                else:
                    settings = new_project_settings(payload['form'])
                    settings.filterFields = list(body.config.filterFields)
                    settings.dateFilterModes = dict(body.config.dateFilterModes)
                    settings.dashboardQuestions = [q['id'] for q in payload['form']['questions'][:6]]
                    p = store.create(body.name, payload, b'', item['raw'], settings)
                staged.pop(body.token)
                return {k: v for k, v in p.items() if k != 'records'}
            except ValueError as exc: raise HTTPException(400, str(exc)) from exc

    return router
