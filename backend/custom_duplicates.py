"""Explicit duplicate decisions bound to the reviewed source records."""
import hashlib
import json
from collections import defaultdict
from typing import Literal

from pydantic import BaseModel, Field
from .kobo import missing


class DuplicateDecision(BaseModel):
    mode: Literal['all', 'first', 'last', 'custom']
    rows: list[int] = Field(default_factory=list, max_length=100000)


class DuplicateReview(BaseModel):
    fields: list[str] = Field(default_factory=list, max_length=1000)
    decisions: dict[str, DuplicateDecision] = Field(default_factory=dict)


def review_duplicates(config, records, questions, source_data):
    settings = config.duplicateReview
    available = {q['id']: q for q in questions}
    result = {'groups': [], 'unresolved': 0, 'excluded': 0, 'included': len(records), 'skipped': 0, 'error': ''}
    if not settings.fields:
        return records, result, []
    if len(set(settings.fields)) != len(settings.fields) or set(settings.fields) - available.keys():
        result['error'] = 'Choose duplicate matching columns from included columns.'
        return records, result, [{'question': '__duplicates', 'message': result['error'], 'count': 1}]
    buckets = defaultdict(list)
    source = dict(source_data)
    def encoded(value):
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str)
    for record in records:
        values = [record['values'].get(field) for field in settings.fields]
        # Incomplete keys are never assumed to identify the same person or case.
        if any(missing(value) for value in values):
            result['skipped'] += 1
            continue
        buckets[encoded(values)].append(record)
    excluded = set()
    for key, members in buckets.items():
        if len(members) < 2:
            continue
        digest = hashlib.sha256(encoded([settings.fields, key]).encode())
        for record in members:
            digest.update(encoded([record['row'], source[record['row']], record['values']]).encode())
        signature = digest.hexdigest()
        decision = settings.decisions.get(signature)
        row_ids = [r['row'] for r in members]
        mode = decision.mode if decision else ''
        kept = row_ids
        if mode == 'first': kept = row_ids[:1]
        elif mode == 'last': kept = row_ids[-1:]
        elif mode == 'custom':
            kept = decision.rows
            if len(set(kept)) != len(kept) or set(kept) - set(row_ids):
                mode = ''
                kept = row_ids
        if not mode:
            result['unresolved'] += 1
        else:
            excluded.update(set(row_ids) - set(kept))
        result['groups'].append({'signature': signature, 'values': json.loads(key), 'mode': mode,
            'keptRows': kept, 'records': [{'row': r['row'], 'values': r['values'], 'original': source[r['row']]} for r in members]})
    result['excluded'] = len(excluded)
    result['included'] = len(records) - len(excluded)
    issues = [{'question': '__duplicates', 'message': 'Review duplicate groups and choose which records to include.', 'count': result['unresolved']}] if result['unresolved'] else []
    if not result['included']:
        issues.append({'question': '__duplicates', 'message': 'Include at least one record.', 'count': 1})
    return [r for r in records if r['row'] not in excluded], result, issues
