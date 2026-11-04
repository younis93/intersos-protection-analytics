"""A bounded condition tree shared by analysis and workbook source generators."""
import math
import re

OPERATORS = {'eq', 'neq', 'selected', 'not-selected', 'gt', 'gte', 'lt', 'lte', 'blank', 'not-blank', 'between', 'not-between', 'contains', 'not-contains', 'starts-with', 'ends-with'}
TOKEN = re.compile(r'''\s*(\$\{[^}]+\}|'[^']*'|"[^"]*"|!=|>=|<=|=|>|<|\(|\)|,|\band\b|\bor\b|\bnot\b|\bselected\b|-?\d+(?:\.\d+)?)''', re.I)


def validate_tree(tree):
    count = 0
    def visit(node, depth=0):
        nonlocal count
        count += 1
        if count > 100 or depth > 5 or not isinstance(node, dict): raise ValueError('Connection rules are too large or deeply nested.')
        if node.get('type') == 'group':
            if node.get('match') not in {'all', 'any'} or not isinstance(node.get('rules'), list): raise ValueError('Choose AND or OR for each connection group.')
            for child in node['rules']: visit(child, depth+1)
        elif node.get('type') == 'rule':
            if not isinstance(node.get('field'), str) or node.get('operator') not in OPERATORS: raise ValueError('Invalid connection rule.')
            for key in ['value','value2']:
                value = node.get(key, '')
                if not isinstance(value, (str, int, float)) or isinstance(value, bool) or len(str(value)) > 1000: raise ValueError('Invalid connection value.')
                if isinstance(value, float) and not math.isfinite(value): raise ValueError('Invalid connection number.')
        else: raise ValueError('Invalid connection rule type.')
    if tree is not None: visit(tree)
    return tree


def fields_in(tree):
    if not tree: return []
    if tree['type'] == 'rule': return [tree['field']]
    return list(dict.fromkeys(field for child in tree['rules'] for field in fields_in(child)))


def tree_issues(tree, child, questions):
    from .kobo_connections import compatible
    if not tree: return ['incomplete-condition']
    if tree['type'] == 'group':
        return list(dict.fromkeys(issue for item in tree['rules'] for issue in tree_issues(item, child, questions))) if tree['rules'] else ['incomplete-condition']
    field = questions.get(tree['field'])
    if not field: return ['missing-rule-question']
    if not compatible(child, field): return ['incompatible-rule-scope']
    op, value = tree['operator'], tree.get('value', '')
    if op in {'blank', 'not-blank'}: return []
    if value == '': return ['missing-rule-value']
    if op in {'gt','gte','lt','lte','between','not-between'} and field['kind'] not in {'number','date'}: return ['incompatible-rule-operator']
    ranged = op in {'between','not-between'}
    if ranged and tree.get('value2','') == '': return ['missing-rule-range']
    values = [value,tree['value2']] if ranged else [value]
    if op in {'contains','not-contains','starts-with','ends-with'} and field['kind'] != 'text': return ['incompatible-rule-operator']
    if field['kind'] == 'number':
        try:
            numbers = [float(v) for v in values]
            if not all(math.isfinite(v) for v in numbers): return ['invalid-rule-number']
            if ranged and numbers[0] > numbers[1]: return ['reversed-rule-range']
        except (ValueError, TypeError): return ['invalid-rule-number']
    if field['kind'] == 'date':
        from datetime import date
        try:
            dates = [date.fromisoformat(str(v)) for v in values]
            if ranged and dates[0] > dates[1]: return ['reversed-rule-range']
        except (ValueError, TypeError): return ['invalid-rule-date']
    if op in {'selected','not-selected'} and field['kind'] != 'multiple': return ['incompatible-rule-operator']
    if field['kind'] == 'multiple' and op not in {'selected','not-selected'}: return ['incompatible-rule-operator']
    if field['kind'] in {'category','multiple'} and field.get('choices') and str(value) not in {choice['name'] for choice in field['choices']}: return ['missing-rule-answer']
    return []


