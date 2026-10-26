"""Project-only question and choice edits used consistently throughout import review."""
from collections import Counter
from copy import deepcopy
import hashlib

from pydantic import BaseModel, Field
from typing import Literal


class ReviewChoice(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    labels: dict[str, str]


class AddedQuestion(BaseModel):
    id: str = Field(pattern=r'^added_[a-zA-Z0-9_]+$')
    label: str = Field(min_length=1, max_length=1000)
    kind: Literal['text', 'number', 'date', 'category', 'multiple']
    sheet: int = Field(ge=0)
    column: int = Field(ge=0)
    repeat: str = ''
    group: str | None = None
    choices: list[ReviewChoice] = Field(default_factory=list)
    separator: str = ''


class ChoiceOverride(BaseModel):
    mode: Literal['form', 'data', 'custom'] = 'form'
    choices: list[ReviewChoice] = Field(default_factory=list)
    separator: str = ''


class ReviewConfig(BaseModel):
    excludedQuestionIds: list[str] = Field(default_factory=list)
    addedQuestions: list[AddedQuestion] = Field(default_factory=list)
    choiceOverrides: dict[str, ChoiceOverride] = Field(default_factory=dict)


def validate_choices(choices, allow_ambiguous=False):
    from .kobo import norm
    aliases = {}
    for choice in choices:
        if not choice['name'].strip() or not any(v.strip() for v in choice['labels'].values()):
            raise ValueError('Each choice needs a code and a label.')
        for value in [choice['name'], *choice['labels'].values()]:
            key = norm(value)
            if not allow_ambiguous and key and key in aliases and aliases[key] != choice['name']:
                raise ValueError('Choice codes and labels must identify a single answer. Resolve ambiguous labels.')
            if key: aliases[key] = choice['name']
    if len({c['name'] for c in choices}) != len(choices):
        raise ValueError('Choice codes must be unique.')


def effective_form(base, config, sheets, allow_empty=False):
    """Never mutate the staged form or uploaded source files."""
    result = deepcopy(base)
    questions = {q['id']: q for q in result['questions']}
    for added in config.get('addedQuestions', []):
        qid = added['id']
        if qid in questions: raise ValueError('Question identifiers must be unique.')
        si, ci = added['sheet'], added['column']
        if si < 0 or ci < 0: raise ValueError('Invalid source provenance for an added question.')
        # A previously added question may have no source in replacement data.
        repeat = added.get('repeat', '')
        if repeat and not any(g['id'] == repeat and g['repeat'] for g in base['groups']):
            raise ValueError('The repeat group for an added question is no longer available.')
        group_id = added.get('group') if added.get('group') is not None else repeat
        groups = {g['id']: g for g in base['groups']}
        current, seen, scope = group_id, set(), ''
        while current:
            if current not in groups or current in seen:
                raise ValueError('Choose an existing question group with valid ancestry.')
            seen.add(current)
            group = groups[current]
            if group['repeat']:
                scope = current
                break
            current = group.get('parent', '')
        if scope != repeat:
            raise ValueError('The question group must belong to the source worksheet repeat context.')
        if not added['label'].strip(): raise ValueError('Enter a question label.')
        kind = added['kind']
        q = {'id': qid, 'name': qid, 'labels': {'en': added['label']},
             'kind': kind, 'type': {'category': 'select_one', 'multiple': 'select_multiple', 'number': 'decimal'}.get(kind, kind),
             'group': group_id, 'repeat': repeat, 'metadata': False, 'identifying': False,
             'choices': deepcopy(added.get('choices', [])), 'order': len(questions),
             'addedFromData': True, 'sourceColumn': {'sheet': si, 'column': ci}}
        questions[qid] = q
        result['questions'].append(q)
        if added.get('separator'): q['dataSeparator'] = added['separator']
    for qid, override in config.get('choiceOverrides', {}).items():
        q = questions.get(qid)
        if not q or q['kind'] not in {'category', 'multiple'}:
            raise ValueError('Choice edits require an existing categorical question.')
        original = {c['name']: c for c in q['choices']}
        choices = q['choices'] if override['mode'] == 'form' else override['choices']
        # Retain XLSForm attributes used by conditional choice filters.
        if q.get('choiceFilter') and any(c['name'] not in original for c in choices):
            raise ValueError('This question has a choice filter. New codes need filter attributes; use form choices or map data to existing codes.')
        q['choices'] = [{**deepcopy(original.get(c['name'], {})), **deepcopy(c)} for c in choices]
        if override.get('separator'): q['dataSeparator'] = override['separator']
    for q in result['questions']:
        if q['id'] in config.get('choiceOverrides', {}) or q.get('addedFromData'):
            validate_choices(q['choices'], allow_ambiguous=config.get('choiceOverrides', {}).get(q['id'], {}).get('mode') == 'form')
            if q['kind'] in {'category', 'multiple'} and not q['choices'] and not allow_empty:
                raise ValueError('Add at least one choice for each categorical question.')
            if q.get('dataSeparator') and q['kind'] != 'multiple': raise ValueError('Only multiple-choice questions use a separator.')
    excluded = set(config.get('excludedQuestionIds', []))
    if len(excluded) != len(config.get('excludedQuestionIds', [])):
        raise ValueError('Excluded question identifiers must be unique.')
    if excluded - questions.keys(): raise ValueError('Excluded question identifiers must reference known questions.')
    import re
    excluded_names = {value for q in result['questions'] if q['id'] in excluded for value in [q['name'], q['id']]}
    for q in result['questions']:
        if q['id'] not in excluded and set(re.findall(r'\$\{([^}]+)\}', q.get('choiceFilter', ''))) & excluded_names:
            raise ValueError(f"Cannot ignore question: {q.get('labels', {}).get('en', q['id'])} has a choice filter that depends on it. Link the question or resolve this dependency first.")
    result['questions'] = [q for q in result['questions'] if q['id'] not in excluded]
    return result


def choice_comparison(form, sheets, mappings, qid, separator='', settings=None):
    """Scan the full source, rather than the 200-value sample in link review."""
    from .kobo import norm, missing, decode_choice
    q = next((q for q in form['questions'] if q['id'] == qid), None)
    if not q or q['kind'] not in {'category', 'multiple'}: raise ValueError('Choose a categorical question.')
    counts, raw_counts = Counter(), Counter()
    for m in mappings:
        if m.get('question') != qid or m.get('status') != 'matched': continue
        if m.get('option'):
            counts[m['option']] += sum(not missing(r[m['column']]) and str(r[m['column']]).strip().lower() not in {'0', 'false', 'no'} for r in sheets[m['sheet']]['rows'] if m['column'] < len(r))
            continue
        for row in sheets[m['sheet']]['rows']:
            raw = row[m['column']] if m['column'] < len(row) else None
            if missing(raw): continue
            raw = str(raw).strip()
            raw_counts[raw] += 1
            if q['kind'] == 'multiple':
                if separator: parts = raw.split(separator)
                else:
                    values, error = decode_choice(raw, q, True)
                    parts = values if not error else [raw]
            else: parts = [raw]
            for atom in set(p.strip() for p in parts if p.strip()): counts[atom] += 1
    aliases = {}
    for c in q['choices']:
        for alias in [c['name'], *c['labels'].values()]:
            aliases.setdefault(norm(alias), set()).add(c['name'])
    observed, proposed, seen = [], [], set()
    for raw, count in counts.most_common():
        matches = sorted(aliases.get(norm(raw), set()))
        code = matches[0] if len(matches) == 1 else 'data_' + hashlib.sha256(norm(raw).encode()).hexdigest()[:16]
        observed.append({'value': raw, 'count': count, 'matches': matches, 'suggestedCode': code})
        if code not in seen:
            seen.add(code)
            proposed.append(deepcopy(next((c for c in q['choices'] if c['name'] == code), {'name': code, 'labels': {'en': raw}})))
    used = {code for a in observed for code in a['matches']}
    return {'answers': observed, 'proposedChoices': proposed,
            'unusedChoices': [c['name'] for c in q['choices'] if c['name'] not in used],
            'examples': [{'value': raw, 'parts': [p.strip() for p in raw.split(separator)] if separator else [raw]} for raw in list(raw_counts)[:5]],
            'settingsReferences': settings_code_references(settings or {}, qid, {c['name'] for c in q['choices']})}


def choice_setting_impacts(settings, form, effective):
    """Return inspectable settings paths mentioning removed codes."""
    changed = {}
    by_id = {q['id']: q for q in effective['questions']}
    for q in form['questions']:
        if q['id'] in by_id:
            removed = {c['name'] for c in q['choices']} - {c['name'] for c in by_id[q['id']]['choices']}
            if removed: changed[q['id']] = removed
    return [{'question': qid, 'code': code, 'path': path}
            for qid, codes in changed.items()
            for code, paths in settings_code_references(settings or {}, qid, codes).items()
            for path in paths]


def settings_code_references(settings, qid, codes):
    """Only inspect choice-bearing configuration in the target question's context."""
    result = {}
    def remember(code, path):
        if code in codes: result.setdefault(code, []).append(path)
    def values(value, path):
        if isinstance(value, dict):
            for key, child in value.items():
                remember(key, path + '.' + key)
                values(child, path + '.' + key)
        elif isinstance(value, list):
            for i, child in enumerate(value): values(child, f'{path}[{i}]')
        elif isinstance(value, str): remember(value, path)
    def walk(value, path):
        if isinstance(value, dict):
            if value.get('field') == qid: values(value.get('values', []), path + '.values')
            if value.get('question') == qid:
                values(value.get('points', {}), path + '.points')
                values(value.get('selectedCodes', []), path + '.selectedCodes')
            questions = value.get('questions')
            if isinstance(questions, dict) and qid in questions:
                for key in ['colors', 'pointColors']:
                    values(questions[qid].get(key, {}), path + '.questions.' + qid + '.' + key)
            for key, child in value.items(): walk(child, path + '.' + key)
        elif isinstance(value, list):
            for i, child in enumerate(value): walk(child, f'{path}[{i}]')
    walk(settings, 'settings')
    return result


def validate_removed_answers(base, form, sheets, mappings):
    """Removing an observed option requires explicit recoding or exclusion."""
    from .kobo import missing, decode_choice
    from .kobo_import_links import decoded_value
    current = {q['id']: q for q in form['questions']}
    for old in base['questions']:
        q = current.get(old['id'])
        if not q or old['kind'] not in {'category', 'multiple'}: continue
        removed = {c['name'] for c in old['choices']} - {c['name'] for c in q['choices']}
        if not removed: continue
        for m in mappings:
            if m.get('question') != q['id'] or m.get('status') != 'matched': continue
            if m.get('option'):
                if m['option'] in removed: raise ValueError('Remap or ignore option columns before removing their choice.')
                continue
            for row in sheets[m['sheet']]['rows']:
                raw = row[m['column']] if m['column'] < len(row) else None
                if missing(raw): continue
                previous, error = decode_choice(str(raw), old, old['kind'] == 'multiple')
                if error or not set(previous) & removed: continue
                _, error = decoded_value(raw, q, m)
                if error:
                    raise ValueError('Map answers for removed choices to a final choice, or explicitly exclude them as blank before applying.')
