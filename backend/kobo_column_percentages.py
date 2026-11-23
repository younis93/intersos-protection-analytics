"""Limit pivot percentages to visible breakdown categories while preserving numeric totals."""
from .kobo_pivot_sort import apply_pivot_sort


def copy_percent(target, source):
    target['percent'] = source.get('percent')
    target['displayPercent'] = source.get('displayPercent', target['percent'])


def copy_row_percentages(rows, scoped_rows):
    by_id = {row['id']: row for row in scoped_rows}
    for row in rows:
        scoped = by_id.get(row['id'], {})
        copy_percent(row, scoped)
        cells = {cell['id']: cell for cell in scoped.get('series', [])}
        for cell in row.get('series', []):
            copy_percent(cell, cells.get(cell['id'], {}))


def copy_trend_percentages(trend, scoped):
    if not trend:
        return
    scoped = scoped or {}
    periods = scoped.get('periods', [])
    by_id = {series['id']: dict(zip(periods, series['points'])) for series in scoped.get('series', [])}
    for series in trend['series']:
        points = by_id.get(series['id'], {})
        for period, point in zip(trend['periods'], series['points']):
            copy_percent(point, points.get(period, {}))


def percentage_summary(result):
    if result.get('percentageSummary') is not None:
        return result['percentageSummary']
    if summary := result.get('answerFilterSummary'):
        return {'numerator': summary['count'], 'denominator': summary['denominator']}
    if result.get('measure'):
        return None
    base = result['respondentBasis']['denominator'] if result.get('respondentBasis') else result['denominator']
    numerator = result.get('pivotTotal', {}).get('count', result['denominator'])
    return {'numerator': numerator, 'denominator': base}


def apply_hidden_column_percentages(result, question, records, settings, questions, lookup, cfg):
    if cfg.hiddenColumnPercentageScope != 'visible' or not cfg.hiddenPivotColumns:
        return result
    if (result.get('measure') and
            (result['measure']['operation'] != 'sum' or result['percentageMode'] == 'legacy-respondents')):
        return result
    hidden = set(cfg.hiddenPivotColumns)
    columns = result['breakdowns']
    visible = {tuple(column['values']) for column in columns if column['id'] not in hidden}
    if len(visible) == len(columns):
        return result

    from .kobo import _question_result, breakdown_fields, breakdown_values
    dimensions = breakdown_fields(cfg, questions, question)
    projection = result.get('chartProjection')
    chart_answers = None
    if projection and not projection.get('axisOrder'):
        chart_answers = {row['id'] for row in projection['rows'] if row['id'] != '__chart_other__'}
    scoped = _question_result(
        question, records, settings, questions, lookup,
        record_in_scope=lambda record: breakdown_values(record, dimensions, lookup) in visible,
        template=result, chart_answers=chart_answers,
    )
    copy_row_percentages(result['rows'], scoped['rows'])
    result['percentageSummary'] = {**percentage_summary(scoped), 'visibleColumnsOnly': True}
    if result.get('answerFilterSummary'):
        scope = scoped['answerFilterSummary']
        result['answerFilterSummary'].update(count=scope['count'], denominator=scope['denominator'], percent=scope['percent'], visibleColumnsOnly=True)
    language = settings.language
    result['percentageBasis'] += ' · ' + ('الأعمدة الظاهرة فقط' if language == 'ar' else 'Visible columns only')
    scoped_columns = {column['id']: column for column in scoped['breakdowns']}
    for column in columns:
        source = scoped_columns.get(column['id'], {})
        column['totalPercent'] = source.get('totalPercent', 100 if source.get('denominator') else None)
    result.setdefault('pivotTotal', {'count': result['denominator']})['percent'] = scoped.get(
        'pivotTotal', {}).get('percent', 100 if scoped['denominator'] else None)
    if result.get('respondentBasis'):
        result['respondentBasis']['denominator'] = scoped['respondentBasis']['denominator']
        counts = {row['id']: row['count'] for row in scoped['rows']}
        for row in result['rows']:
            row['percentageCount'] = counts.get(row['id'], 0)
    copy_trend_percentages(result.get('trend'), scoped.get('trend'))

    # Sort on the displayed percentages, then retain the count-ranked chart selection.
    result = apply_pivot_sort(result, cfg)
    if chart_answers is not None:
        scoped_chart = scoped.get('chartProjection') or {}
        copy_row_percentages(projection['rows'], scoped_chart.get('rows', []))
        order = {row['id']: index for index, row in enumerate(result['rows'])}
        projection['rows'].sort(key=lambda row: order.get(row['id'], len(order)))
        copy_trend_percentages(projection.get('trend'), scoped_chart.get('trend'))
        if projection.get('trend'):
            projection['trend']['series'].sort(key=lambda series: order.get(series['id'], len(order)))
    return result