def parse_condition(expression, child, questions, allow_unresolved=False):
    from .kobo_connections import resolve_reference
    tokens, offset, index = [], 0, 0
    while offset < len(expression.rstrip()):
        match = TOKEN.match(expression, offset)
        if not match: raise ValueError('Unsupported condition.')
        tokens.append(match.group(1)); offset = match.end()
        if len(tokens) > 1000: raise ValueError('Condition is too long.')
    def take():
        nonlocal index
        if index >= len(tokens): raise ValueError('Incomplete condition.')
        token = tokens[index]; index += 1; return token
    def expect(value):
        if take().lower() != value: raise ValueError('Unsupported condition.')
    def reference():
        token = take()
        if not token.startswith('${') or not token.endswith('}'): raise ValueError('Expected a question reference.')
        field = resolve_reference(token[2:-1], child, questions)
        if not field:
            if allow_unresolved: return token[2:-1]
            raise ValueError('Unresolved question reference.')
        return field['id']
    def literal():
        token = take()
        if token.startswith(("'", '"')): return token[1:-1]
        if not re.fullmatch(r'-?\d+(?:\.\d+)?', token): raise ValueError('Expected a literal value.')
        return token
    def negate(node):
        if node['type'] == 'group':
            return {'type': 'group', 'match': 'any' if node['match'] == 'all' else 'all',
                    'rules': [negate(item) for item in node['rules']]}
        complements = {'selected': 'not-selected', 'not-selected': 'selected', 'blank': 'not-blank', 'not-blank': 'blank'}
        # Preserve the existing categorical not(selected(...)) interpretation.
        if questions.get(node['field'], {}).get('kind') in {'category', 'text'}:
            complements.update(eq='neq', neq='eq')
        if node['operator'] not in complements: raise ValueError('Unsupported negation.')
        return {**node, 'operator': complements[node['operator']]}
    def atom():
        if tokens[index:index+1] == ['(']:
            take(); node = disjunction(); expect(')'); return node
        if index < len(tokens) and tokens[index].lower() == 'not':
            take(); expect('(')
            direct_selection = index < len(tokens) and tokens[index].lower() == 'selected'
            node = disjunction(); expect(')')
            if direct_selection and node['type'] == 'rule' and node['operator'] in {'eq', 'neq'}:
                return {**node, 'operator': 'neq' if node['operator'] == 'eq' else 'eq'}
            return negate(node)
        if index < len(tokens) and tokens[index].lower() == 'selected':
            take(); expect('('); field = reference(); expect(','); value = literal(); expect(')')
            operator = 'selected' if questions.get(field,{}).get('kind')=='multiple' else 'eq'
            return {'type':'rule','field':field,'operator':operator,'value':value}
        field = reference(); operator = take()
        operators = {'=':'eq','!=':'neq','>':'gt','>=':'gte','<':'lt','<=':'lte'}
        if operator not in operators: raise ValueError('Unsupported operator.')
        value = literal()
        return {'type':'rule','field':field,'operator':('blank' if operator == '=' else 'not-blank') if value == '' and operator in {'=','!='} else operators[operator],'value':value}
    def conjunction():
        nodes = [atom()]
        while index < len(tokens) and tokens[index].lower() == 'and': take(); nodes.append(atom())
        return nodes[0] if len(nodes)==1 else {'type':'group','match':'all','rules':nodes}
    def disjunction():
        nodes = [conjunction()]
        while index < len(tokens) and tokens[index].lower() == 'or': take(); nodes.append(conjunction())
        return nodes[0] if len(nodes)==1 else {'type':'group','match':'any','rules':nodes}
    try: tree = disjunction()
    except (IndexError, RecursionError) as exc: raise ValueError('Unsupported condition.') from exc
    if index != len(tokens): raise ValueError('Unsupported condition.')
    return validate_tree(tree)


def matches_tree(tree, value, kinds):
    """`value` resolves a stable field ID in the record's ancestor scope."""
    if not tree: return True
    if tree['type'] == 'group':
        return (all if tree['match']=='all' else any)(matches_tree(item,value,kinds) for item in tree['rules'])
    actual = value(tree['field']); expected = tree.get('value', ''); op = tree['operator']
    blank = actual is None or actual == '' or actual == [] or isinstance(actual,str) and not actual.strip()
    if op == 'blank': return blank
    if op == 'not-blank': return not blank
    if op in {'selected','not-selected'}:
        selected = str(expected) in (actual if isinstance(actual,list) else str(actual or '').split())
        return not selected if op=='not-selected' else selected
    if blank: return op=='neq'
    if op in {'contains','not-contains','starts-with','ends-with'}:
        actual, expected = str(actual).lower(), str(expected).lower()
        return {'contains':lambda:expected in actual,'not-contains':lambda:expected not in actual,'starts-with':lambda:actual.startswith(expected),'ends-with':lambda:actual.endswith(expected)}[op]()
    if op in {'between','not-between'}:
        upper = tree.get('value2','')
        try:
            if kinds[tree['field']] == 'number':
                actual,expected,upper = float(actual),float(expected),float(upper)
                if not all(math.isfinite(v) for v in [actual,expected,upper]): return False
            else:
                from datetime import date
                actual,expected,upper = date.fromisoformat(str(actual)[:10]),date.fromisoformat(str(expected)),date.fromisoformat(str(upper))
            within = expected <= actual <= upper
            return not within if op=='not-between' else within
        except (ValueError,TypeError): return False
    if kinds[tree['field']] == 'number':
        try: actual,expected = float(actual),float(expected)
        except (ValueError,TypeError): return False
    else: actual,expected = str(actual)[:10] if kinds[tree['field']]=='date' else str(actual),str(expected)
    return {'eq':lambda:actual==expected,'neq':lambda:actual!=expected,'gt':lambda:actual>expected,'gte':lambda:actual>=expected,'lt':lambda:actual<expected,'lte':lambda:actual<=expected}[op]()


