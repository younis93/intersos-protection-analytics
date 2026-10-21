"""Editable response tables and their workbook-local Power Query pivot source."""
from __future__ import annotations

import base64
import json
import re
from collections import Counter
from datetime import datetime

from .file_security import safe_spreadsheet_value
from .kobo import label, breakdown_fields
from .kobo_excel_layout import DATA_HEADERS, EXCEL_DATA_ROWS, unique_sheet_name
from .kobo_excel_direct import direct_helpers, choice_lookup_rows, structured_column

EXCEL_COLUMNS = 16_384


def validate_export_fields(project, settings, question=''):
    questions = {q['id']: q for q in project['form']['questions']}
    identifying = {qid for qid, q in questions.items() if q['identifying']}
    requested = {question} if question else {qid for qid, q in questions.items() if qid not in settings.hidden and (not q['metadata'] or settings.metadata)}
    dependencies = set(settings.filterFields) | {f.field for f in settings.filters}
    for qid in requested:
        if qid in questions:
            cfg = settings.questions.get(qid)
            if cfg and cfg.trendDateField: dependencies.add(cfg.trendDateField)
            if cfg: dependencies.update(q['id'] for q in breakdown_fields(cfg, questions, questions[qid]))
    blocked = (requested | dependencies) & identifying
    if blocked:
        captions = ', '.join(label(questions[qid], settings.language) for qid in sorted(blocked))
        raise ValueError(f'Identifying fields cannot be included in this Excel workbook: {captions}. Hide these questions and remove them from filters and breakdowns before exporting.')


def response_layout(project, settings):
    questions = [q for q in project['form']['questions'] if not q['identifying']]
    scopes = list(dict.fromkeys(['', *(g['id'] for g in project['form']['groups'] if g['repeat']), *(q['repeat'] for q in questions), *(r['scope'] for r in project['records'])]))
    used = {'_kobo choices', '_kobo chart pivots', '_kobo chart labels', '_kobo slicer totals', '_kobo chart values', '_kobo trend pivots'}
    layouts = []
    for index, scope in enumerate(scopes):
        fields = [q for q in questions if q['repeat'] == scope]
        headers = ['Response ID', 'Parent ID', 'Source row']; seen = {h.casefold() for h in headers}
        columns = {}
        for q in fields:
            original = label(q, settings.language)
            if original.startswith('[Calc]') or re.fullmatch(r'Filter\d{3,}', original): original = 'Field: ' + original
            caption = original[:255]
            suffix = 2
            while caption.casefold() in seen:
                tag = f' [{suffix}]'; caption = original[:255-len(tag)] + tag; suffix += 1
            seen.add(caption.casefold()); headers.append(caption); columns[q['id']] = caption
        if len(headers) > EXCEL_COLUMNS: raise ValueError('Response data exceeds Excel\u2019s column limit. Reduce the form fields before exporting.')
        rows = [r for r in project['records'] if r['scope'] == scope]
        if len(rows) > EXCEL_DATA_ROWS: raise ValueError('Response data exceeds Excel\u2019s row limit. Export a smaller project.')
        title = 'Data' if not scope else 'Data - ' + next((label(g, settings.language) for g in project['form']['groups'] if g['id'] == scope), scope)
        groups = {g['id']: g for g in project['form']['groups']}
        parent = groups.get(scope, {}).get('parent', '')
        while parent and not groups.get(parent, {}).get('repeat'): parent = groups.get(parent, {}).get('parent', '')
        layouts.append({'scope': scope, 'parent_scope': parent, 'sheet': unique_sheet_name(title, used), 'table': f'KoboResponses{index:03d}', 'headers': headers, 'columns': columns, 'fields': fields, 'rows': rows})
    return layouts


def response_values(layout, record, escape=True):
    out = [record['id'], record.get('parent') or '', record['row']]
    for q in layout['fields']:
        value = record['values'].get(q['id'])
        if isinstance(value, list): value = ' '.join(str(item) for item in value)
        if q['kind'] == 'date' and value:
            # COM datetime conversion can shift midnight across a date boundary.
            # Excel date serials with a date number format preserve the source day.
            try: value = (datetime.fromisoformat(str(value)[:10]) - datetime(1899, 12, 30)).days
            except ValueError: pass
        out.append(value)
    return tuple(safe_spreadsheet_value(v) if escape and isinstance(v, str) else v for v in out)


