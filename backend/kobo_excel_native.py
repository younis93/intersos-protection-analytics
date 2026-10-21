"""Native report pivots and small, unrounded chart/percentage formula ranges."""
from openpyxl.utils import get_column_letter
from .file_security import safe_spreadsheet_value
from .kobo_excel_ranges import excel_cell, excel_range
from .kobo_excel_direct import field_name
from .kobo_excel_layout import excel_literal
from .kobo_excel_percentages import percent_format
from .kobo_excel_slicers import pivot_value


def native_report(book, report, pivot, totals, result, metrics, support_sheet, language='en'):
    """Count cells remain real pivot cells; chart values use stable answer IDs."""
    if result.get('_source', {}).get('binary'):
        from .kobo_excel_binary import binary_report
        return binary_report(book, report, pivot, totals, result, metrics, support_sheet, language)
    columns = result.get('_excelBreakdowns', result['breakdowns']) or [{'id': '', 'labels': []}]
    valid = [answer for answer in result['rows'] if answer['id'] != '__blank__']
    base = valid[0]['id'] if valid else '__blank__'
    helper = support_sheet(book, '_Kobo chart values')
    cells = {}
    denominators = []
    for column in columns:
        start = helper.UsedRange.Row + helper.UsedRange.Rows.Count + 3
        excel_cell(helper, start, 1).Value = safe_spreadsheet_value(result['label'])
        denominator = pivot_value(totals, 'Answered total', base, column['labels'], result)
        denominators.append(denominator)
        rows = []
        for answer in valid:
            count = pivot_value(totals, 'Responses', answer['id'], column['labels'], result)
            rows.append(('=' + count, f'=IF({denominator}=0,"-",{count}/{denominator})'))
        if rows:
            if start + len(rows) > 1048576: raise ValueError('Chart values exceed the Excel row limit.')
            excel_range(helper, start + 1, 1, start + len(rows), 2).Formula = tuple(rows)
        quoted = "'" + helper.Name.replace("'", "''") + "'!"
        for index, answer in enumerate(valid, start+1):
            cells[(answer['id'], column['id'])] = {'count': f'{quoted}$A${index}', 'percent': f'{quoted}$B${index}'}
    result['_displayCells'] = cells
    area = pivot.TableRange1
    body = pivot.DataBodyRange
    right = area.Column + area.Columns.Count - 1
    bottom = area.Row + area.Rows.Count - 1
    sparse = result['_source'].get('sparse')
    if sparse and 'percent' in metrics and body is not None:
        # Keep these outside the native pivot's columns. Use live row captions so
        # sorting and filtering the pivot cannot attach percentages to wrong answers.
        first = right + 2
        for index, column in enumerate(columns):
            col = first + index
            heading = (' / '.join(column['labels']) + ' ' if column['labels'] else '') + '%'
            excel_cell(report, body.Row - 1, col).Value = safe_spreadsheet_value(heading)
            denominator = denominators[index]
            formulas = []
            for offset in range(len(result['rows'])):
                row = body.Row + offset
                caption = f'${get_column_letter(area.Column)}${row}'
                args = [excel_literal('#'), result['_countPivot'], excel_literal('Answer'), caption]
                for level, part in enumerate(column['labels'], 1): args += [excel_literal(f'Breakdown{level}'), excel_literal(part)]
                count = 'IFERROR(N(GETPIVOTDATA(' + ','.join(args) + ')),0)'
                blank = next((a['label'] for a in result['rows'] if a['id'] == '__blank__'), None)
                invalid = f'OR({caption}="",{denominator}=0' + (f',{caption}={excel_literal(blank)}' if blank else '') + ')'
                formulas.append((f'=IF({invalid},"-",{count}/{denominator})',))
            if formulas:
                target = excel_range(report, body.Row, col, body.Row + len(formulas) - 1, col)
                target.Formula = tuple(formulas)
                target.NumberFormat = percent_format(result.get('percentageDecimals', 0))
        right = first + len(columns)-1
        bottom = max(bottom, body.Row + len(result['rows'])-1)
        heading = excel_range(report, body.Row - 1, first, body.Row - 1, right)
        heading.Font.Bold = True; heading.WrapText = True; heading.Interior.Color = 0xEBDFD2
    footer_row = bottom + 2
    excel_cell(report, footer_row, 1).Value = 'الإجمالي' if language == 'ar' else 'Total answered'
    # Native pivots can expose additional empty combinations with several
    # breakdown levels. Derive footer positions from their real column items.
    if body is not None:
        for index in range(1, body.Columns.Count+1):
            cell = body.Cells(1, index)
            items = cell.PivotCell.ColumnItems
            parts = {}
            for item_index in range(1, items.Count+1):
                item = items.Item(item_index)
                parts[str(item.Parent.SourceName)] = str(item.Name)
            labels = [parts[field_name(result, f'Breakdown{level+1}')] for level in range(len(result.get('breakdownFields', [])))]
            denominator = pivot_value(totals, 'Answered total', base, labels, result)
            # Excel does not expose DataField on a completely empty PivotCell.
            metric = 'count' if sparse or metrics == ['count'] else 'percent' if metrics == ['percent'] else metrics[(index-1) % len(metrics)]
            target = excel_cell(report, footer_row, body.Column + index - 1)
            target.Formula = '=' + (denominator if metric == 'count' else f'IF({denominator}=0,"-",1)')
            target.NumberFormat = '#,##0' if metric == 'count' else percent_format(result.get('percentageDecimals', 0))
    for index, column in enumerate(columns):
        if sparse and 'percent' in metrics:
            target = excel_cell(report, footer_row, first + index)
            target.Formula = f'=IF({denominators[index]}=0,"-",1)'
            target.NumberFormat = percent_format(result.get('percentageDecimals', 0))
    footer = excel_range(report, footer_row, 1, footer_row, right)
    footer.Interior.Color = 0xEBDFD2; footer.Font.Bold = True; footer.RowHeight = 26
    return excel_range(report, area.Row, area.Column, footer_row, right), footer
