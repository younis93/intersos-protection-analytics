"""Verify saved relevance against the source without activating recovered rules."""
from collections import Counter, OrderedDict
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import threading

from pydantic import BaseModel, Field

_forms = OrderedDict()
_lock = threading.RLock()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def conditions(question):
    return {'relevant': str(question.get('relevant') or '').strip(),
            'inheritedRelevant': [{'source': str(r.get('source', '')), 'expression': str(r.get('expression') or '').strip()}
                                 for r in question.get('inheritedRelevant', []) if str(r.get('expression') or '').strip()]}


def configuration(settings, qid):
    cfg = settings.get('questions', {}).get(qid, {})
    source=cfg.get('connectionSource', 'automatic')
    return [source, cfg.get('connectionRules') if source == 'manual' else None]


def valid_connection(project, settings, qid, manual_only=False):
    from .kobo import KoboSettings, resolved_question_settings
    from .kobo_connections import connection_plan, form_question_index
    from .kobo_question_flow import cyclic_nodes
    questions = form_question_index(project['form'])
    if qid not in questions: return False
    settings = KoboSettings.model_validate(settings)
    cfg = resolved_question_settings(questions[qid], settings)
    if manual_only and cfg.connectionSource != 'manual': return False
    plans = {key: connection_plan(q, resolved_question_settings(q, settings), questions) for key, q in questions.items()}
    plan = plans[qid]
    cycles = cyclic_nodes(list(questions), [(key, f) for key, p in plans.items() for f in p['fields'] if f in questions])
    return bool(plan['tree']) and not plan['reviewIssues'] and qid not in cycles and not any(f in cycles for f in plan['fields'])


def hydrate_connections(project, form_raw=None):
    if project.get('customConfig'): return project
    from .kobo_connections import form_question_index
    effective_questions = form_question_index(project['form'])
    source = None
    if form_raw:
        key = hashlib.sha256(form_raw).hexdigest()
        with _lock:
            if key not in _forms:
                try:
                    from .kobo import parse_form
                    parsed = parse_form(form_raw)
                    indexed = form_question_index(parsed)
                    _forms[key] = [{**q, **conditions(indexed[q['id']])} for q in parsed['questions']]
                except Exception:
                    _forms[key] = None
                while len(_forms) > 8: _forms.popitem(last=False)
            source = _forms[key]
    original = {}
    for q in source or []: original.setdefault(q['id'], []).append(q)
    counts = Counter(q['id'] for q in project['form']['questions'])
    confirmations = project.get('connectionVerification', {})
    settings = project.get('settings', {})
    questions = []
    for question in project['form']['questions']:
        q = {k: v for k, v in question.items() if k != 'connectionSetup'}
        qid = q['id']
        current_conditions=conditions(effective_questions.get(qid,q))
        if q.get('metadata') or q.get('addedFromData') or q.get('localDerived') or q.get('derivedFrom'):
            questions.append(q); continue
        matches = original.get(qid, [])
        recovered, issue = None, ''
        if counts[qid] != 1 or len(matches) > 1: issue = 'ambiguous-question-identity'
        elif len(matches) == 1: recovered = conditions(matches[0])
        elif source is not None: issue = 'source-question-not-found'
        elif q.get('relevanceMetadataVersion') == 1 and 'relevant' in q and 'inheritedRelevant' in q:
            recovered = current_conditions
        else: issue = 'source-form-unavailable'
        source_fp = digest([qid, recovered, issue])
        rule_fp = digest(configuration(settings, qid))
        confirmed = confirmations.get(qid)
        manual = valid_connection(project, settings, qid, manual_only=True) if configuration(settings, qid)[0] == 'manual' else False
        if manual and not confirmed:
            questions.append(q); continue
        changed = bool(confirmed and (confirmed.get('sourceFingerprint') != source_fp or confirmed.get('ruleFingerprint') != rule_fp))
        if confirmed and not changed and manual:
            questions.append(q); continue
        connected = bool(recovered and (recovered['relevant'] or recovered['inheritedRelevant']))
        missing = recovered is not None and current_conditions != recovered
        pending = changed or bool(issue) or missing
        if pending:
            reason = ('source-condition-changed' if confirmed.get('sourceFingerprint') != source_fp else 'configured-connection-changed') if changed else issue or ('missing-form-connection' if connected and not (current_conditions['relevant'] or current_conditions['inheritedRelevant']) else 'source-condition-mismatch')
            q['connectionSetup'] = {'pending': True, 'reason': reason, 'sourceFingerprint': source_fp,
                'recovered': recovered, 'fingerprint': digest([qid, source_fp, rule_fp, current_conditions, confirmed])}
        questions.append(q)
    # Group only identical complete source conditions in the same response scope.
    # Additional question conditions and manual overrides must never be overwritten.
    shared = {}
    for q in questions:
        setup = q.get('connectionSetup') or {}
        recovered = setup.get('recovered')
        if not recovered or configuration(settings, q['id'])[0] != 'automatic': continue
        expressions = sorted(set([recovered['relevant']] + [r['expression'] for r in recovered['inheritedRelevant']]) - {''})
        if not expressions: continue
        shared.setdefault(digest([q.get('repeat', ''), expressions]), []).append(q)
    for members in shared.values():
        if len(members) < 2: continue
        identities = sorted((q['id'], q['connectionSetup']['fingerprint']) for q in members)
        info = {'fingerprint': digest(identities), 'questions': [qid for qid, _ in identities]}
        for q in members: q['connectionSetup']['shared'] = info
    return {**project, 'form': {**project['form'], 'questions': questions}}


