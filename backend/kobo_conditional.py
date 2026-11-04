"""Conditional answer review over effective, unfiltered records.

Review decisions never alter imported values. Analysis gets a separate projection.
"""
from collections import Counter, OrderedDict
from datetime import datetime, timezone
from hashlib import sha256
import json
import threading

from pydantic import BaseModel, Field
from typing import Literal

_cache = OrderedDict()
_lock = threading.RLock()


def digest(value):
    return sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


class ReviewItem(BaseModel):
    record: str
    question: str
    fingerprint: str


class ConditionalAction(BaseModel):
    revision: str
    settings: dict
    action: Literal['ignore', 'exclude', 'reopen', 'restore']
    items: list[ReviewItem] = Field(min_length=1, max_length=1000)


def caption(value, question, language):
    from .kobo import label, missing
    if missing(value): return ''
    labels = {c['name']: label(c, language) for c in question.get('choices', [])}
    if isinstance(value, list): return ', '.join(labels.get(str(v), str(v)) for v in value)
    return labels.get(str(value), str(value))


def scan(project, settings):
    """Find applicable missing answers and conflicts without changing stored values."""
    from .kobo import resolved_question_settings, missing, label
    from .kobo_connections import connection_plan, form_question_index, semantic_form
    from .kobo_connection_rules import matches_tree, describe_tree
    from .kobo_question_flow import cyclic_nodes
    from .kobo_required import required_plan, recover_required
    project = recover_required(project.get('_conditionalSource', project))
    questions = form_question_index(project['form'])
    configs = {key: resolved_question_settings(q, settings) for key, q in questions.items()}
    key = digest(['review-v3', project.get('id'), semantic_form(project['form']), project['records'],
                  {key: [cfg.connectionSource, cfg.connectionRules] for key, cfg in configs.items()},
                  project.get('conditionalReview', {}), settings.language])
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    lookup = {r['id']: r for r in project['records']}
    kinds = {key: q['kind'] for key, q in questions.items()}
    plans = {key: connection_plan(q, configs[key], questions) for key, q in questions.items()}
    required = {key: required_plan(q, questions) for key, q in questions.items()}
    edges = [(key, field) for key, plan in plans.items() for field in plan['fields'] if field in questions]
    cycles = cyclic_nodes(list(questions), edges)
    required_cycles = cyclic_nodes(list(questions), edges + [(key, field) for key, plan in required.items() for field in plan['fields'] if field in questions])
    groups = {g['id']: g for g in project['form']['groups']}
    decisions = project.get('conditionalReview', {}).get('decisions', {})
    rows, coverage = [], Counter()
    def resolve(record, field):
        current, seen = record, set()
        while current['scope'] != field['repeat']:
            if current['id'] in seen: return None, None, 'cyclic-parent-link'
            seen.add(current['id']); current = lookup.get(current.get('parent'))
            if current is None: return None, None, 'missing-parent-link'
        return current['values'].get(field['id']), current, ''
    def controls_for(record, fields):
        controls, values, errors = [], {}, []
        for field_id in dict.fromkeys(fields):
            field = questions.get(field_id)
            if field is None:
                errors.append('missing-rule-question'); continue
            actual, owner, error = resolve(record, field)
            if error: errors.append(error)
            if not missing(actual) and actual != []:
                if field['kind'] == 'number':
                    import math
                    if isinstance(actual, bool) or not isinstance(actual, (int, float)) or not math.isfinite(actual): errors.append('invalid-controlling-answer')
                elif field['kind'] in {'category', 'multiple'}:
                    codes = {c['name'] for c in field['choices']}
                    selected = actual if isinstance(actual, list) else [actual]
                    if field['kind'] == 'multiple' and not isinstance(actual, list) or any(str(v) not in codes for v in selected): errors.append('invalid-controlling-answer')
                elif field['kind'] == 'date':
                    try: datetime.fromisoformat(str(actual).replace('Z', '+00:00'))
                    except (ValueError, TypeError): errors.append('invalid-controlling-answer')
            values[field_id] = actual
            controls.append({'question': field_id, 'label': label(field, settings.language), 'answer': caption(actual, field, settings.language),
                             'value': actual, 'record': owner['id'] if owner else '', 'row': owner['row'] if owner else 0,
                             'identity': owner.get('sourceIdentity') or owner['id'] if owner else ''})
        return controls, values, errors
    for qid, q in questions.items():
        if q.get('metadata') or (q.get('connectionSetup') or {}).get('pending'): continue
        plan, req = plans[qid], required[qid]
        has_condition = bool(plan['tree'] or plan['reviewIssues'])
        if not has_condition and req['constant'] is False: continue
        coverage['questions'] += 1
        problems = list(plan['reviewIssues']) if has_condition else []
        if has_condition and (qid in cycles or any(field in cycles for field in plan['fields'])): problems.append('cyclic-dependency')
        group, seen = q.get('group'), set()
        while group in groups:
            if group in seen:
                problems.append('cyclic-group'); break
            seen.add(group); group = groups[group].get('parent')
        expression = describe_tree(plan['tree'], questions, settings.language) if has_condition and not problems else ''
        raw_conditions = [entry['expression'] for entry in q.get('inheritedRelevant', [])] + ([q['relevant']] if q.get('relevant') else [])
        for record in project['records']:
            if record['scope'] != q['repeat']: continue
            value = record['values'].get(qid)
            blank = missing(value) or value == []
            if not blank and not has_condition: continue
            controls, values, errors = controls_for(record, plan['fields'] if has_condition else [])
            errors += problems
            if has_condition and not plan['tree']: errors.append('incomplete-condition')
            if blank and errors and has_condition and plan['source'] != 'manual':
                # Each inherited rule is ANDed with the question rule. A known
                # false ancestor makes a blank appropriate even if another part
                # uses an unsupported expression.
                from .kobo_connection_rules import parse_condition, tree_issues, fields_in
                proven_false = False
                for raw in raw_conditions:
                    try:
                        node = parse_condition(raw, q, questions)
                        from .kobo_shared_dependencies import prune,rule_key
                        for ignored in q.get('ignoredConnectionRules',[]):node=prune(node,rule_key(ignored))
                        if node is None:continue
                        if any(raw==entry['expression'] for entry in q.get('ignoredSourceConditions',[])):continue
                        _, resolved, issues = controls_for(record, fields_in(node))
                        if not issues and not tree_issues(node, q, questions) and not matches_tree(node, resolved.get, kinds):
                            proven_false = True; break
                    except ValueError: pass
                if proven_false: continue
            applicable = None if errors else not has_condition or matches_tree(plan['tree'], values.get, kinds)
            if applicable is False and blank: continue
            required_description = ''
            if errors: outcome = 'uncheckable'
            elif not blank:
                coverage['evaluated'] += 1
                if applicable: continue
                outcome = 'conflict'
            else:
                # Only applicable blanks need their required expression evaluated.
                extra_controls, extra_values, extra_errors = controls_for(record, req['fields'])
                controls = list({c['question']: c for c in [*controls, *extra_controls]}.values())
                values.update(extra_values); errors += req['issues'] + extra_errors
                if qid in required_cycles and req['tree']: errors.append('cyclic-required-dependency')
                if errors: outcome = 'uncheckable'
                else:
                    is_required = req['constant'] if req['constant'] is not None else matches_tree(req['tree'], values.get, kinds)
                    required_description = describe_tree(req['tree'], questions, settings.language) if req['tree'] else ''
                    coverage['evaluated'] += 1
                    if is_required: outcome = 'required-missing'
                    elif has_condition: outcome = 'connected-blank'
                    else: continue
            coverage[outcome] += 1
            evidence = [qid, plan['source'], plan['tree'], raw_conditions if errors and plan['source'] != 'manual' else [], value,
                        [(c['question'], c['identity'], c['value']) for c in controls], sorted(set(errors))]
            # Preserve legacy fingerprints for nonblank conflicts and condition checks.
            if blank: evidence += [outcome, q.get('required'), req['tree']]
            fingerprint = digest(evidence)
            identity = digest([record['id'], qid])
            decision = decisions.get(identity, {})
            state = decision.get('status', 'open') if decision.get('fingerprint') == fingerprint else 'open'
            if outcome != 'conflict' and state == 'excluded': state = 'open'
            rows.append({'id': identity, 'record': record['id'], 'row': record['row'], 'scopeId': record['scope'],
                         'scope': label(groups[record['scope']], settings.language) if record['scope'] in groups else ('الاستجابات الرئيسية' if settings.language == 'ar' else 'Main submissions'),
                         'question': qid, 'label': label(q, settings.language), 'answer': caption(value, q, settings.language), 'value': value,
                         'condition': expression, 'requiredCondition': required_description, 'required': q.get('required'),
                         'source': plan['source'], 'controls': controls, 'rawConditions': raw_conditions if plan['source'] != 'manual' else [],
                         'manualRules': plan['tree'] if plan['source'] == 'manual' else None,
                         'outcome': outcome, 'issues': sorted(set(errors)), 'status': state, 'fingerprint': fingerprint})
    from .kobo_connection_setup import setup_items
    result = {'revision': key, 'rows': rows, 'coverage': dict(coverage), 'connectionSetups': setup_items(project)}
    with _lock:
        _cache[key] = result
        while len(_cache) > 8: _cache.popitem(last=False)
    return result


