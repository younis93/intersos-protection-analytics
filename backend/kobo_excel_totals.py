from .kobo_excel_ratio import modern,selection_base,ratio
"""Conditional report totals outside native pivot cells."""
from collections import Counter

from openpyxl.utils import get_column_letter

from .file_security import safe_spreadsheet_value
from .kobo_excel_layout import excel_literal
from .kobo_excel_ranges import excel_cell, excel_range
from .kobo_excel_percentages import percent_format, rounding_formulas


def totals_policy(result):
    # Metric subcolumns and Excel's empty cross-product items are not categories.
    return result.get('_totalsPolicy', (len(result['rows']) > 1, len(result['breakdowns']) > 1))


def overall_count_pivot(book, cache, result, position, support_sheet):
    """An ungrouped count pivot provides totals without summing category cells."""
    from .kobo_excel_direct import page_fields, add_metric, field_name
    from .kobo_excel_slicers import pivot_reference
    sheet = support_sheet(book, '_Kobo overall pivots')
    row = sheet.UsedRange.Row + sheet.UsedRange.Rows.Count + 6
    pivot = cache.CreatePivotTable(excel_cell(sheet, row, 1), f'KoboOverall{position:03d}')
    pivot.ManualUpdate = True
    page_fields(pivot, result)
    if result['_source'].get('binary'):
        from .kobo_excel_binary import add_binary_metrics
        add_binary_metrics(pivot, result)
    else:
        field = pivot.PivotFields(field_name(result, 'Answer'))
        field.Orientation = 1; field.Subtotals = (False,) * 12
        add_metric(pivot, result, 'count')
    pivot.RowGrand = False; pivot.ColumnGrand = False; pivot.RowAxisLayout(1)
    pivot.ManualUpdate = False
    result['_overallCountPivot'] = pivot_reference(pivot)
    return pivot


def append_overall_totals(book, report, totals, result, metrics, support_sheet,
                          body_row, answer_column, right, footer_row, language='en'):
    """Use live pivot aggregates and caption lookups so sorting preserves totals."""
    from .kobo_excel_slicers import pivot_value
    show_row, show_column = totals_policy(result)
    if not show_column:
        return right
    answers = [answer for answer in result['rows'] if answer['id'] != '__blank__'] + [answer for answer in result['rows'] if answer['id'] == '__blank__']
    helper = support_sheet(book, '_Kobo overall totals')
    start = helper.UsedRange.Row + helper.UsedRange.Rows.Count + 3
    first, last = start + 1, start + len(answers)
    if last > 1048576:
        raise ValueError('Overall totals exceed the Excel row limit.')
    valid = [answer for answer in answers if answer['id'] != '__blank__']
    base = valid[0]['id'] if valid else '__blank__'
    count_result = {**result, '_countPivot': result['_overallCountPivot']} if '_overallCountPivot' in result else result
    denominator = selection_base(totals,result) if modern(result) else pivot_value(totals, 'Answered total', base, (), result)
    captions = Counter(answer['label'] for answer in answers)
    options = {option['id']: option['caption'] for option in result.get('_source', {}).get('options', [])}
    canonical = {key: i for i, key in enumerate(sorted(answer['id'] for answer in answers))}
    decimals = result.get('percentageDecimals', 0)
    excel_cell(helper, start, 1).Value = safe_spreadsheet_value(result['label'])
    for index, answer in enumerate(answers, first):
        caption = options.get(answer['id'], answer['label'] + (f" [{answer['id']}]" if captions[answer['label']] > 1 else ''))
        excel_cell(helper, index, 1).Formula = '=' + excel_literal(caption)
        excel_cell(helper, index, 2).Formula = '=' + pivot_value(totals, 'Responses', answer['id'], (), count_result)
        excel_cell(helper, index, 3).Formula = '=' + denominator
        formulas = rounding_formulas(index, first, first + len(valid) - 1, 100 * 10 ** decimals, decimals,
                                     result['kind'] != 'multiple')
        if modern(result):formulas[-1]='='+ratio(totals,result,answer['id'])
        elif answer['id'] == '__blank__':
            formulas[-1] = '="-"'
        excel_range(helper, index, 4, index, 7).Formula = (tuple(formulas),)
        excel_cell(helper, index, 8).Value = canonical[answer['id']]
    quoted = "'" + helper.Name.replace("'", "''") + "'!"
    labels = f'{quoted}$A${first}:$A${last}'
    for offset, metric in enumerate(metrics, right + 1):
        heading = ('الإجمالي' if language == 'ar' else 'Total') + (' #' if metric == 'count' else ' %')
        cell = excel_cell(report, body_row - 1, offset)
        cell.Value = heading; cell.Font.Bold = True; cell.Interior.Color = 0xEBDFD2
        source = 'B' if metric == 'count' else 'G'
        values = f'{quoted}${source}${first}:${source}${last}'
        formulas = []
        for row in range(body_row, body_row + len(answers)):
            caption = f'${get_column_letter(answer_column)}{row}'
            formulas.append((f'=IFERROR(INDEX({values},MATCH(1,INDEX(({labels}={caption})*1,0),0)),"-")',))
        if formulas:
            target = excel_range(report, body_row, offset, body_row + len(answers) - 1, offset)
            target.Formula = tuple(formulas)
            target.NumberFormat = '#,##0' if metric == 'count' else percent_format(decimals)
            target.Font.Bold = True; target.Interior.Color = 0xEBDFD2
        if show_row:
            cell = excel_cell(report, footer_row, offset)
            cell.Formula = '=' + (denominator if metric == 'count' else f'IF({denominator}=0,"-",1)')
            cell.NumberFormat = '#,##0' if metric == 'count' else percent_format(decimals)
    return right + len(metrics)
