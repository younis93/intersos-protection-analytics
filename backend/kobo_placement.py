"""Stable analysis-only placement of uploaded fields."""
from copy import deepcopy
from typing import Literal
from pydantic import BaseModel

class FieldPlacement(BaseModel):
    position: Literal['first','last','before','after'] = 'last'
    reference: str = ''

def place_questions(questions):
    by_id = {q['id']: q for q in questions}
    before, after, roots, visiting, done, ordered = {}, {}, [], set(), set(), []
    for q in questions:
        p = q.get('placement')
        if not p or p['position'] in {'first','last'}:
            roots.append(q); continue
        target = by_id.get(p.get('reference'))
        if not target or target['id'] == q['id']:
            raise ValueError('Placement reference is unavailable. Choose a new position for ' + q['id'] + '.')
        if target['group'] != q['group'] or target['repeat'] != q['repeat']:
            raise ValueError('Placement reference must be in the selected group and repeat scope. Review ' + q['id'] + '.')
        (before if p['position']=='before' else after).setdefault(target['id'], []).append(q)
    def emit(q):
        key=q['id']
        if key in visiting: raise ValueError('Field placements form a cycle. Choose another reference question.')
        if key in done: return
        visiting.add(key)
        for child in before.get(key,[]): emit(child)
        ordered.append(q)
        for child in after.get(key,[]): emit(child)
        visiting.remove(key);done.add(key)
    # Separate sibling groups without changing their first-appearance order.
    for group in dict.fromkeys(q['group'] for q in questions):
        siblings=[q for q in roots if q['group']==group]
        for phase in ['first','normal','last']:
            for q in siblings:
                kind=q.get('placement',{}).get('position','normal') if q.get('placement') else 'normal'
                if kind==phase: emit(q)
    for q in questions:
        if q['id'] not in done: emit(q)
    # Replace only sibling slots to preserve legacy nesting and group order.
    buckets={group:iter([q for q in ordered if q['group']==group]) for group in dict.fromkeys(q['group'] for q in questions)}
    result=[next(buckets[q['group']]) for q in questions]
    for i,q in enumerate(result): q['order']=i
    return result

def validate_group(form, group_id, repeat):
    groups={g['id']:g for g in form['groups']};current=group_id;seen=set();scope=''
    while current:
        if current not in groups or current in seen: raise ValueError('Choose an available field group.')
        seen.add(current);g=groups[current]
        if g['repeat']: scope=current;break
        current=g.get('parent','')
    if scope!=repeat: raise ValueError('Choose a group within this field’s repeat scope.')

def move_field(store,pid,body):
    import json
    from datetime import datetime
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT payload,updated FROM projects WHERE id=?',(pid,)).fetchone()
        if not row: raise KeyError('Project not found.')
        if row[1]!=body.updated: raise ValueError('The project changed. Reload before moving this field.')
        raw=json.loads(row[0]);form=raw['form'];q=next((q for q in form['questions'] if q['id']==body.field),None)
        if not q or not q.get('addedFromData'): raise ValueError('Only added fields can be moved.')
        validate_group(form,body.group,q['repeat'])
        q['group']=body.group;q['placement']=body.placement.model_dump() if body.placement else None
        form['questions']=place_questions(form['questions'])
        for added in raw.get('reviewConfig',{}).get('addedQuestions',[]):
            if added['id']==q['id']: added.update(group=q['group'],placement=q['placement'])
        db.execute('UPDATE projects SET payload=?,updated=? WHERE id=?',(json.dumps(raw,ensure_ascii=False),datetime.now().isoformat(),pid))


def placement_issues(questions):
    issues=[]
    by_id={q['id']:q for q in questions}
    for q in questions:
        p=q.get('placement')
        if not p: continue
        current=q;seen=set()
        while current.get('placement') and current['placement']['position'] in {'before','after'}:
            if current['id'] in seen:
                issues.append(dict(question=q['id'],message='Field placements form a cycle. Choose another reference question.',count=0));break
            seen.add(current['id']);target=by_id.get(current['placement'].get('reference'))
            if not target or target['group']!=current['group'] or target['repeat']!=current['repeat']:
                if current['id']==q['id']: issues.append(dict(question=q['id'],message='Placement reference is unavailable or outside the selected group. Choose a new position.',count=0))
                break
            current=target
    return issues
