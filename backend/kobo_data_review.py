"""Grouped Kobo review tables sharing raw identities and reversible corrections."""
from collections import defaultdict
import pandas as pd

from .kobo_conditional import condition_group, digest, review as conditional_review
from .kobo_quality import quality_review
from .column_filters import apply_column_filters, value_page


TITLES = {
    'required-missing': ('Required answer missing', 'إجابة مطلوبة مفقودة'),
    'connected-blank': ('Connected answer blank', 'إجابة مرتبطة فارغة'),
    'conflict': ('Answer conflicts with its condition', 'الإجابة تتعارض مع شرطها'),
    'uncheckable': ('Condition could not be checked', 'تعذّر فحص الشرط'),
}


def data_review(project, settings, *, group='', category='all', status='open', question='', search='', group_search='', column_filters=None, page=1, page_size=25, focus_record=''):
    language = settings.language
    def t(en, ar): return ar if language == 'ar' else en
    generic = quality_review(project, settings, check_id=group, page=1, page_size=10**9)
    conditional = conditional_review(project, settings, status='all', page_size=10**9)
    revision = conditional['revision']
    groups, records = {}, defaultdict(list)
    from .kobo import resolved_question_settings
    from .kobo_connections import form_question_index, connection_plan
    from .kobo_required import required_plan
    from .kobo_connection_rules import describe_tree
    questions = form_question_index(project['form'])
    def rule_summary(qid, problem, suggestion):
        q = questions.get(qid)
        if not q:
            return {'problem': problem, 'required': {'mode': 'unknown', 'label': t('Not a question-level check', 'ليس فحصاً لسؤال محدد')},
                    'applies': {'mode': 'all', 'label': t('Records in this check', 'السجلات ضمن هذا الفحص'), 'source': 'form'}, 'nextStep': suggestion}
        required = required_plan(q, questions)
        required_mode = 'unknown' if required['issues'] else 'always' if required['constant'] is True else 'optional' if required['constant'] is False else 'conditional'
        required_label = {'always': t('Always', 'دائماً'), 'optional': t('Optional', 'اختياري'), 'unknown': t('Could not be determined', 'تعذّر تحديده')}.get(required_mode)
        if required_mode == 'conditional': required_label = describe_tree(required['tree'], questions, language)
        cfg = resolved_question_settings(q, settings)
        plan = connection_plan(q, cfg, questions)
        connected = bool(plan['tree'] or plan['reviewIssues'])
        applies_mode = 'all' if not connected else 'unknown' if plan['reviewIssues'] or not plan['tree'] else 'conditional'
        applies_label = t('All submissions in this response table', 'جميع الاستجابات في هذا الجدول') if applies_mode == 'all' else t('Could not be determined', 'تعذّر تحديده') if applies_mode == 'unknown' else describe_tree(plan['tree'], questions, language)
        return {'problem': problem, 'required': {'mode': required_mode, 'label': required_label},
                'applies': {'mode': applies_mode, 'label': applies_label, 'source': 'manual' if cfg.connectionSource == 'manual' else 'form'}, 'nextStep': suggestion}
    if status in {'open', 'all'}:
        for check in generic.checks:
            if category not in {'all', 'other'}: continue
            if question and check.question != question: continue
            groups[check.id] = {**check.model_dump(), 'kind': 'other', 'canIgnore': False}
            groups[check.id]['rule'] = rule_summary(check.question, check.title, check.suggestion)
        if group in groups:
            check = groups[group]
            for row in generic.rows:
                records[group].append({**row.model_dump(), 'id': digest([group, row.id]), 'record': row.id,
                    'question': row.field, 'label': row.question, 'status': 'open', 'outcome': 'other',
                    'fingerprint': '', 'controls': [], 'controlling': '', 'condition': '', 'requiredCondition': '',
                    'suggestion': check['suggestion'], 'canIgnore': False, 'rule': check['rule']})
    for row in conditional['rows']:
        if status != 'all' and row['status'] != status: continue
        if question and row['question'] != question: continue
        kind = row['outcome']
        row_category = 'missing' if kind in {'required-missing', 'connected-blank'} else 'conflicts' if kind == 'conflict' else 'checks'
        if category not in {'all', row_category}: continue
        gid = 'condition:'+condition_group(row) if kind == 'uncheckable' else kind+':'+row['question']
        controls = ' · '.join(c['label']+': '+(c['answer'] or t('Blank', 'فارغة')) for c in row['controls'])
        if kind == 'required-missing':
            problem = t('No answer was recorded.', 'لم تُسجل إجابة.')
            reason = t('This question applies and requires an answer, but the stored cell is blank.', 'ينطبق هذا السؤال ويتطلب إجابة، لكن الخلية المخزنة فارغة.')
            suggestion = t('Verify the source response and enter the missing answer.', 'تحقق من الاستجابة الأصلية وأدخل الإجابة المفقودة.')
        elif kind == 'connected-blank':
            problem = t('This optional connected answer is blank.', 'هذه الإجابة المرتبطة الاختيارية فارغة.')
            reason = t('The connection condition is met, but this optional answer is blank. It may be intentional.', 'شرط الارتباط متحقق، لكن هذه الإجابة الاختيارية فارغة. قد يكون ذلك مقصوداً.')
            suggestion = t('Check whether an answer was expected. Fill it or acknowledge this check.', 'تحقق مما إذا كانت الإجابة متوقعة. أدخلها أو أكد مراجعة هذا الفحص.')
        elif kind == 'conflict':
            problem = t('An answer is present outside its condition.', 'توجد إجابة خارج شرط انطباقها.')
            reason = t('This answer should be blank because the controlling answers do not meet its condition.', 'يجب أن تكون هذه الإجابة فارغة لأن الإجابات المتحكمة لا تحقق شرطها.')
            suggestion = t('Verify the answer and controlling values before correcting or excluding it.', 'تحقق من الإجابة والقيم المتحكمة قبل تصحيحها أو استبعادها.')
        else:
            problem = t('The app could not evaluate this rule.', 'تعذّر على التطبيق تقييم هذا الشرط.')
            reason = t('No answer error has been confirmed. The rule or required status could not be evaluated.', 'لم يتم تأكيد خطأ في الإجابة. تعذّر تقييم الشرط أو حالة الإلزام.')
            suggestion = t('Inspect the condition setup or original form. Do not assume an answer is required.', 'راجع إعداد الشرط أو الاستمارة الأصلية. لا تفترض أن الإجابة مطلوبة.')
        if row.get('condition'): reason += ' '+t('Applies when: ', 'ينطبق عندما: ')+row['condition']
        if row.get('requiredCondition'): reason += ' '+t('Required when: ', 'مطلوب عندما: ')+row['requiredCondition']
        if gid not in groups:
            groups[gid] = {'id': gid, 'title': TITLES[kind][language == 'ar'], 'kind': row_category, 'findingType': kind,
                'severity': 'correction' if kind in {'required-missing', 'conflict'} else 'check', 'question': row['question'],
                'label': row['label'], 'count': 0, 'explanation': reason, 'suggestion': suggestion, 'canIgnore': True}
            groups[gid]['rule'] = rule_summary(row['question'], problem, suggestion)
        groups[gid]['count'] += 1
        records[gid].append({**row, 'field': row['question'], 'controlling': controls, 'reason': reason,
                             'suggestion': suggestion, 'canIgnore': True, 'rule': groups[gid]['rule']})
    if category in {'all', 'checks'} and status in {'open', 'all'}:
        seen_shared = set()
        for qid, setup in conditional.get('connectionSetups', {}).items():
            if question and question != qid: continue
            shared = setup.get('shared')
            if shared and not question:
                if shared['fingerprint'] in seen_shared: continue
                seen_shared.add(shared['fingerprint'])
            q = questions[qid]
            gid = 'connection-setup:'+qid
            messages = {
                'missing-form-connection': ('The Kobo form contains a condition that is missing from this project. Review the connection before checking answers.', 'تحتوي استمارة كوبو على شرط غير موجود في هذا المشروع. راجع الارتباط قبل فحص الإجابات.'),
                'source-condition-mismatch': ('The saved connection differs from the original Kobo form. Review it before checking answers.', 'يختلف الارتباط المحفوظ عن استمارة كوبو الأصلية. راجعه قبل فحص الإجابات.'),
                'source-condition-changed': ('The original Kobo condition has changed. Review the connection before checking answers.', 'تغيّر شرط كوبو الأصلي. راجع الارتباط قبل فحص الإجابات.'),
                'configured-connection-changed': ('The configured connection has changed. Review it before checking answers.', 'تغيّر الارتباط المُعدّ. راجعه قبل فحص الإجابات.'),
                'ambiguous-question-identity': ('This question could not be matched reliably to the original form. Review the connection setup before checking answers.', 'تعذّرت مطابقة هذا السؤال بالاستمارة الأصلية بشكل موثوق. راجع إعداد الارتباط قبل فحص الإجابات.'),
            }
            reason = t(*messages.get(setup['reason'], ('The original connection could not be verified. Review the connection setup before checking answers.', 'تعذّر التحقق من الارتباط الأصلي. راجع إعداد الارتباط قبل فحص الإجابات.')))
            from .kobo import label
            shared_label = ''
            if shared:
                import re
                expressions = [setup['recovered']['relevant']] + [r['expression'] for r in setup['recovered']['inheritedRelevant']]
                references = sorted(set(re.findall(r'\$\{([^}]+)\}', ' '.join(expressions))))
                shared_label = ', '.join(label(next((v for v in questions.values() if v['id']==ref or v['name']==ref), {'name':ref,'labels':{}}), language) for ref in references)
            groups[gid] = {'id':gid,'title':t('Connection setup needed','يلزم إعداد الارتباط'),'kind':'checks',
                'findingType':'connection-setup-needed','severity':'check','question':qid,'label':t('Shared connection', 'ارتباط مشترك')+' - '+(shared_label or label(q, language)) if shared else label(q, language),'count':len(shared['questions']) if shared else 1,
                'searchLabels':' '.join(label(questions[id], language) for id in shared['questions']) if shared else '',
                'explanation':reason+(t(' Review this source rule once for all dependent questions. Each question retains its own connection.', ' راجع شرط المصدر مرة واحدة لجميع الأسئلة التابعة. يحتفظ كل سؤال بارتباطه.') if shared else ''),'suggestion':t('Edit connection','تعديل الارتباط'),'canIgnore':False,
                'rule':{'problem':reason,'required':{'mode':'unknown','label':''},'applies':{'mode':'setup-required','label':'','source':'form'},'nextStep':''}}
    query = group_search.strip().casefold()
    visible_groups = [g for g in groups.values() if not query or query in ' '.join(str(g.get(k, '')) for k in ['title','label','explanation','suggestion','searchLabels']).casefold()]
    order = {'connection-setup-needed': -1, 'required-missing': 0, 'conflict': 1, 'connected-blank': 2, 'uncheckable': 4}
    visible_groups.sort(key=lambda g: (order.get(g.get('findingType'), 3), g.get('label', ''), g['title']))
    selected = records.get(group, []) if group in {g['id'] for g in visible_groups} else []
    query = search.strip().casefold()
    if query:
        selected = [r for r in selected if query in ' '.join(str(r.get(k, '')) for k in ['row','scope','label','answer','controlling','reason','suggestion']).casefold()]
    frame = pd.DataFrame([{k: row.get(k, '') for k in ['row','scope','label','answer','controlling','reason','suggestion','status']} for row in selected], columns=['row','scope','label','answer','controlling','reason','suggestion','status'])
    if column_filters:
        indexes = apply_column_filters(frame, column_filters).index
        selected = [selected[index] for index in indexes]
    def row_order(row): return (row.get('scopeId', ''), row['row'], row['record'])
    selected.sort(key=row_order)
    focused = next((row for row in selected if row['record'] == focus_record), None)
    navigation = {'previous': None, 'next': None, 'position': None, 'total': len(selected)}
    if focused:
        index = selected.index(focused)
        page = index // page_size + 1
        navigation.update(previous=selected[index-1]['record'] if index else None,
                          next=selected[index+1]['record'] if index+1 < len(selected) else None, position=index+1)
    elif focus_record:
        anchor = next((r for r in project['records'] if r['id'] == focus_record), None)
        if anchor:
            anchor_order = (anchor['scope'], anchor['row'], anchor['id'])
            before = [r for r in selected if row_order(r) < anchor_order]
            after = [r for r in selected if row_order(r) > anchor_order]
            navigation.update(previous=before[-1]['record'] if before else None, next=after[0]['record'] if after else None)
    page = max(1, min(page, max(1, (len(selected)+page_size-1)//page_size)))
    start = (page-1)*page_size
    return {'revision': revision, 'group': group, 'category': category, 'status': status, 'groups': visible_groups, 'rows': selected[start:start+page_size], 'matched': len(selected),
            'page': page, 'pageSize': page_size, 'total': generic.total, 'affected': generic.affected,
            'focusedRow': focused, 'navigation': navigation,
            'filterSummary': generic.filterSummary, 'notes': [note for note in generic.notes if not note.startswith('Saved import note (whole import, not filter-scoped):')],
            'summary': conditional['summary']}


def data_review_values(project, settings, column, *, column_filters=None, value_search='', offset=0, **kwargs):
    result = data_review(project, settings, page=1, page_size=10**9, **kwargs)
    columns = ['row','scope','label','answer','controlling','reason','suggestion','status']
    frame = pd.DataFrame([{k: row.get(k, '') for k in columns} for row in result['rows']], columns=columns)
    return value_page(frame, column, column_filters, value_search, offset)
