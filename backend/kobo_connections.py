"""Inspect XLSForm links without executing expressions; calculate respondent bases."""
import re
from collections import Counter

REFERENCE = re.compile(r'\$\{([^}]+)\}')
TOKEN = re.compile(r'''\s*(\$\{[^}]+\}|'[^']*'|"[^"]*"|!=|>=|<=|=|>|<|\(|\)|,|\band\b|\bor\b|\bselected\b|-?\d+(?:\.\d+)?)''', re.I)


def semantic_form(form):
    """Presentation metadata must not invalidate corrections or review decisions."""
    return {**form,'questions':[{key:value for key,value in q.items() if key!='conditionReview'} for q in form['questions']]}


def form_question_index(form):
    """Derive inherited conditions for older forms that retained group metadata."""
    groups = {g['id']: g for g in form.get('groups', [])}
    questions = {}
    for original in form['questions']:
        chain, seen, gid = [], set(), original.get('group', '')
        while gid in groups and gid not in seen:
            seen.add(gid); group = groups[gid]; chain.insert(0, group); gid = group.get('parent', '')
        inherited = original.get('inheritedRelevant', [])
        if not original.get('connectionVerifiedInheritance') and any('relevant' in group for group in chain):
            inherited = [{'source': group['id'], 'expression': group['relevant']} for group in chain if group.get('relevant')]
        questions[original['id']] = {**original, 'inheritedRelevant': inherited}
    return questions


def compatible(child, parent):
    scope = parent['repeat']
    return child['id'] != parent['id'] and (not scope or scope == child['repeat'] or child['repeat'].startswith(scope + '/'))


def resolve_reference(name, child, questions):
    # Prefer exact paths, then lexical ancestors, then globally unique names.
    if '/' in name and name in questions: return questions[name]
    path = child.get('group', '')
    while path:
        candidate = path + '/' + name
        if candidate in questions: return questions[candidate]
        path = path.rpartition('/')[0]
    if name in questions: return questions[name]
    candidates = [q for q in questions.values() if q['name'] == name]
    return candidates[0] if len(candidates) == 1 else None


def describe_condition(expression, child, questions, language):
    from .kobo_connection_rules import parse_condition,describe_tree,tree_issues
    from .kobo import label
    try:
        tree = parse_condition(expression,child,questions)
        if tree_issues(tree,child,questions): return None,{}
    except ValueError: return None,{}
    triggers = {}
    def visit(node):
        if node['type']=='group':
            for item in node['rules']: visit(item)
        else:
            field = questions[node['field']]; value = str(node.get('value',''))
            choice = next((c for c in field.get('choices',[]) if c['name']==value),None)
            triggers.setdefault(field['id'],[]).append(label(choice,language) if choice else value)
    visit(tree)
    return describe_tree(tree,questions,language),triggers


def condition_review(child, questions, settings):
    from .kobo_question_conditions import entries,entry_id
    from .kobo_connection_rules import parse_condition,tree_issues,describe_tree,fields_in
    from .kobo_shared_dependencies import prune,rule_key
    cfg=settings.questions.get(child['id'])
    manual=bool(cfg and cfg.connectionSource=='manual')
    local={entry_id(e) for e in child.get('ignoredSourceConditions',[])}
    output=[]
    for entry in entries(child):
        readable,_=describe_condition(entry['expression'],child,questions,settings.language)
        missing=[]
        for ref in REFERENCE.findall(entry['expression']):
            if resolve_reference(ref,child,questions) is None: missing.append(ref)
        status='manual' if manual else 'active';scope='';ignored_parts=[];ignored_rules=[];remaining=None;active_fields=[]
        if not manual and entry_id(entry) in local:
            status='ignored';scope='question';missing=[]
        elif not manual:
            try:
                node=parse_condition(entry['expression'],child,questions,allow_unresolved=True)
                for rule in child.get('ignoredConnectionRules',[]):
                    try: changed=prune(node,rule_key(rule))
                    except ValueError: continue
                    if changed!=node:
                        ignored_parts.append(describe_tree(rule,questions,settings.language));ignored_rules.append(rule);node=changed
                if ignored_parts:scope='project'
                issues=tree_issues(node,child,questions) if node else []
                if node is None:status='ignored';missing=[]
                elif missing:status='missing'
                elif issues:status='unchecked'
                elif ignored_parts:status='adjusted'
                remaining=describe_tree(node,questions,settings.language)
                active_fields=fields_in(node)
            except ValueError:status='missing' if missing else 'unchecked'
        if (child.get('connectionSetup') or {}).get('pending') and status in {'active','adjusted'}:status='setup'
        if manual:missing=[]
        output.append({**entry,'readable':readable,'supported':readable is not None,'status':status,'ignoredScope':scope,
            'ignoredParts':ignored_parts,'ignoredRules':ignored_rules,'activeFields':active_fields,'missingReferences':list(dict.fromkeys(missing)),'activeCondition':remaining})
    return output


