"""Scalar response filters and independent, per-analysis-sheet Excel slicers."""
import math
from collections import Counter

from .kobo import label, matches, missing
from .kobo_excel_layout import excel_literal
from .kobo_excel_direct import field_name


def slicer_fields(project, settings):
    questions = {q['id']: q for q in project['form']['questions']}
    ids = list(dict.fromkeys([*settings.filterFields, *(f.field for f in settings.filters)]))
    fields = []
    for qid in ids:
        q = questions.get(qid)
        if not q: raise ValueError(f'Excel slicer field no longer exists: {qid}. Remove it from Filter responses.')
        if q['kind'] == 'multiple' or q['repeat']:
            raise ValueError(f'Excel slicers cannot represent the multi-choice or repeat filter "{label(q, settings.language)}". Remove it from Filter responses and Choose fields before exporting.')
        fields.append(q)
    return fields


def scalar_key(value, kind=''):
    if missing(value): return '__blank__'
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if not math.isfinite(value): return '__blank__'
        return format(value, '.15g')
    return str(value)[:10] if kind == 'date' else str(value)


def slicer_specs(project, settings):
    fields = slicer_fields(project, settings)
    specs = []
    for index, q in enumerate(fields, 1):
        choices = {c['name']: label(c, settings.language) for c in q['choices']}
        raw = {scalar_key(r['values'].get(q['id']), q['kind']): r['values'].get(q['id']) for r in project['records'] if not r['scope']}
        captions = {key: ('Blank / unanswered' if key == '__blank__' else choices.get(key, key)) for key in raw}
        # Excel item names are case insensitive. Distinguish both duplicate labels and codes.
        used = set(); caption_counts = Counter(caption.casefold() for caption in captions.values())
        for key, caption in list(captions.items()):
            if caption_counts[caption.casefold()] > 1:
                caption = f'{caption} [{key}]'
            base = caption; suffix = 2
            while caption.casefold() in used: caption = f'{base} ({suffix})'; suffix += 1
            used.add(caption.casefold()); captions[key] = caption
        rule = next((f for f in settings.filters if f.field == q['id']), None)
        selected = {captions[key] for key, value in raw.items() if matches(value, rule)} if rule else None
        if rule and not selected:
            raise ValueError(f'The filter "{label(q, settings.language)}" has no matching values to select in Excel. Adjust or reset this filter before exporting.')
        caption = label(q, settings.language)
        if sum(label(other, settings.language) == caption for other in fields) > 1: caption += f" [{q['name']}]"
        specs.append({'id': q['id'], 'kind': q['kind'], 'header': f'Filter{index:03d}', 'caption': caption,
                      'captions': captions, 'selected': selected})
    return specs


def filter_values(project, specs):
    lookup = {r['id']: r for r in project['records']}
    values = {}
    for record in project['records']:
        root = record; seen = set()
        while root.get('parent') in lookup and root['id'] not in seen:
            seen.add(root['id']); root = lookup[root['parent']]
        values[record['id']] = [spec['captions'].get(scalar_key(root['values'].get(spec['id']), spec['kind']), 'Blank / unanswered') for spec in specs]
    return values


def initial_filter_summary(specs, settings):
    summaries = []
    for rule in settings.filters:
        spec = next(spec for spec in specs if spec['id'] == rule.field)
        if rule.kind == 'category':
            values = ', '.join(sorted(spec['selected'] or []))
        else:
            values = f'{rule.minimum if rule.minimum is not None else "Any"} - {rule.maximum if rule.maximum is not None else "Any"}'
        summaries.append(spec['caption'] + ': ' + values)
    return '; '.join(summaries) or 'All responses'


def pivot_reference(pivot):
    sheet = str(pivot.Parent.Name).replace("'", "''")
    return f"'{sheet}'!{pivot.TableRange2.Cells(1, 1).Address}"


def pivot_value(pivot, metric, answer, parts=(), result=None):
    """GETPIVOTDATA reads filtered aggregates without counting answer-option rows twice."""
    address = pivot if isinstance(pivot, str) else pivot_reference(pivot)
    direct = result is not None and result.get('_source', {}).get('direct')
    args = [excel_literal(metric), address]
    if not direct: args.extend([excel_literal('AnswerCode'), excel_literal(answer)])
    elif metric == 'Responses':
        row = next((row for row in result['rows'] if row['id'] == answer), {'label': answer})
        caption = row['label']
        if sum(other['label'] == caption for other in result['rows']) > 1: caption += f' [{answer}]'
        args.extend([excel_literal(field_name(result, 'Answer')), excel_literal(caption)])
    for level, part in enumerate(parts, 1): args.extend([excel_literal(field_name(result or {}, f'Breakdown{level}')), excel_literal(part)])
    return 'IFERROR(N(GETPIVOTDATA(' + ','.join(args) + ')),0)'


