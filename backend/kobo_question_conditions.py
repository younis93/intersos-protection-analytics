"""Explicit, reversible review of whole source conditions for one question."""
from datetime import datetime, timezone
import json
from pydantic import BaseModel, Field
from .kobo_connection_setup import conditions, digest, configuration
from .kobo_shared_dependencies import context,source_fingerprint


def entries(q):
    return ([{'source':q['id'],'expression':q['relevant']}] if q.get('relevant','').strip() else [])+list(q.get('inheritedRelevant',[]))


def entry_id(entry): return digest([entry.get('source',''),entry['expression']])


def annotate(project):
    _,questions=context(project)
    for q in project['form']['questions']:
        q.pop('ignoredSourceConditions',None)
        saved=project.get('questionConditionOverrides',{}).get(q['id'])
        if not saved or configuration(project.get('settings',{}),q['id'])[0]=='manual':continue
        setup=q.get('connectionSetup') or {}
        if (setup.get('pending') and not setup.get('recovered')) or saved['sourceFingerprint']!=source_fingerprint(questions[q['id']],questions):
            q['dependencyReviewNeeded']=True
            q.setdefault('connectionSetup',{'pending':True,'reason':'source-condition-changed','sourceFingerprint':digest([q['id'],conditions(questions[q['id']]),'']),
                'recovered':conditions(questions[q['id']]),'fingerprint':digest([saved,conditions(questions[q['id']])])})
        else:q['ignoredSourceConditions']=saved['conditions']
    return project


class QuestionConditionsRequest(BaseModel):
    question: str=Field(min_length=1,max_length=1000)
    ignored: list[str]=Field(default_factory=list,max_length=200)
    token: str | None=None
    language: str=Field(default='en',pattern='^(en|ar)$')


def preview(project,request):
    from .kobo import KoboSettings,resolved_question_settings,label
    from .kobo_connections import connection_plan,describe_condition,condition_review
    from .kobo_connection_rules import describe_tree
    _,questions=context(project)
    if request.question not in questions:raise ValueError('Question not found.')
    q=questions[request.question]
    if configuration(project.get('settings',{}),q['id'])[0]=='manual':raise ValueError('This question uses a manual connection. Edit its manual rules instead.')
    stored=next(v for v in project['form']['questions'] if v['id']==q['id'])
    setup=stored.get('connectionSetup') or {}
    if setup.get('pending') and not setup.get('recovered'):raise ValueError('The source condition cannot be verified. Edit the connection instead.')
    reviewed=condition_review(q,questions,KoboSettings.model_validate(project.get('settings',{})))
    options=[]
    for entry in entries(q):
        readable,_=describe_condition(entry['expression'],q,questions,request.language)
        options.append({**next((v for v in reviewed if v['source']==entry['source'] and v['expression']==entry['expression']),entry),'id':entry_id(entry),'readable':readable,'kind':'question' if entry.get('source')==q['id'] else 'group'})
    selected=set(request.ignored)
    if selected-{e['id'] for e in options}:raise ValueError('The source conditions changed. Refresh this preview.')
    candidate={**q,'ignoredSourceConditions':[e for e in options if e['id'] in selected]}
    cfg=resolved_question_settings(q,KoboSettings.model_validate(project.get('settings',{})))
    plan=connection_plan(candidate,cfg,questions)
    current_ids=[entry_id(e) for e in stored.get('ignoredSourceConditions',[])]
    token=digest([project['form'],project['records'],project.get('settings',{}),project.get('questionConditionOverrides',{}),project.get('sharedDependencyOverrides',{}),q['id'],sorted(selected)])
    return {'question':q['id'],'label':label(q,request.language),'conditions':options,'ignored':current_ids,'selected':sorted(selected),
        'after':describe_tree(plan['tree'],questions,request.language),'issues':plan['reviewIssues'],'percentageBaseChange':plan['percentageBaseChange'],'currentPercentageBaseChange':connection_plan(q,cfg,questions)['percentageBaseChange'],
        'token':token,'sourceFingerprint':source_fingerprint(q,questions)}


def apply(store,pid,request):
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT payload,settings FROM projects WHERE id=?',(pid,)).fetchone()
        if row is None:raise KeyError('Project not found.')
        raw=json.loads(row[0]);settings=json.loads(row[1]);project=store.get(pid)
        result=preview(project,request)
        if not request.token or request.token!=result['token']:raise ValueError('The data or connection changed. Preview the conditions again.')
        from .kobo_shared_dependencies import restore_stale_targets
        restore_stale_targets(project,raw,[request.question])
        saved=raw.setdefault('questionConditionOverrides',{})
        if request.ignored:
            saved[request.question]={'conditions':[{k:e[k] for k in ('source','expression')} for e in result['conditions'] if e['id'] in request.ignored],
                'sourceFingerprint':result['sourceFingerprint'],'at':datetime.now(timezone.utc).isoformat()}
        else:saved.pop(request.question,None)
        q=next(q for q in project['form']['questions'] if q['id']==request.question)
        if (q.get('connectionSetup') or {}).get('recovered'):
            target=next(v for v in raw['form']['questions'] if v['id']==request.question)
            target.update(q['connectionSetup']['recovered']);target.update(relevanceMetadataVersion=1,connectionVerifiedInheritance=True)
            raw.setdefault('connectionVerification',{})[q['id']]={'sourceFingerprint':q['connectionSetup']['sourceFingerprint'],
                'ruleFingerprint':digest(configuration(settings,q['id'])),'at':datetime.now(timezone.utc).isoformat()}
        db.execute('UPDATE projects SET payload=?,updated=? WHERE id=?',(json.dumps(raw,ensure_ascii=False),datetime.now().isoformat(),pid))
    return store.get(pid)