def connection_details(child, questions, settings):
    conditions = [*child.get('inheritedRelevant', [])]
    if child.get('relevant', '').strip(): conditions.append({'source': child['id'], 'expression': child['relevant']})
    parents, issues, descriptions, unresolved = {}, [], [], []
    for condition in conditions:
        expression = condition['expression']
        readable, triggers = describe_condition(expression, child, questions, settings.language)
        descriptions.append({**condition, 'readable': readable, 'supported': readable is not None})
        if readable is None: issues.append('unsupported-condition')
        for name in REFERENCE.findall(expression):
            target = resolve_reference(name, child, questions)
            if not target or target['id'] == child['id']:
                issues.append('unresolved-reference:' + name)
                if name not in {item['reference'] for item in unresolved}:
                    unresolved.append({'reference':name,'source':condition['source']})
                continue
            from .kobo import label
            parent = parents.setdefault(target['id'], {'id': target['id'], 'name': target['name'], 'label': label(target, settings.language), 'hidden': target['id'] in settings.hidden or bool(target.get('metadata') and not settings.metadata), 'compatible': compatible(child, target), 'triggers': []})
            parent['triggers'] = list(dict.fromkeys([*parent['triggers'], *triggers.get(target['id'], [])]))
    return {'parents': list(parents.values()), 'conditions': condition_review(child,questions,settings), 'unresolvedReferences':unresolved,'issues': list(dict.fromkeys(issues))}


def ignored_percentage_base(question, cfg, questions, original_tree, active_tree):
    """A removed percentage parent falls back reversibly to the current question."""
    from .kobo_connection_rules import fields_in
    if cfg.connectionSource=='manual' or (cfg.calculation and cfg.calculation.operation!='count'): return None
    mode=cfg.connectedPercentageMode or ('keep-original' if cfg.percentageBase=='parent' else 'adjust')
    if mode!='keep-original': return None
    original=[key for key in fields_in(original_tree) if key in questions and compatible(question,questions[key])]
    selected=cfg.percentageParent or (original[0] if len(set(original))==1 else '')
    if selected and selected in original and selected not in fields_in(active_tree):
        return {'from':selected,'to':question['id']}
    return None


