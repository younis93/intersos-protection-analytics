"""Live trend aggregates connected to the same response cache and slicers."""
from .file_security import safe_spreadsheet_value
from .kobo_excel_direct import field_name
from .kobo_excel_layout import excel_literal
from .kobo_excel_ranges import excel_cell, excel_range
from .kobo_excel_slicers import pivot_reference
from .kobo_excel_percentages import percent_format


def trend_chart(book, report, cache, result, position, footer, left, top, metrics, block_pivots, support_sheet):
    trend = result['trend']
    sheet = support_sheet(book, '_Kobo trend pivots')
    aggregates = []
    for denominator in (False, True):
        row = sheet.UsedRange.Row + sheet.UsedRange.Rows.Count + 5
        pivot = cache.CreatePivotTable(excel_cell(sheet, row, 1), f'KoboTrend{position:03d}' + ('Base' if denominator else 'Count'))
        pivot.ManualUpdate = True
        sparse = result['_source'].get('sparse')
        if not result['_source'].get('direct'):
            field = pivot.PivotFields('QuestionId'); field.Orientation = 3; field.CurrentPage = result['id']
        field = pivot.PivotFields(field_name(result, 'IncludeInPivot')); field.Orientation = 3
        field.CurrentPage = 'Denominator' if denominator and sparse else 'Included'
        period = pivot.PivotFields(field_name(result, 'TrendPeriod')); period.Orientation = 1; period.Subtotals = (False,)*12
        binary = result['_source'].get('binary')
        if not denominator and not binary:
            answer = pivot.PivotFields(field_name(result, 'Answer')); answer.Orientation = 2; answer.Subtotals = (False,)*12
        if not denominator and binary:
            for option in result['_source']['options']:
                pivot.AddDataField(pivot.PivotFields(option['field']), option.get('metric', option['caption']), -4157)
        else: pivot.AddDataField(pivot.PivotFields(field_name(result, 'Answered' if denominator else 'Selected')), 'Dated responses' if denominator else 'Trend count', -4157)
        pivot.RowGrand = False; pivot.ColumnGrand = False; pivot.ManualUpdate = False
        aggregates.append(pivot)
        block_pivots.append(pivot)
    start = footer.Row + 4
    excel_cell(report, start, 1).Value = 'Answers over time'
    excel_cell(report, start, 1).Font.Bold = True
    excel_cell(report, start + 1, 1).Value = f'Missing or invalid dates excluded: {trend["excluded"]}. Values follow the response slicers.'
    header = start + 3
    headers = ['Period', 'Answered respondents']
    for series in trend['series']:
        headers.extend([series['label'] + ' #', series['label'] + ' %'])
    excel_range(report, header, 1, header, len(headers)).Value = (tuple(safe_spreadsheet_value(value) for value in headers),)
    excel_range(report, header, 1, header, len(headers)).Font.Bold = True
    excel_range(report, header, 1, header, len(headers)).WrapText = True
    count_ref, base_ref = map(pivot_reference, aggregates)
    period_field = excel_literal(field_name(result, 'TrendPeriod'))
    answer_field = excel_literal(field_name(result, 'Answer'))
    binary = result['_source'].get('binary')
    formulas = []
    for index, period in enumerate(trend['periods']):
        row = header + 1 + index
        base = f'IFERROR(N(GETPIVOTDATA("Dated responses",{base_ref},{period_field},{excel_literal(period)})),0)'
        values = [excel_literal(period), '=' + base]
        for series in trend['series']:
            caption = series['label']
            if sum(other['label'] == caption for other in result['rows']) > 1: caption += f' [{series["id"]}]'
            if binary:
                option = next(option for option in result['_source']['options'] if option['id'] == series['id'])
                count = f'IFERROR(N(GETPIVOTDATA({excel_literal(option.get("metric", option["caption"]))},{count_ref},{period_field},{excel_literal(period)})),0)'
            else: count = f'IFERROR(N(GETPIVOTDATA("Trend count",{count_ref},{period_field},{excel_literal(period)},{answer_field},{excel_literal(caption)})),0)'
            values.extend(['=' + count, f'=IF({base}=0,NA(),{count}/{base})'])
        formulas.append(tuple('='+value if column == 0 else value for column, value in enumerate(values)))
    if formulas:
        excel_range(report, header + 1, 1, header + len(formulas), len(headers)).Formula = tuple(formulas)
        for index in range(len(trend['series'])):
            excel_range(report, header + 1, 4 + index*2, header + len(formulas), 4 + index*2).NumberFormat = percent_format(result.get('percentageDecimals', 0))
    footer = excel_range(report, header + max(1, len(formulas)), 1, header + max(1, len(formulas)), len(headers))
    if not formulas:
        excel_cell(report, header + 1, 1).Value = 'No valid dates under the current filters.'
        return None, footer
    chart_object = report.ChartObjects().Add(left, top, 650, result.get('appearance', {}).get('height', 0)*.75 or 360)
    chart_object.Name = f'Chart_Trend{position:03d}'
    chart = chart_object.Chart; chart.ChartType = 4
    chart.HasTitle = True; chart.ChartTitle.Text = result['label'][:255]
    chart.HasLegend = result.get('appearance', {}).get('legend') != 'hidden'
    for index, series in enumerate(trend['series']):
        for metric in metrics:
            native = chart.SeriesCollection().NewSeries()
            native.Name = safe_spreadsheet_value(series['label'] + (' %' if metric == 'percent' else ' #'))
            native.XValues = excel_range(report, header + 1, 1, header + len(formulas), 1)
            column = 3 + index*2 + (metric == 'percent')
            native.Values = excel_range(report, header + 1, column, header + len(formulas), column)
    if metrics == ['percent']: chart.Axes(2).TickLabels.NumberFormat = percent_format(result.get('percentageDecimals', 0))
    for axis in (1, 2):
        chart.Axes(axis).HasMajorGridlines = False; chart.Axes(axis).HasMinorGridlines = False
    chart_object.Placement = 3
    return chart_object, footer


