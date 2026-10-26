"""Reproducible, declarative preparation of custom datasets. No formula execution."""
import hashlib
import json
import math
import re
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field


class Preparation(BaseModel):
    trim: bool = False
    collapseSpaces: bool = False
    letterCase: Literal['none', 'lower', 'upper', 'title'] = 'none'
    missingTokens: list[str] = Field(default_factory=list, max_length=100)
    numberFormat: Literal['plain', 'dot', 'comma'] = 'plain'
    currency: str = Field('', max_length=20)
    percent: bool = False


PREPARATION_POLICY = json.loads(Path(__file__).with_name('custom_preparation_policy.json').read_text(encoding='utf-8'))


def active_preparation(kind, preparation):
    """Pause incompatible settings without changing the saved recipe."""
    saved = preparation.model_dump()
    return Preparation(**{field: saved[field] for field in PREPARATION_POLICY[kind]})


class CalculatedColumn(BaseModel):
    id: str = Field(pattern=r'^calc_[a-zA-Z0-9_]+$', max_length=100)
    label: str = Field(min_length=1, max_length=1000)
    operation: Literal['add', 'subtract', 'multiply', 'divide', 'percentage', 'days_between', 'age_years'] = 'add'
    left: str = ''
    right: str = ''
    useLiteral: bool = False
    literal: str = Field('', max_length=100)
    included: bool = True
    invalidAsMissing: bool = False


class ValidationRule(BaseModel):
    id: str = Field(pattern=r'^rule_[a-zA-Z0-9_]+$', max_length=100)
    label: str = Field(min_length=1, max_length=200)
    kind: Literal['required', 'number_range', 'date_order'] = 'required'
    field: str = ''
    otherField: str = ''
    minimum: float | None = None
    maximum: float | None = None
    severity: Literal['error', 'warning'] = 'error'
    acceptedSignature: str = Field('', max_length=64)


def clean_value(value, prep):
    if not isinstance(value, str): return value
    if prep.trim: value = value.strip()
    if prep.collapseSpaces: value = re.sub(r'[^\S\r\n]+', ' ', value)
    if any(value.strip().casefold() == token.strip().casefold() for token in prep.missingTokens): return None
    if prep.letterCase != 'none': value = getattr(value, prep.letterCase)()
    return value


def prepared_number(value, prep):
    if isinstance(value, bool): raise ValueError('Invalid number')
    if isinstance(value, (float, int)):
        result = float(value)
    else:
        text = str(value).strip()
        if prep.currency.strip():
            symbol = prep.currency.strip()
            if text.startswith(symbol): text = text[len(symbol):].strip()
            elif text.endswith(symbol): text = text[:-len(symbol)].strip()
        percentage = text.endswith('%') and prep.percent
        if percentage: text = text[:-1].strip()
        if prep.numberFormat != 'plain':
            group, decimal = (',', '.') if prep.numberFormat == 'dot' else ('.', ',')
            pattern = rf'[+-]?(?:\d+|\d{{1,3}}(?:{re.escape(group)}\d{{3}})+)(?:{re.escape(decimal)}\d+)?(?:[eE][+-]?\d+)?'
            if not re.fullmatch(pattern, text): raise ValueError('Value does not match the selected number format')
            text = text.replace(group, '').replace(decimal, '.')
        result = float(text)
        if percentage: result /= 100
    if not math.isfinite(result): raise ValueError('Invalid number')
    return result