def condition_group(row):
    return digest([row['question'], row['source'], row.get('rawConditions'), row.get('manualRules'), row['issues'], row['outcome'], row.get('required') if row.get('value') in (None, '', []) else ''])


def matches_category(row, category):
    return category == 'all' or row['outcome'] in {'conflicts': {'conflict'}, 'checks': {'uncheckable'}, 'missing': {'required-missing', 'connected-blank'}}.get(category, set())


def review(project, settings, *, status='open', question='', search='', page=1, page_size=25, category='all', group=''):
    from .kobo import filtered_records
    result = scan(project, settings)
    eligible = {r['id'] for r in filtered_records(project, settings)} if settings.filters else {r['id'] for r in project['records']}
    rows = [r for r in result['rows'] if r['record'] in eligible]
    counts, questions, condition_questions, missing_questions, filter_questions = Counter(), {}, {}, {}, {}
    def count_question(container, row):
        container.setdefault(row['question'], {'label': row['label'], 'open': 0, 'ignored': 0, 'excluded': 0})[row['status']] += 1
    for row in rows:
        target = questions if row['outcome'] == 'conflict' else condition_questions if row['outcome'] == 'uncheckable' else missing_questions
        count_question(target, row)
        if target is missing_questions and row['status'] == 'open':
            key = 'required' if row['outcome'] == 'required-missing' else 'connected'
            target[row['question']][key] = target[row['question']].get(key, 0) + 1
        if matches_category(row, category):
            counts[row['status']] += 1
            count_question(filter_questions, row)
    query = search.strip().casefold()
    filtered = [r for r in rows if (status == 'all' or r['status'] == status) and (not question or r['question'] == question)
                and (not query or query in json.dumps(r, ensure_ascii=False).casefold())]
    # Scope totals stay stable while each category retains independent filters.
    summary = {'connectionSetupQuestions': len(result.get('connectionSetups', {})), 'conflicts': sum(r['outcome'] == 'conflict' for r in rows),
               'conditionGroups': len({condition_group(r) for r in rows if r['outcome'] == 'uncheckable'}),
               'uncheckedAnswers': sum(r['outcome'] == 'uncheckable' for r in rows),
               'requiredMissing': sum(r['outcome'] == 'required-missing' for r in rows), 'connectedBlank': sum(r['outcome'] == 'connected-blank' for r in rows)}
    selected = [r for r in filtered if matches_category(r, category)]
    grouped = {}
    for row in selected:
        if row['outcome'] != 'uncheckable': continue
        gid = condition_group(row)
        if gid not in grouped:
            grouped[gid] = {key: row[key] for key in ['question','label','condition','source','issues','rawConditions','manualRules']}
            grouped[gid].update(id=gid, count=0)
        grouped[gid]['count'] += 1
    if group: selected = [r for r in selected if condition_group(r) == group]
    show_groups = category == 'checks' and not group
    items = list(grouped.values()) if show_groups else selected
    start = (page-1)*page_size
    return {**result, 'rows': [] if show_groups else items[start:start+page_size], 'groups': items[start:start+page_size] if show_groups else [], 'matched': len(items),
            'summary': summary, 'counts': dict(counts), 'questions': questions, 'conditionQuestions': condition_questions,
            'missingQuestions': missing_questions, 'filterQuestions': filter_questions, 'page': page, 'pageSize': page_size,
            'coverage': {**result['coverage'], 'scopeFindings': len(rows)}}


