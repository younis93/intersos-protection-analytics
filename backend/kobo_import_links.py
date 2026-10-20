"""Version-aware source links and reviewed answer reconciliation for Kobo imports."""
from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
import math
from datetime import datetime


def compatible(old, new):
    return old['kind'] == new['kind'] and old.get('repeat', '') == new.get('repeat', '')


def question_matches(old_form, new_form):
    current = {q['id']: q for q in new_form['questions']}
    names = defaultdict(list)
    old_names = Counter((q['name'], q.get('repeat', '')) for q in old_form['questions'])
    for q in current.values(): names[(q['name'], q.get('repeat', ''))].append(q)
    result = {}
    for old in old_form['questions']:
        exact = current.get(old['id'])
        if exact:
            if compatible(old, exact): result[old['id']] = exact['id']
            continue
        key = old['name'], old.get('repeat', '')
        candidates = names[key]
        if old_names[key] == 1 and len(candidates) == 1 and compatible(old, candidates[0]): result[old['id']] = candidates[0]['id']
    return result


def form_changes(old, new):
    matches = question_matches(old, new)
    old_by = {q['id']: q for q in old['questions']}
    new_by = {q['id']: q for q in new['questions']}
    entries = []
    for qid, q in new_by.items():
        previous = old_by.get(qid) or next((old_by[k] for k, v in matches.items() if v == qid), None)
        if previous is None: entries.append({'question': qid, 'change': 'New question'})
        else:
            if previous['type'] != q['type'] or previous.get('repeat', '') != q.get('repeat', ''):
                entries.append({'question': qid, 'change': 'Type or repeat context changed'})
            if previous.get('choices', []) != q.get('choices', []): entries.append({'question': qid, 'change': 'Answer options changed'})
            if previous.get('labels') != q.get('labels'): entries.append({'question': qid, 'change': 'Question label changed'})
    for qid in old_by:
        if qid not in matches and qid not in new_by: entries.append({'question': qid, 'change': 'Removed question'})
    return {'previousVersion': str(old.get('settings', {}).get('version') or ''), 'uploadedVersion': str(new.get('settings', {}).get('version') or ''), 'items': entries}


def reuse_links(project, form, sheets, old_sheets, proposed):
    from .kobo import norm
    matches = question_matches(project['form'], form)
    targets = {q['id']: q for q in form['questions']}
    prior = defaultdict(list)
    def identity(sheet, header): return norm(sheet), norm(header)
    for m in project.get('mappings', []):
        si, ci = m['sheet'], m['column']
        if si >= len(old_sheets) or ci >= len(old_sheets[si]['headers']): continue
        prior[identity(old_sheets[si]['name'], old_sheets[si]['headers'][ci])].append(m)
    counts = Counter(identity(s['name'], h) for s in sheets for h in s['headers'])
    warnings = []
    result = []
    old_questions = {q['id']: q for q in project['form']['questions']}
    for proposed_link in proposed:
        m = deepcopy(proposed_link)
        key = identity(sheets[m['sheet']]['name'], m['header'])
        previous = prior.get(key, [])
        if len(previous) == 1 and counts[key] == 1:
            old = previous[0]
            old_q = old_questions.get(old.get('question'))
            if old_q: m.update(sourceKind=old_q['kind'], sourceRepeat=old_q.get('repeat', ''))
            if old['status'] in {'ignored', 'excluded'}:
                m.update(question='', option='', status=old['status'], reason='Previously ignored metadata' if old['status'] == 'ignored' else 'Previously ignored by you')
            elif old.get('question') in matches and old['status'] == 'matched':
                qid = matches[old['question']]
                codes = {c['name'] for c in targets[qid]['choices']}
                if old.get('option') and old['option'] not in codes:
                    m.update(question=qid, option='', status='ambiguous', reason='The previously linked answer option changed. Choose its current code.')
                else:
                    m.update(question=qid, option=old.get('option', ''), status='matched', reason='Reused confirmed link by worksheet and column header', sourceKind=targets[qid]['kind'], sourceRepeat=targets[qid].get('repeat', ''))
                    for field in ['mergeMode', 'priority']:
                        if field in old: m[field] = old[field]
                    valid = {a: b for a, b in old.get('answerMap', {}).items() if not b or b in codes}
                    m['answerMap'] = valid
                    if len(valid) != len(old.get('answerMap', {})): warnings.append(f"Some saved answer links for {m['header']} no longer exist. Review its answers.")
            elif old.get('question'):
                m.update(question='', option='', status='unmatched', reason='The saved question changed type, repeat context, or was removed. Link it again.')
                warnings.append(f"Saved link for {m['header']} could not be reused safely.")
        elif previous:
            m.update(question='', option='', status='ambiguous', reason='Duplicate source identities prevent safely reusing the saved link.')
        m.setdefault('reason', 'Exact question path, name, or label' if m['status'] == 'matched' else 'Review this source column')
        result.append(m)
    for key, links in prior.items():
        if key not in counts and any(link.get('question') for link in links):
            warnings.append(f'Saved source column {key[1]} is absent from the replacement data. Its previous link was not applied.')
    return result, warnings


