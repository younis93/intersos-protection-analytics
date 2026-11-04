"""Reversible, source-bound removal of safe shared AND predicates."""
from copy import deepcopy
from datetime import datetime, timezone
import json
from pydantic import BaseModel, Field
from .kobo_connection_setup import digest, conditions, configuration


def rule_key(rule):
    return digest({k: rule.get(k, '') for k in ('field', 'operator', 'value', 'value2')})


def expression(rule):
    ref='${'+rule['field']+'}'
    value=str(rule.get('value',''))
    quoted=('"'+value+'"') if "'" in value else ("'"+value+"'")
    if rule['operator'] in {'selected','not-selected'}:
        call='selected('+ref+', '+quoted+')'
        return 'not('+call+')' if rule['operator']=='not-selected' else call
    op={'eq':'=', 'neq':'!=','gt':'>','gte':'>=','lt':'<','lte':'<='}.get(rule['operator'],rule['operator'])
    return ref+' '+op+' '+quoted


def leaves(tree):
    if not tree: return []
    if tree['type']=='rule': return [tree]
    return [r for child in tree['rules'] for r in leaves(child)]


def prune(tree, key):
    """Remove only predicates with an entirely conjunctive path from the root."""
    if not tree: return None
    if tree['type']=='rule': return None if rule_key(tree)==key else tree
    if tree['match']=='any':
        if any(rule_key(r)==key for r in leaves(tree)): raise ValueError('inside-or')
        return tree
    children=[v for child in tree['rules'] if (v:=prune(child,key)) is not None]
    return {**tree, 'rules':children} if children else None


def source_tree(q, questions):
    from .kobo_connection_rules import parse_condition, tree_issues
    nodes=[]
    for entry in [*q.get('inheritedRelevant', []), {'expression':q.get('relevant','')}]:
        if not entry['expression'].strip(): continue
        node=parse_condition(entry['expression'],q,questions)
        if tree_issues(node,q,questions): raise ValueError('invalid-reference')
        nodes.append(node)
    return {'type':'group','match':'all','rules':nodes} if nodes else None


def review_tree(q, questions):
    """Retain supported clauses even when a different ANDed source entry is unchecked."""
    from .kobo_connection_rules import parse_condition,tree_issues
    nodes=[];issues=[]
    for entry in [*q.get('inheritedRelevant',[]),{'expression':q.get('relevant','')}]:
        if not entry['expression'].strip(): continue
        try:
            node=parse_condition(entry['expression'],q,questions,allow_unresolved=True)
            nodes.append(node);issues.extend(tree_issues(node,q,questions))
        except ValueError:issues.append('unsupported-condition')
    return ({'type':'group','match':'all','rules':nodes} if nodes else None),list(dict.fromkeys(issues))


def source_fingerprint(q, questions):
    from .kobo_connections import REFERENCE, resolve_reference
    refs={}
    for entry in [*q.get('inheritedRelevant',[]), {'expression':q.get('relevant','')}]:
        for ref in REFERENCE.findall(entry['expression']):
            target=resolve_reference(ref,q,questions)
            refs[ref]=None if target is None else {k:target.get(k) for k in ('id','name','repeat','kind','choices')}
    return digest([q['id'], q.get('repeat',''), conditions(q), refs])


