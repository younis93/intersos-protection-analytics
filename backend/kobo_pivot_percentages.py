"""Additive pivot percentages, separate from respondent-based legacy percentages."""
import math
from decimal import Decimal,ROUND_HALF_UP

MODES={'grand-total':'% of Grand Total','column-total':'% of Column Total','row-total':'% of Row Total','breakdown-group':'% within breakdown group','legacy-respondents':'% of Respondents'}

def percentage(numerator, denominator):
    return numerator / denominator * 100 if numerator is not None and denominator else None


def put_percent(cell, numerator, denominator, decimals):
    cell['percent'] = percentage(numerator, denominator)
    cell['displayPercent'] = float(Decimal(str(cell['percent'])).quantize(Decimal(1).scaleb(-decimals), rounding=ROUND_HALF_UP)) if cell['percent'] is not None else None


def value_totals(result, use_value, level):
    value_key = 'value' if use_value else 'count'
    def total(values):
        valid = [value for value in values if value is not None]
        return math.fsum(valid) if valid else None if use_value else 0

    rows, columns = result['rows'], result['breakdowns']
    row_totals = {row['id']: total(cell.get(value_key) for cell in row.get('series', [])) if columns else row.get(value_key) for row in rows}
    by_column = {}
    for row in rows:
        for cell in row.get('series', []):
            by_column.setdefault(cell['id'], []).append(cell.get(value_key))
    column_totals = {column['id']: total(by_column.get(column['id'], [])) for column in columns}
    keys = {column['id']: tuple((column.get('values') or [column['id']])[:level]) for column in columns}
    groups = {}
    for column, key in keys.items():
        groups.setdefault(key, []).append(column_totals[column])
    group_totals = {key: total(values) for key, values in groups.items()}
    return row_totals, column_totals, {column: group_totals[key] for column, key in keys.items()}, total(row_totals.values())


def column_base(mode, column, totals):
    _, columns, groups, grand = totals
    return columns.get(column) if mode == 'column-total' else groups.get(column) if mode == 'breakdown-group' else grand


def trend_pivot(trend, result):
    return {'rows': [
        {'id': series['id'], 'count': 0, 'value': None,
         'series': [dict(point, id=period) for period, point in zip(trend['periods'], series['points'])]}
        for series in trend['series']
    ], 'breakdowns': [{'id': period} for period in trend['periods']], 'measure': result.get('measure'),
        'denominator': result['denominator'], 'percentageDecimals': result.get('percentageDecimals', 0)}


def apply_pivot_percentages(result, cfg, original=None):
    mode = cfg.percentageMode
    result['percentageMode'] = mode
    if mode == 'legacy-respondents': return result
    measured = result.get('measure')
    if measured and measured['operation'] != 'sum': return result
    value_key = 'value' if measured else 'count'
    total_key = 'totalValue' if measured else 'totalCount'
    decimals = result.get('percentageDecimals', 0)
    visible = value_totals(result, bool(measured), cfg.percentageGroupLevel)
    basis = value_totals(original, bool(measured), cfg.percentageGroupLevel) if original is not None else visible
    row_totals, column_totals, _, grand = visible
    for row in result['rows']:
        row_base = basis[0].get(row['id']) if mode == 'row-total' else basis[3]
        for cell in row.get('series', []):
            base = row_base if mode == 'row-total' else column_base(mode, cell['id'], basis)
            put_percent(cell, cell.get(value_key), base, decimals)
        put_percent(row, row_totals[row['id']], row_base, decimals)
    for column in result['breakdowns']:
        amount = column_totals[column['id']]
        column[total_key] = amount
        column['totalPercent'] = percentage(amount, column_base(mode, column['id'], basis))
    result['pivotTotal'] = {value_key: grand, 'percent': percentage(grand, basis[3]),
        'contributingCount': (result.get('measureTotal') or {}).get('contributingCount', result['denominator'])}
    trend = result.get('trend')
    if trend:
        nested = trend_pivot(trend, result)
        original_trend = (original or {}).get('trend')
        apply_pivot_percentages(nested, cfg, trend_pivot(original_trend, original) if original_trend else None)
        for series, row in zip(trend['series'], nested['rows']):
            for point, cell in zip(series['points'], row['series']):
                point.update(percent=cell['percent'], displayPercent=cell['displayPercent'])
    result['percentageBasis'] = MODES[mode]+(f' · level {cfg.percentageGroupLevel}' if mode=='breakdown-group' else '')+' · '+('sum of values across answer selections' if measured else 'answer selections')
    return result