def validate_links(form, sheets, mappings):
    from .kobo import aliases, norm
    questions = {q['id']: q for q in form['questions']}
    groups = {g['id']: g for g in form['groups']}
    for m in mappings:
        if not m.get('question'): continue
        q = questions.get(m['question'])
        if q is None: raise ValueError('Mapping references an unknown question.')
        if not 0 <= m['sheet'] < len(sheets) or not 0 <= m['column'] < len(sheets[m['sheet']]['headers']): raise ValueError('Mapping column is outside its worksheet.')
        if m.get('sourceKind') and m['sourceKind'] != q['kind']: raise ValueError('Cannot link fields with incompatible types.')
        if m.get('sourceRepeat') is not None and m['sourceRepeat'] != q.get('repeat', ''): raise ValueError('Cannot link fields across repeat contexts.')
        if q.get('repeat'):
            group = groups[q['repeat']]
            if m['sheet'] == 0 or not any(norm(sheets[m['sheet']]['name']) == a or norm(sheets[m['sheet']]['name']).endswith('/' + a) for a in aliases(group)):
                raise ValueError('Repeat fields must be linked within their matching repeat worksheet.')
        elif m['sheet'] != 0: raise ValueError('Main-response fields cannot be linked to repeat worksheets.')
        codes = {c['name'] for c in q['choices']}
        if m.get('answerMap') and (q['kind'] not in {'category', 'multiple'} or m.get('option')): raise ValueError('Answer links apply only to categorical answer columns.')
        normalized_answers = {}
        for source, target in m.get('answerMap', {}).items():
            if not norm(source): raise ValueError('Answer link source cannot be blank.')
            if norm(source) in normalized_answers and normalized_answers[norm(source)] != target: raise ValueError('Answer links contain contradictory source codes or labels.')
            normalized_answers[norm(source)] = target
        if any(target and target not in codes for target in m.get('answerMap', {}).values()): raise ValueError('Answer link references an unknown current choice code.')
        if m.get('mergeMode', '') not in {'', 'coalesce', 'priority', 'blank'}: raise ValueError('Unknown field merge rule.')


def decoded_value(raw, question, mapping):
    from .kobo import decode_choice, missing, norm
    if missing(raw): return None, None
    kind = question['kind']
    if kind in {'category', 'multiple'}:
        answer_map = mapping.get('answerMap', {})
        raw_text = str(raw).strip()
        # An explicit exact mapping takes precedence over current codes and labels.
        direct = {norm(k): v for k, v in answer_map.items()}
        if norm(raw_text) in direct:
            target = direct[norm(raw_text)]
            if target and target not in {c['name'] for c in question['choices']}: return None, 'answer is outside the current choice filter'
            return ([target] if target else None) if kind == 'multiple' else (target or None), None
        if not answer_map:
            values, error = decode_choice(raw_text, question, kind == 'multiple')
            return (sorted(set(values)) or None) if kind == 'multiple' else (values[0] if values else None), error
        # Internal codes let an explicit link override an existing code or label
        # without leaving the old alias ambiguous in the current dictionary.
        q = {**question, 'choices': []}
        decoded_codes = {}
        code_ids = {}
        for index, choice in enumerate(question['choices']):
            internal = f'__kobo_choice_{index}__'
            decoded_codes[internal] = choice['name']
            code_ids[choice['name']] = internal
            choice_labels = {k: v for k, v in choice.get('labels', {}).items() if norm(v) not in direct}
            if norm(choice['name']) not in direct: choice_labels['source_code'] = choice['name']
            q['choices'].append({'name': internal, 'labels': choice_labels})
        ignored = '__kobo_ignored_answer__'
        q['choices'].append({'name': ignored, 'labels': {}})
        for source, target in answer_map.items():
            if target and target not in code_ids: continue
            internal = code_ids[target] if target else ignored
            next(c for c in q['choices'] if c['name'] == internal)['labels']['link_' + source] = source
        values, error = decode_choice(raw_text, q, kind == 'multiple')
        values = [decoded_codes[v] for v in values if v in decoded_codes]
        return (sorted(set(values)) or None) if kind == 'multiple' else (values[0] if values else None), error
    if kind == 'number':
        import re
        try:
            text = str(raw)
            if ',' in text and not re.fullmatch(r'[+-]?\d{1,3}(,\d{3})+(\.\d+)?', text): raise ValueError()
            value = float(text.replace(',', ''))
            if not math.isfinite(value) or (question['type'] == 'integer' and not value.is_integer()): raise ValueError()
            return value, None
        except (ValueError, TypeError): return None, 'invalid numeric answer'
    if kind == 'date':
        try:
            if isinstance(raw, (int, float)):
                import openpyxl
                raw = openpyxl.utils.datetime.from_excel(raw).isoformat()
            return datetime.fromisoformat(str(raw).replace('Z', '+00:00')).isoformat(), None
        except (ValueError, TypeError): return None, 'invalid date answer (expected ISO date)'
    return str(raw).strip(), None


