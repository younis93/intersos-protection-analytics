"""Question-specific mappings for pivots sourced directly from response tables."""
from .kobo_excel_layout import excel_literal
from .kobo_excel_percentages import percent_format


def field_name(result, name):
    return result.get('_source', {}).get('fields', {}).get(name, name)


def page_fields(pivot, result):
    if not result.get('_source', {}).get('direct'):
        field = pivot.PivotFields('QuestionId'); field.Orientation = 3; field.CurrentPage = result['id']
    name = field_name(result, 'IncludeInPivot')
    field = pivot.PivotFields(name); field.Orientation = 3; field.CurrentPage = 'Included'


def add_metric(pivot, result, metric, percentage_field=None):
    direct = result.get('_source', {}).get('direct')
    source = pivot.PivotFields(field_name(result, 'Selected' if metric == 'count' else 'Answered')) if direct else (
        pivot.PivotFields('Selected') if metric == 'count' else percentage_field(pivot))
    field = pivot.AddDataField(source, '#' if metric == 'count' else '%', -4157)
    if direct and metric == 'percent': field.Calculation = 7  # xlPercentOfColumn
    field.NumberFormat = '#,##0' if metric == 'count' else percent_format(result.get('percentageDecimals', 0))


def structured_column(header):
    # Excel structured references escape these characters with a single quote.
    return ''.join("'" + c if c in "[]#'@" else c for c in header)


def direct_helpers(config, layouts):
    """Return calculated table columns and field mappings, without expanding rows."""
    tables = {layout['scope']: layout for layout in layouts}
    helpers = {scope: {} for scope in tables}
    sources = {}

    def raw(scope, qid):
        field = config['fields'][qid]
        column = structured_column(field['column'])
        if field['scope'] == scope: return f'[@[{column}]]'
        # Resolve ancestors through stable response/parent IDs, including nested repeats.
        current = tables[scope]
        parent = '[@[Parent ID]]'
        visited = set()
        while current['scope'] != field['scope']:
            if current['scope'] in visited: raise ValueError('Circular repeat scope hierarchy.')
            visited.add(current['scope'])
            parent_scope = current.get('parent_scope', '')
            ancestor = tables[parent_scope]
            if parent_scope == field['scope']:
                value = f'INDEX({ancestor["table"]}[{column}],MATCH({parent},{ancestor["table"]}[Response ID],0))'
                return f'IFERROR(IF({value}="","",{value}),"")'
            parent = f'INDEX({ancestor["table"]}[Parent ID],MATCH({parent},{ancestor["table"]}[Response ID],0))'
            current = ancestor
        raise ValueError('Breakdown field must belong to this response or an ancestor response.')

    def text_value(value, field):
        return f'TEXT({value},"yyyy-mm-dd")' if field['kind'] == 'date' else f'({value}&"")'

    def caption(scope, qid, blank='Missing breakdown', overrides=None):
        value = raw(scope, qid); field = config['fields'][qid]
        key = text_value(value, field)
        # Separate lookup namespaces preserve slicer-specific duplicate captions.
        namespace = 'filter:' if overrides is not None else 'field:'
        lookup = f'IFERROR(VLOOKUP({excel_literal(namespace+qid+"|")}&{key},KoboChoices,2,FALSE),{key})'
        return f'IF({value}="",{excel_literal(blank)},{lookup})'

    for scope in tables:
        helpers[scope]['[Calc] Response'] = '=1'
        for spec in config['filters']:
            helpers[scope][spec['header']] = '=' + caption(scope, spec['id'], 'Blank / unanswered', spec['captions'])

    for index, q in enumerate(config['questions'], 1):
        if q['kind'] == 'multiple': continue
        scope = q['scope']; prefix = f'[Calc] Q{index:03d} '
        value = raw(scope, q['id'])
        answer = caption(scope, q['id'], q['blankLabel'])
        if q['bins']:
            answer = 'NA()'
            for i, bucket in reversed(list(enumerate(q['bins']))):
                op = '<=' if i == len(q['bins'])-1 else '<'
                answer = f'IF(AND({value}>={bucket["min"]},{value}{op}{bucket["max"]}),{excel_literal(bucket["label"])},{answer})'
            answer = f'IF({value}="",{excel_literal(q["blankLabel"])},{answer})'
        elif q['kind'] == 'date':
            fmt = 'yyyy' if q['dateUnit'] == 'year' else 'yyyy-mm' if q['dateUnit'] == 'month' else 'yyyy-mm-dd'
            # Keep initial human-readable period labels, and show new periods by their key.
            answer = f'IF({value}="",{excel_literal(q["blankLabel"])},IFERROR(VLOOKUP({excel_literal("period:"+q["id"]+"|")}&TEXT({value},{excel_literal(fmt)}),KoboChoices,2,FALSE),TEXT({value},{excel_literal(fmt)})))'
        fields = {'Respondent': 'Response ID', 'Selected': '[Calc] Response', 'Answer': prefix+'answer', 'Answered': prefix+'answered', 'IncludeInPivot': prefix+'included'}
        helpers[scope][fields['Answer']] = '=' + answer
        helpers[scope][fields['Answered']] = f'=IF({value}="",0,1)'
        helpers[scope][fields['IncludeInPivot']] = f'=IF({value}="","Excluded","Included")' if not q['blank'] else '="Included"'
        for level, qid in enumerate(q['dimensions'], 1):
            fields[f'Breakdown{level}'] = prefix+f'breakdown {level}'
            helpers[scope][fields[f'Breakdown{level}']] = '=' + caption(scope, qid)
        sources[q['id']] = {'direct': True, 'table': tables[scope]['table'], 'fields': fields, 'scope': scope}
    return helpers, sources


def choice_lookup_rows(config):
    rows = {}
    for qid, field in config['fields'].items():
        rows.update((f'field:{qid}|{code}', label) for code, label in field['captions'].items())
    for spec in config['filters']:
        rows.update((f'filter:{spec["id"]}|{code}', label) for code, label in spec['captions'].items())
    for question in config['questions']:
        if question['kind'] == 'date':
            rows.update((f'period:{question["id"]}|{a["id"]}', a['label']) for a in question['answers'])
        elif question['kind'] == 'number' and not question['bins']:
            rows.update((f'field:{question["id"]}|{float(a["id"]):.15g}', a['label']) for a in question['answers'])
    return list(rows.items()) or [('unused', '')]