def native_heatmap(report, result, area, footer):
    """A formula matrix of pivot values keeps color rules stable on Refresh All."""
    columns = result.get('_excelBreakdowns', result['breakdowns'])
    answers = [answer for answer in result['rows'] if answer['id'] != '__blank__']
    first = area.Column + area.Columns.Count + 2
    top = area.Row
    metric = result.get('appearance', {}).get('metric', 'count')
    excel_cell(report, top, first).Value = 'Heatmap - ' + ('%' if metric == 'percent' else '#')
    excel_cell(report, top, first).Font.Bold = True
    excel_cell(report, top + 1, first).Value = 'Values follow the pivot and response slicers. Double-click counts in the pivot to view responses.'
    heading = top + 3
    headers = ['Answer', *(column['label'] for column in columns)]
    excel_range(report, heading, first, heading, first + len(columns)).Value = (tuple(safe_spreadsheet_value(h) for h in headers),)
    excel_range(report, heading, first, heading, first + len(columns)).Font.Bold = True
    formulas = []
    for answer in answers:
        values = ['=' + excel_literal(answer['label'])]
        for column in columns:
            cell = result['_displayCells'][(answer['id'], column['id'])][metric]
            values.append('=' + cell)
        formulas.append(tuple(values))
    ranges = []
    if formulas and columns:
        matrix = excel_range(report, heading + 1, first, heading + len(formulas), first + len(columns))
        matrix.Formula = tuple(formulas); matrix.WrapText = True
        numeric = excel_range(report, heading + 1, first + 1, heading + len(formulas), first + len(columns))
        numeric.NumberFormat = percent_format(result.get('percentageDecimals', 0)) if metric == 'percent' else '#,##0'
        ranges = [(str(report.Name), str(numeric.Address))]
    bottom = max(footer.Row, heading + len(formulas) + 1)
    return excel_range(report, area.Row, area.Column, bottom, first + len(columns)), excel_cell(report, bottom, 1), ranges


def write_heatmap_formats(path, ranges):
    """Add ordinary range color scales without Excel's unstable PivotArea scopes.

    Edit only sheet XML, preserving the workbook's slicers, queries and caches.
    """
    import re
    import posixpath
    from pathlib import Path
    from zipfile import ZipFile, ZIP_DEFLATED
    from xml.etree import ElementTree as ET
    from xml.sax.saxutils import quoteattr
    path = Path(path)
    temporary = path.with_suffix('.heatmap.tmp')
    namespace = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    relationship = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
    try:
        with ZipFile(path) as source:
            workbook = ET.fromstring(source.read('xl/workbook.xml'))
            links = {r.attrib['Id']: posixpath.normpath('xl/' + r.attrib['Target']) if not r.attrib['Target'].startswith('/') else r.attrib['Target'].lstrip('/')
                     for r in ET.fromstring(source.read('xl/_rels/workbook.xml.rels'))}
            sheets = {s.attrib['name']: links[s.attrib[relationship]] for s in workbook.find(namespace+'sheets')}
            changes = {}
            for name, address in ranges:
                member = sheets[name]
                content = changes.get(member, source.read(member).decode('utf-8'))
                priority = max([int(n) for n in re.findall(r'<cfRule[^>]*priority="(\d+)"', content)] or [0]) + 1
                rule = '<conditionalFormatting sqref=' + quoteattr(address.replace('$', '')) + f'><cfRule type="colorScale" priority="{priority}"><colorScale><cfvo type="min"/><cfvo type="max"/><color rgb="FFEDF5FC"/><color rgb="FF1683D8"/></colorScale></cfRule></conditionalFormatting>'
                after = content.index('</sheetData>') + len('</sheetData>')
                following = re.search(r'<(?:conditionalFormatting|dataValidations|hyperlinks|printOptions|pageMargins|pageSetup|headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)(?:\s|>)', content[after:])
                index = after + following.start() if following else content.index('</worksheet>')
                changes[member] = content[:index] + rule + content[index:]
            with ZipFile(temporary, 'w', ZIP_DEFLATED) as destination:
                for info in source.infolist(): destination.writestr(info, changes.get(info.filename, source.read(info.filename)))
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
