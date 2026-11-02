"""Staged, explicit record matching and local source update history."""
from copy import deepcopy
import hashlib
import json
import uuid
from collections import Counter
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class UpdateMatching(BaseModel):
    keys: dict[str, list[str]] = Field(default_factory=dict)
    skip: bool = False
    signature: str = ''
    editResolutions: dict[str, str] = Field(default_factory=dict)
    discardEdits: bool = False


def caption(question):
    labels=question.get('labels',{})
    return labels.get('en') or labels.get('default') or labels.get('ar') or question.get('name') or question.get('id','Column')


def canonical(value):
    if isinstance(value,list): return sorted((canonical(v) for v in value),key=lambda v:json.dumps(v,ensure_ascii=False))
    if isinstance(value,dict): return {k:canonical(v) for k,v in sorted(value.items())}
    return value


def fingerprint(payload):
    return hashlib.sha256(json.dumps(canonical(payload),ensure_ascii=False,default=str).encode()).hexdigest()


def source_description(project):
    source=project.get('source',{})
    filename=source.get('filename','Saved source')
    csv=filename.lower().endswith('.csv')
    tables=source.get('tables') or [{'name':source.get('worksheet') or project.get('customConfig',{}).get('worksheet') or ('CSV table' if csv else 'Saved worksheet'), 'role':'Main table'}]
    return {'filename':filename,'formFilename':source.get('formFilename',''), 'tables':[{'name':t['name'],'role':'Single CSV table' if csv else t.get('role','Worksheet')} for t in tables]}