def default_consent_overrides(project, questions):
    """Ignore affirmative consent gates without changing source answers or expressions."""
    import re
    from .kobo_connection_rules import tree_issues
    disabled=set(project.get('restoredConsentDependencies',[]))
    found={}
    for q in questions.values():
        if configuration(project.get('settings',{}),q['id'])[0]=='manual': continue
        check={**q, **((q.get('connectionSetup') or {}).get('recovered') or {})}
        tree,_=review_tree(check,questions)
        for rule in leaves(tree):
            if tree_issues(rule,check,questions): continue
            parent=questions.get(rule['field'],{})
            names=' '.join([str(parent.get('name','')), *map(str,parent.get('labels',{}).values())]).casefold()
            if not re.search(r'\bconsent\b|موافقة',names.replace('_',' ')): continue
            if rule.get('operator') not in {'eq','selected'}: continue
            value=str(rule.get('value','')).strip().casefold()
            choice=next((c for c in parent.get('choices',[]) if str(c['name']).casefold()==value),{})
            labels={str(v).strip().casefold() for v in choice.get('labels',{}).values()}
            if value not in {'yes','true'} and not labels.intersection({'yes','نعم'}): continue
            key=rule_key(rule)
            if key in disabled: continue
            try: prune(tree,key)
            except ValueError: continue
            item=found.setdefault(key,{'rule':rule,'questions':{},'default':True})
            item['questions'][q['id']]=source_fingerprint(check,questions)
    return found


def annotate(project):
    """Runtime annotations only; saved source conditions remain intact."""
    from .kobo_connections import form_question_index
    questions=form_question_index(project['form'])
    overrides=default_consent_overrides(project,questions)
    for key,entry in project.get('sharedDependencyOverrides',{}).items():
        if entry.get('default'): continue
        automatic=overrides.get(key,{})
        overrides[key]={**entry,'questions':{**automatic.get('questions',{}),**entry.get('questions',{})}}
    project['sharedDependencyOverrides']=overrides
    for q in project['form']['questions']:
        q.pop('ignoredConnectionRules',None);q.pop('dependencyReviewNeeded',None)
        if configuration(project.get('settings',{}),q['id'])[0]=='manual': continue
        for key,entry in overrides.items():
            if q['id'] not in entry.get('questions',{}): continue
            expected=entry['questions'][q['id']]
            check=questions[q['id']]
            setup=q.get('connectionSetup') or {}
            if setup.get('recovered'): check={**check, **setup['recovered']}
            if (setup.get('pending') and not setup.get('recovered')) or source_fingerprint(check,questions)!=expected:
                q['dependencyReviewNeeded']=True
                q.setdefault('connectionSetup', {'pending':True,'reason':'source-condition-changed','sourceFingerprint':digest([q['id'],conditions(questions[q['id']]),'']),
                    'recovered':conditions(questions[q['id']]),'fingerprint':digest([key,expected,conditions(questions[q['id']])])})
                continue
            q.setdefault('ignoredConnectionRules',[]).append(entry['rule'])
    return project


def context(project):
    from .kobo_connections import form_question_index
    # Only form metadata is needed. Never copy the response dataset per question.
    candidate={**project,'form':{**project['form'],'questions':deepcopy(project['form']['questions'])}}
    for q in candidate['form']['questions']:
        recovered=(q.get('connectionSetup') or {}).get('recovered')
        if recovered:
            q.update(recovered)
            q['connectionVerifiedInheritance']=True
    return candidate,form_question_index(candidate['form'])


def catalog(project, language='en'):
    from .kobo_connection_rules import describe_tree
    from .kobo import label
    _,questions=context(project);found={}
    for q in questions.values():
        if q.get('metadata') or q.get('addedFromData') or q.get('localDerived'): continue
        tree,_=review_tree(q,questions)
        seen=set()
        for rule in leaves(tree):
            from .kobo_connection_rules import tree_issues
            if tree_issues(rule,q,questions): continue
            key=rule_key(rule)
            if key in seen: continue
            seen.add(key)
            item=found.setdefault(key,{'id':key,'rule':rule,'label':describe_tree(rule,questions,language),
                'controller':label(questions[rule['field']],language),'expression':expression(rule),'questions':[],'count':0})
            item['count']+=1
            item['questions'].append(q['id'])
    for key,entry in project.get('sharedDependencyOverrides',{}).items():
        if key not in found:
            found[key]={'id':key,'rule':entry['rule'],'label':entry.get('label',key),'controller':'','expression':expression(entry['rule']),'questions':list(entry['questions']),'count':len(entry['questions'])}
        found[key]['ignored']=True
        found[key]['stale']=any(q.get('dependencyReviewNeeded') for q in project['form']['questions'] if q['id'] in entry['questions'])
    return list(found.values())


