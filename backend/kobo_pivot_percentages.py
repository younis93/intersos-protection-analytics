"""Additive pivot percentages, separate from respondent-based legacy percentages."""
import math
from decimal import Decimal,ROUND_HALF_UP

MODES={'grand-total':'% of Grand Total','column-total':'% of Column Total','row-total':'% of Row Total','breakdown-group':'% within breakdown group','legacy-respondents':'% of Respondents'}

def apply_pivot_percentages(result,cfg):
    mode=cfg.percentageMode
    result['percentageMode']=mode
    if mode=='legacy-respondents':return result
    measured=result.get('measure')
    if measured and measured['operation']!='sum':return result
    use_value=bool(measured)
    rows=result['rows'];columns=result['breakdowns']
    value=lambda cell:cell.get('value') if use_value else cell.get('count',0)
    def total(cells):
        values=[value(c) for c in cells if value(c) is not None]
        return math.fsum(values) if values else None if use_value else 0
    row_totals={r['id']:total(r.get('series',[])) if columns else value(r) for r in rows}
    column_totals={c['id']:total([s for r in rows for s in r.get('series',[]) if s['id']==c['id']]) for c in columns}
    level=cfg.percentageGroupLevel
    def group_key(column): return tuple((column.get('values') or [column['id']])[:level])
    group_totals={group_key(c):math.fsum(v for other in columns if group_key(other)==group_key(c) for v in [column_totals[other['id']]] if v is not None) for c in columns}
    group_base={c['id']:group_totals[group_key(c)] for c in columns}
    grand=math.fsum(v for v in row_totals.values() if v is not None) if any(v is not None for v in row_totals.values()) else None
    def percentage(n,d):return n/d*100 if n is not None and d else None
    def put(cell,n,d):
        cell['percent']=percentage(n,d);cell['displayPercent']=float(Decimal(str(cell['percent'])).quantize(Decimal(1).scaleb(-result.get('percentageDecimals',0)),rounding=ROUND_HALF_UP)) if cell['percent'] is not None else None
    for row in rows:
        for cell in row.get('series',[]):put(cell,value(cell),grand if mode=='grand-total' else group_base[cell['id']] if mode=='breakdown-group' else column_totals[cell['id']] if mode=='column-total' else row_totals[row['id']])
        put(row,row_totals[row['id']],row_totals[row['id']] if mode=='row-total' else grand)
    for column in columns:
        column['totalValue' if use_value else 'totalCount']=column_totals[column['id']]
        column['totalPercent']=percentage(column_totals[column['id']],column_totals[column['id']] if mode=='column-total' else group_base[column['id']] if mode=='breakdown-group' else grand)
    result['pivotTotal']={'value' if use_value else 'count':grand,'percent':100 if grand else None,'contributingCount':result.get('measureTotal',{}).get('contributingCount',result['denominator']) if result.get('measureTotal') else result['denominator']}
    if result.get('trend'):
        trend=result['trend']
        nested={'rows':[{'id':series['id'],'count':0,'value':None,'series':[dict(point,id=period) for period,point in zip(trend['periods'],series['points'])]} for series in trend['series']], 'breakdowns':[{'id':period} for period in trend['periods']], 'measure':measured,'denominator':result['denominator'],'percentageDecimals':result.get('percentageDecimals',0)}
        apply_pivot_percentages(nested,cfg)
        for series,row in zip(trend['series'],nested['rows']):
            for point,cell in zip(series['points'],row['series']):point.update(percent=cell['percent'],displayPercent=cell['displayPercent'])
    result['percentageBasis']=MODES[mode]+(f' · level {level}' if mode=='breakdown-group' else '')+' · '+('sum of values across answer selections' if use_value else 'answer selections')
    return result
