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
            if cfg: dependencies.update(q['id'] for q in breakdown_fields(cfg, questions, questions[qid]))
    blocked = (requested | dependencies) & identifying
    if blocked:
        captions = ', '.join(label(questions[qid], settings.language) for qid in sorted(blocked))
        raise ValueError(f'Identifying fields cannot be included in this Excel workbook: {captions}. Hide these questions and remove them from filters and breakdowns before exporting.')


def response_layout(project, settings):
    questions = [q for q in project['form']['questions'] if not q['identifying']]
    scopes = list(dict.fromkeys(['', *(g['id'] for g in project['form']['groups'] if g['repeat']), *(q['repeat'] for q in questions), *(r['scope'] for r in project['records'])]))
    used = {'workbook guide', '_kobo choices', '_kobo chart pivots', '_kobo chart labels', '_kobo slicer totals'}
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


def response_values(layout, record):
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
    return tuple(safe_spreadsheet_value(v) if isinstance(v, str) else v for v in out)


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
            'scope': q['repeat'], 'kind': q['kind'], 'dateUnit': cfg.dateUnit if cfg else 'month', 'dimensions': [f['id'] for f in dimensions],
            'bins': result.get('bins', []), 'blank': not settings.hideBlanks,
            'answers': [{'id': a['id'], 'label': f"{a['label']} [{a['id']}]" if counts[a['label']] > 1 else a['label']} for a in result['rows'] if a['id'] != '__blank__'],
            'blankLabel': 'Blank / unanswered' if settings.language == 'en' else 'فارغ / دون إجابة'})
    return {'tables': [{'name': l['table'], 'raw': f'KoboRaw{index:03d}', 'scope': l['scope']} for index, l in enumerate(layouts)], 'fields': fields, 'questions': results,
        'filters': [{'id': s['id'], 'header': s['header'], 'captions': s['captions']} for s in specs], 'headers': [*DATA_HEADERS, *(s['header'] for s in specs)]}


def query_formula(config):
    encoded = base64.b64encode(json.dumps(config, ensure_ascii=False).encode()).decode()
    return 'let\n Config = Json.Document(Binary.FromText("' + encoded + '", BinaryEncoding.Base64)),\n' + QUERY_BODY


QUERY_BODY = r'''
 TextValue = (v as any) as text => if v = null then "" else if Value.Is(v, type date) or Value.Is(v, type datetime) then Date.ToText(Date.From(v), "yyyy-MM-dd") else Text.From(v, "en-US"),
 Source = List.Combine(List.Transform(Config[tables], (t) => let columns = {"Response ID", "Parent ID"} & List.Transform(List.Select(Record.FieldValues(Config[fields]), each [scope] = t[scope]), each [column]), raw = Table.PromoteHeaders(Excel.CurrentWorkbook(){[Name=t[raw]]}[Content], [PromoteAllScalars=true]), data = Table.Buffer(Table.SelectColumns(raw, columns)) in List.Transform(Table.ToRecords(data), (r) => Record.AddField(r, "_Scope", t[scope])))),
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
 QuestionRows = (q as record) as list => let
   Cohort = List.Select(Records, each [_Scope] = q[scope]),
   Category = (value as text) as list => if value = "" then {} else
     if q[kind] = "multiple" then List.Distinct(List.Select(Text.Split(value, " "), each _ <> "")) else
     if List.Count(q[bins]) > 0 then let n = Number.FromText(value, "en-US"), last = List.Last(q[bins]), matches = List.Transform(List.Select(q[bins], each n >= [min] and (n < [max] or [id] = last[id] and n <= [max])), each [id]) in if List.IsEmpty(matches) then error ("Number outside exported bin limits. Re-export " & q[label]) else matches else
     if q[kind] = "number" then let n = Number.FromText(value, "en-US"), known = List.Select(q[answers], each (try Number.FromText([id], "en-US") otherwise null) = n) in {if List.IsEmpty(known) then value else known{0}[id]} else
     if q[kind] = "date" then {Text.Start(value, if q[dateUnit] = "year" then 4 else if q[dateUnit] = "month" then 7 else 10)} else {value},
   Observed = List.Distinct(List.Combine(List.Transform(Cohort, each Category(FieldValue(_, q[id]))))),
   Answers = if List.Count(q[bins]) = 0 and List.Contains({"text", "date", "number"}, q[kind]) then List.Transform(List.Distinct(List.Transform(q[answers], each [id]) & Observed), (id) => let known = List.Select(q[answers], each [id] = id) in if List.Count(known) > 0 then known{0} else [id=id, label=id]) else q[answers],
   Options = Answers & (if q[blank] then {[id="__blank__", label=q[blankLabel]]} else {}),
   Expanded = List.Combine(List.Transform(Cohort, (r) => let
     value = FieldValue(r, q[id]), selected = Category(value), answered = if value = "" then 0 else 1,
     dimensions = List.Transform(q[dimensions], (id) => Caption(id, FieldValue(r, id))),
     filters = List.Transform(Config[filters], (f) => let v = FieldValue(r, f[id]) in Record.FieldOrDefault(f[captions], if v = "" then "__blank__" else v, if v = "" then "Blank / unanswered" else Caption(f[id], v)))
     in List.Transform(Options, (a) => {q[id], q[label], q[group], q[groupLabel], TextValue(Record.Field(r, "Response ID")), a[id], a[label], if a[id] = "__blank__" then 1-answered else if List.Contains(selected, a[id]) then 1 else 0, if a[id] = "__blank__" then 0 else answered} & List.FirstN(dimensions & {"", "", ""}, 3) & {"Included"} & filters)))
 in Expanded,
 Rows = List.Combine(List.Transform(Config[questions], each QuestionRows(_))),
 Result = if List.Count(Ids) <> List.Count(List.Distinct(Ids)) then error "Response IDs must be unique across all Data tables." else
   if List.AnyTrue(List.Transform(Records, each [_Scope] <> "" and not Record.HasFields(Lookup, TextValue(Record.FieldOrDefault(_, "Parent ID"))))) then error "Repeat entries must have a valid Parent ID from a Data table." else
   if List.Count(Rows) > 1048575 then error "Pivot support data exceeds the Excel row limit." else Table.FromRows(Rows, Config[headers]),
 Typed = Table.TransformColumnTypes(Result, {{"Selected", Int64.Type}, {"Answered", Int64.Type}})
in Typed
'''


