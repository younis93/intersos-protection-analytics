"""Native Excel export jobs with live pivot-backed report tables and charts."""
from __future__ import annotations

import atexit
import json
import math
import multiprocessing
import os
import queue
import threading
import time
import uuid
from pathlib import Path
from collections import Counter, defaultdict

from .kobo_excel_percentages import percent_format
from .export_temp import new_export_folder, remove_export_folder
from .kobo_excel_native import native_report
from .kobo_excel_source import create_response_source, validate_export_fields, multi_row_count, response_layout, query_config
from .kobo_excel_prepare import prepare_workbook
from .kobo_excel_runtime import ExportProgress, timeout_message, create_process_job, assign_to_job, create_excel
from .kobo_excel_direct import field_name, page_fields, add_metric
from .file_security import safe_spreadsheet_value
from .kobo_excel_ranges import excel_cell, excel_range
from .kobo_excel_layout import CHART_GAP, BLOCK_GAP, unique_sheet_name, group_sections, answered_formula, excel_literal, count_criterion
from .kobo import KoboSettings, analyze, breakdown_fields, breakdown_values, filtered_records, label, missing
from .kobo_excel_slicers import slicer_fields, slicer_specs, totals_pivot, pivot_value, pivot_reference, add_sheet_slicers, initial_filter_summary


PALETTE = ['#1877c9', '#2f9e68', '#d97706', '#7c5cc4', '#d9485f', '#168a91', '#9a6b35', '#536d88', '#b85c9e', '#6d8f38', '#e06b3c', '#3f73a8']
EXPORT_TIMEOUT_SECONDS = 3600


def answer_label(result, answer):
    duplicate = sum(r['label'] == answer['label'] for r in result['rows']) > 1
    return f"{answer['label']} [{answer['id']}]" if duplicate else answer['label']


def answer_color(result, key):
    if key in result['colors']: return result['colors'][key]
    if not result['breakdowns'] and result['chart'] in {'bar', 'column', 'line'}: return '#1683d8'
    hash_value = 0
    for c in key: hash_value = (hash_value * 31 + ord(c)) & 0xFFFFFFFF
    return PALETTE[hash_value % len(PALETTE)]


def breakdown_captions(dimensions, values, language):
    captions = []
    for field, value in zip(dimensions, values):
        labels = {choice['name']: label(choice, language) for choice in field['choices']}
        caption = 'Missing breakdown' if value == '__blank__' else labels.get(value, value)
        if value != '__blank__' and sum(other == caption for other in labels.values()) > 1:
            caption = f'{caption} [{value}]'
        captions.append(caption)
    return captions


def native_breakdown_columns(project, result, settings):
    if '_excelBreakdowns' in result: return result['_excelBreakdowns']
    questions = {question['id']: question for question in project['form']['questions']}
    cfg = settings.questions.get(result['id'])
    dimensions = breakdown_fields(cfg, questions, questions[result['id']]) if cfg else []
    columns = result['breakdowns']
    if result.get('_source', {}).get('binary') and dimensions:
        lookup = {record['id']: record for record in project['records']}
        cohorts = defaultdict(list)
        for record in project['records']:
            if record['scope'] == questions[result['id']]['repeat']:
                cohorts[breakdown_values(record, dimensions, lookup)].append(record)
        columns = [{'id': values[0] if len(values) == 1 else json.dumps(values, ensure_ascii=False), 'values': list(values),
                    'label': ' / '.join(breakdown_captions(dimensions, values, settings.language)),
                    'denominator': sum(not missing(r['values'].get(result['id'])) for r in members)} for values, members in sorted(cohorts.items())]
    return [{**column, 'labels': breakdown_captions(dimensions, column.get('values', [column['id']]), settings.language)} for column in columns]


def source_context(project, settings):
    records = defaultdict(list)
    for record in filtered_records(project, settings): records[record['scope']].append(record)
    return {'questions': {q['id']: q for q in project['form']['questions']}, 'records': records,
            'lookup': {r['id']: r for r in project['records']}}


def iter_source_rows(project, result, settings, context=None):
    """One row per cohort respondent/answer, including unselected options.

    SUM(Selected)/SUM(Answered) is correct for every answer and breakdown.
    Blank rows use zero Answered, so their percentage is intentionally absent.
    """
    context = context or source_context(project, settings)
    q = context['questions'][result['id']]
    records = context['records'][q['repeat']]
    cfg = settings.questions.get(q['id'])
    dimensions = breakdown_fields(cfg, context['questions'], q) if cfg else []
    lookup = context['lookup']
    answers = [r for r in result['rows'] if r['id'] != '__blank__']
    counts = Counter(row['label'] for row in result['rows'])
    captions_by_answer = {row['id']: f"{row['label']} [{row['id']}]" if counts[row['label']] > 1 else row['label'] for row in result['rows']}
    blank = next((row for row in result['rows'] if row['id'] == '__blank__'), None)
    dimension_labels = []
    for field in dimensions:
        captions = {choice['name']: label(choice, settings.language) for choice in field['choices']}
        duplicates = Counter(captions.values())
        dimension_labels.append({code: f'{caption} [{code}]' if duplicates[caption] > 1 else caption for code, caption in captions.items()})
    for record in records:
        value = record['values'].get(q['id'])
        parts = breakdown_values(record, dimensions, lookup)
        captions = ['Missing breakdown' if part == '__blank__' else labels.get(part, part) for labels, part in zip(dimension_labels, parts)]
        breakdown = captions[0] if captions else 'Missing breakdown'
        extra = captions[1:]
        answered = not missing(value)
        if not answered: selected = set()
        elif q['kind'] == 'multiple': selected = set(value)
        elif result['bins']:
            selected = {b['id'] for index, b in enumerate(result['bins']) if b['min'] <= value and (value <= b['max'] if index == len(result['bins'])-1 else value < b['max'])}
        elif q['kind'] == 'date': selected = {answer['id'] for answer in answers if str(value).startswith(answer['id'])}
        else: selected = {str(value)}
        for answer in answers:
            yield [record['id'], captions_by_answer[answer['id']], int(answer['id'] in selected), int(answered), breakdown, answer['id'], *extra]
        if blank:
            yield [record['id'], captions_by_answer['__blank__'], int(not answered), 0, breakdown, '__blank__', *extra]
def source_rows(project, result, settings):
    return list(iter_source_rows(project, result, settings))


def _rgb(color):
    return int(color[1:3], 16) + (int(color[3:5], 16) << 8) + (int(color[5:7], 16) << 16)


def _label_ink(rgb):
    def luminance(channels):
        linear = [value/12.92 if value <= .04045 else ((value+.055)/1.055)**2.4 for value in channels]
        return sum(value*weight for value, weight in zip(linear, (.2126, .7152, .0722)))
    fill = luminance([(rgb >> shift & 255)/255 for shift in (0, 8, 16)])
    dark = luminance([8/255, 24/255, 39/255])
    return '#081827' if (fill+.05)/(dark+.05) >= 1.05/(fill+.05) else '#ffffff'


