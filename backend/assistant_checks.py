"""Read-only aggregate checks for the local project assistant."""
from collections import Counter
from typing import Literal

from pydantic import BaseModel, Field

from .kobo import KoboSettings, filtered_records, label, missing
from .kobo_conditional import analysis_project


class CrossQuestionCheck(BaseModel):
    settings: KoboSettings
    first: str
    second: str
    when: str = ''
    expectation: Literal['patterns', 'blank', 'answer', 'different'] = 'patterns'
    expected: str = ''


def check_questions(project, check, minimum):
    settings = check.settings
    fields = {q['id']: q for q in project['form']['questions']
              if q['kind'] == 'category' and not q.get('repeat') and not q.get('identifying')
              and not q.get('metadata') and q['id'] not in settings.hidden}
    if check.first == check.second or not {check.first, check.second} <= fields.keys():
        raise ValueError('Choose two different visible single-choice questions from the main form.')
    choices = {field: {c['name']: label(c, 'en') for c in fields[field]['choices']
                       if field not in settings.questions or c['name'] not in settings.questions[field].hiddenAnswers}
               for field in (check.first, check.second)}
    if check.expectation != 'patterns' and (check.when not in choices[check.first] or
        (check.expectation in {'answer', 'different'} and check.expected not in choices[check.second])):
        raise ValueError('Choose visible answer options for the rule.')
    protected = lambda n: 0 < n < minimum
    cohort = [r for r in filtered_records(analysis_project(project, settings), settings) if not r.get('scope')]
    pairs = Counter()
    matched = violations = 0
    for record in cohort:
        values = record['values']
        a, b = values.get(check.first), values.get(check.second)
        if not isinstance(a, str) or a not in choices[check.first]:
            continue
        if not missing(b) and (not isinstance(b, str) or b not in choices[check.second]):
            continue
        if check.expectation == 'patterns':
            if not missing(b):
                pairs[a, b] += 1
        elif a == check.when:
            matched += 1
            good = missing(b) if check.expectation == 'blank' else (
                b == check.expected if check.expectation == 'answer' else not missing(b) and b != check.expected)
            violations += not good
    if check.expectation != 'patterns':
        if any(protected(n) for n in (len(cohort), matched, len(cohort)-matched, violations, matched-violations)):
            return {'withheld': True}
        return {'checked': matched, 'violations': violations}
    total = sum(pairs.values())
    # Release the whole matrix only when its cells and complementary totals pass the same threshold.
    if protected(total) or protected(len(cohort)-total) or any(protected(n) or protected(total-n) for n in pairs.values()):
        return {'withheld': True}
    return {'patterns': [{'first': choices[check.first][a], 'second': choices[check.second][b], 'count': n}
                         for (a, b), n in sorted(pairs.items(), key=lambda pair: (pair[1], pair[0]))[:8]]}
