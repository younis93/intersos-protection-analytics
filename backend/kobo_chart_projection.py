"""Chart-only answer projection. Pivot rows and full-data bases stay intact."""
from copy import deepcopy
import math


def project_chart(result, cfg, question=None):
    rows = [r for r in result['rows'] if r['id'] != '__blank__']
    limit = cfg.chartTopN
    if not limit or result['kind'] == 'date' or result.get('bins') or result['chart'] == 'histogram': return None
    measure = result.get('measure')
    value = lambda r: r.get('value') if measure else r['count']
    fallback={r['id']:i for i,r in enumerate(sorted(rows,key=lambda r:float(r['id']) if result['kind']=='number' else r['id']))}
    form_order={c['name']:i for i,c in enumerate((question or {}).get('choices',[]))}
    ranked = sorted(enumerate(rows), key=lambda pair: (value(pair[1]) is None, -(value(pair[1]) or 0), form_order.get(pair[1]['id'],fallback[pair[1]['id']])))
    chosen = {r['id'] for _, r in ranked[:limit]}
    kept = [deepcopy(r) for r in rows if r['id'] in chosen]
    omitted = [r for r in rows if r['id'] not in chosen]
    additive = not measure or measure['operation'] == 'sum'
    other = bool(cfg.chartOther and additive and omitted)
    mode = cfg.percentageMode

    def combine(entries, base, row_base=None):
        count = sum(e['count'] for e in entries)
        valid = [e.get('value') for e in entries if e.get('value') is not None]
        amount = math.fsum(valid) if valid else None
        number = amount if measure else count
        denominator = row_base if mode == 'row-total' else base
        percent = number / denominator * 100 if denominator and number is not None else None
        return {'count': count, 'value': amount, 'contributingCount': sum(e.get('contributingCount',0) for e in entries), 'percent': percent, 'displayPercent': percent}

    if other:
        total = result.get('pivotTotal') or {}
        grand = total.get('value') if measure else total.get('count')
        own_value = math.fsum((value(r) or 0) for r in omitted)
        base = (result.get('respondentBasis') or {}).get('denominator', result['denominator']) if mode == 'legacy-respondents' else grand
        merged = {'id':'__chart_other__', 'label':'Other (chart aggregation)', **combine(omitted,base,own_value)}
        merged['series'] = []
        for column in result['breakdowns']:
            entries = [next((s for s in r.get('series',[]) if s['id']==column['id']), {'count':0}) for r in omitted]
            column_base = column.get('totalValue') if measure else column.get('totalCount')
            denominator = column['denominator'] if mode == 'legacy-respondents' else column_base if mode == 'column-total' else grand
            if mode=='breakdown-group':denominator=column_base/(column['totalPercent']/100) if column.get('totalPercent') else None
            merged['series'].append({'id':column['id'], **combine(entries,denominator,own_value)})
        kept.append(merged)
    projection = {'rows':kept, 'topNTotal':len(rows), 'topNShown':min(limit,len(rows)), 'topNOther':other}
    trend = result.get('trend')
    if trend:
        trend = deepcopy(trend)
        removed = [s for s in trend['series'] if s['id'] not in chosen]
        trend['series'] = [s for s in trend['series'] if s['id'] in chosen]
        if other and removed:
            points = []
            for index in range(len(trend['periods'])):
                entries = [s['points'][index] for s in removed]
                # Trend percentages use the complete period's additive denominator.
                complete = [s['points'][index] for s in result['trend']['series']]
                base = trend['denominators'][index] if mode == 'legacy-respondents' else math.fsum((e.get('value') or 0) if measure else e['count'] for e in complete)
                points.append(combine(entries,base,base))
            trend['series'].append({'id':'__chart_other__','label':'Other (chart aggregation)','points':points})
        if other and mode!='legacy-respondents':
            from .kobo_pivot_percentages import apply_pivot_percentages
            visible_ids={s['id'] for s in result['trend']['series']}
            basis_series=[*trend['series'],*[s for s in result['trend'].get('percentageSeries',[]) if s['id'] not in visible_ids]]
            nested={'rows':[{'id':s['id'],'count':0,'value':None,'series':[dict(point,id=period) for point,period in zip(s['points'],trend['periods'])]} for s in basis_series], 'breakdowns':[{'id':period} for period in trend['periods']], 'measure':measure, 'denominator':result['denominator'],'percentageDecimals':result.get('percentageDecimals',0)}
            apply_pivot_percentages(nested,cfg)
            for series,row in zip(trend['series'],nested['rows']):
                for point,cell in zip(series['points'],row['series']):point.update(percent=cell['percent'],displayPercent=cell['displayPercent'])
        projection['trend'] = trend
    return projection
