"""Read-only questionnaire structure. Never evaluates expressions or reads responses."""
from .kobo import KoboSettings, label
from .kobo_connections import REFERENCE, connection_details, resolve_reference


def cyclic_nodes(ids, edges):
    """Iterative strongly connected components, including self references."""
    outgoing = {key: [] for key in ids}
    incoming = {key: [] for key in ids}
    for source, target in edges:
        outgoing[source].append(target)
        incoming[target].append(source)
    seen, order = set(), []
    for key in ids:
        if key in seen:
            continue
        seen.add(key)
        stack = [(key, iter(outgoing[key]))]
        while stack:
            node, children = stack[-1]
            child = next(children, None)
            if child is None:
                stack.pop()
                order.append(node)
            elif child not in seen:
                seen.add(child)
                stack.append((child, iter(outgoing[child])))
    seen, result = set(), set()
    for key in reversed(order):
        if key in seen:
            continue
        component, stack = [], [key]
        seen.add(key)
        while stack:
            node = stack.pop()
            component.append(node)
            for parent in incoming[node]:
                if parent not in seen:
                    seen.add(parent)
                    stack.append(parent)
        if len(component) > 1 or key in outgoing[key]:
            result.update(component)
    return result


def question_flow(project, language=None):
    form = project['form']
    language = language if language in {'en', 'ar'} else project.get('settings', {}).get('language', form.get('language', 'en'))
    settings = KoboSettings(language=language)
    questions = {q['id']: q for q in form['questions']}
    groups = {g['id']: g for g in form['groups']}
    edges, output_questions, output_groups = [], [], []

    def ancestors(group):
        path, seen = [], set()
        while group in groups and group not in seen:
            seen.add(group)
            path.insert(0, group)
            group = groups[group].get('parent', '')
        return path

    def details(item, is_group=False):
        path = ancestors(item.get('parent' if is_group else 'group', ''))
        own = {**item, 'group': item.get('parent', '') if is_group else item.get('group', ''),
               'repeat': next((key for key in reversed(path + ([item['id']] if is_group else [])) if groups[key].get('repeat')), '')}
        own['inheritedRelevant'] = [{'source': key, 'expression': groups[key]['relevant']} for key in path if groups[key].get('relevant', '').strip()]
        connections = connection_details(own, questions, settings)
        expression = item.get('relevant', '').strip()
        if expression:
            direct = next(c for c in connections['conditions'] if c['source'] == item['id'])
            # Extract references even when the explanation grammar is unsupported.
            for name in dict.fromkeys(REFERENCE.findall(expression)):
                parent = resolve_reference(name, own, questions)
                if parent:
                    edges.append({'id': f"condition-{len(edges)}", 'source': parent['id'], 'target': item['id'],
                                  'label': direct['readable'], 'expression': expression,
                                  'review': not direct['supported'], 'compound': len(REFERENCE.findall(expression)) > 1 or ' and ' in expression.lower() or ' or ' in expression.lower()})
        return {**item, 'label': label(item, language), 'groupPath': path, 'connections': connections}

    for group in groups.values():
        output_groups.append(details(group, True))
    for index, question in enumerate(questions.values()):
        output_questions.append({**details(question), 'number': index + 1})
    all_items = output_groups + output_questions
    ids = [item['id'] for item in all_items]
    structural = [(g['parent'], g['id']) for g in output_groups if g.get('parent') in groups]
    structural += [(q['group'], q['id']) for q in output_questions if q.get('group') in groups]
    cycles = cyclic_nodes(ids, structural + [(e['source'], e['target']) for e in edges])
    for item in all_items:
        if item['id'] in cycles:
            item['connections']['issues'].append('cyclic-dependency')
    for edge in edges:
        edge['review'] = edge['review'] or edge['source'] in cycles or edge['target'] in cycles
    return {'id': project['id'], 'name': project['name'], 'language': language,
            'questions': output_questions, 'groups': output_groups, 'edges': edges}