def calculated_columns(config, records, questions):
    """Only included source fields and earlier included calculations are operands."""
    known = {q['id']: q for q in questions}
    profiles, issues = [], []
    all_ids = [c.id for c in config.calculatedColumns]
    if len(set(all_ids)) != len(all_ids) or set(all_ids) & known.keys():
        raise ValueError('Calculated column identifiers must be unique.')
    for calc in config.calculatedColumns:
        if not calc.label.strip(): raise ValueError('Enter a calculated column label.')
        expected = 'date' if calc.operation in {'days_between', 'age_years'} else 'number'
        problem = ''
        left, right = known.get(calc.left), known.get(calc.right)
        if not left or left['kind'] != expected: problem = f'Choose an included {expected} column for the first operand.'
        if not calc.useLiteral and (not right or right['kind'] != expected): problem = f'Choose an included {expected} column or earlier calculation for the second operand.'
        literal = None
        if calc.useLiteral:
            try:
                literal = date.fromisoformat(calc.literal) if expected == 'date' else float(calc.literal)
                if isinstance(literal, float) and not math.isfinite(literal): raise ValueError()
            except (ValueError, TypeError): problem = f'Enter a valid {expected} constant.'
        examples, previews, invalid, filled, distinct = [], [], 0, 0, set()
        for record in records:
            a = record['values'].get(calc.left)
            b = literal if calc.useLiteral else record['values'].get(calc.right)
            result = None
            reason = problem
            if not reason and a is not None and b is not None:
                try:
                    if expected == 'date':
                        start = date.fromisoformat(str(a)[:10])
                        end = b if isinstance(b, date) else date.fromisoformat(str(b)[:10])
                        if calc.operation == 'days_between': result = (end - start).days
                        else:
                            if end < start: raise ValueError('Reference date precedes the birth date')
                            result = end.year-start.year-((end.month,end.day)<(start.month,start.day))
                    else:
                        a, b = float(a), float(b)
                        if calc.operation == 'add': result = a+b
                        elif calc.operation == 'subtract': result = a-b
                        elif calc.operation == 'multiply': result = a*b
                        else:
                            if b == 0: raise ValueError('Division by zero')
                            result = a/b*(100 if calc.operation == 'percentage' else 1)
                        if not math.isfinite(result): raise ValueError('Calculation is not finite')
                except (ValueError, TypeError, OverflowError) as exc: reason = str(exc)
            if reason:
                invalid += 1
                if len(examples) < 15: examples.append({'row': record['row'], 'value': f'{a} / {b}', 'reason': reason})
            record['values'][calc.id] = result
            if result is not None: filled += 1; distinct.add(result)
            if len(previews) < 8: previews.append({'original': f'{a if a is not None else "Missing"} | {b if b is not None else "Missing"}', 'value': result})
        if calc.included and (problem or invalid and not calc.invalidAsMissing):
            issues.append({'question': calc.id, 'message': problem or 'Review calculation errors or explicitly accept them as missing.', 'count': invalid or 1})
        profiles.append({'id': calc.id, 'detected': 'number', 'missing': len(records)-filled, 'distinct': len(distinct), 'values': [], 'valuesTruncated': False, 'samples': [], 'invalid': invalid, 'examples': examples, 'preview': previews, 'ambiguous': bool(problem), 'timeCount': 0, 'changed': 0})
        if calc.included:
            question = {'customColumn': True, 'id': calc.id, 'name': calc.label.strip(), 'labels': {'en': calc.label.strip()}, 'kind': 'number', 'type': 'decimal', 'choices': [], 'group': '', 'repeat': '', 'metadata': False, 'identifying': False, 'order': len(questions)}
            questions.append(question)
            known[calc.id] = question
    return profiles, issues


def validate_rules(config, records, questions):
    known = {q['id']: q for q in questions}
    results, issues = [], []
    ids = [rule.id for rule in config.validationRules]
    if len(set(ids)) != len(ids): raise ValueError('Validation rule identifiers must be unique.')
    for rule in config.validationRules:
        error = ''
        if not rule.label.strip(): error = 'Enter a rule name.'
        field = known.get(rule.field)
        if not field: error = 'Choose an included column for this rule.'
        if rule.kind == 'number_range':
            if field and field['kind'] != 'number': error = 'Range rules require a Number column.'
            if rule.minimum is None and rule.maximum is None: error = 'Enter at least one range bound.'
            if any(v is not None and not math.isfinite(v) for v in [rule.minimum, rule.maximum]): error = 'Range bounds must be finite.'
            if rule.minimum is not None and rule.maximum is not None and rule.minimum > rule.maximum: error = 'Minimum cannot exceed maximum.'
        if rule.kind == 'date_order' and (not field or field['kind'] != 'date' or known.get(rule.otherField, {}).get('kind') != 'date'):
            error = 'Date order rules require two included Date columns.'
        digest = hashlib.sha256(json.dumps(rule.model_dump(exclude={'acceptedSignature'}), sort_keys=True).encode())
        count, examples = 0, []
        if not error:
            for record in records:
                value, other = record['values'].get(rule.field), record['values'].get(rule.otherField)
                empty = value is None or value == '' or value == []
                failed = empty if rule.kind == 'required' else (not empty and ((rule.minimum is not None and value < rule.minimum) or (rule.maximum is not None and value > rule.maximum))) if rule.kind == 'number_range' else (not empty and other is not None and value > other)
                if failed:
                    count += 1
                    digest.update(json.dumps([record['row'],value,other], ensure_ascii=False, sort_keys=True).encode())
                    if len(examples) < 10: examples.append({'row': record['row'], 'value': value, 'otherValue': other})
        signature = digest.hexdigest()
        acknowledged = rule.severity == 'warning' and rule.acceptedSignature == signature
        if error or count and (rule.severity == 'error' or not acknowledged):
            target = rule.field if rule.field in known else next(iter(known), '')
            issues.append({'question': target, 'message': f'{rule.label}: {error or ("validation failed" if rule.severity == "error" else "review and acknowledge this warning")}.', 'count': count or 1})
        results.append({'id': rule.id, 'label': rule.label, 'field': rule.field, 'severity': rule.severity, 'matched': count, 'examples': examples, 'error': error, 'signature': signature, 'acknowledged': acknowledged})
    return results, issues