def query_config(project, snapshot, settings, specs, layouts):
    by_id = {q['id']: q for q in project['form']['questions']}
    fields = {}
    for layout in layouts:
        for q in layout['fields']:
            captions = {c['name']: label(c, settings.language) for c in q['choices']}
            duplicates = Counter(captions.values())
            fields[q['id']] = {'column': layout['columns'][q['id']], 'scope': q['repeat'], 'kind': q['kind'],
                'captions': {code: f'{caption} [{code}]' if duplicates[caption] > 1 else caption for code, caption in captions.items()}}
    results = []
    for result in snapshot['questions']:
        q = by_id[result['id']]; cfg = settings.questions.get(q['id'])
        dimensions = breakdown_fields(cfg, by_id, q) if cfg else []
        counts = Counter(row['label'] for row in result['rows'])
        results.append({'id': q['id'], 'label': result['label'], 'group': q['group'], 'groupLabel': next((g['label'] for g in snapshot['groups'] if g['id'] == q['group']), ''),
            'scope': q['repeat'], 'kind': q['kind'], 'dateUnit': cfg.dateUnit if cfg else 'month', 'trendDateField': cfg.trendDateField if cfg and result.get('trend') else '', 'trendUnit': cfg.trendUnit if cfg else 'month', 'dimensions': [f['id'] for f in dimensions],
            'bins': result.get('bins', []), 'blank': not settings.hideBlanks,
            'answers': [{'id': a['id'], 'label': f"{a['label']} [{a['id']}]" if counts[a['label']] > 1 else a['label']} for a in result['rows'] if a['id'] != '__blank__'],
            'blankLabel': 'Blank / unanswered' if settings.language == 'en' else 'فارغ / دون إجابة'})
    return {'tables': [{'name': l['table'], 'raw': f'KoboRaw{index:03d}', 'scope': l['scope'], 'parent': l['parent_scope']} for index, l in enumerate(layouts)], 'fields': fields, 'questions': results,
        'filters': [{'id': s['id'], 'header': s['header'], 'captions': s['captions']} for s in specs], 'headers': [*DATA_HEADERS, *(s['header'] for s in specs)]}


def query_formula(config):
    encoded = base64.b64encode(json.dumps(config, ensure_ascii=False).encode()).decode()
    return 'let\n Config = Json.Document(Binary.FromText("' + encoded + '", BinaryEncoding.Base64)),\n' + QUERY_BODY


def multi_config(config, question):
    """Keep complete response/ancestor fields, without unrelated repeat tables."""
    tables = {table['scope']: table for table in config['tables']}
    scopes = []; scope = question['scope']
    while scope not in scopes:
        scopes.append(scope)
        if not scope: break
        scope = tables[scope]['parent']
    fields = {qid: field for qid, field in config['fields'].items() if field['scope'] in scopes}
    used = {header.casefold() for header in [*config['headers'], 'TrendPeriod', 'Response ID', 'Parent ID', 'Source row']}
    details = []
    for qid, field in fields.items():
        original = field['column']; header = original[:255]; suffix = 2
        while header.casefold() in used:
            tag = f' [{suffix}]'; header = original[:255-len(tag)] + tag; suffix += 1
        used.add(header.casefold()); details.append({'id': qid, 'header': header})
    headers = [*config['headers'], *(['TrendPeriod'] if question.get('trendDateField') else []), 'Response ID', 'Parent ID', 'Source row', *(field['header'] for field in details)]
    # Reserve technical keys before choosing user-field headers.
    if len({header.casefold() for header in headers}) != len(headers):
        raise ValueError('Multi-select reference headers conflict with response keys.')
    if len(headers) > EXCEL_COLUMNS: raise ValueError('Multi-select reference exceeds Excel\u2019s column limit.')
    return {**config, 'tables': [tables[scope] for scope in scopes], 'fields': fields,
            'questions': [question], 'details': details, 'headers': headers}


def multi_row_count(project, result, hide_blanks):
    rows = [record for record in project['records'] if record['scope'] == result['repeat']]
    return (len(rows) + sum(len(set(record['values'].get(result['id']) or [])) or int(not hide_blanks) for record in rows)
            + len(result['rows']))


