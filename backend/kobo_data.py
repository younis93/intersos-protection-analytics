"""Read-only, paged Kobo response grids. Repeat scopes remain separate tables."""
from .kobo import KoboFilter, filtered_records, label, missing, question_result, question_categories, QuestionSettings, question_cohort, breakdown_fields, breakdown_values


def pivot_records(project, settings, scope, records, selection):
    from .kobo_conditional import analysis_project
    project = analysis_project(project, settings)
    projected_lookup = {r['id']: r for r in project['records']}
    records = [projected_lookup[r['id']] for r in records]
    from .kobo_connections import form_question_index
    questions = form_question_index(project['form'])
    question = questions.get(selection['question'])
    if question is None:
        raise ValueError('Question not found.')
    if question['repeat'] != scope:
        raise ValueError('The selected question belongs to a different response table.')
    lookup = {record['id']: record for record in project['records']}
    records = question_cohort(question, records, settings.questions.get(question['id'], QuestionSettings()), questions, lookup)
    snapshot = question_result(question, records, settings, questions, lookup)
    answer, breakdown = selection.get('answer'), selection.get('breakdown')
    if answer is not None and not any(row['id'] == answer for row in snapshot['rows']):
        raise ValueError('The selected answer is no longer available in this pivot.')
    column = next((column for column in snapshot['breakdowns'] if column['id'] == breakdown), None)
    if breakdown is not None and column is None:
        raise ValueError('The selected breakdown is no longer available in this pivot.')
    if answer == '__blank__' and breakdown is not None:
        raise ValueError('Blank answers do not have breakdown values.')
    answered = [record for record in records if not missing(record['values'].get(question['id']))]
    cfg = settings.questions.get(question['id'], QuestionSettings())
    _, _, categories = question_categories(question, answered, cfg)
    dimensions = breakdown_fields(cfg, questions, question)
    selected = []
    for record in records:
        value = record['values'].get(question['id'])
        matches = missing(value) if answer == '__blank__' else not missing(value) and (answer is None or answer in categories(value))
        if matches and (column is None or list(breakdown_values(record, dimensions, lookup)) == column['values']):
            selected.append(record)
    if snapshot.get('measure'):
        from .kobo_measures import value_field, record_value
        field = value_field(question, cfg, questions)
        selected = [r for r in selected if not missing(record_value(r, field, lookup))]
    return selected


def data_rows(project, settings, scope, columns, search='', sort_column='', direction='asc', drilldown=None, column_filters=None, record_ids=None):
    raw_lookup = {r['id']: r for r in project['records']}
    if drilldown:
        from .kobo_conditional import analysis_project
        project = analysis_project(project, settings)
    questions = {q['id']: q for q in project['form']['questions'] if q['repeat'] == scope}
    measure_field = None
    if drilldown:
        from .kobo_measures import value_field,record_value
        all_questions={q['id']:q for q in project['form']['questions']}
        target=all_questions.get(drilldown.get('question'))
        if target:
            measure_field=value_field(target,settings.questions.get(target['id'],QuestionSettings()),all_questions)
            if measure_field:questions[measure_field['id']]=measure_field
    if scope and not questions:
        raise ValueError('Response table not found.')
    if any(column not in questions for column in columns):
        raise ValueError('A selected column is not in this response table.')
    if sort_column and sort_column != '__row__' and sort_column not in columns:
        raise ValueError('Select a visible column to sort.')
    columns = list(dict.fromkeys(columns))
    captions = {qid: {c['name']: label(c, settings.language) for c in questions[qid]['choices']} for qid in columns}

    def display(qid, value):
        if value is None: return ''
        if isinstance(value, list): return ', '.join(display(qid, item) for item in value)
        return captions[qid].get(str(value), str(value))

    # An exact raw-row inspection must also reach orphaned/cyclic repeat records.
    source_records = project['records'] if record_ids is not None and not settings.filters and drilldown is None else filtered_records(project, settings)
    records = [record for record in source_records if record['scope'] == scope]
    if record_ids is not None:
        selected_records = set(record_ids)
        records = [record for record in records if record['id'] in selected_records]
    if drilldown is not None:
        if drilldown.get('baseFilters') is not None:
            # Keep the clicked pivot cohort and numeric bin boundaries stable.
            base_settings = settings.model_copy(update={'filters': [KoboFilter.model_validate(rule) for rule in drilldown['baseFilters']]})
            base_records = [record for record in filtered_records(project, base_settings) if record['scope'] == scope]
            selected_ids = {record['id'] for record in pivot_records(project, base_settings, scope, base_records, drilldown)}
            records = [record for record in records if record['id'] in selected_ids]
        else:
            records = pivot_records(project, settings, scope, records, drilldown)
    if measure_field:
        lookup={r['id']:r for r in project['records']}
        records=[{**r,'values':{**r['values'],measure_field['id']:record_value(r,measure_field,lookup)}} for r in records]
    query = search.strip().casefold()
    rows = []
    for record in records:
        if drilldown:
            raw_record = raw_lookup[record['id']]
            record = {**raw_record, 'values': {**raw_record['values'], measure_field['id']: record['values'].get(measure_field['id'])}} if measure_field else raw_record
        values = {qid: display(qid, record['values'].get(qid)) for qid in columns}
        if query and not any(query in text.casefold() for text in [str(record['row']), *values.values(), *(str(record['values'].get(qid, '')) for qid in columns)]):
            continue
        rows.append((record, {'id': record['id'], 'row': record['row'], 'values': values, 'rawValues': {key:record['values'].get(key) for key in columns}}))
    if sort_column:
        if sort_column == '__row__':
            rows.sort(key=lambda item: item[0]['row'], reverse=direction == 'desc')
        else:
            filled = [item for item in rows if item[1]['values'][sort_column] != '']
            blank = [item for item in rows if item[1]['values'][sort_column] == '']
            def sort_key(item):
                value = item[0]['values'].get(sort_column)
                if questions[sort_column]['kind'] == 'number':
                    try: return (0, float(value))
                    except (ValueError, TypeError): pass
                return (1, item[1]['values'][sort_column].casefold())
            filled.sort(key=sort_key, reverse=direction == 'desc')
            rows = filled + blank
    if column_filters:
        import pandas as pd
        from .column_filters import apply_column_filters
        frame = pd.DataFrame([{'__row__':item[1]['row'], **item[1]['values']} for item in rows], columns=['__row__', *columns])
        indexes = apply_column_filters(frame, column_filters).index
        rows = [rows[index] for index in indexes]
    return {'total': len(records), 'matched': len(rows), 'rows': [item[1] for item in rows]}


