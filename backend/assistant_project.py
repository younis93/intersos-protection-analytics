"""Project-scoped assistant state stored with portable project backups."""
from datetime import datetime, timezone
import json

from fastapi import HTTPException
from pydantic import BaseModel, Field

from .kobo_import_links import form_changes
from .kobo import AssistantAnalysisRecipe


def field_snapshot(form):
    keys = ('id', 'name', 'labels', 'type', 'kind', 'repeat', 'choices', 'required', 'relevant')
    return {'questions': [{key: field[key] for key in keys if key in field}
                          for field in form['questions']]}


def remember_fields(payload, previous=None, form=None):
    state = payload.setdefault('assistant', dict((previous or {}).get('assistant', {})))
    now = datetime.now(timezone.utc).isoformat()
    current = field_snapshot(form or payload['form'])
    if previous and not state.get('schema'):
        from .kobo_edits import effective_project
        state['schema'] = field_snapshot(effective_project(previous)['form'])
        state['baseline'] = now
    prior = state.get('schema')
    if prior == current:
        return
    state['schema'] = current
    if prior is None:
        state['baseline'] = now
        return
    changes = form_changes(prior, current)['items']
    prior_fields = {field['id']: field for field in prior['questions']}
    for field in current['questions']:
        before = prior_fields.get(field['id'])
        if before and any(before.get(key) != field.get(key) for key in ('required', 'relevant')):
            changes.append({'question': field['id'], 'change': 'Required or display rule changed'})
    if changes:
        state['fieldHistory'] = [*state.get('fieldHistory', []), {'at': now, 'changes': changes}][-50:]


def remember_upload(payload, previous, current, prior, hidden=()):
    """Record a change summary for the last replacement source."""
    from .kobo import missing
    hidden = set(hidden)

    def eligible(project):
        return {q['id'] for q in project['form']['questions']
                if not q.get('identifying') and not q.get('metadata') and not q.get('repeat') and q['id'] not in hidden}

    def missing_counts(project, fields):
        counts = dict.fromkeys(fields, 0)
        total = 0
        for record in project['records']:
            if record.get('scope'):
                continue
            total += 1
            values = record['values']
            for field in fields:
                counts[field] += missing(values.get(field))
        return total, counts

    fields = sorted(eligible(prior) & eligible(current))
    before_total, before = missing_counts(prior, fields)
    after_total, after = missing_counts(current, fields)
    changes = form_changes(field_snapshot(prior['form']), field_snapshot(current['form']))['items']
    visible = eligible(prior) | eligible(current)
    increasing = [field for field in fields if after_total and after[field]*max(1, before_total) > before[field]*after_total]
    increasing.sort(key=lambda field: (-after[field], field))
    payload.setdefault('assistant', dict(previous.get('assistant', {})))['upload'] = {
        'at': datetime.now(timezone.utc).isoformat(),
        'changes': [change for change in changes if change['question'] in visible][:100],
        'missingIncreases': [{'field': field, 'before': before[field], 'after': after[field]} for field in increasing[:50]],
        'beforeTotal': before_total, 'afterTotal': after_total,
    }


class Turn(BaseModel):
    question: str = Field(max_length=6000)
    answer: str = Field(max_length=16000)


class ProjectPreferences(BaseModel):
    outline: str | None = Field(default=None, max_length=4500)
    conversation: list[Turn] | None = Field(default=None, max_length=12)
    analyses: list[AssistantAnalysisRecipe] = Field(default_factory=list, max_length=30)


def mount_project_assistant(router, store):
    @router.get('/projects/{pid}/assistant')
    def assistant_project(pid: str):
        with store.connect() as db:
            row = db.execute("SELECT json_extract(payload, '$.assistant') FROM projects WHERE id=?", (pid,)).fetchone()
        if not row:
            raise HTTPException(404, 'Project not found.')
        saved = json.loads(row[0]) if row[0] else {}
        return {key: saved[key] for key in ('outline', 'conversation', 'analyses', 'baseline', 'fieldHistory', 'upload') if key in saved}

    @router.patch('/projects/{pid}/assistant')
    def update_assistant_project(pid: str, body: ProjectPreferences):
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT payload FROM projects WHERE id=?', (pid,)).fetchone()
            if not row:
                raise HTTPException(404, 'Project not found.')
            payload = json.loads(row[0])
            state = payload.setdefault('assistant', {})
            state.update(body.model_dump(exclude_unset=True))
            db.execute('UPDATE projects SET payload=? WHERE id=?',
                       (json.dumps(payload, ensure_ascii=False), pid))
        return {'saved': True}
