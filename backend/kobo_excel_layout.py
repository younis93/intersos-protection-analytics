"""Pure layout and source helpers for the grouped native Excel export."""
from __future__ import annotations

import re
from collections import Counter

from .kobo import filtered_records

DATA_HEADERS = ['QuestionId', 'Question', 'GroupId', 'Group', 'Respondent', 'AnswerCode', 'Answer', 'Selected', 'Answered', 'Breakdown1', 'Breakdown2', 'Breakdown3', 'IncludeInPivot']
EXCEL_DATA_ROWS = 1_048_575
CHART_GAP = 24
BLOCK_GAP = 72


def unique_sheet_name(title, used):
    title = re.sub(r'[\[\]:*?/\\\x00-\x1f]', ' ', str(title)).strip().strip("'").strip() or 'Analysis'
    title = title[:31].rstrip("' ") or 'Analysis'
    name, index = title, 2
    while name.casefold() in used:
        suffix = f' ({index})'; name = title[:31-len(suffix)] + suffix; index += 1
    used.add(name.casefold())
    return name


def group_sections(snapshot, separate_groups=None):
    groups = {group['id']: group for group in snapshot['groups']}
    selected = set(separate_groups) if separate_groups is not None else None
    if selected is not None and selected - groups.keys():
        raise ValueError('A selected export group no longer exists. Reopen Excel export options.')
    sections = {}
    for position, question in enumerate(snapshot['questions'], 1):
        current = question['group']; chain = []; seen = set()
        while current and current not in seen:
            seen.add(current); group = groups.get(current, {'id': current, 'label': current, 'parent': ''})
            chain.insert(0, group); current = group.get('parent', '')
        if not chain:
            owner, title, nested, kind = '', 'General', '', 'general'
        else:
            owner_group = chain[0] if selected is None else next((group for group in reversed(chain) if group['id'] in selected), None)
            if owner_group is None:
                owner, title, nested, kind = None, 'Analysis', ' / '.join(group.get('label') or group.get('name', group['id']) for group in chain), 'combined'
            else:
                owner, title, kind = owner_group['id'], owner_group.get('label') or owner_group.get('name', owner_group['id']), 'group'
                nested = ' / '.join(group.get('label') or group.get('name', group['id']) for group in chain[chain.index(owner_group)+1:])
        section = sections.setdefault(owner, {'id': owner, 'label': title, 'kind': kind, 'questions': []})
        section['questions'].append({'position': position, 'result': question, 'nested': nested})
    order = {group['id']: index for index, group in enumerate(snapshot['groups'])}
    return sorted(sections.values(), key=lambda section: order.get(section['id'], len(order)+(section['kind']=='general')))


def combined_row_count(project, snapshot, settings, limit=EXCEL_DATA_ROWS):
    counts = Counter(record['scope'] for record in filtered_records(project, settings))
    total = sum(counts[result['repeat']] * len(result['rows']) for result in snapshot['questions'])
    if total > limit:
        raise ValueError('The combined Data table exceeds Excel\u2019s row limit. Export fewer questions or a smaller filtered cohort.')
    return total


def excel_literal(value):
    return '"' + str(value).replace('"', '""') + '"'


def count_criterion(value):
    return excel_literal(str(value).replace('~', '~~').replace('*', '~*').replace('?', '~?'))


def answered_formula(question_id, answer_code, breakdowns=(), indirect=False):
    criteria = ['KoboData[QuestionId]', count_criterion(question_id), 'KoboData[AnswerCode]', count_criterion(answer_code), 'KoboData[Answered]', '1', 'KoboData[IncludeInPivot]', excel_literal('Included')]
    for index, value in enumerate(breakdowns, 1):
        criteria.extend([f'KoboData[Breakdown{index}]', count_criterion(value)])
    if indirect:
        criteria = ['INDIRECT(' + excel_literal(value) + ')' if index % 2 == 0 else value for index, value in enumerate(criteria)]
    return '=COUNTIFS(' + ','.join(criteria) + ')'