def compare_update(previous, payload, matching, filename=''):
    from .kobo import missing
    from .kobo_edits import carry_edits
    local_edits=carry_edits(previous,payload,matching)
    future=deepcopy(payload);carry_edits(previous,future,matching,materialize=True)
    from .kobo_edits import effective_project
    future=effective_project(future)
    previous={**previous,'form':previous.get('_sourceForm',previous['form']),'records':previous.get('_sourceRecords',previous['records'])}
    oldq = {q['id']:q for q in previous['form']['questions']}
    newq = {q['id']:q for q in payload['form']['questions']}
    common = oldq.keys() & newq.keys()
    changed_types = {key for key in common if oldq[key]['kind']!=newq[key]['kind']}
    comparable = common-changed_types
    structural = [{'field':key,'label':caption(q),'change':'removed'} for key,q in oldq.items() if key not in newq]
    structural += [{'field':key,'label':caption(q),'change':'added'} for key,q in newq.items() if key not in oldq]
    structural += [{'field':key,'label':caption(newq[key]),'change':'type changed'} for key in sorted(changed_types)]
    scopes = sorted({r['scope'] for r in previous['records']+payload['records']},key=lambda s:(s.count('/'),len(s),s))
    issues=[]; details=[]; summaries=[]; maps={}; reliable=False
    for scope in scopes:
        keys=matching.keys.get(scope,[])
        before=[r for r in previous['records'] if r['scope']==scope]
        after=[r for r in payload['records'] if r['scope']==scope]
        selected=[key for key in keys if key in comparable and oldq[key]['repeat']==newq[key]['repeat']==scope and newq[key]['kind']!='multiple']
        if not keys or len(selected)!=len(keys):
            summaries.append({'scope':scope,'before':len(before),'after':len(after),'compared':False})
            if keys: issues.append(f'{scope or "Main records"}: selected ID columns are unavailable or incompatible.')
            continue
        def indexed(records,side):
            result={}; duplicates=0; blanks=0
            for record in records:
                values=[record['values'].get(key) for key in selected]
                if any(missing(v) for v in values): blanks+=1;continue
                # Typed JSON preserves leading-zero text IDs and composite boundaries.
                key=json.dumps([[type(v).__name__,v] for v in values],ensure_ascii=False,default=str)
                if scope:
                    parent=maps.get((side,record.get('parent')))
                    if parent is None: blanks+=1;continue
                    key=parent+' / '+key
                if key in result: duplicates+=1
                result[key]=record
            if duplicates or blanks: issues.append(f'{scope or "Main records"}: {side} source has {blanks} missing/unmatched IDs and {duplicates} duplicate IDs.')
            return result,not(duplicates or blanks)
        a,valid_a=indexed(before,'previous');b,valid_b=indexed(after,'replacement')
        if not(valid_a and valid_b):
            summaries.append({'scope':scope,'before':len(before),'after':len(after),'compared':False});continue
        if not scope: reliable=True
        for side,values in [('previous',a),('replacement',b)]:
            maps.update({(side,r['id']):key for key,r in values.items()})
        counts=Counter()
        fields=[key for key in comparable if oldq[key]['repeat']==newq[key]['repeat']==scope and not oldq[key].get('derivedFrom') and not key.startswith('calc_')]
        for key in sorted(a.keys()|b.keys()):
            old,new=a.get(key),b.get(key)
            changed=[field for field in fields if old and new and canonical(old['values'].get(field))!=canonical(new['values'].get(field))]
            kind='added' if old is None else 'removed' if new is None else 'changed' if changed else 'unchanged'
            counts[kind]+=1
            if kind!='unchanged': details.append({'scope':scope,'key':key,'kind':kind,'previousRow':old.get('row') if old else None,'replacementRow':new.get('row') if new else None,'fields':changed,'before':{f:old['values'].get(f) for f in (changed if new else fields)} if old else {},'after':{f:new['values'].get(f) for f in (changed if old else fields)} if new else {}})
        summaries.append({'scope':scope,'before':len(before),'after':len(after),'compared':True,**{k:counts[k] for k in ['added','removed','changed','unchanged']}})
    changed_fields={field for change in details for field in change['fields']}|{v['field'] for v in structural}
    for scope in summaries:
        if matching.skip or not scope['compared'] or scope.get('added') or scope.get('removed'):
            changed_fields.update(key for key,q in oldq.items() if q['repeat']==scope['scope'])
    impacts=[]
    settings=previous.get('settings',{})
    for qid in oldq:
        cfg=settings.get('questions',{}).get(qid,{})
        references={qid,cfg.get('calculation',{}).get('field','') if cfg.get('calculation') else '',cfg.get('trendDateField',''),cfg.get('breakdown',''),*cfg.get('breakdowns',[]),*(f['field'] for f in cfg.get('ownFilters',[]))}
        if references & changed_fields: impacts.append({'name':caption(oldq[qid]),'kind':'Analysis','needsRepair':bool(references & (oldq.keys()-newq.keys()|changed_types))})
    for batch in previous.get('dataEdits',{}).get('history',[]):
        operation=batch.get('operation',{})
        if not batch.get('undone') and operation.get('kind')=='answers' and operation.get('destination')=='new' and operation.get('field') in changed_fields:
            impacts.append({'name':operation.get('name','Derived field'),'kind':'Derived field','needsRepair':operation['field'] not in newq or operation['field'] in changed_types})
    for calculation in previous.get('customConfig',{}).get('calculatedColumns',[]):
        dependencies={calculation.get('left',''),calculation.get('right','')}
        if dependencies & changed_fields:impacts.append({'name':calculation['label'],'kind':'Calculated column','needsRepair':bool(dependencies & (oldq.keys()-newq.keys()|changed_types))})
    for kind,items in [('Saved view',settings.get('savedViews',[])),('Indicator',settings.get('indicators',[])),('Filter',settings.get('filters',[]))]:
        for item in items:
            encoded=json.dumps(item,ensure_ascii=False)
            affected=[field for field in changed_fields if json.dumps(field,ensure_ascii=False) in encoded]
            if affected:impacts.append({'name':item.get('name',item.get('field',kind)),'kind':kind,'needsRepair':any(f not in newq or f in changed_types for f in affected)})
    from .kobo import AnalysisViewSettings, SavedAnalysisView
    from .kobo_saved_views import snapshot_issues, saved_view_issues
    repair_issues=snapshot_issues(future,AnalysisViewSettings.model_validate(settings))
    from .kobo import question_cohort, QuestionSettings
    future_questions={q['id']:q for q in future['form']['questions']}
    blocking=[]
    for qid,cfg in settings.get('questions',{}).items():
        if qid in future_questions and cfg.get('filterMode') in {'own','additional'}:
            try:question_cohort(future_questions[qid],[],QuestionSettings.model_validate(cfg),future_questions,{})
            except ValueError as exc:blocking.append(f"{caption(future_questions[qid])}: {exc} Restore the source field or revise its question filters before applying.")
    for view in settings.get('savedViews',[]):
        problems=saved_view_issues(future,SavedAnalysisView.model_validate(view))
        repair_issues.extend(f'{view["name"]}: {problem}' for problem in problems)
    from .kobo_indicators import IndicatorDefinition, indicator_issues
    for definition in settings.get('indicators',[]):
        repair_issues.extend(f'{definition["name"]}: {problem}' for problem in indicator_issues(future,IndicatorDefinition.model_validate(definition)))
    comparison_payload = {k: v for k, v in payload.items() if k not in {'importNotes', 'reviewedImportNotes', 'noteSourceContexts', 'noteWarningReferences'}}
    signature=fingerprint({'payload':comparison_payload,'keys':matching.keys,'updated':previous['updated'],'skip':matching.skip})
    return {'blockingIssues':blocking,'previousSource':source_description(previous),'replacementSource':source_description(payload),'localEdits':local_edits,'repairIssues':list(dict.fromkeys(repair_issues)),'signature':signature,'reliable':reliable and not issues,'issues':issues,'scopes':summaries,'structural':structural,'impacts':impacts,'details':details,'keys':matching.keys,'fields':[{'id':k,'label':caption(newq[k]),'scope':newq[k]['repeat'],'canMatch':k in comparable and newq[k]['kind']!='multiple','suggested':any(part in caption(newq[k]).lower() for part in ['uuid','_id','code','identifier'])} for k in sorted(common) if not k.startswith('calc_')],'previousFilename':previous.get('source',{}).get('filename','Saved source'),'replacementFilename':filename or payload.get('source',{}).get('filename','Replacement source'),'preparationChanged':previous.get('customConfig')!=payload.get('customConfig') or any((previous.get('reviewConfig') or {}).get(key,default)!=(payload.get('reviewConfig') or {}).get(key,default) for key,default in [('addedQuestions',[]),('choiceOverrides',{}),('excludedQuestionIds',[])])}