QUERY_BODY = r'''
 TextValue = (v as any) as text => if v = null then "" else if Value.Is(v, type date) or Value.Is(v, type datetime) then Date.ToText(Date.From(v), "yyyy-MM-dd") else Text.From(v, "en-US"),
 Source = List.Combine(List.Transform(Config[tables], (t) => let columns = {"Response ID", "Parent ID", "Source row"} & List.Transform(List.Select(Record.FieldValues(Config[fields]), each [scope] = t[scope]), each [column]), raw = Table.PromoteHeaders(Excel.CurrentWorkbook(){[Name=t[raw]]}[Content], [PromoteAllScalars=true]), data = Table.Buffer(Table.SelectColumns(raw, columns)) in List.Transform(Table.ToRecords(data), (r) => Record.AddField(r, "_Scope", t[scope])))),
 Nonempty = List.Select(Source, each List.AnyTrue(List.Transform(Record.FieldValues(Record.RemoveFields(_, {"_Scope"})), each TextValue(_) <> ""))),
 Records = List.Buffer(List.Transform(Nonempty, each if TextValue(Record.FieldOrDefault(_, "Response ID")) = "" then error "Enter a unique Response ID for every response row." else _)),
 Ids = List.Transform(Records, each TextValue(Record.Field(_, "Response ID"))),
 Lookup = if List.Count(Ids) <> List.Count(List.Distinct(Ids)) then error "Response IDs must be unique across all Data tables." else Record.FromList(Records, Ids),
 Resolve = (r as record, scope as text, optional seen as nullable list) as nullable record =>
   if r[_Scope] = scope then r else let visited = if seen = null then {} else seen, id = TextValue(Record.Field(r, "Response ID")), parent = TextValue(Record.FieldOrDefault(r, "Parent ID")) in
   if List.Contains(visited, id) then error "Circular parent response IDs." else if parent = "" or not Record.HasFields(Lookup, parent) then null else @Resolve(Record.Field(Lookup, parent), scope, visited & {id}),
 FieldValue = (r as record, id as text) as text => let f = Record.Field(Config[fields], id), owner = Resolve(r, f[scope]), raw = if owner = null then null else Record.Field(owner, f[column]) in
   if TextValue(raw) = "" then "" else if f[kind] = "date" then (try Date.ToText(Date.From(raw, "en-US"), "yyyy-MM-dd") otherwise error ("Invalid date in " & f[column])) else
   if f[kind] = "number" then (try Text.From(Number.From(raw, "en-US"), "en-US") otherwise error ("Invalid number in " & f[column])) else TextValue(raw),
 Caption = (id as text, value as text) as text => if value = "" then "Missing breakdown" else Record.FieldOrDefault(Record.Field(Config[fields], id)[captions], value, value),

 FilterValues = (r as record) as list => List.Transform(Config[filters], (f) => let v = FieldValue(r, f[id]) in Record.FieldOrDefault(f[captions], if v = "" then "__blank__" else v, if v = "" then "Blank / unanswered" else Caption(f[id], v))),
 QuestionRows = (q as record) as list => let
   Cohort = List.Select(Records, each [_Scope] = q[scope]),
   Options = q[answers] & (if q[blank] then {[id="__blank__", label=q[blankLabel]]} else {}),
   Expanded = List.Combine(List.Transform(Cohort, (r) => let
     value = FieldValue(r, q[id]), selected = List.Distinct(List.Select(Text.Split(value, " "), each _ <> "")), answered = if List.IsEmpty(selected) then 0 else 1,
     dimensions = List.Transform(q[dimensions], (id) => Caption(id, FieldValue(r, id))),
     filters = FilterValues(r),
     trend = if Record.FieldOrDefault(q, "trendDateField", "") = "" then {} else {try Date.ToText(Date.From(FieldValue(r, q[trendDateField])), if q[trendUnit] = "year" then "yyyy" else if q[trendUnit] = "month" then "yyyy-MM" else "yyyy-MM-dd") otherwise ""},
     details = {TextValue(Record.Field(r, "Response ID")), TextValue(Record.FieldOrDefault(r, "Parent ID")), Record.FieldOrDefault(r, "Source row")} & List.Transform(Config[details], (f) => let field = Record.Field(Config[fields], f[id]), owner = Resolve(r, field[scope]) in if owner = null then null else Record.Field(owner, field[column])),
     row = (code as text, caption as text, count as number, base as number, role as text) => {q[id], q[label], q[group], q[groupLabel], TextValue(Record.Field(r, "Response ID")), code, caption, count, base} & List.FirstN(dimensions & {"", "", ""}, 3) & {role} & filters & trend & details,
     chosen = if answered = 0 then (if q[blank] then {"__blank__"} else {}) else selected,
     selections = List.Transform(chosen, (code) => let known = List.Select(Options, each [id] = code) in row(code, if List.IsEmpty(known) then code else known{0}[label], 1, 0, "Included"))
     in {row("__base__", "Respondent base", 0, answered, "Denominator")} & selections)),
   Seeds = List.Transform(Options, (a) => {q[id], q[label], q[group], q[groupLabel], null, a[id], a[label], 0, 0, "", "", "", "Category seed"} & (if List.IsEmpty(Cohort) then List.Repeat({null}, List.Count(Config[filters])) else FilterValues(Cohort{0})) & (if Record.FieldOrDefault(q, "trendDateField", "") = "" then {} else {null}) & List.Repeat({null}, 3 + List.Count(Config[details])))
 in Expanded & Seeds,
 Rows = List.Combine(List.Transform(Config[questions], each QuestionRows(_))),
 Result = if List.Count(Ids) <> List.Count(List.Distinct(Ids)) then error "Response IDs must be unique across all Data tables." else if List.AnyTrue(List.Transform(Records, each [_Scope] <> "" and not Record.HasFields(Lookup, TextValue(Record.FieldOrDefault(_, "Parent ID"))))) then error "Repeat entries must have a valid Parent ID from a Data table." else
   if List.Count(Rows) > 1048575 then error "Pivot support data exceeds the Excel row limit." else Table.FromRows(Rows, Config[headers]),
 Typed = Table.TransformColumnTypes(Result, {{"Selected", Int64.Type}, {"Answered", Int64.Type}})
in Typed
'''


