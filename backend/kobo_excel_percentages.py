"""Live report tables backed by native pivots, with deterministic display rounding."""
from .file_security import safe_spreadsheet_value


def percent_format(decimals):
    return '0' + ('.' + '0' * decimals if decimals else '') + '%'


def rounding_formulas(row, first, last, units, decimals, balance=True):
    counts, floors, remainders, order = (f'${column}${first}:${column}${last}' for column in ('B', 'D', 'E', 'H'))
    rank = f'=COUNTIF({remainders},">"&E{row})+COUNTIFS({remainders},E{row},{order},"<"&H{row})+1'
    rounded = f'ROUND(B{row}/C{row},{decimals + 2})'
    if balance:
        rounded = f'IF(SUM({counts})=C{row},(D{row}+IF(AND(B{row}>0,F{row}<={units}-SUM({floors})),1,0))/{units},{rounded})'
    return [f'=IF(C{row}=0,0,QUOTIENT(B{row}*{units},C{row}))',
            f'=IF(C{row}=0,0,MOD(B{row}*{units},C{row}))', rank,
            f'=IF(C{row}=0,"-",{rounded})']


def report_table(book, report, totals, result, row, metrics, support_sheet, language='en'):
    """Stable answer IDs own helper rows; display sort never determines rounding ties."""
    from .kobo_excel_slicers import pivot_value
    decimals = result.get('percentageDecimals', 0)
    units = 100 * 10 ** decimals
    helper = support_sheet(book, '_Kobo rounding')
    columns = result.get('_excelBreakdowns', result['breakdowns']) or [{'id': '', 'labels': []}]
    answers = result['rows']
    valid = [answer for answer in answers if answer['id'] != '__blank__']
    canonical = {key: index for index, key in enumerate(sorted(answer['id'] for answer in valid))}
    base = valid[0]['id'] if valid else '__blank__'
    cells = {}
    for column in columns:
        start = helper.UsedRange.Row + helper.UsedRange.Rows.Count + 3
        helper.Cells(start, 1).Value = safe_spreadsheet_value(result['label'] + (' / ' + ' / '.join(column['labels']) if column['labels'] else ''))
        helper.Range(helper.Cells(start + 1, 1), helper.Cells(start + 1, 8)).Value = (('Answer ID', 'Count', 'Answered base', 'Whole units', 'Remainder', 'Remainder rank', 'Display percentage', 'Stable order'),)
        first, last = start + 2, start + 1 + len(valid)
        if max(first, last) > 1048576: raise ValueError('Percentage display helpers exceed the Excel row limit. Export fewer questions or breakdowns.')
        quoted = "'" + helper.Name.replace("'", "''") + "'!"
        parts = column['labels']
        denominator = pivot_value(totals, 'Answered total', base, parts, result)
        for index, answer in enumerate(valid):
            r = first + index
            helper.Cells(r, 1).Value = safe_spreadsheet_value(answer['id'])
            helper.Cells(r, 2).Formula = '=' + pivot_value(totals, 'Responses', answer['id'], parts, result)
            helper.Cells(r, 3).Formula = '=' + denominator
            formulas = rounding_formulas(r, first, last, units, decimals, result['kind'] != 'multiple')
            helper.Range(helper.Cells(r, 4), helper.Cells(r, 7)).Formula = (tuple(formulas),)
            helper.Cells(r, 8).Value = canonical[answer['id']]
            helper.Cells(r, 7).NumberFormat = percent_format(decimals)
            cells[(answer['id'], column['id'])] = {'count': f'{quoted}$B${r}', 'percent': f'{quoted}$G${r}', 'denominator': f'{quoted}$C${r}'}
        if not valid:
            helper.Cells(first, 3).Formula = '=' + denominator
        column['_denominator'] = f'{quoted}$C${first}'
        blank = next((answer for answer in answers if answer['id'] == '__blank__'), None)
        if blank:
            cells[(blank['id'], column['id'])] = {'count': pivot_value(totals, 'Responses', blank['id'], parts, result), 'percent': '"-"', 'denominator': column['_denominator']}
    result['_displayCells'] = cells
    depth = len(result.get('breakdownFields', []))
    metric_count = len(metrics)
    width = 1 + len(columns) * metric_count
    header_bottom = row + depth
    report.Cells(row, 1).Value = 'الإجابة' if language == 'ar' else 'Answer'
    if depth:
        report.Range(report.Cells(row, 1), report.Cells(header_bottom, 1)).Merge()
    for level in range(depth):
        index = 0
        while index < len(columns):
            end = index + 1
            key = columns[index].get('values', [columns[index]['id']])[:level + 1]
            while end < len(columns) and columns[end].get('values', [columns[end]['id']])[:level + 1] == key:
                end += 1
            area = report.Range(report.Cells(row + level, 2 + index * metric_count), report.Cells(row + level, 1 + end * metric_count))
            area.Merge(); area.Value = safe_spreadsheet_value(columns[index]['labels'][level]); area.WrapText = True
            index = end
    for index, column in enumerate(columns):
        for offset, metric in enumerate(metrics):
            report.Cells(header_bottom, 2 + index * metric_count + offset).Value = '#' if metric == 'count' else '%'
    heading = report.Range(report.Cells(row, 1), report.Cells(header_bottom, width))
    heading.Interior.Color = 0x704B23; heading.Font.Color = 0xFFFFFF; heading.Font.Bold = True
    heading.HorizontalAlignment = -4108; heading.VerticalAlignment = -4108; heading.Rows.RowHeight = 30
    for index, answer in enumerate(answers):
        r = header_bottom + 1 + index
        report.Cells(r, 1).Value = safe_spreadsheet_value(answer['label'])
        report.Cells(r, 1).WrapText = True
        for c, column in enumerate(columns):
            for offset, metric in enumerate(metrics):
                target = report.Cells(r, 2 + c * metric_count + offset)
                target.Formula = '=' + cells[(answer['id'], column['id'])][metric]
                target.NumberFormat = '#,##0' if metric == 'count' else percent_format(decimals)
                target.Interior.Color = 0xFBF2E8
        report.Rows(r).AutoFit()
        if report.Rows(r).RowHeight < 22: report.Rows(r).RowHeight = 22
    footer_row = header_bottom + 1 + len(answers)
    report.Cells(footer_row, 1).Value = 'الإجمالي' if language == 'ar' else 'Total'
    for c, column in enumerate(columns):
        denominator = column['_denominator']
        for offset, metric in enumerate(metrics):
            target = report.Cells(footer_row, 2 + c * metric_count + offset)
            target.Formula = '=' + (denominator if metric == 'count' else f'IF({denominator}=0,"-",1)')
            target.NumberFormat = '#,##0' if metric == 'count' else percent_format(decimals)
    footer = report.Range(report.Cells(footer_row, 1), report.Cells(footer_row, width))
    footer.Interior.Color = 0xEBDFD2; footer.Font.Bold = True; footer.RowHeight = 26
    area = report.Range(report.Cells(row, 1), report.Cells(footer_row, width))
    area.Font.Name = 'Arial'; area.Font.Size = 10; area.Borders.Color = 0xEADACF
    footer.RowHeight = 26
    return area, footer
