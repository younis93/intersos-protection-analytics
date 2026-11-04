"""Required metadata recovery and bounded XLSForm required-rule interpretation."""
import hashlib
import threading

_forms = {}
_lock = threading.RLock()


def recover_required(project, form_raw=None):
    questions = project['form']['questions']
    if all(q.get('required') is not None for q in questions): return project
    source = {}
    if form_raw:
        key = hashlib.sha256(form_raw).hexdigest()
        with _lock:
            if key not in _forms:
                try:
                    from .kobo import parse_form
                    _forms[key] = {q['id']: q.get('required', '') for q in parse_form(form_raw)['questions']}
                except Exception:
                    # The source may be unavailable or an older non-XLSForm import.
                    _forms[key] = {}
                while len(_forms) > 8: _forms.pop(next(iter(_forms)))
            source = _forms[key]
    recovered = []
    for question in questions:
        required = question.get('required')
        if required is None:
            local = project.get('customConfig') or question.get('addedFromData') or question.get('localDerived') or question.get('derivedFrom')
            required = '' if local else source.get(question['id'])
        recovered.append({**question, 'required': required})
    return {**project, 'form': {**project['form'], 'questions': recovered}}


def required_plan(question, questions):
    from .kobo_connection_rules import parse_condition, tree_issues, fields_in
    raw = question.get('required')
    if raw is None: return {'constant': None, 'tree': None, 'fields': [], 'issues': ['required-metadata-unavailable']}
    normalized = str(raw).strip().lower()
    if normalized in {'yes', 'true', 'true()', '1'}:
        return {'constant': True, 'tree': None, 'fields': [], 'issues': []}
    if normalized in {'', 'no', 'false', 'false()', '0'}:
        return {'constant': False, 'tree': None, 'fields': [], 'issues': []}
    try:
        tree = parse_condition(str(raw), question, questions, allow_unresolved=True)
        return {'constant': None, 'tree': tree, 'fields': fields_in(tree), 'issues': tree_issues(tree, question, questions)}
    except ValueError:
        return {'constant': None, 'tree': None, 'fields': [], 'issues': ['unsupported-required-condition']}
