"""Record-based pivot measures shared by analysis, drilldown and exports."""
import math
import statistics
from pydantic import BaseModel, Field
from typing import Literal


class Calculation(BaseModel):
    operation: Literal['count', 'unique', 'sum', 'average', 'median'] = 'count'
    field: str = ''
    decimals: int = Field(2, ge=0, le=6)


def value_field(question, cfg, questions):
    calc = cfg.calculation
    if calc is None or calc.operation == 'count': return None
    field = questions.get(calc.field)
    if not field or field['kind'] == 'multiple': raise ValueError('Choose an available scalar value column.')
    if calc.operation != 'unique' and field['kind'] != 'number': raise ValueError('This calculation requires a numeric value column.')
    scope = field['repeat']
    if scope and scope != question['repeat'] and not question['repeat'].startswith(scope + '/'):
        raise ValueError('Value column must belong to this response table or an ancestor table.')
    if cfg.chart in {'pie', 'donut', 'histogram'}: raise ValueError('Calculated measures support bar, column, line and heatmap charts.')
    return field


def record_value(record, field, lookup):
    seen = set()
    while record['scope'] != field['repeat']:
        if record['id'] in seen or record.get('parent') not in lookup: return None
        seen.add(record['id']); record = lookup[record['parent']]
    return record['values'].get(field['id'])


def aggregate(records, field, operation, lookup):
    from .kobo import missing
    values = [record_value(record, field, lookup) for record in records]
    values = [v for v in values if not missing(v)]
    if operation == 'unique':
        def key(value):
            return ('number',float(value)) if isinstance(value,(int,float)) and not isinstance(value,bool) else ('text',str(value).casefold())
        return {'value': len({key(v) for v in values}), 'contributingCount': len(values)}
    values = [float(v) for v in values if not isinstance(v, bool) and isinstance(v, (int, float)) and math.isfinite(v)]
    value = None if not values else math.fsum(values) if operation == 'sum' else statistics.mean(values) if operation == 'average' else statistics.median(values)
    return {'value': value, 'contributingCount': len(values)}


def apply_measure(result, question, cfg, questions, answered, lookup, categories, dimensions, cohort=None):
    from .kobo import breakdown_values, label
    field = value_field(question, cfg, questions)
    if field is None: return result
    operation = cfg.calculation.operation
    names = {'unique':'Unique count','sum':'Sum','average':'Average','median':'Median'}
    measure = {**cfg.calculation.model_dump(), 'label': names[operation]+' of '+label(field, 'en'),
               'unit': 'Repeat entries' if question['repeat'] else 'Records',
               'parentValuesRepeated': field['repeat'] != question['repeat']}
    result['measure'] = measure
    pool=cohort if cfg.percentageMode!='legacy-respondents' and any(r['id']=='__blank__' for r in result['rows']) else answered
    memberships = {r['id']:set(categories(r['values'].get(question['id']))) for r in pool}
    row_members = {row['id']:[r for r in pool if row['id'] in memberships[r['id']] or row['id']=='__blank__' and not memberships[r['id']]] for row in result['rows']}
    column_members = {column['id']:[r for r in pool if list(breakdown_values(r,dimensions,lookup)) == column['values']] for column in result['breakdowns']}
    for row in result['rows']:
        row.update(aggregate(row_members[row['id']],field,operation,lookup))
        for series in row.get('series',[]):
            selected = {r['id'] for r in column_members[series['id']]}
            series.update(aggregate([r for r in row_members[row['id']] if r['id'] in selected],field,operation,lookup))
    for column in result['breakdowns']:
        column.update(aggregate(column_members[column['id']],field,operation,lookup))
    result['measureTotal'] = aggregate(pool if cfg.percentageMode!='legacy-respondents' else answered,field,operation,lookup)
    if cfg.answerSort.startswith('count'):
        valid = [row for row in result['rows'] if row['id'] != '__blank__']
        valid.sort(key=lambda row: row['value'] or 0, reverse=cfg.answerSort == 'count-desc')
        result['rows'] = [r for r in valid if r['value'] is not None]+[r for r in valid if r['value'] is None]+[r for r in result['rows'] if r['id']=='__blank__']
    trend = result.get('trend')
    if trend:
        order={row['id']:index for index,row in enumerate(result['rows'])}
        trend['series'].sort(key=lambda series:order.get(series['id'],len(order)))
        date_field = questions[trend['dateField']]
        length = {'day':10,'month':7,'year':4}[trend['unit']]
        for series in trend['series']:
            for period,point in zip(trend['periods'],series['points']):
                members = [r for r in row_members.get(series['id'],[]) if str(record_value(r,date_field,lookup))[:length]==period]
                point.update(aggregate(members,field,operation,lookup))
    return result
