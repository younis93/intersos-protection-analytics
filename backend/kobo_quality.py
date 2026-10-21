"""Read-only quality checks on normalized responses, with explicit review limits."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import json
import math
from typing import Literal

from pydantic import BaseModel, Field


class QualityCheck(BaseModel):
    id: str
    title: str
    severity: Literal['check', 'correction']
    question: str = ''
    label: str = ''
    count: int
    total: int
    explanation: str
    suggestion: str


class QualityRecord(BaseModel):
    id: str
    row: int
    scope: str
    question: str
    answer: str
    reason: str


class QualityResult(BaseModel):
    total: int
    main: int
    repeats: int
    affected: int
    checks: list[QualityCheck]
    filterSummary: list[str]
    notes: list[str]
    rows: list[QualityRecord] = Field(default_factory=list)
    matched: int = 0
    page: int = 1
    pageSize: int = 25


def quality_review(project, settings, *, check_id='', page=1, page_size=25):
    from .kobo import filtered_records, label, missing
    from .kobo_indicators import filter_descriptions
    excluded_cycles = 0
    if settings.filters:
        lookup = {r['id']: r for r in project['records']}
        resolved, cyclic = set(), set()
        for record in project['records']:
            current, path = record, set()
            while current and current['id'] not in resolved and current['id'] not in cyclic:
                if current['id'] in path: cyclic.update(path); break
                path.add(current['id']); current = lookup.get(current.get('parent'))
            if current and current['id'] in cyclic: cyclic.update(path)
            else: resolved.update(path)
        excluded_cycles = len(cyclic)
        safe = {**project, 'records': [r for r in project['records'] if r['id'] not in cyclic]} if cyclic else project
        records = filtered_records(safe, settings)
    else: records = project['records']
    questions = [q for q in project['form']['questions'] if not q.get('identifying') and not q.get('metadata')]
    lookup = {r['id']: r for r in project['records']}
    groups = {g['id']: g for g in project['form']['groups']}
    checks, affected, matches = [], set(), []
    start = (page-1)*page_size
    matched = 0

    def add(cid, title, severity, question, cohort, hits, explanation, suggestion):
        nonlocal matched
        if not hits: return
        caption = label(question, settings.language) if question else ''
        checks.append(QualityCheck(id=cid, title=title, severity=severity, question=question['id'] if question else '', label=caption, count=len(hits), total=len(cohort), explanation=explanation, suggestion=suggestion))
        for record, value, reason in hits:
            affected.add(record['id'])
            if cid != check_id: continue
            if start <= matched < start+page_size:
                matches.append(QualityRecord(id=record['id'], row=record['row'], scope=label(groups[record['scope']], settings.language) if record['scope'] in groups else record['scope'] or 'Main submissions', question=caption, answer=value, reason=reason))
            matched += 1

    for q in questions:
        cohort = [r for r in records if r['scope'] == q['repeat']]
        blanks, invalid = [], []
        captions = {c['name']: label(c, settings.language) for c in q['choices']}
        for r in cohort:
            value = r['values'].get(q['id'])
            if missing(value): blanks.append((r, '', 'No answer is available. The question may have been skipped or not applicable.')); continue
            valid = True
            if q['kind'] == 'number': valid = not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)
            elif q['kind'] == 'category': valid = isinstance(value, str) and value in captions
            elif q['kind'] == 'multiple': valid = isinstance(value, list) and all(isinstance(v, str) and v in captions for v in value)
            elif q['kind'] == 'date':
                try: datetime.fromisoformat(str(value).replace('Z', '+00:00'))
                except (ValueError, TypeError): valid = False
            if not valid:
                answer = ', '.join(captions.get(str(v), str(v)) for v in value) if isinstance(value, list) else str(value)
                invalid.append((r, answer, 'The value does not match the current question type or configured answer options.'))
        add('missing:'+q['id'], 'Missing answers', 'check', q, cohort, blanks, 'Missing does not automatically mean an error. Relevance and skip logic are not evaluated in this review.', 'Check applicability and source answers before treating these records as incomplete or correcting the import.')
        add('invalid:'+q['id'], 'Invalid or unrecognized values', 'correction', q, cohort, invalid, 'Values cannot be interpreted using the current question type or answer codes.', 'Review the source values and answer mappings using Review and correct import. Apply only confirmed corrections.')

    duplicate_groups = defaultdict(list)
    by_scope = defaultdict(list)
    for q in questions: by_scope[q['repeat']].append(q)
    for r in records:
        values = {q['id']: r['values'].get(q['id']) for q in by_scope[r['scope']]}
        if not values or all(missing(v) for v in values.values()): continue
        for q in by_scope[r['scope']]:
            v = values[q['id']]
            if q['kind'] == 'multiple' and isinstance(v, list) and all(isinstance(x, str) for x in v): values[q['id']] = sorted(set(v))
        duplicate_groups[(r['scope'], r.get('parent') if r['scope'] else '', json.dumps(values, sort_keys=True, ensure_ascii=False))].append(r)
    duplicates = [(r, '', 'Same non-identifying, non-metadata answers as example source row(s) '+', '.join(str(other['row']) for other in group[:8] if other is not r)+'.') for group in duplicate_groups.values() if len(group)>1 for r in group]
    add('duplicates', 'Possible duplicate responses', 'check', None, records, duplicates, 'All comparable answers are identical within a response table. Repeat entries are compared only within the same parent. Matching answers alone do not prove duplication.', 'Compare source rows and submission details before deciding whether any record is a duplicate. Records are never removed automatically.')

    links = []
    repeats = [r for r in records if r['scope']]
    for r in repeats:
        current, seen = r, set()
        reason = ''
        while current and current.get('scope'):
            if current['id'] in seen: reason = 'The parent relationship contains a cycle.'; break
            seen.add(current['id'])
            parent = lookup.get(current.get('parent'))
            if parent is None: reason = 'The repeat entry has no matching parent response.'; break
            if parent['id'] in seen: reason = 'The parent relationship contains a cycle.'; break
            group = groups.get(current['scope'], {})
            parent_scope, group_seen = group.get('parent', ''), set()
            while parent_scope and not groups.get(parent_scope, {}).get('repeat') and parent_scope not in group_seen:
                group_seen.add(parent_scope); parent_scope = groups.get(parent_scope, {}).get('parent', '')
            if parent['scope'] != parent_scope: reason = 'The repeat entry is linked to an unexpected parent response table.'; break
            current = parent
        if reason: links.append((r, '', reason))
    add('links', 'Broken repeat links', 'correction', None, repeats, links, 'Repeat entries need a valid chain of parent responses to support parent filters and calculations.', 'Review the source parent index and repeat table mapping. Re-upload corrected files after checking the links.')
    notes = ['Checks use normalized responses. Values previously converted to blank cannot be recovered here; inspect the saved import notes and mappings.', 'Identifying fields and metadata are excluded from answer and duplicate checks. Hidden analysis questions are included.', 'Issue counts can overlap. Records needing review counts each record once. No automatic corrections are applied.', 'This review does not evaluate skip logic, survey sampling, numeric outliers, or cross-question consistency.']
    if settings.filters: notes.append('Current filters apply. Unlinked repeat entries may be excluded by parent filters; clear filters to review all repeat links.')
    if excluded_cycles: notes.append(f'{excluded_cycles} records with cyclic parent relationships were excluded because their parent filters cannot be evaluated. Choose Whole dataset to inspect them.')
    for issue in project.get('issues', []):
        q = next((q for q in questions if q['id'] == issue['question']), None)
        if q: notes.append(f'Saved import note (whole import, not filter-scoped): {label(q, settings.language)}: {issue["message"]} ({issue["count"]} rows).')
    if check_id and not any(c.id == check_id for c in checks): matched = 0
    return QualityResult(total=len(records), main=sum(not r['scope'] for r in records), repeats=len(repeats), affected=len(affected), checks=checks, filterSummary=filter_descriptions(project, settings), notes=notes, rows=matches, matched=matched, page=page, pageSize=page_size)