def reconcile_values(question, mappings, row, issues, review, sheet, row_number):
    from .kobo import missing
    candidates = []
    for mapping in sorted(mappings, key=lambda m: (m.get('priority', 0), m['column'])):
        if mapping.get('option'): continue
        raw = row[mapping['column']] if mapping['column'] < len(row) else None
        value, error = decoded_value(raw, question, mapping)
        if error: issues[(question['id'], error)] += 1
        if not missing(value): candidates.append((mapping, value, raw))
    distinct = {repr(value) for _, value, _ in candidates}
    conflict = len(distinct) > 1
    modes = {m.get('mergeMode', '') for m in mappings if not m.get('option')}
    mode = next(iter(modes)) if len(modes) == 1 else ''
    if conflict:
        qid = question['id']
        if review is not None:
            entry = review.setdefault('conflicts', {}).setdefault(qid, {'count': 0, 'examples': []})
            entry['count'] += 1
            if len(entry['examples']) < 10:
                entry['examples'].append({'sheet': sheet, 'row': row_number, 'values': [{'column': m.get('header') or str(m['column'] + 1), 'value': raw} for m, _, raw in candidates]})
        if mode not in {'priority', 'blank'}: issues[(qid, 'conflicting mapped columns - choose a merge decision')] += 1
        if mode != 'priority': return None
    return candidates[0][1] if candidates else None


def review_details(form, sheets, mappings, policies=None):
    from .kobo import normalize, missing
    review = {}
    _, issues = normalize(form, sheets, mappings, policies, review=review)
    columns = {}
    for m in mappings:
        sheet = sheets[m['sheet']]
        values = Counter(str(r[m['column']]).strip() for r in sheet['rows'] if m['column'] < len(r) and not missing(r[m['column']]))
        columns[f"{m['sheet']}:{m['column']}"] = {'samples': list(values)[:3], 'values': [{'value': v, 'count': n} for v, n in values.most_common(200)], 'distinct': len(values)}
    grouped = defaultdict(list)
    for m in mappings:
        if m.get('question'): grouped[m['question']].append(m)
    merged = [qid for qid, links in grouped.items() if len([m for m in links if not m.get('option')]) > 1]
    review.update(columns=columns, merged=merged, noSource=[q['id'] for q in form['questions'] if q['id'] not in grouped and not q.get('metadata')])
    return issues, review


def suggest_links(form, sheets, mappings):
    from difflib import SequenceMatcher
    from .kobo import aliases, norm
    groups = {g['id']: g for g in form['groups']}
    questions = {q['id']: q for q in form['questions']}
    for m in mappings:
        if m['status'] == 'matched' and m.get('question') in questions:
            q = questions[m['question']]
            m.setdefault('sourceKind', q['kind'])
            m.setdefault('sourceRepeat', q.get('repeat', ''))
        m.setdefault('reason', 'Exact question path, name, or label' if m['status'] == 'matched' else 'Automatically ignored metadata' if m['status'] == 'ignored' else 'No unique exact match')
        if m['status'] != 'unmatched': continue
        scored = []
        for q in form['questions']:
            if q.get('metadata'): continue
            if m['sheet'] == 0 and q.get('repeat') or m['sheet'] != 0 and not q.get('repeat'): continue
            if q.get('repeat') and not any(norm(sheets[m['sheet']]['name']) == a or norm(sheets[m['sheet']]['name']).endswith('/' + a) for a in aliases(groups[q['repeat']])): continue
            score = max((SequenceMatcher(None, norm(m['header']), alias).ratio() for alias in aliases(q)), default=0)
            if score >= .72: scored.append((score, q['id']))
        if scored:
            m['candidates'] = [{'question': qid, 'option': ''} for _, qid in sorted(scored, reverse=True)[:3]]
            m['reason'] = 'Similar question name or label. Confirm the meaning before linking.'
    return mappings