def connection_plan(question, cfg, questions):
    from .kobo_connection_rules import parse_condition, tree_issues, fields_in, tree_diagnostics
    entries = list(question.get('inheritedRelevant', []))
    if question.get('relevant', '').strip(): entries.append({'source':question['id'],'expression':question['relevant']})
    original_entries = list(entries)
    ignored_source = question.get('ignoredSourceConditions',[]) if cfg.connectionSource!='manual' else []
    if ignored_source:
        from .kobo_question_conditions import entry_id
        ignored_ids={entry_id(e) for e in ignored_source}
        entries=[e for e in entries if entry_id({'source':e.get('source',question['id']),**e}) not in ignored_ids]
    measured = cfg.calculation and cfg.calculation.operation != 'count'
    enabled = bool(entries or cfg.connectionSource == 'manual' or cfg.percentageBase == 'parent' or cfg.connectedPercentageMode) and not measured
    mode = cfg.connectedPercentageMode or ('keep-original' if cfg.percentageBase == 'parent' else 'adjust')
    tree, review, referenced, diagnostics = None, [], [], []
    if cfg.connectionSource == 'manual':
        tree = cfg.connectionRules
        review = tree_issues(tree, question, questions)
        diagnostics = tree_diagnostics(tree, question, questions)
        referenced = fields_in(tree)
    elif entries:
        nodes = []
        for index, entry in enumerate(entries):
            for name in REFERENCE.findall(entry['expression']):
                target = resolve_reference(name, question, questions)
                if target: referenced.append(target['id'])
            try:
                node = parse_condition(entry['expression'], question, questions, allow_unresolved=True)
                problems = tree_issues(node, question, questions)
                if problems: review.extend(problems)
                nodes.append(node)
                diagnostics.extend({**d, 'source':entry.get('source', question['id']), 'expression':entry['expression']} for d in tree_diagnostics(node, question, questions, [len(nodes)-1]))
            except ValueError:
                review.append('unsupported-condition')
                diagnostics.append(dict(code='unsupported-condition', path=[index], source=entry.get('source', question['id']), expression=entry['expression']))
                for name in REFERENCE.findall(entry['expression']):
                    if not resolve_reference(name, question, questions):
                        diagnostics.append(dict(code='missing-rule-question', path=[index], field=name, expression=entry['expression'], availableIds=[q['id'] for q in questions.values() if compatible(question,q)]))
                nodes.append({'type':'group','match':'all','rules':[]})
        if nodes: tree = {'type':'group','match':'all','rules':nodes}
    elif enabled and not ignored_source:
        review.append('manual-connection-required')
    original_tree = tree
    if ignored_source:
        original_keys=list(dict.fromkeys(target['id'] for e in original_entries for name in REFERENCE.findall(e['expression']) if (target:=resolve_reference(name,question,questions))))
        original_tree={'type':'group','match':'all','rules':[{'type':'rule','field':key,'operator':'eq','value':''} for key in original_keys]}
        if tree is None and not review: enabled=False
    ignored = question.get('ignoredConnectionRules', []) if cfg.connectionSource != 'manual' else []
    if ignored:
        from .kobo_shared_dependencies import prune, rule_key
        for rule in ignored:
            try: tree = prune(tree, rule_key(rule))
            except ValueError: review.append('ignored-condition-needs-review')
        referenced = fields_in(tree)
        if tree is None and not review: enabled = False
    candidates = [questions[key] for key in dict.fromkeys(referenced) if key in questions and compatible(question, questions[key])]
    selected = cfg.percentageParent or (candidates[0]['id'] if len(candidates)==1 else '')
    base_change = ignored_percentage_base(question,cfg,questions,original_tree,tree) if (ignored or ignored_source) else None
    if base_change:
        mode = 'adjust'
        selected = ''
    parent = questions.get(selected)
    parent_issue = '' if parent and compatible(question,parent) else 'missing-parent' if not parent else 'incompatible-scope'
    if not parent_issue and selected not in {candidate['id'] for candidate in candidates}: parent_issue = 'not-connected-parent'
    if parent_issue: parent = None
    if base_change: parent_issue = ''
    issue = (review[0] if review else '') if cfg.connectionSource == 'manual' or mode == 'keep-original' else ''
    if mode == 'keep-original' and not issue: issue = parent_issue
    if measured and cfg.percentageBase == 'parent': issue = 'calculated-measure'
    return {'percentageBaseChange':base_change,'enabled':enabled,'mode':mode,'source':cfg.connectionSource,'tree':tree,'diagnostics':diagnostics,'reviewIssues':list(dict.fromkeys(review)),'parent':parent,'parentId':selected,'parentIssue':parent_issue,'issue':issue,'canKeepOriginal':not review and not parent_issue and not measured and not base_change,'fields':list(dict.fromkeys(referenced))}


def parent_field(question, cfg, questions):
    plan = connection_plan(question,cfg,questions)
    return (plan['parent'] if plan['mode']=='keep-original' else None), plan['issue']