class DependencyRequest(BaseModel):
    condition: str = Field(min_length=1,max_length=1000)
    action: str = Field(pattern='^(ignore|restore)$')
    token: str | None = None
    language: str = Field(default='en',pattern='^(en|ar)$')


def preview(project, request):
    from .kobo import label, resolved_question_settings, KoboSettings
    from .kobo_connection_rules import describe_tree
    from .kobo_connections import REFERENCE, resolve_reference, ignored_percentage_base
    from .kobo_question_flow import cyclic_nodes
    item=next((v for v in catalog(project,request.language) if v['id']==request.condition),None)
    if item is None: raise ValueError('This condition changed. Refresh shared dependencies.')
    saved=project.get('sharedDependencyOverrides',{}).get(request.condition)
    if request.action=='restore' and not saved: raise ValueError('This condition is not ignored.')
    if request.action=='ignore' and saved: raise ValueError('Restore this dependency before reviewing it again.')
    _,questions=context(project);rows=[];eligible={};all_trees={};unchecked={}
    settings=KoboSettings.model_validate(project.get('settings',{}))
    for qid,q in questions.items():
        tree,issues=review_tree(q,questions)
        if tree is not None: all_trees[qid]=tree
        unchecked[qid]=issues
    cycles=cyclic_nodes(list(questions),[(qid,r['field']) for qid,tree in all_trees.items() for r in leaves(tree) if r['field'] in questions])
    for qid,q in questions.items():
        if request.action=='restore' and qid not in saved['questions']: continue
        tree=all_trees.get(qid);current=tree;matches=any(rule_key(r)==request.condition for r in leaves(tree))
        refs=[resolve_reference(ref,q,questions) for e in [*q.get('inheritedRelevant',[]),{'expression':q.get('relevant','')}] for ref in REFERENCE.findall(e['expression'])]
        if not matches and request.action=='ignore' and not (qid not in all_trees and any(r and r['id']==item['rule']['field'] for r in refs)): continue
        reason='';after=tree
        if configuration(project.get('settings',{}),qid)[0]=='manual':
            current=configuration(project.get('settings',{}),qid)[1]
            reason='manual-override'
        elif (q.get('connectionSetup') or {}).get('pending') and not q['connectionSetup'].get('recovered'): reason='unverified-source'
        elif not matches and request.action=='ignore': reason='unsupported-condition'
        elif qid in cycles or any(r['field'] in cycles for r in leaves(tree)): reason='cyclic-condition'
        else:
            try:
                # Keep other active ignored predicates when previewing either operation.
                current=tree
                for key,entry in project.get('sharedDependencyOverrides',{}).items():
                    if qid in entry['questions'] and source_fingerprint(q,questions)==entry['questions'][qid]: current=prune(current,key)
                after=prune(current,request.condition) if request.action=='ignore' else tree
                if request.action=='restore':
                    for key,entry in project.get('sharedDependencyOverrides',{}).items():
                        if key!=request.condition and qid in entry['questions'] and source_fingerprint(q,questions)==entry['questions'][qid]: after=prune(after,key)
            except ValueError: reason='inside-or'
        if not reason: eligible[qid]=source_fingerprint(q,questions)
        always='ينطبق على جميع السجلات في جدول الاستجابات هذا' if request.language=='ar' else 'Applies to all records in this response table'
        unknown='تعذّر تقييم هذا الشرط' if request.language=='ar' else 'This condition could not be evaluated'
        base_change=None
        if not reason:
            cfg=resolved_question_settings(q,settings)
            before_base=ignored_percentage_base(q,cfg,questions,tree,current)
            after_base=ignored_percentage_base(q,cfg,questions,tree,after)
            if before_base != after_base:
                change=after_base or before_base
                from_id,to_id=(change['from'],change['to']) if after_base else (change['to'],change['from'])
                base_change={'from':label(questions[from_id],request.language),'to':label(questions[to_id],request.language)}
        remaining_issues=unchecked.get(qid,[]) if not reason else []
        current_description=describe_tree(current,questions,request.language)
        after_description=describe_tree(after,questions,request.language)
        if remaining_issues:
            current_description=(current_description+' · ' if current_description else '')+unknown
            after_description=(after_description+' · ' if after_description else '')+unknown
        rows.append({'remainingIssues':remaining_issues,'percentageBaseChange':base_change,'question':qid,'label':label(q,request.language),'current':current_description or (unknown if qid not in all_trees else always),
            'after':after_description or always,'reason':reason})
    expressions=list(dict.fromkeys(e['expression'] for q in questions.values() for e in [*q.get('inheritedRelevant',[]),{'expression':q.get('relevant','')}] if e['expression'] and any(r and r['id']==item['rule']['field'] for r in [resolve_reference(ref,q,questions) for ref in REFERENCE.findall(e['expression'])])))
    token=digest([project['form'],project['records'],project.get('settings',{}),project.get('sharedDependencyOverrides',{}),request.condition,request.action,eligible])
    return {'condition':item,'expressions':expressions,'rows':rows,'eligible':len(eligible),'unchanged':sum(r['reason']=='manual-override' for r in rows),'needsReview':sum((bool(r['reason']) and r['reason']!='manual-override') or bool(r.get('remainingIssues')) for r in rows),'individual':sum(bool(r['reason']) for r in rows),'token':token,'targets':eligible}