def _label_fits(text, magnitude, maximum, extent, thickness, font, horizontal):
    length = magnitude/maximum*extent if maximum else 0
    return (length >= len(text)*font*.64+12 and thickness >= font*1.3) if horizontal else (length >= font*1.7 and thickness >= len(text)*font*.64+8)


def _footer(report, pivot, result, dimensions, language='en', totals=None):
    """Answered totals are independent of the number of multi-select options."""
    body = pivot.DataBodyRange
    row = pivot.TableRange2.Row + pivot.TableRange2.Rows.Count + 1
    excel_cell(report, row, 1).Value = 'الإجمالي' if language == 'ar' else 'Total'
    base_answer = next((answer['id'] for answer in result['rows'] if answer['id'] != '__blank__'), '__blank__')
    for index in range(1, body.Columns.Count + 1):
        cell = body.Cells(1, index)
        items = cell.PivotCell.ColumnItems
        values = {}
        for item_index in range(1, items.Count + 1):
            item = items.Item(item_index)
            values[str(item.Parent.SourceName)] = str(item.Name)
        parts = [values[field_name(result, f'Breakdown{level + 1}')] for level in range(dimensions)]
        formula = '=' + pivot_value(totals, 'Answered total', base_answer, parts, result) if totals is not None else answered_formula(result['id'], base_answer, parts)
        target = excel_cell(report, row, body.Column + index - 1)
        percentage = '%' in str(cell.PivotCell.DataField.Name)
        target.Formula = '=IF(' + formula[1:] + '=0,"",1)' if percentage else formula
        target.NumberFormat = percent_format(result.get('percentageDecimals', 0)) if percentage else '#,##0'
    footer = excel_range(report, row, 1, row, body.Column + body.Columns.Count - 1)
    footer.Interior.Color = _rgb('#e8f2fb'); footer.Font.Bold = True
    footer.RowHeight = 24
    return footer


def _style_pivot(pivot, report, result, totals=None):
    pivot.TableStyle2 = 'PivotStyleLight16'
    pivot.ShowTableStyleRowHeaders = True; pivot.ShowTableStyleColumnHeaders = True
    area = pivot.TableRange2
    area.Font.Name = 'Arial'; area.Font.Size = 10
    area.Rows.RowHeight = 22
    pivot.RowRange.WrapText = True
    pivot.RowRange.HorizontalAlignment = -4131
    pivot.RowRange.Rows.AutoFit()
    # Fixed source-role filters are implementation details. Slicers remain the
    # visible controls; keep the filtered source rows available for Show Details.
    pivot.PageRange.EntireRow.Hidden = True
    pivot.DisplayFieldCaptions = False
    # Percentage columns must keep missing denominators undefined, including after refresh.
    body = pivot.DataBodyRange
    for index in range(1, body.Columns.Count + 1):
        first = body.Cells(1, index)
        try: percentage = '%' in str(first.PivotCell.DataField.Name)
        except Exception:
            # Excel exposes no DataField for a sparse, empty PivotCell.
            continue
        if not percentage: continue
        target = report.Range(first, body.Cells(body.Rows.Count, index))
        # A blank answer has no denominator; numeric zero on an answered option is valid.
        blank_label = answer_label(result, next((row for row in result['rows'] if row['id'] == '__blank__'), {'id': '__blank__', 'label': 'Blank / unanswered'}))
        values = {}
        column_items = first.PivotCell.ColumnItems
        for item_index in range(1, column_items.Count+1):
            item = column_items.Item(item_index); values[str(item.Parent.SourceName)] = str(item.Name)
        parts = [values[field_name(result, f'Breakdown{level+1}')] for level in range(len(result.get('breakdownFields', [])))]
        answer_code = next((row['id'] for row in result['rows'] if row['id'] != '__blank__'), '__blank__')
        denominator = pivot_value(totals, 'Answered total', answer_code, parts, result) if totals is not None else answered_formula(result['id'], answer_code, parts, indirect=True)[1:]
        formula = f'=OR($A{body.Row}={excel_literal(blank_label)},{denominator}=0)'
        # Excel's COM dispatch can reject an omitted Operator even for
        # xlExpression (2), where Excel ignores the operator's value.
        condition = target.FormatConditions.Add(2, 0, formula)
        condition.NumberFormat = '"-"'
    return area


def _support_sheet(book, name):
    try: return book.Worksheets(name)
    except Exception:
        sheet = book.Worksheets.Add(After=book.Worksheets(book.Worksheets.Count))
        sheet.Name = name; sheet.Visible = 2
        return sheet


def _fixed_pivot_items(pivot, result, project, settings):
    """Keep the exported question's full layout stable when a slicer hides its data."""
    # Every answer option has a source row, including zero selections. Showing items
    # with no source data would also show answers from every other question in this cache.
    # Keep the native question filter instead of hiding thousands of foreign items.
    fields = []
    columns = native_breakdown_columns(project, result, settings)
    for level in range(len(result.get('breakdownFields', []))):
        fields.append((field_name(result, f'Breakdown{level+1}'), [column['labels'][level] for column in columns]))
    if result.get('_source', {}).get('sparse'):
        fields.insert(0, ('Answer', [answer_label(result, answer) for answer in result['rows']]))
    if not fields: return
    pivot.ManualUpdate = True
    try:
        for name, captions in fields:
            field = pivot.PivotFields(name); allowed = set(captions)
            field.ShowAllItems = True
            items = [(item, str(item.Name)) for item in (field.PivotItems(index) for index in range(1, field.PivotItems().Count+1))]
            for item, caption in items:
                if caption in allowed: item.Visible = True
            for item, caption in items:
                if caption not in allowed: item.Visible = False
    finally: pivot.ManualUpdate = False


def _percentage_field(pivot):
    """Resolve the calculated field on this pivot, never by a workbook cache index.

    A cache number remembered from another pivot does not prove this field is
    available on the current pivot. Use the returned calculated PivotField
    directly instead of looking it up again through deferred PivotFields.
    """
    fields = pivot.CalculatedFields()
    try: return fields.Item('ResponsePercent')
    except Exception:
        return fields.Add('ResponsePercent', '=IF(Answered=0,0,Selected/Answered)', True)


