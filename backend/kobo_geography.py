"""Geography-only interpretation of original location answers."""
from collections import Counter
from pydantic import BaseModel, Field, field_validator

GOVERNORATES = {'sulaymaniyah': 'Al-Sulaimaniyah', 'ninewa': 'Ninawa', 'qadisiyah': 'Al-Qadisiyah', 'muthanna': 'Al-Muthanna', 'dhi qar': 'Dhi Qar', 'salah al din': 'Salah al-Din', 'anbar': 'Al-Anbar', 'basra': 'Al-Basrah', 'karbala': 'Karbala', 'najaf': 'An-Najaf', 'wasit': 'Wasit', 'baghdad': 'Baghdad', 'babil': 'Babil', 'maysan': 'Maysan', 'diyala': 'Diyala', 'kirkuk': 'Kirkuk', 'erbil': 'Erbil', 'duhok': 'Dohuk'}
EXCLUDE = '__exclude__'


class GeographyConfig(BaseModel):
    fallbackField: str = Field('', max_length=500)
    mappings: dict[str, dict[str, str]] = Field(default_factory=dict)

    @field_validator('mappings')
    @classmethod
    def valid_destinations(cls, mappings):
        if sum(len(values) for values in mappings.values()) > 10000:
            raise ValueError('Too many geography mappings.')
        if any(value not in {*GOVERNORATES.values(), EXCLUDE} for values in mappings.values() for value in values.values()):
            raise ValueError('Choose a supported Iraqi governorate or Exclude.')
        return mappings


def location_eligible(q, settings):
    return bool(q and not q['repeat'] and not q['identifying'] and q['id'] not in settings.hidden and (not q['metadata'] or settings.metadata) and q['kind'] in {'category', 'text'} and q['type'].split()[0] != 'geopoint')


def governorate_analysis(project, settings, field, records):
    from .kobo import missing, label
    from .legal_platform import normalize_governorate
    questions = {q['id']: q for q in project['form']['questions']}
    config = settings.geographyConfigs.get(field, GeographyConfig())
    warnings = []
    fallback = config.fallbackField
    if fallback and (fallback == field or not location_eligible(questions.get(fallback), settings)):
        warnings.append('Fallback location field is unavailable. Choose another field or clear it.')
        fallback = ''
    sources = [field, *([fallback] if fallback else [])]
    all_records = [r for r in project['records'] if not r['scope']]
    choices = {source: {str(c['name']): c for c in questions[source]['choices']} for source in sources}

    def raw_value(record, source):
        value = record['values'].get(source)
        return None if missing(value) else str(value)

    def interpret(source, raw):
        if raw is None:
            return '', '', 'Missing'
        choice = choices[source].get(raw)
        candidates = {GOVERNORATES.get(normalize_governorate(value)) for value in [raw, *((choice or {}).get('labels', {}).values())] if value}
        candidates.discard(None)
        automatic = next(iter(candidates)) if len(candidates) == 1 else ''
        override = config.mappings.get(source, {}).get(raw)
        target = automatic if override is None else override
        return automatic, '' if target == EXCLUDE else target, 'Excluded' if target == EXCLUDE else 'Matched' if target else 'Unmatched'

    review = []
    for source in sources:
        totals = Counter(raw_value(r, source) for r in all_records)
        filtered = Counter(raw_value(r, source) for r in records)
        for raw, count in sorted(totals.items(), key=lambda item: (item[0] is not None, item[0] or '')):
            automatic, target, status = interpret(source, raw)
            choice = choices[source].get(raw)
            review.append({'field': source, 'raw': raw, 'label': label(choice, settings.language) if choice else raw or 'Blank / unanswered', 'total': count, 'filtered': filtered[raw], 'automatic': automatic, 'governorate': target, 'status': status, 'override': config.mappings.get(source, {}).get(raw) if raw is not None else None})
        for raw in config.mappings.get(source, {}):
            if raw not in totals:
                warnings.append(f'Saved mapping value no longer occurs: {questions[source]["name"]} / {raw}. Review after re-upload.')
    for source in config.mappings:
        if source not in sources:
            warnings.append(f'Saved mapping field is unavailable or inactive: {source}.')
    mapped, outcome_counts, details = Counter(), Counter(), Counter()
    recovered = primary_missing = 0
    for record in records:
        raw = raw_value(record, field)
        source = field
        if raw is None:
            primary_missing += 1
            if fallback:
                source, raw = fallback, raw_value(record, fallback)
        _, target, status = interpret(source, raw)
        outcome_counts[status] += 1
        if target:
            mapped[target] += 1
            if source != field:
                recovered += 1
        details[(source, raw, target, status)] += 1
    if any(row['status'] == 'Unmatched' for row in review):
        warnings.append('Unmatched location values require review before they can appear on the governorate map.')
    rows = [{'field': source, 'raw': raw, 'label': label(choices[source][raw], settings.language) if raw in choices[source] else raw or 'Blank / unanswered', 'governorate': target, 'status': status, 'count': count} for (source, raw, target, status), count in details.items()]
    return {'total': len(records), 'missing': outcome_counts['Missing'], 'invalid': 0, 'spatial': False, 'mapped': sum(mapped.values()), 'unmapped': outcome_counts['Unmatched'], 'excluded': outcome_counts['Excluded'], 'primaryMissing': primary_missing, 'fallbackUsed': recovered, 'governorates': dict(mapped), 'matches': [{'source': r['label'], 'governorate': r['governorate']} for r in review if r['governorate']], 'rows': rows, 'cells': [], 'reviewValues': review, 'warnings': warnings, 'governorateOptions': sorted(GOVERNORATES.values()), 'percentageBasis': 'Mapped submissions under current response filters'}
