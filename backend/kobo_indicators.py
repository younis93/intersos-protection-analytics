"""Auditable, per-record indicator scores. Definitions never modify response data."""
from __future__ import annotations

import math
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class NumericScoreRange(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    minimum: float | None = None
    maximum: float | None = None
    includeMaximum: bool = False
    points: float = Field(ge=0, le=1e12)


class IndicatorQuestion(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    question: str
    kind: Literal['category', 'multiple', 'number']
    weight: float = Field(1, gt=0, le=1e6)
    points: dict[str, float | None] = Field(default_factory=dict)
    multipleMethod: Literal['sum', 'highest'] | None = None
    ranges: list[NumericScoreRange] = Field(default_factory=list, max_length=100)
    selectedCodes: list[str] = Field(default_factory=list)

    @model_validator(mode='after')
    def finite_points(self):
        if any(value is not None and (not math.isfinite(value) or value < 0 or value > 1e12) for value in self.points.values()):
            raise ValueError('Answer points must be finite numbers from 0 to 1,000,000,000,000.')
        return self


class IndicatorDefinition(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field('', max_length=4000)
    higherMeaning: str = Field('', max_length=2000)
    scope: str = ''
    questions: list[IndicatorQuestion] = Field(default_factory=list, max_length=100)
    reviewIssues: list[str] = Field(default_factory=list)
    mode: Literal['score', 'percentage', 'numeric_sum', 'numeric_average'] = 'score'
    conditionMatch: Literal['all', 'any'] = 'all'


class IndicatorPivotRow(BaseModel):
    label: str
    count: int = 0
    percent: float | None = None
    completeCount: int = 0
    completePercent: float | None = None
    points: float | None = None


class IndicatorQuestionPivot(BaseModel):
    question: str
    label: str
    answered: int = 0
    missing: int = 0
    unscorable: int = 0
    complete: int = 0
    multiple: bool = False
    maximum: float = 0
    share: float = 0
    averagePoints: float | None = None
    averageNormalized: float | None = None
    averageContribution: float | None = None
    numericTotal: float | None = None
    numericAverage: float | None = None
    rows: list[IndicatorPivotRow] = Field(default_factory=list)


class IndicatorContribution(BaseModel):
    question: str
    label: str
    answer: str
    points: float | None
    maximum: float
    weight: float
    share: float
    normalized: float | None
    contribution: float | None
    reason: str | None


class IndicatorRecord(BaseModel):
    id: str
    row: int
    status: Literal['complete', 'incomplete']
    score: float | None
    contributions: list[IndicatorContribution]


class IndicatorResult(BaseModel):
    id: str
    name: str
    total: int = 0
    complete: int = 0
    incomplete: int = 0
    completeness: float | None = None
    average: float | None = None
    issues: list[str] = Field(default_factory=list)
    filterSummary: list[str] = Field(default_factory=list)
    methodology: str = ''
    rows: list[IndicatorRecord] = Field(default_factory=list)
    matched: int = 0
    page: int = 1
    pageSize: int = 25
    mode: str = 'score'
    conditionMatch: str = 'all'
    value: float | None = None
    numerator: float | None = None
    denominator: int = 0
    questionPivots: list[IndicatorQuestionPivot] = Field(default_factory=list)


def scope_ancestors(form, scope):
    groups = {g['id']: g for g in form['groups']}
    if scope and (scope not in groups or not groups[scope]['repeat']):
        return None
    scopes, current, seen = {scope, ''}, scope, set()
    while current and current not in seen:
        seen.add(current)
        current = groups.get(current, {}).get('parent', '')
        if groups.get(current, {}).get('repeat'):
            scopes.add(current)
    return scopes


def maximum_points(rule):
    if rule.kind == 'number':
        return max((item.points for item in rule.ranges), default=0)
    points = [value for value in rule.points.values() if value is not None]
    return sum(points) if rule.kind == 'multiple' and rule.multipleMethod == 'sum' else max(points, default=0)


def indicator_issues(project, definition):
    issues = list(definition.reviewIssues)
    if not definition.name.strip(): issues.append('Enter an indicator name.')
    if definition.mode == 'score' and not definition.higherMeaning.strip(): issues.append('Explain what a higher score means.')
    if not definition.questions: issues.append('Select at least one scoring question.')
    if len({item.question for item in definition.questions}) != len(definition.questions): issues.append('Each scoring question must appear only once.')
    scopes = scope_ancestors(project['form'], definition.scope)
    if scopes is None: issues.append('The selected repeat table no longer exists.')
    questions = {q['id']: q for q in project['form']['questions']}
    for rule in definition.questions:
        question = questions.get(rule.question)
        if question is None:
            issues.append(f'Question no longer exists: {rule.question}.'); continue
        caption = question['name']
        if question.get('identifying'): issues.append(f'{caption}: identifying fields cannot be used for scoring.')
        if question['kind'] != rule.kind: issues.append(f'{caption}: question type changed; review its scoring rules.')
        if scopes is not None and question['repeat'] not in scopes: issues.append(f'{caption}: choose a question in the scoring table or its parent records.')
        if definition.mode in {'numeric_sum', 'numeric_average'}:
            if rule.kind != 'number': issues.append(f'{caption}: numeric calculations require numeric questions.')
            continue
        if rule.kind in {'category', 'multiple'}:
            codes = {choice['name'] for choice in question['choices']}
            if not codes: issues.append(f'{caption}: no configured answer options are available.')
            if definition.mode == 'percentage':
                if not rule.selectedCodes or not set(rule.selectedCodes) <= codes: issues.append(f'{caption}: select at least one current answer option for the condition.')
                continue
            if codes != rule.points.keys() or any(value is None for value in rule.points.values()):
                issues.append(f'{caption}: assign points explicitly to every current answer option and remove obsolete options.')
            if rule.kind == 'multiple' and rule.multipleMethod is None: issues.append(f'{caption}: choose Add selected points or Highest selected score.')
        else:
            if not rule.ranges: issues.append(f'{caption}: add at least one numeric scoring range.')
            ranges = sorted(rule.ranges, key=lambda item: -math.inf if item.minimum is None else item.minimum)
            for index, item in enumerate(ranges):
                if item.minimum is not None and item.maximum is not None and (item.minimum > item.maximum or item.minimum == item.maximum and not item.includeMaximum):
                    issues.append(f'{caption}: a numeric range has invalid boundaries.')
                if index:
                    previous = ranges[index-1]
                    if previous.maximum is None or item.minimum is None or previous.maximum > item.minimum or previous.maximum == item.minimum and previous.includeMaximum:
                        issues.append(f'{caption}: numeric scoring ranges must not overlap.')
        if definition.mode == 'score' and maximum_points(rule) <= 0: issues.append(f'{caption}: maximum possible points must be greater than zero.')
    return list(dict.fromkeys(issues))


def filter_descriptions(project, settings):
    from .kobo import label, filter_rule_summary
    questions = {q['id']: q for q in project['form']['questions']}
    descriptions = []
    for rule in settings.filters:
        question = questions.get(rule.field)
        if not question: continue
        captions = {c['name']: label(c, settings.language) for c in question['choices']}
        value = filter_rule_summary(rule, captions)
        descriptions.append(f'{label(question, settings.language)}: {value}')
    return descriptions


def answer_owner(record, question, lookup):
    owner, seen = record, set()
    while owner is not None and owner['scope'] != question['repeat']:
        if owner['id'] in seen: return None
        seen.add(owner['id']); owner = lookup.get(owner.get('parent'))
    return owner


def in_range(value, item):
    return (item.minimum is None or value >= item.minimum) and (item.maximum is None or value < item.maximum or item.includeMaximum and value == item.maximum)


def score_record(record, definition, questions, lookup, language):
    from .kobo import label, missing
    total_weight = sum(rule.weight for rule in definition.questions)
    contributions = []
    for rule in definition.questions:
        question = questions[rule.question]
        owner = answer_owner(record, question, lookup)
        value = owner['values'].get(rule.question) if owner else None
        reason, points = None, None
        if owner is None: reason = 'Parent response is missing.'
        elif missing(value): reason = 'Required answer is missing or was not asked.'
        elif rule.kind == 'number':
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value): reason = 'Answer is not a valid number.'
            else:
                bucket = next((item for item in rule.ranges if in_range(value, item)), None)
                if definition.mode in {'numeric_sum', 'numeric_average'}: points = value
                elif definition.mode == 'percentage': points = float(bucket is not None)
                elif bucket is None: reason = 'Answer is outside the configured numeric ranges.'
                else: points = bucket.points
        else:
            selected = list(dict.fromkeys(value)) if rule.kind == 'multiple' and isinstance(value, list) and all(isinstance(code, str) for code in value) else [value] if rule.kind == 'category' and isinstance(value, str) else []
            codes = {choice['name'] for choice in question['choices']} if definition.mode == 'percentage' else rule.points
            if not selected or any(code not in codes for code in selected): reason = 'Answer contains an unrecognized option or invalid value.'
            elif definition.mode == 'percentage': points = float(bool(set(selected) & set(rule.selectedCodes)))
            else:
                selected_points = [rule.points[code] for code in selected]
                points = sum(selected_points) if rule.kind == 'multiple' and rule.multipleMethod == 'sum' else max(selected_points)
        maximum = maximum_points(rule) if definition.mode == 'score' else 1 if definition.mode == 'percentage' else 0
        normalized = points / maximum if points is not None and maximum else None
        captions = {choice['name']: label(choice, language) for choice in question['choices']}
        answer = ', '.join(captions.get(str(v), str(v)) for v in value) if isinstance(value, list) else '' if missing(value) else captions.get(str(value), str(value))
        share = rule.weight / total_weight if definition.mode == 'score' else 1/len(definition.questions)
        contribution = normalized*share*100 if normalized is not None and definition.mode == 'score' else points/(len(definition.questions) if definition.mode == 'numeric_average' else 1) if points is not None and definition.mode.startswith('numeric_') else None
        contributions.append(IndicatorContribution(question=rule.question, label=label(question, language), answer=answer, points=points, maximum=maximum, weight=rule.weight, share=share*100,
            normalized=normalized*100 if normalized is not None else None, contribution=contribution, reason=reason))
    complete = all(item.reason is None for item in contributions)
    score = None
    if complete:
        if definition.mode == 'percentage': score = float((all if definition.conditionMatch == 'all' else any)(item.points == 1 for item in contributions))*100
        else: score = math.fsum(item.contribution for item in contributions)
        if definition.mode == 'score': score = min(100., max(0., score))
    return IndicatorRecord(id=record['id'], row=record['row'], status='complete' if complete else 'incomplete', score=score, contributions=contributions)


def calculate_indicator(project, settings, definition, *, status='all', page=1, page_size=25, records=None):
    from .kobo import filtered_records, label, missing
    issues = indicator_issues(project, definition)
    if issues: raise ValueError('\n'.join(issues))
    if records is None: records = filtered_records(project, settings)
    questions = {q['id']: q for q in project['form']['questions']}
    lookup = {record['id']: record for record in project['records']}
    selected, complete, incomplete, scores, total = [], 0, 0, [], 0
    start = (page-1)*page_size
    matched = 0
    pivots, accumulators = [], []
    for rule in definition.questions:
        question = questions[rule.question]
        rows = [IndicatorPivotRow(label=label(choice, settings.language), points=rule.points.get(choice['name']) if definition.mode == 'score' else float(choice['name'] in rule.selectedCodes) if definition.mode == 'percentage' else None) for choice in question['choices']] if rule.kind != 'number' else [IndicatorPivotRow(label=range_label(r), points=r.points if definition.mode == 'score' else 1) for r in rule.ranges] if not definition.mode.startswith('numeric_') else [IndicatorPivotRow(label='Valid numeric answers')]
        pivots.append(IndicatorQuestionPivot(question=rule.question, label=label(question, settings.language), multiple=rule.kind == 'multiple', maximum=maximum_points(rule) if definition.mode == 'score' else 1 if definition.mode == 'percentage' else 0, share=rule.weight/sum(r.weight for r in definition.questions)*100 if definition.mode == 'score' else 100/len(definition.questions), rows=rows))
        if definition.mode == 'percentage' and rule.kind == 'number': pivots[-1].rows.append(IndicatorPivotRow(label='Does not meet any configured range', points=0))
        accumulators.append({'points': [], 'normalized': [], 'contribution': [], 'numeric': []})
    for record in records:
        if record['scope'] != definition.scope: continue
        total += 1
        scored = score_record(record, definition, questions, lookup, settings.language)
        if scored.status == 'complete': complete += 1; scores.append(scored.score)
        else: incomplete += 1
        for rule, part, pivot, acc in zip(definition.questions, scored.contributions, pivots, accumulators):
            question = questions[rule.question]
            owner = answer_owner(record, question, lookup)
            value = owner['values'].get(rule.question) if owner else None
            if missing(value): pivot.missing += 1
            else: pivot.answered += 1
            if part.reason and not missing(value): pivot.unscorable += 1
            if scored.status == 'complete':
                pivot.complete += 1
                for field in ('points', 'normalized', 'contribution'):
                    if getattr(part, field) is not None: acc[field].append(getattr(part, field))
                if rule.kind == 'number': acc['numeric'].append(value)
            indices = []
            if rule.kind == 'number' and isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
                indices = [0] if definition.mode.startswith('numeric_') else [i for i, r in enumerate(rule.ranges) if in_range(value, r)]
                if not indices and definition.mode == 'percentage': indices = [len(rule.ranges)]
            elif rule.kind != 'number':
                codes = value if isinstance(value, list) else [value]
                indices = [i for i, choice in enumerate(question['choices']) if choice['name'] in codes]
            for i in indices:
                pivot.rows[i].count += 1
                if scored.status == 'complete': pivot.rows[i].completeCount += 1
        if status == 'all' or status == scored.status:
            if start <= matched < start+page_size: selected.append(scored)
            matched += 1
    rules = []
    total_weight = sum(item.weight for item in definition.questions)
    for item in definition.questions:
        question = questions[item.question]
        if definition.mode.startswith('numeric_'): scoring = 'Use the original numeric answer, without converting it to points'
        elif definition.mode == 'percentage' and item.kind != 'number':
            scoring = 'Match any of: '+', '.join(label(c, settings.language) for c in question['choices'] if c['name'] in item.selectedCodes)
        elif definition.mode == 'percentage': scoring = 'Match any range: '+ '; '.join(range_label(r) for r in item.ranges)
        elif item.kind == 'number':
            ranges = []
            for r in item.ranges:
                bounds = []
                if r.minimum is not None: bounds.append(f'value >= {r.minimum:g}')
                if r.maximum is not None: bounds.append(f'value {"<=" if r.includeMaximum else "<"} {r.maximum:g}')
                ranges.append(f'{" and ".join(bounds) or "Any finite number"}: {r.points:g} points')
            scoring = '; '.join(ranges)
        else:
            captions = {c['name']: c.get('labels', {}).get(settings.language) or c['name'] for c in question['choices']}
            scoring = '; '.join(f'{captions.get(code, code)}: {value:g}' for code, value in item.points.items())
        rules.append(f'{question["name"]}: {scoring}.' + (f' Method: {item.multipleMethod or "assigned points"}. Maximum: {maximum_points(item):g}. Weight: {item.weight:g} ({item.weight/total_weight*100:.1f}%).' if definition.mode == 'score' else ''))
    formulas = {'score': 'Score = 100 x weighted average of (question points / maximum question points).', 'percentage': f'Percentage = 100 x complete responses meeting {definition.conditionMatch.upper()} question conditions / complete responses. Each response is counted once.', 'numeric_sum': 'Total = sum of original numeric answers across all selected questions and complete responses.', 'numeric_average': 'Average = sum of original numeric answers / number of answered numeric values across complete responses. Each question has equal weight; use compatible units.'}
    methodology = '\n'.join([definition.name, definition.description, *((('Higher score means: ' if definition.mode == 'score' else 'Higher result means: ')+definition.higherMeaning,) if definition.higherMeaning else ()),
        'Unit: '+(definition.scope or 'Main submission'), formulas[definition.mode],
        'Only complete responses enter the final result. Missing, unrecognized or invalid answers make a response incomplete.' + (' Weights are not redistributed.' if definition.mode == 'score' else ''),
        *rules, 'Current filters: '+('; '.join(filter_descriptions(project, settings)) or 'All responses')])
    for pivot, acc in zip(pivots, accumulators):
        for row in pivot.rows:
            row.percent = row.count/pivot.answered*100 if pivot.answered else None
            row.completePercent = row.completeCount/complete*100 if complete else None
        for source, target in [('points', 'averagePoints'), ('normalized', 'averageNormalized'), ('contribution', 'averageContribution')]:
            setattr(pivot, target, math.fsum(acc[source])/complete if complete and acc[source] else None)
        if acc['numeric']:
            pivot.numericTotal = math.fsum(acc['numeric']); pivot.numericAverage = pivot.numericTotal/complete
    average = math.fsum(scores)/complete if complete else None
    numeric_total = math.fsum(p.numericTotal for p in pivots if p.numericTotal is not None)
    numerator = sum(s == 100 for s in scores) if definition.mode == 'percentage' else numeric_total if definition.mode.startswith('numeric_') else math.fsum(scores)
    denominator = complete*len(definition.questions) if definition.mode == 'numeric_average' else complete
    value = numeric_total if definition.mode == 'numeric_sum' and complete else numeric_total/denominator if definition.mode == 'numeric_average' and denominator else average
    return IndicatorResult(id=definition.id, name=definition.name, total=total, complete=complete, incomplete=incomplete, completeness=complete/total*100 if total else None,
        average=average, value=value, mode=definition.mode, conditionMatch=definition.conditionMatch, numerator=numerator if complete else None, denominator=denominator, questionPivots=pivots, filterSummary=filter_descriptions(project, settings), methodology=methodology, rows=selected, matched=matched, page=page, pageSize=page_size)


def range_label(r):
    bounds = []
    if r.minimum is not None: bounds.append(f'value >= {r.minimum:g}')
    if r.maximum is not None: bounds.append(f'value {"<=" if r.includeMaximum else "<"} {r.maximum:g}')
    return ' and '.join(bounds) or 'Any finite number'