def commit_review(store, pid, request):
    from .kobo import KoboSettings
    from .kobo_edits import effective_project
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        saved = db.execute('SELECT payload,form FROM projects WHERE id=?', (pid,)).fetchone()
        if saved is None: raise KeyError('Project not found.')
        from .kobo_required import recover_required
        payload = recover_required(json.loads(saved[0]), bytes(saved[1]))
        current = scan(store.get(pid), KoboSettings.model_validate(request.settings))
        if request.revision != current['revision']: raise ValueError('The data or review decisions changed. Refresh before applying this action.')
        lookup = {(r['record'], r['question']): r for r in current['rows']}
        chosen = []
        for item in request.items:
            row = lookup.get((item.record, item.question))
            if not row or row['fingerprint'] != item.fingerprint: raise ValueError('The condition evidence changed. Review this answer again.')
            if request.action == 'exclude' and row['outcome'] != 'conflict': raise ValueError('Only confirmed conflicts can be excluded.')
            chosen.append(row)
        state = {'ignore': 'ignored', 'exclude': 'excluded', 'reopen': 'open', 'restore': 'open'}[request.action]
        saved_review = payload.setdefault('conditionalReview', {})
        decisions = saved_review.setdefault('decisions', {})
        at = datetime.now(timezone.utc).isoformat()
        for row in chosen:
            decisions[row['id']] = {'record': row['record'], 'question': row['question'], 'fingerprint': row['fingerprint'], 'status': state, 'at': at, 'action': request.action}
        saved_review['revision'] = saved_review.get('revision', 0) + 1
        db.execute('UPDATE projects SET payload=?,updated=? WHERE id=?', (json.dumps(payload, ensure_ascii=False), at, pid))