def apply(store,pid,request):
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT payload,settings,form FROM projects WHERE id=?',(pid,)).fetchone()
        if row is None: raise KeyError('Project not found.')
        raw=json.loads(row[0]);settings=json.loads(row[1])
        project=store.get(pid)
        result=preview(project,request)
        if not request.token or request.token!=result['token']: raise ValueError('The data or connections changed. Preview this action again.')
        overrides=raw.setdefault('sharedDependencyOverrides',{})
        if request.action=='restore':
            overrides.pop(request.condition,None)
            raw['restoredConsentDependencies']=list(dict.fromkeys([*raw.get('restoredConsentDependencies',[]),request.condition]))
        else:
            raw['restoredConsentDependencies']=[key for key in raw.get('restoredConsentDependencies',[]) if key!=request.condition]
            if not result['eligible']: raise ValueError('No eligible questions remain.')
            overrides[request.condition]={'rule':result['condition']['rule'],'label':result['condition']['label'],
                'questions':result['targets'],'at':datetime.now(timezone.utc).isoformat()}
            for qid in result['targets']:
                target=next(q for q in raw['form']['questions'] if q['id']==qid)
                setup=next(q for q in project['form']['questions'] if q['id']==qid).get('connectionSetup')
                if setup and setup.get('recovered'):
                    target.update(setup['recovered']);target.update(relevanceMetadataVersion=1,connectionVerifiedInheritance=True)
                    raw.setdefault('connectionVerification',{})[qid]={'sourceFingerprint':setup['sourceFingerprint'],
                        'ruleFingerprint':digest(configuration(settings,qid)),'at':datetime.now(timezone.utc).isoformat()}
        db.execute('UPDATE projects SET payload=?,updated=? WHERE id=?',(json.dumps(raw,ensure_ascii=False),datetime.now().isoformat(),pid))
    return store.get(pid)


def restore_stale_targets(project, raw, targets):
    stale={q['id'] for q in project['form']['questions'] if q['id'] in targets and q.get('dependencyReviewNeeded')}
    for qid in stale: raw.get('questionConditionOverrides',{}).pop(qid,None)
    overrides=raw.get('sharedDependencyOverrides',{})
    for key in list(overrides):
        for qid in stale: overrides[key]['questions'].pop(qid,None)
        if not overrides[key]['questions']: overrides.pop(key)