def describe_tree(tree, questions, language):
    from .kobo import label
    if not tree: return ''
    ar = language == 'ar'
    if tree['type'] == 'group':
        join = (' و ' if ar else ' AND ') if tree['match']=='all' else (' أو ' if ar else ' OR ')
        return '(' + join.join(describe_tree(item,questions,language) for item in tree['rules']) + ')'
    field = questions.get(tree['field'])
    if not field: return tree['field']
    value = str(tree.get('value',''))
    choice = next((c for c in field.get('choices',[]) if c['name']==value),None)
    caption = label(choice,language) if choice else value
    operators = {'eq':'=','neq':'≠','gt':'>','gte':'≥','lt':'<','lte':'≤','selected':'يتضمن' if ar else 'includes','not-selected':'لا يتضمن' if ar else 'does not include','blank':'فارغ' if ar else 'is blank','not-blank':'غير فارغ' if ar else 'is not blank'}
    operators.update({'contains':'يحتوي على' if ar else 'contains','not-contains':'لا يحتوي على' if ar else 'does not contain','starts-with':'يبدأ بـ' if ar else 'starts with','ends-with':'ينتهي بـ' if ar else 'ends with','between':'بين' if ar else 'between','not-between':'ليس بين' if ar else 'not between'})
    if tree['operator'] in {'between','not-between'}: caption += (' و ' if ar else ' and ') + str(tree.get('value2',''))
    return f"{label(field,language)} {operators[tree['operator']]}" + ('' if tree['operator'] in {'blank','not-blank'} else ' ' + caption)


def excel_condition(tree, raw, kinds):
    from .kobo_excel_layout import excel_literal
    if not tree: return 'TRUE'
    if tree['type']=='group':
        if not tree['rules']: return 'FALSE'
        return ('AND' if tree['match']=='all' else 'OR')+'('+','.join(excel_condition(child,raw,kinds) for child in tree['rules'])+')'
    value = raw(tree['field']); expected = excel_literal(str(tree.get('value',''))); op = tree['operator']
    if op in {'blank','not-blank'}: return f'({value}{"=" if op=="blank" else "<>"}"")'
    if op in {'selected','not-selected'}:
        normalized = f'TRIM(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({value},CHAR(9)," "),CHAR(10)," "),CHAR(13)," "))'
        expression = f'ISNUMBER(FIND({excel_literal(" "+str(tree.get("value",""))+" ")}," "&{normalized}&" "))'
        return 'NOT('+expression+')' if op=='not-selected' else expression
    if op in {'contains','not-contains','starts-with','ends-with'}:
        actual = f'LOWER({value}&"")'
        needle = f'LOWER({expected})'
        test = f'ISNUMBER(FIND({needle},{actual}))' if op in {'contains','not-contains'} else f'EXACT({"LEFT" if op=="starts-with" else "RIGHT"}({actual},LEN({needle})),{needle})'
        if op=='not-contains': test = f'NOT({test})'
        return f'IFERROR(AND(LEN(TRIM({value}&""))>0,{test}),FALSE)'
    if op in {'between','not-between'}:
        numeric = kinds[tree['field']]=='number'
        actual = value if numeric else f'INT({value})'
        bounds = [format(float(tree[k]),'.15g') if numeric else 'DATE('+','.join(str(int(part)) for part in str(tree[k]).split('-'))+')' for k in ['value','value2']]
        test = f'AND({actual}>={bounds[0]},{actual}<={bounds[1]})'
        if op=='not-between': test = f'NOT({test})'
        return f'IFERROR(AND(LEN(TRIM({value}&""))>0,ISNUMBER({value}),{test}),FALSE)'
    if kinds[tree['field']]=='date' and op in {'gt','gte','lt','lte'}:
        operator={'gt':'>','gte':'>=','lt':'<','lte':'<='}[op]
        date_value='DATE('+','.join(str(int(part)) for part in str(tree['value']).split('-'))+')'
        return f'IFERROR(AND({value}<>"",INT({value}){operator}{date_value}),FALSE)'
    if kinds[tree['field']]=='number':
        operator={'eq':'=','neq':'<>','gt':'>','gte':'>=','lt':'<','lte':'<='}[op]
        number = format(float(tree.get('value',0)), '.15g')
        comparison=f'IFERROR(AND({value}<>"",{value}{operator}{number}),FALSE)'
        return f'OR({value}="",{comparison})' if op=='neq' else comparison
    if kinds[tree['field']]=='date': value = f'IF({value}="","",TEXT({value},"yyyy-mm-dd"))'
    expression = f'EXACT({value}&"",{expected})'
    return 'NOT('+expression+')' if op=='neq' else expression


def tree_diagnostics(tree, child, questions, path=None):
    """Describe each invalid leaf without dropping reparable conditions."""
    path = [] if path is None else path
    if tree and tree.get('type') == 'group' and tree.get('rules'):
        return [issue for i, node in enumerate(tree['rules']) for issue in tree_diagnostics(node, child, questions, [*path, i])]
    field_id = tree.get('field', '') if tree else ''
    field = questions.get(field_id)
    from .kobo_connections import compatible
    return [dict(code=code, path=path, field=field_id, value=str(tree.get('value', '')) if tree else '', availableIds=[c['name'] for c in field.get('choices', [])] if code == 'missing-rule-answer' and field else [q['id'] for q in questions.values() if compatible(child, q)]) for code in tree_issues(tree, child, questions)]
