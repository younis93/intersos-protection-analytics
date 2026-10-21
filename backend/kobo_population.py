"""Descriptive population comparisons, independent of question-to-question Compare."""
from __future__ import annotations
import math
from pydantic import BaseModel, Field
from .kobo_indicators import IndicatorDefinition, answer_owner, calculate_indicator, scope_ancestors, filter_descriptions
from .kobo import KoboSettings


class PopulationRequest(BaseModel):
    settings: KoboSettings
    groupField: str
    groups: list[str] = Field(min_length=2, max_length=12)
    question: str = ''
    indicator: IndicatorDefinition | None = None


class PopulationColumn(BaseModel):
    id: str
    label: str
    total: int
    answered: int
    missing: int
    invalid: int = 0
    value: float | None = None
    numerator: float | None = None
    denominator: int = 0


class PopulationCell(BaseModel):
    count: int
    percent: float | None


class PopulationRow(BaseModel):
    id: str
    label: str
    values: list[PopulationCell]


class PopulationResult(BaseModel):
    label: str
    groupLabel: str
    unit: str
    kind: str
    mode: str
    total: int
    missingGroup: int
    otherGroups: int
    columns: list[PopulationColumn]
    rows: list[PopulationRow]
    filterSummary: list[str]
    methodology: str


def compare_population(project, settings, *, group_field, groups, question_id='', indicator=None):
    from .kobo import filtered_records, label, missing
    questions = {q['id']: q for q in project['form']['questions']}
    field = questions.get(group_field)
    if not field or field['kind'] != 'category' or field.get('identifying'): raise ValueError('Choose a non-identifying single-choice field for population groups.')
    codes = {c['name'] for c in field['choices']}
    if len(groups)<2 or len(groups)>12 or len(set(groups)) != len(groups) or not set(groups)<=codes: raise ValueError('Choose 2 to 12 different configured population groups.')
    if bool(question_id) == bool(indicator): raise ValueError('Choose one question or one saved indicator to compare.')
    question = questions.get(question_id) if question_id else None
    if question_id and (not question or question.get('identifying') or question['kind'] not in {'category','multiple','number'}): raise ValueError('Choose a non-identifying choice or numeric question.')
    scope = indicator.scope if indicator else question['repeat']
    if field['repeat'] not in (scope_ancestors(project['form'], scope) or set()): raise ValueError('The group field must be in the same response table or its parent records.')
    records = [r for r in filtered_records(project, settings) if r['scope'] == scope]
    lookup = {r['id']:r for r in project['records']}
    cohorts = {code:[] for code in groups}; missing_group, other = 0, 0
    for record in records:
        owner = answer_owner(record, field, lookup)
        value = owner['values'].get(group_field) if owner else None
        if not isinstance(value,str) or value not in codes: missing_group += 1
        elif value not in cohorts: other += 1
        else: cohorts[value].append(record)
    columns, rows = [], []
    captions = {c['name']:label(c,settings.language) for c in field['choices']}
    answer_codes = [c['name'] for c in question['choices']] if question and question['kind'] != 'number' else []
    counts = []
    for code, cohort in cohorts.items():
        if indicator:
            result = calculate_indicator(project,settings,indicator,records=cohort,page_size=0)
            columns.append(PopulationColumn(id=code,label=captions[code],total=result.total,answered=result.complete,missing=result.incomplete,value=result.value,numerator=result.numerator,denominator=result.denominator))
            continue
        answered, blanks, invalid, values, answer_counts = 0, 0, 0, [], {c:0 for c in answer_codes}
        for record in cohort:
            value = record['values'].get(question_id)
            if missing(value): blanks += 1; continue
            if question['kind']=='number':
                if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value): invalid += 1; continue
                values.append(value)
            else:
                selected = list(set(value)) if question['kind']=='multiple' and isinstance(value,list) and all(isinstance(c,str) for c in value) else [value] if question['kind']=='category' and isinstance(value,str) else []
                if not selected or any(c not in answer_counts for c in selected): invalid += 1; continue
                for c in selected: answer_counts[c] += 1
            answered += 1
        total_value = math.fsum(values) if values else None
        columns.append(PopulationColumn(id=code,label=captions[code],total=len(cohort),answered=answered,missing=blanks,invalid=invalid,value=total_value/len(values) if values else None,numerator=total_value,denominator=answered))
        counts.append(answer_counts)
    if question and answer_codes:
        for choice in question['choices']:
            rows.append(PopulationRow(id=choice['name'],label=label(choice,settings.language),values=[PopulationCell(count=count[choice['name']],percent=count[choice['name']]/column.answered*100 if column.answered else None) for count,column in zip(counts,columns)]))
    mode = indicator.mode if indicator else 'numeric_average' if question['kind']=='number' else 'answers'
    methodology = 'Current response filters apply. Each eligible response belongs to one selected population group. Missing or unrecognized group answers are excluded and reported separately. '
    methodology += 'Indicator definitions and completeness rules are applied separately within each group.' if indicator else 'Answer percentages use valid answered responses within each group. Missing and invalid answers are reported separately. Multiple-choice options are counted once per response; percentages may total more than 100%. Numeric means use original valid numeric answers.'
    methodology += ' Differences are descriptive, without survey sampling weights or significance testing.'
    return PopulationResult(label=indicator.name if indicator else label(question,settings.language),groupLabel=label(field,settings.language),unit=scope or 'Main submissions',kind='indicator' if indicator else question['kind'],mode=mode,total=len(records),missingGroup=missing_group,otherGroups=other,columns=columns,rows=rows,filterSummary=filter_descriptions(project,settings),methodology=methodology)