def setup_items(project):
    return {q['id']: {**q['connectionSetup'], 'question': q['id'], 'labels': q.get('labels', {}), 'name': q['name']}
            for q in project['form']['questions'] if (q.get('connectionSetup') or {}).get('pending')}


def preview_project(project, qid):
    result = deepcopy(project)
    question = next((q for q in result['form']['questions'] if q['id'] == qid), None)
    if not question: raise ValueError('Question not found.')
    setup = question.get('connectionSetup')
    if setup and setup.get('recovered'):
        question.update(setup['recovered'])
        question['connectionVerifiedInheritance']=True
    return result


class ConnectionSetupRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    fingerprint: str = Field(min_length=1, max_length=1000)
    settings: dict
    sharedFingerprint: str | None = None


def confirm_connection(store, pid, request):
    from .kobo import KoboSettings
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT payload,settings,form FROM projects WHERE id=?', (pid,)).fetchone()
        if row is None: raise KeyError('Project not found.')
        raw, settings = json.loads(row[0]), json.loads(row[1])
        project = hydrate_connections({**raw, 'settings': settings}, bytes(row[2]))
        from .kobo_shared_dependencies import annotate, restore_stale_targets
        project = annotate(project)
        from .kobo_question_conditions import annotate as annotate_question_conditions
        project = annotate_question_conditions(project)
        matches = [q for q in project['form']['questions'] if q['id'] == request.question]
        if len(matches) != 1: raise ValueError('This question identity is ambiguous. Review the source form.')
        setup = matches[0].get('connectionSetup')
        if not setup or setup['fingerprint'] != request.fingerprint:
            raise ValueError('The connection changed. Reopen Edit connection and review it again.')
        if request.sharedFingerprint:
            shared = setup.get('shared')
            if not shared or shared['fingerprint'] != request.sharedFingerprint:
                raise ValueError('The shared connection changed. Review the affected questions again.')
            if configuration(request.settings, request.question) != configuration(settings, request.question):
                raise ValueError('Shared confirmation restores source rules only. Save manual changes individually.')
            # Validate every full rule before writing anything, including its own extra predicates.
            candidate = deepcopy(project)
            for qid in shared['questions']: candidate = preview_project(candidate, qid)
            for qid in shared['questions']:
                if not valid_connection(candidate, settings, qid):
                    raise ValueError('A dependent connection cannot be checked. Review it individually.')
            for qid in shared['questions']:
                evidence = next(q['connectionSetup'] for q in project['form']['questions'] if q['id'] == qid)
                target = next(q for q in raw['form']['questions'] if q['id'] == qid)
                target.update(evidence['recovered'])
                target.update(relevanceMetadataVersion=1, connectionVerifiedInheritance=True)
                raw.setdefault('connectionVerification', {})[qid] = {
                    'sourceFingerprint': evidence['sourceFingerprint'],
                    'ruleFingerprint': digest(configuration(settings, qid)),
                    'at': datetime.now(timezone.utc).isoformat()}
            restore_stale_targets(project,raw,shared['questions'])
            db.execute('UPDATE projects SET payload=?,updated=? WHERE id=?',
                       (json.dumps(raw, ensure_ascii=False), datetime.now().isoformat(), pid))
            return hydrate_connections({**raw, 'settings': settings}, bytes(row[2]))
        proposed = KoboSettings.model_validate(request.settings)
        settings.setdefault('questions', {})[request.question] = proposed.questions.get(request.question).model_dump() if request.question in proposed.questions else {}
        candidate = preview_project(project, request.question)
        recovered=setup.get('recovered')
        confirmed_all=recovered is not None and not recovered['relevant'] and not recovered['inheritedRelevant'] and configuration(settings,request.question)[0]=='automatic'
        if not confirmed_all and not valid_connection(candidate, settings, request.question):
            raise ValueError('Complete a supported connection with valid references before saving.')
        target = next(q for q in raw['form']['questions'] if q['id'] == request.question)
        if setup.get('recovered'): target.update(setup['recovered'])
        target['relevanceMetadataVersion'] = 1
        target['connectionVerifiedInheritance'] = True
        raw.setdefault('connectionVerification', {})[request.question] = {
            'sourceFingerprint': setup['sourceFingerprint'], 'ruleFingerprint': digest(configuration(settings, request.question)),
            'at': datetime.now(timezone.utc).isoformat()}
        restore_stale_targets(project,raw,[request.question])
        db.execute('UPDATE projects SET payload=?,settings=?,updated=? WHERE id=?',
                   (json.dumps(raw, ensure_ascii=False), json.dumps(settings, ensure_ascii=False), datetime.now().isoformat(), pid))
    return store.get(pid)