def data_page(project, settings, scope, columns, search='', sort_column='', direction='asc', page=1, page_size=50, drilldown=None, column_filters=None, record_ids=None):
    result = data_rows(project, settings, scope, columns, search, sort_column, direction, drilldown, column_filters, record_ids)
    start = (page - 1) * page_size
    from .kobo_conditional import scan
    warnings = {}
    for row in scan(project, settings)['rows']:
        if row['question'] in columns: warnings.setdefault(row['record'], {})[row['question']] = {'status': row['status'], 'outcome': row['outcome'], 'condition': row['condition']}
    setups = {qid: {'status':'open','outcome':'connection-setup-needed','condition':''} for qid in columns if any(q['id']==qid and (q.get('connectionSetup') or {}).get('pending') for q in project['form']['questions'])}
    return {**result, 'rows': [{**row, 'conditionalWarnings': {**warnings.get(row['id'], {}), **setups}} for row in result['rows'][start:start + page_size]]}


def data_workbook(project, settings, scope, columns, search='', sort_column='', direction='asc', selected_ids=None, drilldown=None, column_filters=None, record_ids=None):
    from collections import Counter
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.cell import WriteOnlyCell
    from openpyxl.styles import Alignment, Font, PatternFill

    columns = list(dict.fromkeys(columns))
    result = data_rows(project, settings, scope, columns, search, sort_column, direction, drilldown, None if selected_ids is not None else column_filters, record_ids)
    selected = None if selected_ids is None else set(selected_ids)
    from .kobo_connections import form_question_index
    questions = form_question_index(project['form'])
    labels = [label(questions[qid], settings.language) for qid in columns]
    counts = Counter(['Source row', *labels])
    headers, used = ['Source row'], {'Source row'}
    for qid, caption in zip(columns, labels):
        title = f"{caption} [{questions[qid]['name']}]" if counts[caption] > 1 else caption
        if title in used: title = f'{title} [{qid}]'
        while title in used: title += ' [column]'
        used.add(title); headers.append(title)
    workbook = Workbook(write_only=True)
    sheet = workbook.create_sheet('Response data')
    sheet.freeze_panes = 'B2'
    sheet.sheet_view.rightToLeft = settings.language == 'ar'
    from openpyxl.utils import get_column_letter
    for index in range(1, len(headers) + 1):
        sheet.column_dimensions[get_column_letter(index)].width = 14 if index == 1 else 32

    def cells(values, header=False):
        for value in values:
            cell = WriteOnlyCell(sheet, value=value)
            # Export response text literally, including strings beginning with '='.
            if isinstance(value, str): cell.data_type = 's'
            cell.alignment = Alignment(vertical='top', wrap_text=True)
            if header:
                cell.font = Font(bold=True, color='FFFFFF')
                cell.fill = PatternFill('solid', fgColor='245B83')
            yield cell

    sheet.append(list(cells(headers, True)))
    for row in result['rows']:
        if selected is None or row['id'] in selected:
            sheet.append(list(cells([row['row'], *(row['values'][qid] for qid in columns)])))
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()
