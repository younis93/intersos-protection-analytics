"""Named analysis setups. Source records and shared indicators are never copied."""
from .kobo import AnalysisViewSettings, KoboSettings, breakdown_fields, new_project_settings
from .kobo_trends import validate_chart_settings


def snapshot_issues(project, snapshot):
    questions = {q['id']: q for q in project['form']['questions']}
    issues = []
    referenced = set(snapshot.hidden) | set(snapshot.filterFields) | set(snapshot.questions) | set(snapshot.dateFilterModes)
    referenced |= {f.field for f in snapshot.filters}
    for qid in sorted(referenced - questions.keys()): issues.append(f'Question no longer exists: {qid}.')
    for qid in snapshot.dateFilterModes:
        if qid in questions and questions[qid]['kind'] != 'date': issues.append(f'{questions[qid]["name"]}: date filter column type changed.')
    for rule in snapshot.filters:
        q = questions.get(rule.field)
        if not q: continue
        expected = q['kind'] if q['kind'] in {'number', 'date'} else 'category'
        if rule.kind != expected: issues.append(f'{q["name"]}: filter type is incompatible.')
        if rule.kind == 'category' and q['kind'] in {'category', 'multiple'}:
            codes = {c['name'] for c in q['choices']} | {'__blank__'}
            if not set(rule.values) <= codes: issues.append(f'{q["name"]}: saved filter includes unavailable answer codes.')
    for qid, cfg in snapshot.questions.items():
        if qid not in questions: continue
        try: breakdown_fields(cfg, questions, questions[qid])
        except ValueError as exc: issues.append(f'{questions[qid]["name"]}: {exc}')
    try: validate_chart_settings(questions, snapshot)
    except ValueError as exc: issues.append(str(exc))
    return list(dict.fromkeys(issues))


def apply_saved_view(project, settings, view_id):
    view = next((v for v in settings.savedViews if v.id == view_id), None)
    if view is None: raise ValueError('This saved view no longer exists.')
    issues = list(dict.fromkeys([*view.reviewIssues, *saved_view_issues(project, view)]))
    if issues: raise ValueError('Review this saved view before opening it:\n'+'\n'.join(issues))
    return KoboSettings.model_validate({**settings.model_dump(), **view.snapshot.model_dump(), 'activeViewId': view.id})


def apply_default_view(project, settings):
    snapshot = AnalysisViewSettings.model_validate(new_project_settings(project['form']).model_dump())
    return KoboSettings.model_validate({**settings.model_dump(), **snapshot.model_dump(), 'activeViewId': ''})


def saved_view_issues(project, view):
    issues = snapshot_issues(project, view.snapshot)
    questions = {q['id']: q for q in project['form']['questions']}
    for qid, kind in view.questionKinds.items():
        if qid not in questions: issues.append(f'Question no longer exists: {qid}.')
        elif questions[qid]['kind'] != kind: issues.append(f'{questions[qid]["name"]}: question type changed.')
    return list(dict.fromkeys(issues))