def analysis_project(project, settings):
    """Mask explicitly excluded answers for every role, retaining raw review evidence."""
    if project.get('_conditionalSource') is not None: return project
    if not any(d.get('status') == 'excluded' for d in project.get('conditionalReview', {}).get('decisions', {}).values()): return project
    # Setup gates review, while analysis retains the previously configured rules.
    legacy = {**project, 'form': {**project['form'], 'questions': [{k:v for k,v in q.items() if k != 'connectionSetup'} for q in project['form']['questions']]}}
    result = scan(legacy, settings)
    excluded = {}
    for row in result['rows']:
        if row['status'] == 'excluded': excluded.setdefault(row['record'], set()).add(row['question'])
    if not excluded: return project
    records = [{**r, 'values': {**r['values'], **{qid: None for qid in excluded.get(r['id'], [])}},
                '_conditionalExcluded': sorted(excluded.get(r['id'], []))} for r in project['records']]
    return {**project, 'records': records, '_conditionalSource': project}


def preserve_review(previous, replacement, settings, *, same_source=False):
    """Row-based normalized IDs are never evidence of identity after a new upload."""
    from .kobo_edits import effective_project
    old = previous.get('conditionalReview')
    if not old: return
    replacement.pop('conditionalReview', None)
    if same_source:
        replacement['conditionalReview'] = old
        return  # Fingerprints still revalidate changed forms, values and controls.
    before, after = effective_project(previous), effective_project(replacement)
    before_rows, after_rows = before['records'], after['records']
    def identities(records):
        counts = Counter((r['scope'], r.get('sourceIdentity')) for r in records if r.get('sourceIdentity'))
        return {r['id']: (r['scope'], r['sourceIdentity']) for r in records if r.get('sourceIdentity') and counts[(r['scope'], r['sourceIdentity'])] == 1}
    old_ids, new_ids = identities(before_rows), identities(after_rows)
    destinations = {identity: rid for rid, identity in new_ids.items()}
    old_findings = {(r['record'], r['question']): r for r in scan(before, settings)['rows']}
    new_findings = {(r['record'], r['question']): r for r in scan(after, settings)['rows']}
    decisions = {}
    for decision in old.get('decisions', {}).values():
        identity = old_ids.get(decision['record'])
        rid = destinations.get(identity)
        prior = old_findings.get((decision['record'], decision['question']))
        current = new_findings.get((rid, decision['question']))
        if not prior or not current or current['fingerprint'] != decision['fingerprint'] or prior['fingerprint'] != decision['fingerprint']: continue
        # Every controlling record must also have a verifiable identity.
        if any(c['record'] not in old_ids for c in prior['controls']) or any(c['record'] not in new_ids for c in current['controls']): continue
        decisions[current['id']] = {**decision, 'record': rid}
    replacement['conditionalReview'] = {'revision': old.get('revision', 0) + 1, 'decisions': decisions}
