"""Display rounding only; respondent membership and raw percentages stay unchanged."""
from decimal import Decimal, ROUND_HALF_UP


def display_percentages(entries, denominator, decimals=0, balance=True):
    scale = 10 ** decimals
    units = 100 * scale
    if not denominator:
        return {key: None for key, count in entries}
    quotients = {key: divmod(count * units, denominator) for key, count in entries}
    if balance and sum(count for key, count in entries) == denominator:
        remaining = units - sum(value[0] for value in quotients.values())
        winners = set(sorted(quotients, key=lambda key: (-quotients[key][1], key))[:remaining])
        return {key: (base + int(key in winners)) / scale for key, (base, remainder) in quotients.items()}
    return {key: float((Decimal(count) * 100 / denominator).quantize(Decimal(1).scaleb(-decimals), rounding=ROUND_HALF_UP)) for key, count in entries}


def apply_display_percentages(rows, breakdowns, denominator, kind, decimals):
    valid = [row for row in rows if row['id'] != '__blank__']
    values = display_percentages([(row['id'], row['count']) for row in valid], denominator, decimals, kind != 'multiple')
    for row in rows:
        row['displayPercent'] = values.get(row['id'])
    for column in breakdowns:
        entries = [(row['id'], next((entry['count'] for entry in row.get('series', []) if entry['id'] == column['id']), 0)) for row in valid]
        values = display_percentages(entries, column['denominator'], decimals, kind != 'multiple')
        for row in rows:
            for entry in row.get('series', []):
                if entry['id'] == column['id']:
                    entry['displayPercent'] = values.get(row['id'])