def _metric_pivot(book, cache, visible, result, position):
    metric = result.get('appearance', {}).get('metric', 'auto')
    if metric == 'auto': return visible, None
    sheet = _support_sheet(book, '_Kobo chart pivots')
    row = sheet.UsedRange.Row + sheet.UsedRange.Rows.Count + 5
    pivot = cache.CreatePivotTable(excel_cell(sheet, row, 1), f'KoboChartPivot{position:03d}')
    pivot.ManualUpdate = True
    page_fields(pivot, result)
    names = [('Answer', 1, 1)] + [(f'Breakdown{level+1}', 2, level+1) for level in range(len(result.get('breakdownFields', [])))]
    for name, orientation, position in names:
        field = pivot.PivotFields(field_name(result, name)); field.Orientation = orientation; field.Position = position; field.Subtotals = (False,)*12
    add_metric(pivot, result, metric, _percentage_field)
    pivot.RowGrand = False; pivot.ColumnGrand = False; pivot.RowAxisLayout(1)
    # Shared caches contain every question's answer items. Only order this
    # question's items, and defer rebuilding the pivot until ordering is complete.
    ordered = [('Answer', [answer_label(result, answer) for answer in result['rows']])]
    ordered.extend((f'Breakdown{level+1}', list(dict.fromkeys(column['labels'][level] for column in result.get('_excelBreakdowns', result['breakdowns']))))
                   for level in range(len(result.get('breakdownFields', []))))
    for name, captions in ordered:
        original = visible.PivotFields(field_name(result, name)); field = pivot.PivotFields(field_name(result, name))
        for caption in captions:
            try: field.PivotItems(caption).Position = original.PivotItems(caption).Position
            except Exception: pass
    pivot.ManualUpdate = False
    return pivot, [metric]