def totals_pivot(book, cache, result, position):
    try: sheet = book.Worksheets('_Kobo slicer totals')
    except Exception:
        sheet = book.Worksheets.Add(After=book.Worksheets(book.Worksheets.Count))
        sheet.Name = '_Kobo slicer totals'; sheet.Visible = 2
    row = sheet.UsedRange.Row + sheet.UsedRange.Rows.Count + 6
    pivot = cache.CreatePivotTable(sheet.Cells(row, 1), f'KoboTotals{position:03d}')
    pivot.ManualUpdate = True
    direct = result.get('_source', {}).get('direct')
    if not direct:
        field = pivot.PivotFields('QuestionId'); field.Orientation = 3; field.CurrentPage = result['id']
    field = pivot.PivotFields(field_name(result, 'Answer') if direct else 'AnswerCode'); field.Orientation = 1; field.Subtotals = (False,)*12
    for level in range(len(result.get('breakdownFields', []))):
        field = pivot.PivotFields(field_name(result, f'Breakdown{level+1}')); field.Orientation = 2; field.Position = level+1; field.Subtotals = (False,)*12
    for source, caption, aggregation in [('Selected', 'Responses', -4157), ('Answered', 'Answered total', -4157), ('Respondent', 'Cohort size', -4112)]:
        pivot.AddDataField(pivot.PivotFields(field_name(result, source)), caption, aggregation)
    pivot.RowGrand = True; pivot.ColumnGrand = True; pivot.RowAxisLayout(1)
    pivot.ManualUpdate = False
    return pivot


def add_sheet_slicers(book, report, pivots, specs, sheet_number, notify=None, top_row=7):
    if not specs or not pivots: return
    for pivot in pivots: pivot.ManualUpdate = True
    caches = []
    try:
        _connect_sheet_slicers(book, report, pivots, specs, sheet_number, caches, notify, top_row)
    finally:
        try:
            for cache, cross_filter in caches: cache.CrossFilterType = cross_filter
        finally:
            for pivot in pivots: pivot.ManualUpdate = False


def _connect_sheet_slicers(book, report, pivots, specs, sheet_number, caches, notify, top_row):
    import pythoncom
    for index, spec in enumerate(specs):
        try: cache = book.SlicerCaches.Add(pivots[0], spec['header'], f'KoboSlicerCache{sheet_number}_{index}')
        except Exception as exc: raise ValueError(f"Could not create slicer cache for {spec['caption']}: {exc}") from exc
        # Computing dimmed slicer buttons after every connection is quadratic in
        # the number of pivots. Restore the normal display once all are connected.
        caches.append((cache, cache.CrossFilterType)); cache.CrossFilterType = 1
        total = len(specs)*len(pivots)
        if notify: notify(index*len(pivots)+1, total)
        for connection, pivot in enumerate(pivots[1:], 2):
            try: cache.PivotTables.AddPivotTable(pivot)
            except Exception as exc: raise ValueError(f'Could not connect slicer to {pivot.Name}: {exc}') from exc
            if notify and (connection % 5 == 0 or connection == len(pivots)):
                notify(index*len(pivots)+connection, total)
        # Positional arguments avoid locale-dependent Excel generated dispatch metadata.
        top = report.Cells(top_row, 1).Top + (index // 4)*156
        left = report.Cells(1, 1).Left + (index % 4)*230
        slicer = cache.Slicers.Add(report, pythoncom.Missing, f'KoboSlicer{sheet_number}_{index}', spec['caption'][:255], top, left, 218, 144)
        slicer.Style = 'SlicerStyleLight2'; slicer.NumberOfColumns = 1
        slicer.Shape.Placement = 3
        # Set final geometry explicitly: Add and style assignment can apply display scaling.
        slicer.Shape.Width = 218; slicer.Shape.Height = 144
        slicer.Shape.Left = left; slicer.Shape.Top = top
        if spec['selected'] is not None:
            # Select wanted items first: Excel must always retain at least one selected item.
            available = [cache.SlicerItems.Item(i) for i in range(1, cache.SlicerItems.Count+1)]
            wanted = [item for item in available if str(item.Name) in spec['selected']]
            if not wanted: raise ValueError(f"Excel could not restore the filter selection: {spec['caption']}.")
            for item in wanted: item.Selected = True
            for item in available:
                if str(item.Name) not in spec['selected']: item.Selected = False