def create_response_source(book, excel, project, snapshot, settings, specs, notify=None, prepared=None, progress=None):
    """Attach local queries to a workbook whose editable tables were built on disk."""
    layouts, config, sources, multis = prepared
    # File preparation seeds helper formula values. Excel calculates all formulas
    # once at the end; initial pivot caches can immediately read those values.
    used = {name.casefold() for name in [*(layout['sheet'] for layout in layouts), '_Kobo choices', '_Kobo trend pivots']}
    total = sum(question['kind'] == 'multiple' for question in config['questions'])
    completed = 0; query_seconds = {}; recordset_cache = {}
    from .kobo_excel_recordset import prepared_recordset
    import time
    for index, question in enumerate(config['questions'], 1):
        if question['kind'] != 'multiple' or config.get('excelMode') == 'binary': continue
        completed += 1
        if progress: progress.begin('queries', 5+round(completed/max(1,total)*15), f'Preparing multi-select reference: {completed}/{total}')
        elif notify: notify(completed, total)
        began = time.perf_counter()
        own = multi_config(config, question)
        name = f'KoboMulti{index:03d}'
        seed = multis[question['id']]
        if progress: progress.begin('queries.definition')
        definition = book.Queries.Add(name, query_formula(own))
        if progress: progress.begin('queries.sheet')
        support = book.Worksheets.Add(After=book.Worksheets(book.Worksheets.Count)); support.Name = unique_sheet_name(f'_Kobo multi {index:03d}', used)
        connection = f'OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location={name};Extended Properties=""'
        if progress: progress.begin('queries.recordset')
        recordset = prepared_recordset(own, seed.pop('rows'), recordset_cache)
        try:
            if progress: progress.begin('queries.load')
            # Starting with an ADO source avoids the provider's expensive schema
            # discovery. Switch to the real local query after loading the rows.
            table = support.ListObjects.Add(0, recordset, None, 1, support.Range('A1')); table.Name = name
            query = table.QueryTable
            query.AdjustColumnWidth = False
            query.BackgroundQuery = False; query.Refresh(False)
            # Switching the connection releases the initial ADO rows but keeps
            # the loaded result. Future Refresh All uses the saved local M query.
            if progress: progress.begin('queries.connection')
            query.Connection = connection
            query.CommandType = 2; query.CommandText = f'SELECT * FROM [{name}]'
            query.BackgroundQuery = False
        finally:
            recordset.Close()
            recordset = None
        if progress: progress.begin('queries.properties')
        native_connection = query.WorkbookConnection
        native_connection.OLEDBConnection.BackgroundQuery = False
        native_connection.RefreshWithRefreshAll = True
        support.Visible = 0
        sources[question['id']] = {'direct': False, 'sparse': True, 'table': name, 'connection': native_connection, 'fields': {}, 'scope': question['scope']}
        query_seconds[name] = round(time.perf_counter()-began, 3)
        if progress: progress.put({'querySeconds': dict(query_seconds)})
    return sources, used