def create_response_source(book, excel, project, snapshot, settings, specs, notify=None):
    layouts = response_layout(project, settings)
    sheet = book.Worksheets(1)
    for index, layout in enumerate(layouts):
        if index: sheet = book.Worksheets.Add(After=book.Worksheets(book.Worksheets.Count))
        sheet.Name = layout['sheet']; sheet.DisplayRightToLeft = False; width = len(layout['headers'])
        sheet.Range(sheet.Cells(1, 1), sheet.Cells(1, width)).NumberFormat = '@'
        sheet.Range(sheet.Cells(1, 1), sheet.Cells(1, width)).Value = (tuple(layout['headers']),)
        # Literal response text, including Excel formula prefixes, stays text.
        for column, q in enumerate(layout['fields'], 4):
            sheet.Columns(column).NumberFormat = '0.##########' if q['kind'] == 'number' else 'yyyy-mm-dd' if q['kind'] == 'date' else '@'
        sheet.Columns(1).NumberFormat = '@'; sheet.Columns(2).NumberFormat = '@'
        for start in range(0, len(layout['rows']), 10000):
            rows = tuple(response_values(layout, record) for record in layout['rows'][start:start+10000])
            sheet.Range(sheet.Cells(start+2, 1), sheet.Cells(start+len(rows)+1, width)).Value = rows
        table = sheet.ListObjects.Add(1, sheet.Range(sheet.Cells(1, 1), sheet.Cells(max(2, len(layout['rows'])+1), width)), None, 1)
        table.Name = layout['table']; table.TableStyle = 'TableStyleMedium2'
        # Limit query dependencies to editable input columns. The dynamic range
        # expands with the response table but never includes calculated helpers.
        last = structured_column(layout['headers'][-1])
        book.Names.Add(Name=f'KoboRaw{index:03d}', RefersTo=f'={layout["table"]}[[#All],[Response ID]:[{last}]]')
        if not layout['rows']:
            while table.ListRows.Count: table.ListRows(1).Delete()
        sheet.UsedRange.Font.Name = 'Arial'; sheet.UsedRange.Font.Size = 10
        sheet.UsedRange.Columns.ColumnWidth = 28; sheet.Rows(1).RowHeight = 42; sheet.Rows(1).WrapText = True
        sheet.Activate(); excel.ActiveWindow.DisplayGridlines = False; excel.ActiveWindow.SplitRow = 1; excel.ActiveWindow.FreezePanes = True
    guide = book.Worksheets.Add(After=book.Worksheets(book.Worksheets.Count)); guide.Name = 'Workbook guide'; guide.DisplayRightToLeft = False
    notes = [('EDITABLE RESPONSE DATA',), ('Edit Data, then use Data > Refresh All once. Wait for all queries and pivots to finish.',),
        ('All responses and non-identifying form fields are included. Slicers start with the app filters.',),
        ('Use unique Response IDs and valid Parent IDs. Append rows inside the Excel response tables.',),
        ('Choice fields use the codes below. Multiple-choice codes are separated by spaces.',),
        ('Form definitions, answer categories, bins, and chart layout are fixed at export. Re-export after schema changes.',),
        ('Each multi-select question has independent slicers. Other questions share sheet controls within their response scope.',),
        ('Ordinary pivots connect directly to the response tables. Collapsed [Calc] columns contain formulas: do not overwrite them.',),
        ('Each multi-select pivot uses its own local query reference, listed below. Reference sheets are hidden and can be unhidden in Excel.',),
        ('Report percentages use balanced rounding for complete single-answer distributions. Multiple-choice percentages may total more than 100%.',),
        ('Report tables and charts recalculate from native pivots. The Pivot data sheet retains the unadjusted native percentage calculations.',)]
    guide.Range(guide.Cells(1, 1), guide.Cells(len(notes), 1)).Value = tuple(notes)
    guide.Columns(1).ColumnWidth = 75; guide.Columns(2).ColumnWidth = 24; guide.Columns(3).ColumnWidth = 40
    guide.Range('A1:C1').Font.Bold = True
    rows = [('Question / field', 'Code', 'Label')]
    for layout in layouts:
        for q in layout['fields']:
            rows.extend((label(q, settings.language), c['name'], label(c, settings.language)) for c in q['choices'])
    guide.Range(guide.Cells(12, 1), guide.Cells(11+len(rows), 3)).NumberFormat = '@'
    guide.Range(guide.Cells(12, 1), guide.Cells(11+len(rows), 3)).Value = tuple(tuple(safe_spreadsheet_value(v) for v in row) for row in rows)
    guide.UsedRange.WrapText = True; guide.UsedRange.Rows.AutoFit(); guide.Activate(); excel.ActiveWindow.DisplayGridlines = False
    config = query_config(project, snapshot, settings, specs, layouts)
    lookup = book.Worksheets.Add(After=book.Worksheets(book.Worksheets.Count)); lookup.Name = '_Kobo choices'
    choices = [('Key', 'Label'), *choice_lookup_rows(config)]
    lookup.Range(lookup.Cells(1, 1), lookup.Cells(len(choices), 2)).NumberFormat = '@'
    lookup.Range(lookup.Cells(1, 1), lookup.Cells(len(choices), 2)).Value = tuple(tuple(safe_spreadsheet_value(v) for v in row) for row in choices)
    lookup.ListObjects.Add(1, lookup.UsedRange, None, 1).Name = 'KoboChoices'; lookup.Visible = 0
    helpers, sources = direct_helpers(config, layouts)
    for layout in layouts:
        columns = helpers[layout['scope']]
        sheet = book.Worksheets(layout['sheet']); table = sheet.ListObjects(layout['table'])
        width = len(layout['headers']); total_width = width + len(columns)
        if total_width > EXCEL_COLUMNS: raise ValueError('Response fields and calculated helper columns exceed Excel\u2019s column limit. Export fewer questions.')
        table.Resize(sheet.Range(sheet.Cells(1, 1), sheet.Cells(max(2, len(layout['rows'])+1), total_width)))
        sheet.Range(sheet.Cells(1, width+1), sheet.Cells(1, total_width)).NumberFormat = '@'
        sheet.Range(sheet.Cells(1, width+1), sheet.Cells(1, total_width)).Value = (tuple(columns),)
        for offset, formula in enumerate(columns.values(), width+1):
            cells = table.ListColumns(offset).DataBodyRange
            if cells is not None: cells.NumberFormat = 'General'; cells.Formula = formula
        if not layout['rows']:
            while table.ListRows.Count: table.ListRows(1).Delete()
        sheet.Range(sheet.Cells(1, width+1), sheet.Cells(1, total_width)).EntireColumn.Group()
        sheet.Outline.ShowLevels(ColumnLevels=1)
        table.Range.Calculate()
    used = {name.casefold() for name in [*(l['sheet'] for l in layouts), 'Workbook guide', lookup.Name]}
    references = [('MULTI-SELECT REFERENCES', 'Query / table', 'Hidden worksheet')]
    multiple_count = sum(q['kind'] == 'multiple' for q in config['questions'])
    for index, question in enumerate(config['questions'], 1):
        if question['kind'] != 'multiple': continue
        if notify: notify(len(references), multiple_count)
        own = {**config, 'questions': [question]}
        required = {question['id'], *question['dimensions'], *(f['id'] for f in config['filters'])}
        own['fields'] = {qid: f for qid, f in config['fields'].items() if qid in required}
        name = f'KoboMulti{index:03d}'
        book.Queries.Add(name, query_formula(own))
        support = book.Worksheets.Add(After=book.Worksheets(book.Worksheets.Count)); support.Name = unique_sheet_name(f'_Kobo multi {index:03d}', used)
        connection = f'OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location={name};Extended Properties=""'
        table = support.ListObjects.Add(0, connection, None, 1, support.Range('A1')); table.Name = name
        query = table.QueryTable; query.CommandType = 2; query.CommandText = f'SELECT * FROM [{name}]'
        query.BackgroundQuery = False; query.Refresh(False)
        native_connection = query.WorkbookConnection
        native_connection.OLEDBConnection.BackgroundQuery = False
        native_connection.RefreshWithRefreshAll = True
        support.Visible = 0
        sources[question['id']] = {'direct': False, 'table': name, 'connection': native_connection, 'fields': {}, 'scope': question['scope']}
        references.append((question['label'], name, support.Name))
    row = 14 + len(rows)
    guide.Range(guide.Cells(row, 1), guide.Cells(row+len(references)-1, 3)).NumberFormat = '@'
    guide.Range(guide.Cells(row, 1), guide.Cells(row+len(references)-1, 3)).Value = tuple(tuple(safe_spreadsheet_value(v) for v in record) for record in references)
    guide.UsedRange.WrapText = True; guide.UsedRange.Rows.AutoFit()
    return sources, used
