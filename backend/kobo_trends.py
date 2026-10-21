"""Date-field validation and chart-only answer trends, independent of pivot rows."""
from collections import Counter, defaultdict
from datetime import date, timedelta


def trend_date_field(target, cfg, questions):
    if not cfg.trendDateField:
        if cfg.chart == 'line' and target['kind'] in {'category', 'multiple'}:
            raise ValueError('Choose a date field for this line chart.')
        return None
    field = questions.get(cfg.trendDateField)
    if not field or field['kind'] != 'date' or field.get('identifying'):
        raise ValueError('Trend date field must be a non-identifying date question.')
    scope = field['repeat']
    if scope and scope != target['repeat'] and not target['repeat'].startswith(scope + '/'):
        raise ValueError('Trend date field must belong to this response table or a parent response.')
    return field


def validate_chart_settings(questions, settings):
    for qid, cfg in settings.questions.items():
        target = questions.get(qid)
        if target is None:
            continue
        trend_date_field(target, cfg, questions)
        if cfg.chart == 'histogram' and target['kind'] != 'number':
            raise ValueError('Histogram requires a numeric question.')
        if cfg.chart == 'heatmap' and not (cfg.breakdowns or cfg.breakdown):
            raise ValueError('Heatmap requires at least one breakdown.')


def answer_trend(question, cfg, questions, answered, lookup, categories, rows):
    field = trend_date_field(question, cfg, questions)
    if cfg.chart != 'line' or field is None:
        return None
    cohorts = defaultdict(list)
    excluded = 0
    for record in answered:
        owner, seen = record, set()
        while owner['scope'] != field['repeat'] and owner.get('parent') in lookup and owner['id'] not in seen:
            seen.add(owner['id'])
            owner = lookup[owner['parent']]
        if owner['scope'] != field['repeat']:
            excluded += 1
            continue
        try:
            value = date.fromisoformat(str(owner['values'].get(field['id'], ''))[:10])
        except (ValueError, TypeError):
            excluded += 1
            continue
        period = value.isoformat()[:{'day': 10, 'month': 7, 'year': 4}[cfg.trendUnit]]
        cohorts[period].append(record)
    periods = []
    if cohorts:
        first, last = min(cohorts), max(cohorts)
        current = date.fromisoformat(first + {'day': '', 'month': '-01', 'year': '-01-01'}[cfg.trendUnit])
        while True:
            period = current.isoformat()[:len(first)]
            periods.append(period)
            if period == last:
                break
            if cfg.trendUnit == 'day':
                current += timedelta(days=1)
            elif cfg.trendUnit == 'month':
                current = date(current.year + (current.month == 12), current.month % 12 + 1, 1)
            else:
                current = date(current.year + 1, 1, 1)
    counts = {period: Counter(answer for record in members for answer in categories(record['values'][question['id']])) for period, members in cohorts.items()}
    return {'dateField': field['id'], 'unit': cfg.trendUnit, 'excluded': excluded,
            'periods': periods, 'denominators': [len(cohorts[p]) for p in periods],
            'series': [{'id': row['id'], 'label': row['label'], 'points': [
                {'count': counts.get(p, {}).get(row['id'], 0),
                 'percent': counts.get(p, {}).get(row['id'], 0) / len(cohorts[p]) * 100 if cohorts[p] else None}
                for p in periods]} for row in rows if row['id'] != '__blank__']}