def _chart_labels(report, chart, result, metrics, project, settings, totals=None, final_styles=None):
    mode = result.get('appearance', {}).get('labels', 'auto')
    series_count = chart.SeriesCollection().Count
    if mode == 'hidden':
        for index in range(1, series_count+1): chart.SeriesCollection(index).HasDataLabels = False
        return
    sheet = _support_sheet(report.Parent, '_Kobo chart labels')
    sheet_name = sheet.Name.replace("'", "''")
    start = sheet.UsedRange.Row + sheet.UsedRange.Rows.Count + 3
    columns = native_breakdown_columns(project, result, settings)
    reference = pivot_reference(totals) if totals is not None else None
    font = result.get('appearance', {}).get('fontSize') or 11
    kind = result.get('_excelChartKind', result['chart']); horizontal = kind == 'bar'
    stacked = result.get('appearance', {}).get('bars') == 'stack' and bool(result['breakdowns'])
    try: width, height = float(chart.PlotArea.InsideWidth), float(chart.PlotArea.InsideHeight)
    except Exception: width, height = 500, 300
    thickness = (height if horizontal else width)/max(1, len(result['rows']))/(1 if stacked else series_count)*.8
    prepared = []
    for index in range(1, series_count+1):
        series = chart.SeriesCollection(index); series.ApplyDataLabels()
        series.DataLabels().Font.Size = font; series.DataLabels().Font.Bold = True
        points = min(series.Points().Count, len(result['rows']))
        effective_mode = (metrics[(index-1) % len(metrics)] if metrics else 'count') if mode == 'auto' else mode
        column = columns[min((index-1)//len(metrics), len(columns)-1)] if columns else None
        formulas = []
        chart_answers = [answer for answer in result['rows'] if answer['id'] != '__blank__'] if result.get('_displayCells') else result['rows']
        for answer in chart_answers[:points]:
            criteria = ['KoboData[QuestionId]', count_criterion(result['id']), 'KoboData[AnswerCode]', count_criterion(answer['id']), 'KoboData[IncludeInPivot]', excel_literal('Included')]
            if column:
                for level, caption in enumerate(column['labels'], 1): criteria.extend([f'KoboData[Breakdown{level}]', count_criterion(caption)])
            def summed(field): return 'SUMIFS(KoboData['+field+'],'+','.join(criteria)+')'
            count, denominator = (pivot_value(reference, 'Responses', answer['id'], column['labels'] if column else (), result), pivot_value(reference, 'Answered total', answer['id'], column['labels'] if column else (), result)) if reference else (summed('Selected'), summed('Answered'))
            count_text = f'TEXT({count},"#,##0")'
            display = result.get('_displayCells', {}).get((answer['id'], column['id'] if column else ''))
            if display:
                count = display['count']; count_text = f'TEXT({count},"#,##0")'
                percent_text = f'IF(ISNUMBER({display["percent"]}),TEXT({display["percent"]},"{percent_format(result.get("percentageDecimals", 0))}"),"-")'
            else:
                percent_text = f'IF({denominator}=0,"-",TEXT({count}/{denominator},"{percent_format(result.get("percentageDecimals", 0))}"))'
            text = count_text if effective_mode == 'count' else percent_text if effective_mode == 'percent' else count_text+'&" ("&'+percent_text+'&")"'
            formulas.append('=' + (f'IF({count}=0,"",{text})' if reference and mode == 'auto' else text))
        prepared.append((series, points, effective_mode, column, formulas))
    maximum_points = max((entry[1] for entry in prepared), default=0)
    if not maximum_points: return
    matrix = tuple(tuple(entry[4][row] if row < entry[1] else '' for entry in prepared) for row in range(maximum_points))
    label_range = excel_range(sheet, start + 1, 1, start + maximum_points, series_count)
    label_range.Formula = matrix
    label_range.Calculate()
    from openpyxl.utils import get_column_letter
    for index, (series, points, effective_mode, column, _) in enumerate(prepared, 1):
        try: values = [abs(float(value or 0)) for value in series.Values]
        except (TypeError, ValueError): values = []
        data_metric = metrics[(index-1) % len(metrics)] if metrics else 'count'
        entries = [next((entry for entry in answer.get('series', []) if column and entry['id'] == column['id']), answer) for answer in chart_answers[:points]]
        values = [abs(float(entry.get('percent' if data_metric == 'percent' else 'count', values[i] if i < len(values) else 0) or 0)) for i, entry in enumerate(entries)]
        maximum = max(values, default=0)
        if kind in {'bar', 'column'}:
            try: maximum = max(maximum, float(chart.Axes(2, series.AxisGroup).MaximumScale))
            except Exception: pass
        for point_index in range(1, points+1):
            answer = ([a for a in result['rows'] if a['id'] != '__blank__'] if result.get('_displayCells') else result['rows'])[point_index-1]
            formula = f"='{sheet_name}'!${get_column_letter(index)}${start+point_index}"
            magnitude = values[point_index-1] if point_index <= len(values) else 0
            entry = entries[point_index-1]
            count_value = entry.get('count', magnitude)
            percent_value = entry.get('displayPercent', entry.get('percent'))
            count_text = f'{count_value:,.0f}'
            percent_text = f'{percent_value:.{result.get("percentageDecimals", 0)}f}%' if isinstance(percent_value, (int, float)) else '-'
            text = count_text if effective_mode == 'count' else percent_text if effective_mode == 'percent' else count_text+' ('+percent_text+')'
            small = not _label_fits(text, magnitude, maximum, width if horizontal else height, thickness, font, horizontal)
            visible = not (mode == 'auto' and magnitude <= 0 or kind in {'bar', 'column'} and stacked and small)
            position = (3 if stacked or not small else 2) if kind in {'bar', 'column'} else 0 if kind == 'line' else 2
            fill = answer_color(result, column['id'] if column else answer['id']) if kind in {'bar', 'column'} and position == 3 else None
            color = _label_ink(_rgb(fill)) if fill else '#263746'
            # Connecting slicers can recreate PivotChart series. Retain the chart
            # and indices instead of COM series objects that Excel invalidates.
            style = (chart, index, point_index, visible, font, position, color, formula)
            if final_styles is not None: final_styles.append(style)
            else: _apply_label_style(style)


def _apply_label_style(style, series_cache=None):
    chart, series_index, index, visible, font, position, color, formula = style
    key = (id(chart), series_index)
    series = series_cache.get(key) if series_cache is not None else None
    if series is None:
        collection = chart.SeriesCollection()
        if series_index > collection.Count: return
        series = collection(series_index)
        if series_cache is not None: series_cache[key] = series
    if index > series.Points().Count: return
    if index == 1:
        # Series defaults survive slicer refreshes when Excel recreates points.
        series_font = series.DataLabels().Font
        series_font.Size = font; series_font.Bold = True; series_font.Color = _rgb(color)
    point = series.Points(index)
    if not visible:
        point.HasDataLabel = False; return
    try:
        point.HasDataLabel = True
        label = point.DataLabel; label.Formula = formula
        label.Font.Color = _rgb(color)
        label.Position = position
    except Exception:
        # Preserve formula links when an Excel version cannot apply a positioning option.
        pass


def _chart(report, pivot, result, left, top, metrics, project, settings, totals=None, final_styles=None):
    appearance = result.get('appearance', {})
    chart_object = report.ChartObjects().Add(left, top, 650, appearance.get('height', 0)*.75 or 360)
    # Add() and the Left property use different origins on RTL worksheets.
    chart_object.Left = left; chart_object.Top = top
    chart_object.Name = f'Chart_{pivot.Name}'
    chart = chart_object.Chart
    display_cells = result.get('_displayCells')
    if display_cells:
        # Ordinary native charts retain linked labels when slicers rebuild pivots.
        # Their values still recalculate from the connected native pivot totals.
        answers = [answer for answer in result['rows'] if answer['id'] != '__blank__']
        columns = native_breakdown_columns(project, result, settings) or [{'id': '', 'label': ''}]
        for column in columns:
            for metric in metrics:
                series = chart.SeriesCollection().NewSeries()
                series.Name = (column['label'] + ' ' if column['label'] else '') + ('%' if metric == 'percent' else '#')
                series.XValues = tuple(answer_label(result, answer) for answer in answers)
                first = display_cells[(answers[0]['id'], column['id'])][metric]
                last = display_cells[(answers[-1]['id'], column['id'])][metric]
                series.Values = '=' + first + ':' + last.split('!', 1)[1]
        chart.PlotVisibleOnly = False
    else:
        chart.SetSourceData(pivot.TableRange1)
        if chart.PivotLayout is None: raise ValueError('Excel did not create a connected native PivotChart.')
    kind = result['chart']
    if result['breakdowns'] and kind in {'pie', 'donut'}: kind = 'bar'
    if kind == 'column':
        rows = [answer for answer in result['rows'] if answer['id'] != '__blank__']
        series_count = max(1, chart.SeriesCollection().Count)
        decimals = result.get('percentageDecimals', 0)
        font = appearance.get('fontSize') or 11
        labels = appearance.get('labels', 'auto')
        entries = [entry for answer in rows for entry in (answer.get('series', []) if result['breakdowns'] else [answer])]
        def width(entry):
            count = f"{entry.get('count', 0):,.0f}"
            value = entry.get('displayPercent', entry.get('percent'))
            percent = f'{value:.{decimals}f}%' if value is not None else '-'
            return len(count if labels in {'count', 'auto', 'hidden'} else percent if labels == 'percent' else count + ' (' + percent + ')')
        if len(rows) > 8 or 530 / max(1, len(rows) * series_count) * .8 < max((width(entry) for entry in entries), default=1) * font * .64 + 10:
            kind = 'bar'
    result['_excelChartKind'] = kind
    if kind == 'bar':
        chart_object.Height = max(chart_object.Height, len(result['rows']) * max(1, chart.SeriesCollection().Count) * 24 + 80)
    stacked = appearance.get('bars') == 'stack' and bool(result['breakdowns'])
    chart.ChartType = {'histogram': 52 if stacked else 51, 'bar': 58 if stacked else 57, 'column': 52 if stacked else 51, 'pie': 5, 'donut': -4120, 'line': 4}.get(kind, 57)
    if kind == 'histogram': chart.ChartGroups(1).GapWidth = 0
    chart.HasTitle = True; chart.ChartTitle.Text = result['label'][:255]
    chart.ChartTitle.Font.Name = 'Arial'; chart.ChartTitle.Font.Size = 12
    legend = appearance.get('legend', 'auto')
    chart.HasLegend = (bool(result['breakdowns']) or kind in {'pie', 'donut'}) if legend == 'auto' else legend != 'hidden'
    if chart.HasLegend and legend != 'auto': chart.Legend.Position = {'top': -4160, 'bottom': -4107, 'left': -4131, 'right': -4152}[legend]
    if appearance.get('fontSize'): chart.ChartArea.Font.Size = appearance['fontSize']
    if kind not in {'pie', 'donut'}:
        for axis_type in (1, 2):
            for group in (1, 2):
                try:
                    axis = chart.Axes(axis_type, group); axis.HasMajorGridlines = False; axis.HasMinorGridlines = False
                except Exception: pass
    try: chart.ShowAllFieldButtons = False
    except Exception: pass
    if kind not in {'pie', 'donut'}:
        for index in range(1, chart.SeriesCollection().Count + 1):
            series = chart.SeriesCollection(index)
            if '%' in str(series.Name) and len(metrics) > 1: series.AxisGroup = 2
        try:
            primary = chart.Axes(2, 1); primary.HasTitle = True; primary.AxisTitle.Text = '%' if metrics == ['percent'] else '#'
            if metrics == ['percent']: primary.TickLabels.NumberFormat = percent_format(result.get('percentageDecimals', 0))
            else: primary.MajorUnit = max(1, math.ceil(primary.MaximumScale / 6))
            if len(metrics) > 1:
                secondary = chart.Axes(2, 2); secondary.TickLabels.NumberFormat = percent_format(result.get('percentageDecimals', 0)); secondary.HasTitle = True; secondary.AxisTitle.Text = '%'
        except Exception: pass
    for index in range(1, chart.SeriesCollection().Count + 1):
        series = chart.SeriesCollection(index)
        if result['breakdowns']:
            key = result['breakdowns'][min((index - 1) // len(metrics), len(result['breakdowns']) - 1)]['id']
            color = _rgb(answer_color(result, key))
            series.Format.Fill.ForeColor.RGB = color; series.Format.Line.ForeColor.RGB = color
        elif kind == 'line':
            color = _rgb(answer_color(result, 'series')); series.Format.Line.ForeColor.RGB = color; series.MarkerForegroundColor = color
        else:
            for point, answer in enumerate(result['rows'], 1):
                if point <= series.Points().Count: series.Points(point).Format.Fill.ForeColor.RGB = _rgb(answer_color(result, answer['id']))
    chart_object.Placement = 3  # Do not let later row sizing move an earlier chart.
    chart.Refresh()
    _chart_labels(report, chart, result, metrics, project, settings, totals, final_styles)
    return chart_object


def excel_worker(project, snapshot, settings_dict, target, messages, question='', separate_groups=None, chart_metric='count', process_job_name=None, cancel_event=None, excel_mode='native'):
    import pythoncom
    import win32com.client
    import win32com.client.dynamic
    import win32process
    pythoncom.CoInitialize()
    excel = book = None
    table_preferences = None
    telemetry = ExportProgress(messages, Path(target).with_suffix('.progress.json'))
    messages = telemetry
    prepared_path = Path(target).with_suffix(".prepared.xlsx")
    try:
        settings = KoboSettings.model_validate(settings_dict)
        validate_export_fields(project, settings, question)
        specs = slicer_specs(project, settings)
        source_settings = settings.model_copy(update={'filters': [], 'hideZero': False, 'hideEmpty': False})
        telemetry.begin('analysis', 0, 'Calculating export results')
        snapshot = analyze(project, source_settings, question)
        if not snapshot['questions']: raise ValueError('There are no visible questions to export.')
        messages.put({'progress': 0, 'message': 'Preparing response data and question references'})
        sections = group_sections(snapshot, separate_groups)
        included = {item['result']['id'] for section in sections for item in section['questions']}
        snapshot['questions'] = [result for result in snapshot['questions'] if result['id'] in included]
        if not snapshot['questions']: raise ValueError('Select at least one group with visible questions to export.')
        scope_counts = Counter(record['scope'] for record in project['records'])
        for result in snapshot['questions']:
            if excel_mode != 'binary' and result['kind'] == 'multiple' and multi_row_count(project, result, settings.hideBlanks) > 1_048_575:
                raise ValueError(f'The multi-select reference for "{result["label"]}" exceeds the Excel row limit. Export a smaller project.')
        sections = group_sections(snapshot, separate_groups)
        telemetry.total = len(snapshot['questions'])
        telemetry.begin('preparation', 1, 'Preparing editable workbook tables')
        layouts = response_layout(project, source_settings)
        config = query_config(project, snapshot, source_settings, specs, layouts)
        config['excelMode'] = excel_mode
        preparation = prepare_workbook(prepared_path, layouts, config, source_settings, messages)
        import gc
        gc.collect()
        if cancel_event is not None and cancel_event.is_set(): return
        telemetry.begin('excel_start', 4, 'Opening prepared workbook in Excel')
        excel = create_excel()
        excel_pid = win32process.GetWindowThreadProcessId(excel.Hwnd)[1]
        if process_job_name:
            import win32job
            job_handle = win32job.OpenJobObject(win32job.JOB_OBJECT_ASSIGN_PROCESS, False, process_job_name)
            try: assign_to_job(job_handle, excel_pid)
            finally: job_handle.Close()
        messages.put({'excelPid': excel_pid})
        if cancel_event is not None and cancel_event.is_set(): return
        excel.Visible = False; excel.DisplayAlerts = False; excel.EnableEvents = False; excel.AutomationSecurity = 3
        excel.ScreenUpdating = False
        auto_correct = excel.AutoCorrect
        table_preferences = (auto_correct.AutoFillFormulasInLists, auto_correct.AutoExpandListRange)
        auto_correct.AutoFillFormulasInLists = False; auto_correct.AutoExpandListRange = False
        book = excel.Workbooks.Open(str(prepared_path), UpdateLinks=0)
        for layout in layouts:
            if not layout['rows']:
                table = book.Worksheets(layout['sheet']).ListObjects(layout['table'])
                if table.ListRows.Count: table.ListRows(1).Delete()
        # Formula values are calculated once after all pivots and slicers are connected.
        excel.Calculation = -4135; excel.CalculateBeforeSave = False
        excel.MultiThreadedCalculation.Enabled = True
        excel.MultiThreadedCalculation.ThreadMode = 0
        excel.PrintCommunication = False
        book.Styles('Normal').Font.Name = 'Arial'; book.Styles('Normal').Font.Size = 10

        def source_progress(index, total):
            messages.put({'progress': 5+round(index/max(total, 1)*15), 'message': f'Preparing multi-select reference: {index}/{total}'})
        sources, response_sheet_names = create_response_source(book, excel, project, snapshot, source_settings, specs, source_progress, prepared=(layouts, config, preparation['sources'], preparation['multi']), progress=telemetry)
        scope_counts = Counter(record['scope'] for record in project['records'])
        question_rows = {result['id']: scope_counts[result['repeat']] for result in snapshot['questions']}
        for result in snapshot['questions']:
            result['_source'] = sources[result['id']]
            result['_excelBreakdowns'] = native_breakdown_columns(project, result, source_settings)
            if result['_source'].get('binary'): result['breakdowns'] = result['_excelBreakdowns']
            result['appearance'] = {**result.get('appearance', {}), 'metric': 'percent' if chart_metric == 'percent' else 'count', 'labels': chart_metric, 'grid': 'hide'}
        used_names = response_sheet_names | {'_kobo chart pivots', '_kobo chart labels', '_kobo slicer totals', '_kobo chart values', '_kobo trend pivots'}; first_report = None; completed = 0
        final_label_styles = []; final_heatmaps = []
        caches = {}
        telemetry.begin('layout', 20, 'Preparing analysis worksheets')
        for sheet_number, section in enumerate(sections, 1):
            control_scopes = list(dict.fromkeys(item['result']['repeat'] for item in section['questions'] if excel_mode == 'binary' or item['result']['kind'] != 'multiple'))
            has_sheet_controls = bool(specs and control_scopes)
            sheet_pivots = defaultdict(list)
            report = book.Worksheets.Add(After=book.Worksheets(book.Worksheets.Count)); report.Name = unique_sheet_name(section['label'], used_names)
            if first_report is None: first_report = report
            # Keep the requested table-left/chart-right layout for every language.
            # Arabic text retains its native reading order inside these cells.
            report.DisplayRightToLeft = False
            report.Activate(); excel.ActiveWindow.DisplayGridlines = False
            report.Columns('A:A').ColumnWidth = 46; report.Columns('B:AZ').ColumnWidth = 13
            excel_cell(report, 2, 1).Value = safe_spreadsheet_value(section['label']); excel_cell(report, 2, 1).Font.Size = 16; excel_cell(report, 2, 1).Font.Bold = True
            excel_cell(report, 3, 1).Value = safe_spreadsheet_value(project['name'])
            excel_cell(report, 4, 1).Value = safe_spreadsheet_value(f'Exported submissions: {snapshot["filtered"]} / {snapshot["total"]}. ' + '; '.join(snapshot['filterSummary']))
            report.Range('A2:H4').WrapText = False
            if specs:
                excel_cell(report, 4, 1).Value = ('Slicers above filter all questions using the same response table. Repeat tables have separate controls.' if excel_mode == 'binary' else 'Multi-select questions have independent slicers. Other questions share sheet controls. Clear filters to explore all responses.')
                excel_cell(report, 5, 1).Value = safe_spreadsheet_value('Initial filters: ' + initial_filter_summary(specs, settings))
            next_row = 7
            if has_sheet_controls:
                controls_bottom = excel_cell(report, 7, 1).Top + ((len(specs)+3)//4)*156*len(control_scopes) + 24
                while excel_cell(report, next_row, 1).Top < controls_bottom: next_row += 1
            previous_nested = None
            for item in section['questions']:
                result = item['result']; position = item['position']; start = next_row; completed += 1
                telemetry.completed = completed-1
                telemetry.begin('pivots', 20+round(completed / len(snapshot['questions']) * 75), f'Building question {completed}/{len(snapshot["questions"])}')
                source = sources[result['id']]
                independent = result['kind'] == 'multiple' and not source.get('binary')
                block_pivots = [] if independent else sheet_pivots[source['scope']]
                active_cache = None
                if question_rows[result['id']]:
                    key = ('multiple', result['id']) if independent else ('response', source['scope'], sheet_number if excel_mode == 'binary' else 0)
                    if key not in caches:
                        caches[key] = book.PivotCaches().Create(1, source['table'])
                        caches[key].RefreshOnFileOpen = False
                        caches[key].MissingItemsLimit = 0
                    active_cache = caches[key]
                nested = item['nested']
                if nested and nested != previous_nested:
                    excel_cell(report, start, 1).Value = safe_spreadsheet_value(nested); excel_cell(report, start, 1).Font.Bold = True; excel_cell(report, start, 1).Font.Color = _rgb('#1683d8'); start += 2
                previous_nested = nested
                title = excel_range(report, start, 1, start, 7); title.Merge(); title.Value = safe_spreadsheet_value(result['label']); title.Font.Size = 14; title.Font.Bold = True; title.WrapText = True
                title.RowHeight = max(24, ((len(result['label']) // 90)+1)*20)
                excel_cell(report, start + 1, 1).Value = f'Answered: {result["denominator"]}. Missing: {result["missing"]}. ' + ('Repeat entries.' if result['repeat'] else 'Respondents.')
                base_answer = next((answer['id'] for answer in result['rows'] if answer['id'] != '__blank__'), '__blank__' if result['rows'] else None)
                dimensions = len(result.get('breakdownFields', []))
                excel_cell(report, start + 2, 1).Value = safe_spreadsheet_value('Breakdowns: ' + ' / '.join(field['label'] for field in result.get('breakdownFields', [])) if dimensions else result['percentageBasis'])
                messages.put({'progress': 20+round(completed / len(snapshot['questions']) * 75), 'message': f'Creating grouped analysis: {completed}/{len(snapshot["questions"])}'})
                if not question_rows[result['id']] or (not result['denominator'] and settings.hideBlanks):
                    if specs: excel_cell(report, start + 1, 1).Value = 'No recorded answers in the exported responses.'
                    excel_cell(report, start + 5, 1).Value = 'No answered responses under the current filters.'; next_row = start+13; continue
                pivot_row = start+7
                if independent and specs:
                    bottom = excel_cell(report, start + 4, 1).Top + ((len(specs)+3)//4)*156 + 24
                    while excel_cell(report, pivot_row - 2, 1).Top < bottom: pivot_row += 1
                pivot = active_cache.CreatePivotTable(excel_cell(report, pivot_row, 1), f'KoboPivot{position:03d}')
                pivot.EnableDrilldown = True; pivot.SaveData = True
                pivot.ManualUpdate = True
                pivot.HasAutoFormat = False; pivot.PreserveFormatting = True
                page_fields(pivot, result)
                if not source.get('binary'):
                    field = pivot.PivotFields(field_name(result, 'Answer')); field.Orientation = 1; field.Position = 1; field.Subtotals = (False,)*12
                for level in range(dimensions):
                    field = pivot.PivotFields(field_name(result, f'Breakdown{level+1}')); field.Orientation = 2; field.Position = level+1; field.Subtotals = (False,)*12
                mode = result.get('breakdownDisplay', 'both')
                metrics = ['count', 'percent'] if mode == 'both' else [mode]
                if source.get('binary'):
                    from .kobo_excel_binary import add_binary_metrics
                    add_binary_metrics(pivot, result)
                else:
                    for metric in (['count'] if independent else metrics): add_metric(pivot, result, metric, _percentage_field)
                pivot.DisplayErrorString = True; pivot.ErrorString = '-'; pivot.RowGrand = False; pivot.ColumnGrand = False; pivot.PreserveFormatting = True; pivot.RowAxisLayout(1)
                pivot.DisplayNullString = True; pivot.NullString = '0'
                pivot.MergeLabels = True
                for index, answer in enumerate([] if source.get('binary') else result['rows'], 1):
                    try: pivot.PivotFields(field_name(result, 'Answer')).PivotItems(answer_label(result, answer)).Position = index
                    except Exception: pass
                for level in range(dimensions):
                    captions = list(dict.fromkeys(column['labels'][level] for column in native_breakdown_columns(project, result, settings)))
                    for index, caption in enumerate(captions, 1):
                        try: pivot.PivotFields(field_name(result, f'Breakdown{level+1}')).PivotItems(caption).Position = index
                        except Exception: pass
                pivot.ManualUpdate = False
                result['_countPivot'] = pivot_reference(pivot)
                totals = totals_pivot(book, active_cache, result, position)
                if totals is not None:
                    block_pivots.extend([pivot, totals])
                    if base_answer is not None:
                        answered = pivot_value(totals, 'Answered total', base_answer, result=result)
                        cohort = pivot_value(totals, 'Cohort size', base_answer, result=result)
                        excel_cell(report, start + 1, 1).Formula = '="Answered: "&' + answered + '&". Missing: "&(' + cohort + '-' + answered + ')&". ' + ('Repeat entries.' if result['repeat'] else 'Respondents.') + '"'
                    _fixed_pivot_items(pivot, result, project, settings)
                _style_pivot(pivot, report, result, totals)
                telemetry.begin('formulas', message=f'Writing question values: {completed}/{len(snapshot["questions"])}')
                area, footer = native_report(book, report, pivot, totals, result, metrics, _support_sheet, settings.language)
                chart_pivot, chart_metrics = pivot, [result['appearance']['metric']]
                telemetry.begin('charts', message=f'Building chart: {completed}/{len(snapshot["questions"])}')
                from .kobo_excel_trends import trend_chart, native_heatmap, write_heatmap_formats
                if result['chart'] == 'heatmap':
                    area, footer, heatmap_formats = native_heatmap(report, result, area, footer)
                    final_heatmaps.extend(heatmap_formats)
                    chart = None
                    excel_cell(report, start + 3, 1).Value = 'The heatmap at right shows live pivot values.'
                elif result.get('trend'):
                    trend_metrics = ['count', 'percent'] if chart_metric == 'both' else [chart_metric]
                    chart, footer = trend_chart(book, report, active_cache, result, position, footer, area.Left+area.Width+CHART_GAP, area.Top, trend_metrics, block_pivots, _support_sheet)
                else:
                    chart = _chart(report, chart_pivot, result, area.Left+area.Width+CHART_GAP, area.Top, chart_metrics or metrics, project, settings, totals, final_label_styles) if result['denominator'] else None
                    if chart is None: excel_cell(report, start + 3, 1).Value = 'No answered responses available for a chart.'
                if source.get('binary'):
                    from .kobo_excel_binary import DRILLDOWN_NOTE
                    note = excel_range(report, start+3, 1, start+3, 10); note.Merge(); note.Value = DRILLDOWN_NOTE; note.WrapText = True; note.RowHeight = 34
                telemetry.begin('slicers', message=f'Connecting question filters: {completed}/{len(snapshot["questions"])}')
                if independent: add_sheet_slicers(book, report, block_pivots, specs, f'q{position}', top_row=start+4)
                telemetry.completed = completed
                telemetry.begin('layout')
                required = max(footer.Top+footer.Height, chart.Top+chart.Height if chart is not None else 0) + BLOCK_GAP
                next_row = max(footer.Row+5, start+int((required-title.Top)/15))
                while excel_cell(report, next_row, 1).Top < required: next_row += 1
            def connection_progress(index, total):
                messages.put({'progress': 20+round(completed / len(snapshot['questions']) * 75),
                              'message': f'Connecting response filters: {index}/{total} - {report.Name}'})
            telemetry.begin('slicers', message='Connecting sheet filters')
            for scope_index, (scope, pivots) in enumerate(sheet_pivots.items()):
                scope_label = next((label(group, settings.language) for group in project['form']['groups'] if group['id'] == scope), scope)
                scope_specs = [{**spec, 'caption': f'{scope_label} - {spec["caption"]}'} for spec in specs] if excel_mode == 'binary' and scope else specs
                add_sheet_slicers(book, report, pivots, scope_specs, f'{sheet_number}s{scope_index}', connection_progress, top_row=7+scope_index*((len(specs)+3)//4)*11)
            report.PageSetup.Orientation = 2; report.PageSetup.Zoom = False; report.PageSetup.FitToPagesWide = 1; report.PageSetup.FitToPagesTall = False
        telemetry.completed = len(snapshot['questions'])
        telemetry.begin('calculation', 96, 'Calculating final workbook values')
        # Excel creates a connection for an external cache only after its first
        # pivot is materialized. Configure those cloned connections as well.
        for connection in book.Connections:
            connection.OLEDBConnection.BackgroundQuery = False
            connection.RefreshWithRefreshAll = True
        excel.CalculateFull()
        telemetry.begin('chart_styles', 97, 'Finishing chart labels')
        series_cache = {}
        for style in final_label_styles: _apply_label_style(style, series_cache)
        if first_report is not None: first_report.Activate(); first_report.Range('A1').Select()
        telemetry.begin('saving', 98, 'Saving Excel workbook')
        auto_correct.AutoFillFormulasInLists, auto_correct.AutoExpandListRange = table_preferences
        excel.PrintCommunication = True
        excel.Calculation = -4105; excel.CalculateBeforeSave = False
        ranges = final_heatmaps
        book.SaveAs(str(target), FileFormat=51)
        if ranges:
            book.Close(False); book = None
            write_heatmap_formats(target, ranges)
        telemetry.begin('complete')
        Path(target).with_suffix('.timings.json').write_text(json.dumps({'stageSeconds': telemetry.timings, 'querySeconds': telemetry.query_timings, 'elapsedSeconds': time.monotonic()-telemetry.started}, indent=2), encoding='utf-8')
        messages.put({'done': True, 'progress': 100, 'message': 'Grouped native Excel workbook ready'})
    except Exception as exc:
        import traceback
        frame = next((frame for frame in reversed(traceback.extract_tb(exc.__traceback__)) if frame.filename == __file__), traceback.extract_tb(exc.__traceback__)[-1])
        messages.put({'error': f'{exc} (export line {frame.lineno}: {frame.line})'})
    finally:
        if book is not None:
            try: book.Close(False)
            except Exception: pass
        if excel is not None:
            if table_preferences is not None:
                try:
                    auto_correct.AutoFillFormulasInLists, auto_correct.AutoExpandListRange = table_preferences
                except Exception: pass
            try: excel.ScreenUpdating = True; excel.EnableEvents = True; excel.PrintCommunication = True
            except Exception: pass
            try: excel.Quit()
            except Exception: pass
        try: prepared_path.unlink(missing_ok=True)
        except OSError: pass  # A failed Excel shutdown must not mask the export error.
        pythoncom.CoUninitialize()


class ExportJobs:
    def __init__(self):
        self.jobs = {}; self.lock = threading.Lock(); self.serial = threading.Semaphore(1)
        atexit.register(self.close)

    def close(self):
        for item in list(self.jobs.values()): item['cancelled'].set()
        for item in list(self.jobs.values()):
            thread = item.get('thread')
            if thread and thread is not threading.current_thread(): thread.join(timeout=20)
            if not thread or not thread.is_alive(): remove_export_folder(item['folder'], item.get('owner'))

    def retire(self, job):
        with self.lock:
            item = self.jobs.get(job)
            if item and item['state'] in {'complete', 'error', 'cancelled'}:
                remove_export_folder(item['folder'], item.get('owner')); del self.jobs[job]

    def start(self, project, snapshot, settings, question='', separate_groups=None, chart_metric='count', excel_mode='native'):
        if os.name != 'nt': raise ValueError('Native Excel export requires Windows and installed Microsoft Excel.')
        try: import win32com.client  # noqa: F401
        except ImportError as exc: raise ValueError('Native Excel export requires pywin32. Install the updated application dependencies.') from exc
        slicer_fields(project, settings)
        validate_export_fields(project, settings, question)
        if excel_mode not in {'native', 'binary'}: raise ValueError('Unknown Excel export mode.')
        if chart_metric not in {'count', 'percent', 'both'}: raise ValueError('Unknown Excel chart metric.')
        job = uuid.uuid4().hex
        folder, owner = new_export_folder()
        with self.lock:
            self._expire()
            if sum(item['state'] in {'queued', 'running'} for item in self.jobs.values()) >= 4:
                remove_export_folder(folder, owner)
                raise ValueError('Four Excel exports are already queued. Wait for one to finish or cancel it.')
            self.jobs[job] = {'id': job, 'state': 'queued', 'progress': 0, 'message': 'Waiting for Excel export', 'folder': folder, 'owner': owner, 'created': time.monotonic(), 'completed': None, 'cancelled': threading.Event(), 'excelPid': None, 'stage': 'queued', 'stageSeconds': {}, 'started': None, 'lastProgress': None, 'completedQuestions': 0, 'totalQuestions': 0, 'peakMemoryBytes': 0}
        thread = threading.Thread(target=self._run, args=(job, project, snapshot, settings.model_dump(), question, list(separate_groups) if separate_groups is not None else None, chart_metric, excel_mode), daemon=True)
        self.jobs[job]['thread'] = thread; thread.start()
        return self.status(job)

    def _expire(self):
        for key, item in list(self.jobs.items()):
            if item['state'] in {'complete', 'error', 'cancelled'} and time.monotonic() - (item.get('completed') or item['created']) > 3600:
                remove_export_folder(item['folder'], item.get('owner')); del self.jobs[key]

    def _run(self, job, project, snapshot, settings, question='', separate_groups=None, chart_metric='count', excel_mode='native'):
        item = self.jobs[job]
        while not self.serial.acquire(timeout=.25):
            if item['cancelled'].is_set():
                item['state'] = 'cancelled'; item['completed'] = time.monotonic()
                remove_export_folder(item['folder'], item.get('owner'))
                timer = threading.Timer(3600, self.retire, args=(job,)); timer.daemon = True; timer.start()
                return
        process = None
        excel_handle = None
        preparation_handles = []
        process_job = None
        try:
            if item['cancelled'].is_set(): item['state'] = 'cancelled'; return
            item['state'] = 'running'
            context = multiprocessing.get_context('spawn'); messages = context.Queue()
            cancel_event = context.Event()
            process_job_name = 'Local\\IntersosKoboExport-' + job
            process_job = create_process_job(process_job_name)
            process = context.Process(target=excel_worker, args=(project, snapshot, settings, item['folder'] / 'analysis.xlsx', messages, question, separate_groups, chart_metric, process_job_name, cancel_event, excel_mode), daemon=False)
            process.start(); began = time.monotonic()
            item['processPid'] = process.pid
            # Windows job ownership also covers workers cancelled before their
            # initializer can announce a PID. It never includes unrelated apps.
            assign_to_job(process_job, process.pid)
            item['started'] = item['lastProgress'] = began
            cancellation_began = None
            while process.is_alive() or not messages.empty():
                if item['cancelled'].is_set():
                    cancel_event.set()
                    item['state'] = 'cancelled'
                    cancellation_began = cancellation_began or time.monotonic()
                    # Drain PID announcements before force-stopping a startup.
                    # COM may launch Excel through the Office broker, outside
                    # the worker's process tree. Allow it to return and acquire
                    # explicit job ownership before terminating the worker.
                    grace = 15 if item.get('stage') == 'excel_start' and not item.get('excelPid') else 2
                    if time.monotonic()-cancellation_began > grace: break
                deadline = timeout_message(time.monotonic(), began, item['lastProgress'], item.get('stage', 'startup'))
                if deadline: raise TimeoutError(deadline)
                try: update = messages.get(timeout=.25)
                except queue.Empty: continue
                item['lastProgress'] = time.monotonic()
                item.update({k: v for k, v in update.items() if k in {'progress', 'message', 'excelPid', 'stage', 'stageSeconds', 'elapsedSeconds', 'completedQuestions', 'totalQuestions', 'peakMemoryBytes', 'preparationWorkers', 'querySeconds'}})
                if update.get('preparationPid'):
                    import win32api
                    try: preparation_handles.append(win32api.OpenProcess(1 | 0x100000, False, update['preparationPid']))
                    except Exception: pass
                if update.get('excelPid'):
                    import win32api
                    # Retain the original process handle, avoiding PID reuse races.
                    excel_handle = win32api.OpenProcess(1 | 0x100000, False, update['excelPid'])
                if update.get('error') and not item['cancelled'].is_set(): raise ValueError('Excel could not create the workbook. Details: ' + update['error'])
                if update.get('done') and not item['cancelled'].is_set(): item['state'] = 'complete'
            if item['state'] == 'running': raise ValueError('Excel export ended unexpectedly.')
        except Exception as exc: item.update(state='error', message=str(exc))
        finally:
            if process:
                process.join(timeout=2)
                if process.is_alive(): process.terminate(); process.join(timeout=2)
            for handle in preparation_handles:
                try:
                    import win32api, win32event
                    if win32event.WaitForSingleObject(handle, 0) == 258: win32api.TerminateProcess(handle, 0)
                    handle.Close()
                except Exception: pass
            if process_job: process_job.Close()
            if excel_handle:
                try:
                    import win32api
                    import win32event
                    if win32event.WaitForSingleObject(excel_handle, 0) == 258: win32api.TerminateProcess(excel_handle, 0)
                    excel_handle.Close()
                except Exception: pass
            if item['state'] != 'complete': remove_export_folder(item['folder'], item.get('owner'))
            item['completed'] = time.monotonic()
            timer = threading.Timer(3600, self.retire, args=(job,)); timer.daemon = True; timer.start()
            self.serial.release()

    def status(self, job):
        with self.lock:
            self._expire(); item = self.jobs[job]
            result = {k: item[k] for k in ['id', 'state', 'progress', 'message']}
            for key in ['stage', 'stageSeconds', 'completedQuestions', 'totalQuestions', 'peakMemoryBytes', 'preparationWorkers']:
                if key in item: result[key] = item[key]
            if item.get('started'):
                stop = item.get('completed') or time.monotonic()
                result['elapsedSeconds'] = round(stop-item['started'], 1)
                result['lastProgressSecondsAgo'] = round(max(0, stop-(item.get('lastProgress') or stop)), 1)
            return result

    def cancel(self, job):
        with self.lock:
            if job in self.jobs: self.jobs[job]['cancelled'].set()

    def download(self, job):
        item = self.jobs[job]
        if item['state'] != 'complete': raise ValueError('Not ready')
        return (item['folder'] / 'analysis.xlsx').read_bytes()


jobs = ExportJobs()
