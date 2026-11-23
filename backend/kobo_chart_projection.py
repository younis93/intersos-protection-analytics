"""Chart-only answer projection. Pivot rows and full-data bases stay intact."""
from copy import deepcopy
import math
from .kobo_pivot_percentages import column_base, put_percent, trend_pivot, value_totals


def project_chart(result, cfg, question=None, *, original=None, selected_answers=None):
    rows = [r for r in result['rows'] if r['id'] != '__blank__']
    limit = cfg.chartTopN
    if not limit or result['kind'] == 'date' or result.get('bins') or result['chart'] == 'histogram': return None
    measure = result.get('measure')
    value = lambda r: r.get('value') if measure else r['count']
    fallback={r['id']:i for i,r in enumerate(sorted(rows,key=lambda r:float(r['id']) if result['kind']=='number' else r['id']))}
    form_order={c['name']:i for i,c in enumerate((question or {}).get('choices',[]))}
    ranked = sorted(enumerate(rows), key=lambda pair: (value(pair[1]) is None, -(value(pair[1]) or 0), form_order.get(pair[1]['id'],fallback[pair[1]['id']])))
    chosen = selected_answers if selected_answers is not None else {r['id'] for _, r in ranked[:limit]}
    kept = [deepcopy(r) for r in rows if r['id'] in chosen]
    omitted = [r for r in rows if r['id'] not in chosen]
    additive = not measure or measure['operation'] == 'sum'
    other = bool(cfg.chartOther and additive and omitted)
    mode = result.get('percentageMode', cfg.percentageMode)
    answer_base = (result.get('answerFilterSummary') or {}).get('denominator')

    basis = original if original is not None else result
    respondent_mode = mode == 'legacy-respondents'

    def combine(entries, denominator):
        count = sum(e['count'] for e in entries)
        valid = [e.get('value') for e in entries if e.get('value') is not None]
        amount = math.fsum(valid) if valid else None
        merged = {'count': count, 'value': amount,
                  'contributingCount': sum(e.get('contributingCount', 0) or 0 for e in entries)}
        put_percent(merged, amount if measure else count, denominator, result.get('percentageDecimals', 0))
        return merged

    if other:
        if answer_base is not None:
            denominator = answer_base
            column_denominators = {column['id']: answer_base for column in result['breakdowns']}
        elif respondent_mode:
            denominator = (basis.get('respondentBasis') or {}).get('denominator', basis['denominator'])
            column_denominators = {column['id']: column['denominator'] for column in basis['breakdowns']}
        else:
            totals = value_totals(basis, bool(measure), cfg.percentageGroupLevel)
            denominator = math.fsum(totals[0].get(row['id']) or 0 for row in omitted) if mode == 'row-total' else totals[3]
            column_denominators = {column['id']: denominator if mode == 'row-total' else column_base(mode, column['id'], totals) for column in result['breakdowns']}
        merged = {'id': '__chart_other__', 'label': 'Other (chart aggregation)', **combine(omitted, denominator)}
        merged['series'] = [
            {'id': column['id'], **combine(
                [cell for row in omitted for cell in row.get('series', []) if cell['id'] == column['id']],
                column_denominators.get(column['id']))}
            for column in result['breakdowns']
        ]
        kept.append(merged)
    projection = {'rows': kept, 'topNTotal': len(rows), 'topNShown': min(limit, len(rows)), 'topNOther': other}
    if result.get('trend'):
        trend = deepcopy(result['trend'])
        removed = [series for series in trend['series'] if series['id'] not in chosen]
        trend['series'] = [series for series in trend['series'] if series['id'] in chosen]
        if other and removed:
            base_trend = basis['trend']
            if answer_base is not None:
                period_bases = dict.fromkeys(base_trend['periods'], answer_base)
            elif respondent_mode:
                period_bases = dict(zip(base_trend['periods'], base_trend['denominators']))
            else:
                totals = value_totals(trend_pivot(base_trend, basis), bool(measure), cfg.percentageGroupLevel)
                denominator = math.fsum(totals[0].get(series['id']) or 0 for series in removed)
                period_bases = {period: denominator if mode == 'row-total' else column_base(mode, period, totals) for period in trend['periods']}
            points = [combine([series['points'][index] for series in removed], period_bases.get(period))
                      for index, period in enumerate(trend['periods'])]
            trend['series'].append({'id': '__chart_other__', 'label': 'Other (chart aggregation)', 'points': points})
        projection['trend'] = trend
    return projection