def apply_connection_basis(result, question, records, cfg, questions, lookup, settings):
    from .kobo import question_cohort, missing, label, breakdown_fields, breakdown_values, apply_display_percentages
    from .kobo_measures import record_value
    from .kobo_connection_rules import describe_tree
    plan = connection_plan(question,cfg,questions)
    connections = connection_details(question, questions, settings)
    connections['ignoredSourceConditions'] = question.get('ignoredSourceConditions',[])
    connections['originalParents'] = list(connections['parents'])
    connections['suspendedDependencies'] = bool(question.get('dependencyReviewNeeded'))
    connections['percentageBaseChange'] = plan['percentageBaseChange']
    if question.get('ignoredConnectionRules') and cfg.connectionSource != 'manual':
        connections['ignoredDependencies'] = question['ignoredConnectionRules']
    if not plan['enabled'] and not question.get('ignoredConnectionRules') and not question.get('ignoredSourceConditions'):
        if connections['conditions']: result['connections'] = connections
        return result
    connections.update(source=plan['source'],manualTree=cfg.connectionRules,effectiveTree=plan['tree'],effectiveCondition=describe_tree(plan['tree'],questions,settings.language),diagnostics=plan['diagnostics'],baseIssue=plan['parentIssue'],reviewIssues=plan['reviewIssues'],canKeepOriginal=plan['canKeepOriginal'])
    if plan['source']=='manual' or question.get('ignoredConnectionRules') or question.get('ignoredSourceConditions'):
        connections['issues'] = plan['reviewIssues']
        connections['parents'] = []
        for key in plan['fields']:
            field = questions.get(key)
            if field: connections['parents'].append({'id':key,'name':field['name'],'label':label(field,settings.language),'hidden':key in settings.hidden,'compatible':compatible(question,field),'triggers':next((p['triggers'] for p in connections['originalParents'] if p['id']==key),[])})
    result['connections'] = connections
    # Additive percentage bases retain connection filtering without respondent denominators.
    if cfg.percentageMode != 'legacy-respondents' and cfg.percentageBase != 'parent' and cfg.connectedPercentageMode != 'keep-original':
        return result
    parent, issue = plan['parent'], plan['issue']
    cohort = question_cohort(question, records, cfg, questions, lookup)
    parent_base = plan['mode']=='keep-original'
    baseline = question_cohort(question,records,cfg.model_copy(update={'hiddenAnswers':[]}),questions,lookup,apply_connections=False) if parent_base else cohort
    base = [r for r in baseline if not missing(record_value(r,parent,lookup) if parent_base and parent else r['values'].get(question['id']))]
    denominator = None if issue else len(base)
    kind = 'parent' if parent_base else 'question'
    result['respondentBasis'] = {'kind':kind,'mode':plan['mode'],'parentId':plan['parentId'],'label':label(parent,settings.language) if parent_base and parent else result['label'],'denominator':denominator,'active':True,'issue':issue,'hiddenMode':plan['mode'],'repeatEntries':bool(question['repeat']),'canKeepOriginal':plan['canKeepOriginal']}
    dimensions = breakdown_fields(cfg, questions, question)
    bases = Counter(breakdown_values(r, dimensions, lookup) for r in base) if dimensions else {}
    for column in result['breakdowns']:
        column['totalCount'] = column['denominator']
        column['denominator'] = bases.get(tuple(column['values']), 0) if not issue else 0
        column['totalPercent'] = column['totalCount'] / column['denominator'] * 100 if column['denominator'] else None
    for row in result['rows']:
        row['percent'] = row['count'] / denominator * 100 if denominator and row['id'] != '__blank__' else None
        for cell in row.get('series', []):
            column = next(c for c in result['breakdowns'] if c['id'] == cell['id'])
            cell['percent'] = cell['count'] / column['denominator'] * 100 if column['denominator'] and row['id'] != '__blank__' else None
    apply_display_percentages(result['rows'], result['breakdowns'], denominator or 0, question['kind'], settings.percentageDecimals)
    # Each period needs its parent base, including records with no follow-up answer.
    trend = result.get('trend')
    if trend:
        from .kobo_trends import answer_trend
        stub = [{**r, 'values': {**r['values'], question['id']: '__base__'}} for r in base]
        baseline = answer_trend(question, cfg, questions, stub, lookup, lambda _: [], [])
        old_periods = trend['periods']; periods = baseline['periods']
        trend['periods'], trend['denominators'] = periods, baseline['denominators']
        for series in trend['series']:
            old = dict(zip(old_periods, series['points']))
            series['points'] = []
            for period, count in zip(periods, baseline['denominators']):
                point = dict(old.get(period, {'count': 0}))
                point['percent'] = point['count'] / count * 100 if count and not issue else None
                series['points'].append(point)
    result['percentageMode'] = 'legacy-respondents'
    result['percentageBasis'] = ('قاعدة النسبة: ' if settings.language == 'ar' else 'Percentage base: ') + (label(parent, settings.language) if parent_base and parent else result['label'])
    result['pivotTotal'] = {'count': result['denominator'], 'percent': result['denominator'] / denominator * 100 if denominator else None}
    return result