def resolve_ignored_setup(project):
    """Verified ignored gates and valid remaining source rules need no setup."""
    if not any((q.get("connectionSetup") or {}).get("pending") and (q.get("ignoredConnectionRules") or q.get("ignoredSourceConditions")) for q in project["form"]["questions"]):
        return project
    from .kobo import KoboSettings, resolved_question_settings
    from .kobo_connections import connection_plan
    from .kobo_question_flow import cyclic_nodes
    from .kobo_shared_dependencies import context
    _, questions = context(project)
    settings = KoboSettings.model_validate(project.get('settings', {}))
    plans = {key: connection_plan(source, resolved_question_settings(source, settings), questions) for key, source in questions.items()}
    cycles = cyclic_nodes(list(questions), [(key, field) for key, plan in plans.items() for field in plan['fields'] if field in questions])
    for q in project['form']['questions']:
        setup = q.get('connectionSetup') or {}
        if not setup.get('pending') or not setup.get('recovered') or q.get('dependencyReviewNeeded'):
            continue
        if setup.get('reason') in {'source-condition-changed', 'configured-connection-changed', 'ambiguous-question-identity', 'source-question-not-found'}:
            continue
        if not (q.get('ignoredConnectionRules') or q.get('ignoredSourceConditions')):
            continue
        source = questions[q['id']]
        cfg = resolved_question_settings(source, settings)
        if cfg.connectionSource == 'manual':
            continue
        plan = plans[q['id']]
        if plan['reviewIssues'] or plan['issue'] or q['id'] in cycles or any(field in cycles for field in plan['fields']):
            continue
        # Retain recovered source metadata for the ignored-condition display.
        # This is runtime hydration only; saved source and review history stay intact.
        q.update(setup['recovered'])
        q['connectionVerifiedInheritance'] = True
        q.pop('connectionSetup', None)
    # Automatic resolution can remove members from a previously shared setup.
    # Bulk confirmation must only refer to questions that still need setup.
    shared = {}
    for q in project['form']['questions']:
        setup = q.get('connectionSetup') or {}
        previous = setup.pop('shared', None)
        if setup.get('pending') and previous:
            shared.setdefault(previous['fingerprint'], []).append(q)
    for members in shared.values():
        if len(members) < 2:
            continue
        identities = sorted((q['id'], q['connectionSetup']['fingerprint']) for q in members)
        info = {'fingerprint': digest(identities), 'questions': [qid for qid, _ in identities]}
        for q in members:
            q['connectionSetup']['shared'] = info
    return project
