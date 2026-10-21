"""Multi-select pivots over one calculated 0/1 column per answer, without row expansion."""
from .kobo_excel_layout import excel_literal
from .kobo_excel_ranges import excel_cell, excel_range
from .kobo_excel_percentages import percent_format
from .kobo_excel_direct import field_name
from .file_security import safe_spreadsheet_value

DRILLDOWN_NOTE = 'Double-click counts may include unselected respondents. In the extracted sheet, filter the relevant answer column to 1.'


def binary_columns(question, value, prefix, helpers, raw_headers):
    options = []
    used_headers = {name.casefold() for name in [*raw_headers, *helpers]}
    used_captions = {*used_headers, 'values', 'row labels', 'column labels', 'answered total', 'cohort size'}
    answers = [*question['answers'], *([{'id': '__blank__', 'label': question['blankLabel']}] if question['blank'] else [])]
    normalized = f'TRIM(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({value},CHAR(9)," "),CHAR(10)," "),CHAR(13)," "))'
    helpers[prefix+'answered'] = f'=IF({normalized}="",0,1)'
    helpers[prefix+'included'] = f'=IF({normalized}="","Excluded","Included")' if not question['blank'] else '="Included"'
    for answer in answers:
        caption = answer['label']
        if len(caption) > 230: caption = caption[:180] + f" [{answer['id'][:40]}]"
        if caption.casefold() in used_captions: caption += f" [{answer['id']}]"
        base = caption[:230]; caption = base; suffix = 2
        while caption.casefold() in used_captions:
            caption = f'{base} ({suffix})'; suffix += 1
        used_captions.add(caption.casefold())
        original = prefix + '0/1 ' + question['label'][:90] + ': ' + answer['label'][:90] + f" [{answer['id'][:40]}]"
        header = original[:255]; suffix = 2
        while header.casefold() in used_headers:
            tag = f' ({suffix})'; header = original[:255-len(tag)] + tag; suffix += 1
        used_headers.add(header.casefold())
        # FIND is case sensitive and has no wildcard matching. Padding matches complete codes.
        helpers[header] = f'=IF({normalized}="",1,0)' if answer['id'] == '__blank__' else f'=IFERROR(--ISNUMBER(FIND({excel_literal(" "+answer["id"]+" ")}," "&{normalized}&" ")),0)'
        options.append({**answer, 'field': header, 'caption': caption})
    return options


def add_binary_metrics(pivot, result):
    for option in result['_source']['options']:
        metric = pivot.AddDataField(pivot.PivotFields(option['field']), option.get('metric', option['caption']), -4157)
        metric.NumberFormat = '#,##0'
    field = pivot.PivotFields(field_name(result, 'Answer')) if result['_source'].get('single') else pivot.DataPivotField
    field.Orientation = 1; field.Position = 1
    if result['_source'].get('single'): field.Subtotals = (False,)*12


def binary_report(book, report, pivot, totals, result, metrics, support_sheet, language):
    """Native count cells stay drillable; percentages track captions after pivot sorting."""
    from .kobo_excel_slicers import pivot_value
    from openpyxl.utils import get_column_letter
    columns = result.get('_excelBreakdowns', result['breakdowns']) or [{'id': '', 'labels': []}]
    options = result['_source']['options']
    helper = support_sheet(book, '_Kobo chart values')
    quoted = "'" + helper.Name.replace("'", "''") + "'!"
    result['_displayCells'] = {}
    area = pivot.TableRange1
    body = pivot.DataBodyRange
    right = area.Column + area.Columns.Count - 1
    bottom = area.Row + area.Rows.Count - 1
    denominators = []
    for index, column in enumerate(columns):
        start = helper.UsedRange.Row + helper.UsedRange.Rows.Count + 3
        denominator = pivot_value(totals, 'Answered total', '', column['labels'], result)
        denominators.append(denominator)
        rows = []
        for option in options:
            count = pivot_value(totals, 'Responses', option['id'], column['labels'], result)
            percentage = '"-"' if option['id'] == '__blank__' else f'IF({denominator}=0,"-",{count}/{denominator})'
            rows.append(('='+excel_literal(option['caption']), '='+count, '='+percentage))
        if rows:
            if start + len(rows) > 1048576: raise ValueError('Chart values exceed the Excel row limit.')
            excel_range(helper, start+1, 1, start+len(rows), 3).Formula = tuple(rows)
        for offset, option in enumerate(options, start+1):
            result['_displayCells'][(option['id'], column['id'])] = {'count': f'{quoted}$B${offset}', 'percent': f'{quoted}$C${offset}'}
        if 'percent' in metrics and body is not None:
            col = right + 2 + index
            label = (' / '.join(column['labels']) + ' ' if column['labels'] else '') + '%'
            excel_cell(report, body.Row-1, col).Value = safe_spreadsheet_value(label)
            labels = f'{quoted}$A${start+1}:$A${start+len(rows)}'
            percentages = f'{quoted}$C${start+1}:$C${start+len(rows)}'
            formulas = [(f'=IFERROR(INDEX({percentages},MATCH(${get_column_letter(area.Column)}{row},{labels},0)),"-")',) for row in range(body.Row, body.Row+body.Rows.Count)]
            if formulas:
                target = excel_range(report, body.Row, col, body.Row+len(formulas)-1, col)
                target.Formula = tuple(formulas); target.NumberFormat = percent_format(result.get('percentageDecimals', 0))
            excel_cell(report, body.Row-1, col).Font.Bold = True
    footer_row = bottom+2
    excel_cell(report, footer_row, 1).Value = 'إجمالي الإجابات' if language == 'ar' else 'Total answered'
    if body is not None:
        for index in range(1, body.Columns.Count+1):
            items = body.Cells(1, index).PivotCell.ColumnItems
            parts = {str(items.Item(i).Parent.SourceName): str(items.Item(i).Name) for i in range(1, items.Count+1)}
            labels = [parts[field_name(result, f'Breakdown{level+1}')] for level in range(len(result.get('breakdownFields', [])))]
            excel_cell(report, footer_row, body.Column+index-1).Formula = '='+pivot_value(totals, 'Answered total', '', labels, result)
    if 'percent' in metrics:
        for index, denominator in enumerate(denominators):
            cell = excel_cell(report, footer_row, right+2+index)
            cell.Formula = f'=IF({denominator}=0,"-",1)'; cell.NumberFormat = percent_format(result.get('percentageDecimals', 0))
        right += 1+len(columns)
    footer = excel_range(report, footer_row, 1, footer_row, right)
    footer.Font.Bold = True; footer.Interior.Color = 0xEBDFD2; footer.RowHeight = 26
    return excel_range(report, area.Row, area.Column, footer_row, right), footer
