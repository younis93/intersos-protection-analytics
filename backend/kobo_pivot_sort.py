"""One persisted answer order for pivots, charts, and exports."""
import re
import unicodedata
from functools import cmp_to_key


def natural(value):
    return [(0, int(part)) if part.isdecimal() else (1, part) for part in re.split(r'(\d+)', ''.join(c for c in unicodedata.normalize('NFKD', str(value)).casefold() if not unicodedata.combining(c)))]


def apply_pivot_sort(result, cfg):
    selected = cfg.pivotSort
    columns = {c['id']: c for c in result['breakdowns']}
    if selected and selected.series and (any(key not in columns for key in selected.series)
            or selected.id.endswith(':count') and cfg.breakdownDisplay == 'percent'
            or selected.id.endswith(':percent') and cfg.breakdownDisplay == 'count'):
        selected = None
    result['pivotSort'] = selected.model_dump() if selected else None
    if not selected: return result
    ids = set(selected.series or [])
    base = sum(columns[key]['denominator'] for key in ids)
    def value(row):
        if selected.metric == 'answer': return natural(row['label'])
        if not ids: return row.get('value') if result.get('measure') and selected.metric == 'count' else row.get(selected.metric)
        cells = [cell for cell in row.get('series', []) if cell['id'] in ids]
        if not cells or selected.metric == 'percent' and all(c.get('percent') is None for c in cells): return None
        if selected.metric == 'count' and result.get('measure'): return cells[0].get('value')
        if selected.metric == 'percent' and len(cells) == 1: return cells[0].get('percent')
        count = sum(cell['count'] for cell in cells)
        return count if selected.metric == 'count' else count / base * 100 if base else None
    def compare(a, b):
        if a['id'] == '__blank__' or b['id'] == '__blank__': return (a['id'] == '__blank__') - (b['id'] == '__blank__')
        left, right = value(a), value(b)
        if left is None or right is None: return (left is None) - (right is None)
        return ((left > right) - (left < right)) * (1 if selected.direction == 'asc' else -1)
    temporal = result['kind'] == 'date' or result.get('bins') or result['chart'] == 'histogram'
    original = result['rows']
    result['rows'] = sorted(original, key=cmp_to_key(compare))
    order = {row['id']: i for i, row in enumerate(result['rows'])}
    if result.get('trend'): result['trend']['series'].sort(key=lambda series: order.get(series['id'], len(order)))
    if temporal:
        result['chartProjection'] = {'rows': original, 'axisOrder': True, 'topNTotal': len(original), 'topNShown': len(original), 'topNOther': False}
    return result
