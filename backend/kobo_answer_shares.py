"""Respondent shares and answer composition for a question's filtered cohort."""
from collections import Counter, defaultdict


def answer_source(target, source):
    return bool(source and source['kind'] in {'category', 'multiple'}
                and source.get('choices') and source['repeat'] == target['repeat'])


def answer_views(target, cfg, questions, cohort, dimensions, lookup, language):
    from .kobo import breakdown_values, label, missing

    selected_source = questions.get(cfg.answerShareQuestion)
    selected_source = selected_source if answer_source(target, selected_source) else None
    stacking = (cfg.answerStackMode and len(dimensions) == 1
                and cfg.chart in {'bar', 'column'}
                and (not cfg.calculation or cfg.calculation.operation == 'count'))
    source = selected_source or (target if stacking and answer_source(target, target) else None)
    if not source:
        return {}

    answers = {choice['name']: label(choice, language) for choice in source['choices']}
    groups = defaultdict(Counter)
    counts = Counter()
    answered = 0
    for record in cohort:
        value = record['values'].get(source['id'])
        if missing(value) or source['id'] in record.get('_conditionalExcluded', ()):
            continue
        codes = set(value) if source['kind'] == 'multiple' else {str(value)}
        answered += 1
        counts.update(codes)
        if stacking:
            group = breakdown_values(record, dimensions, lookup)[0]
            groups[group].update(codes)

    views = {}
    if selected_source and cfg.answerShareAnswer in answers:
        count = counts[cfg.answerShareAnswer]
        views['answerShare'] = {
            'questionLabel': label(source, language), 'answerLabel': answers[cfg.answerShareAnswer],
            'count': count, 'denominator': answered,
            'percent': 100 * count / answered if answered else None,
        }
    if stacking:
        dimension = dimensions[0]
        captions = {choice['name']: label(choice, language) for choice in dimension['choices']}
        for code in sorted(counts.keys() - answers.keys()):
            answers[code] = code
        if source['id'] == target['id']:
            answers = {code: name for code, name in answers.items()
                       if code not in cfg.hiddenAnswers or code == cfg.answerShareAnswer}
        views['answerStack'] = {
            'mode': cfg.answerStackMode,
            'questionId': source['id'],
            'questionLabel': label(source, language),
            'highlightedAnswer': cfg.answerShareAnswer if selected_source else '',
            'multiple': source['kind'] == 'multiple',
            'answers': [{'id': code, 'label': name} for code, name in answers.items()],
            'groups': [
                {'id': group, 'label': captions.get(group, group) if group != '__blank__' else
                 ('تقسيم مفقود' if language == 'ar' else 'Missing breakdown'),
                 'counts': {code: count for code, count in group_counts.items() if code in answers}}
                for group, group_counts in sorted(groups.items()) if group not in cfg.hiddenPivotColumns
            ],
        }
    return views