def review_update(previous,payload,matching,filename=''):
    preview=compare_update(previous,payload,matching,filename)
    if preview.get('blockingIssues'):raise ValueError(' '.join(preview['blockingIssues']))
    if matching.signature!=preview['signature']:raise ValueError('Review the latest source update comparison before applying.')
    if not preview['reliable'] and not matching.skip:raise ValueError('Choose reliable IDs or explicitly update without record comparison.')
    if matching.skip:
        preview['details']=[]
        for scope in preview['scopes']:
            for key in ['added','removed','changed','unchanged']:scope.pop(key,None)
            scope['compared']=False
    from .kobo_edits import carry_edits
    carry_edits(previous,payload,matching,apply=True)
    return {'id':uuid.uuid4().hex,'appliedAt':datetime.now(timezone.utc).isoformat(),'skipped':matching.skip,'editResolutions':matching.editResolutions,'discardEdits':matching.discardEdits,**preview}


def preview_update(previous, payload, body, filename=''):
    """Resolve routine matching without requiring an explicit skip decision."""
    matching = UpdateMatching.model_validate(body.get('matching', {}))
    if body.get('matchingMode') == 'automatic':
        oldq = {q['id']: q for q in previous.get('_sourceForm', previous['form'])['questions']}
        newq = {q['id']: q for q in payload['form']['questions']}
        history = previous.get('updateHistory', [])
        keys = {}
        scopes = sorted({r['scope'] for r in previous.get('_sourceRecords', previous['records']) + payload['records']}, key=lambda s: (s.count('/'), len(s), s))
        for scope in scopes:
            candidates = [entry['keys'][scope] for entry in history if not entry.get('skipped') and entry.get('keys', {}).get(scope)]
            candidates += [[qid] for qid in sorted(oldq.keys() & newq.keys())
                           if newq[qid]['repeat'] == oldq[qid]['repeat'] == scope
                           and newq[qid]['kind'] == oldq[qid]['kind'] and newq[qid]['kind'] in {'text', 'category'}
                           and newq[qid].get('name', '').strip().lower() in {'uuid', '_uuid'}
                           and oldq[qid].get('name', '').strip().lower() in {'uuid', '_uuid'}]
            for candidate in dict.fromkeys(tuple(ids) for ids in candidates):
                candidate = list(candidate)
                attempt = matching.model_copy(update={'keys': {**keys, scope: candidate}, 'skip': False})
                checked = compare_update(previous, payload, attempt, filename)
                if any(s['scope'] == scope and s['compared'] for s in checked['scopes']):
                    keys[scope] = candidate
                    break
        matching = matching.model_copy(update={'keys': keys, 'skip': '' not in keys})
    review = compare_update(previous, payload, matching, filename)
    matching.signature = review['signature']
    return {**review, 'matching': matching.model_dump()}


def paged_review(review,page=1,page_size=25,kind='',field='',scope=None):
    rows=[r for r in review.get('details',[]) if (not kind or r['kind']==kind) and (not field or field in r['fields']) and (scope is None or r['scope']==scope)]
    return {**{k:v for k,v in review.items() if k!='details'},'total':len(rows),'page':page,'pageSize':page_size,'rows':rows[(page-1)*page_size:page*page_size]}
