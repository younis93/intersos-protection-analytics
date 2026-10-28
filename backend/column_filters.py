"""Typed record-column filters, shared by record queries, facets and exports."""
import math
import re
from datetime import date, datetime
from functools import lru_cache

import pandas as pd
from pydantic import BaseModel, Field
from typing import Literal


class ColumnCondition(BaseModel):
    operator: Literal['equals', 'contains', 'starts_with', 'ends_with', 'gt', 'gte', 'lt', 'lte', 'between', 'date_on', 'date_before', 'date_after', 'date_between', 'blank', 'not_blank']
    value: str = ''
    value2: str = ''


class ColumnFilter(BaseModel):
    column: str
    type: Literal['text', 'number', 'date'] = 'text'
    values: list[str] | None = None
    excluded: list[str] = Field(default_factory=list)
    included: list[str] = Field(default_factory=list)
    # Search selections cover all matching distinct values, not just a loaded page.
    valueSearch: str | None = None
    condition: ColumnCondition | None = None


def text_value(value):
    if value is None or value is pd.NA or value is pd.NaT: return ''
    if isinstance(value, float) and math.isnan(value): return ''
    if isinstance(value, float) and value.is_integer(): return str(int(value))
    if isinstance(value, (datetime, date)): return value.isoformat()
    if isinstance(value, list): return ', '.join(text_value(item) for item in value)
    return str(value).strip()


@lru_cache(maxsize=8192)
def calendar_value(value):
    parsed=pd.to_datetime(value,errors='coerce',format='mixed',dayfirst=True)
    return pd.NaT if pd.isna(parsed) else pd.Timestamp(parsed.date())


def column_type(series, name=''):
    name=re.sub(r'[_/]+',' ',name)
    if re.search(r'\b(id|identifier|phone|code)\b|contact.*number', name, re.I): return 'text'
    if pd.api.types.is_datetime64_any_dtype(series): return 'date'
    if re.search(r'\b(date|dob|created on|added on)\b', name, re.I): return 'date'
    if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series): return 'number'
    if re.search(r'\b(age|amount|count|score)\b',name,re.I):
        populated=series.dropna().astype(str).str.strip()
        populated=populated[populated.ne('')]
        if len(populated) and pd.to_numeric(populated,errors='coerce').notna().all(): return 'number'
    return 'text'


def normalized_rules(rules):
    return [rule.model_dump() if isinstance(rule, BaseModel) else rule for rule in (rules or [])]


def apply_column_filters(frame, rules, *, exclude_column=None):
    result = frame
    for rule in normalized_rules(rules):
        column = rule['column']
        if column == exclude_column: continue
        if column not in result.columns: raise ValueError(f'Unknown filter column: {column}')
        series = result[column]
        text = series.map(text_value)
        mask = pd.Series(True, index=result.index)
        def selection_values(selection):
            if rule.get('type')=='date' and selection and any(selection) and all(not value or re.fullmatch(r'\d{4}-\d{2}',value) for value in selection):
                return text.map(lambda value:'' if not value else value if pd.isna(calendar_value(value)) else calendar_value(value).strftime('%Y-%m'))
            return text
        if rule.get('values') is not None: mask &= selection_values(rule['values']).isin(rule['values'])
        if rule.get('valueSearch') is not None: mask &= text.str.casefold().str.contains(rule['valueSearch'].strip().casefold(), regex=False) | text.isin(rule.get('included', []))
        if rule.get('excluded'): mask &= ~selection_values(rule['excluded']).isin(rule['excluded'])
        condition = rule.get('condition')
        if condition:
            op = condition['operator']; value = condition.get('value', ''); value2 = condition.get('value2', '')
            blank = text.eq('')
            if op == 'blank': mask &= blank
            elif op == 'not_blank': mask &= ~blank
            elif rule.get('type') == 'number' or op in {'gt', 'gte', 'lt', 'lte', 'between'}:
                try:
                    first = float(value); second = float(value2) if op == 'between' else first
                    if not math.isfinite(first) or not math.isfinite(second) or (op == 'between' and first > second): raise ValueError()
                except (ValueError, TypeError): raise ValueError('Enter a valid numeric value or range.')
                numeric = pd.to_numeric(series, errors='coerce')
                matches = {'equals': lambda: numeric.eq(first), 'gt': lambda: numeric.gt(first), 'gte': lambda: numeric.ge(first), 'lt': lambda: numeric.lt(first), 'lte': lambda: numeric.le(first), 'between': lambda: numeric.between(first, second)}
                if op not in matches: raise ValueError('Unsupported numeric condition.')
                mask &= matches[op]()
            elif op.startswith('date_'):
                first = pd.to_datetime(value, errors='coerce'); second = pd.to_datetime(value2, errors='coerce') if op == 'date_between' else first
                if pd.isna(first) or pd.isna(second) or first > second: raise ValueError('Enter a valid date or range.')
                parsed = text.map(calendar_value)
                matches = {'date_on': lambda: parsed.eq(first.normalize()), 'date_before': lambda: parsed.lt(first.normalize()), 'date_after': lambda: parsed.gt(first.normalize()), 'date_between': lambda: parsed.between(first.normalize(), second.normalize())}
                mask &= matches[op]()
            else:
                folded = text.str.casefold(); needle = value.strip().casefold()
                matches = {'equals': lambda: folded.eq(needle), 'contains': lambda: folded.str.contains(needle, regex=False), 'starts_with': lambda: folded.str.startswith(needle), 'ends_with': lambda: folded.str.endswith(needle)}
                if op not in matches: raise ValueError('Unsupported text condition.')
                mask &= matches[op]()
        result = result.loc[mask]
    return result


def value_page(frame, column, rules=None, search='', offset=0, limit=100):
    if column not in frame.columns: raise ValueError('Unknown filter column.')
    filtered = apply_column_filters(frame, rules, exclude_column=column)
    values = sorted(set(filtered[column].map(text_value)), key=lambda value: (value != '', value.casefold()))
    needle = search.strip().casefold()
    values = [value for value in values if needle in value.casefold()]
    return {'values': values[offset:offset + limit], 'total': len(values), 'offset': offset, 'type': column_type(frame[column], column)}


def model_record_page(result, rules, page, page_size, frame=None):
    """Filter complete Pydantic record results while retaining summary metrics."""
    if not rules: return result
    if frame is None: frame = pd.DataFrame([row.model_dump() for row in result.rows])
    if frame.empty:
        frame = pd.DataFrame(columns=[rule['column'] for rule in normalized_rules(rules)])
    indexes = apply_column_filters(frame, rules).index
    start = (page - 1) * page_size
    return result.model_copy(update={'rows':[result.rows[index] for index in indexes[start:start + page_size]], 'matched':len(indexes), 'page':page, 'pageSize':page_size})


def indicator_record_frame(result):
    return pd.DataFrame([{'row':row.row,'score':('Yes' if row.score==100 else 'No') if result.mode=='percentage' and row.score is not None else row.score,'status':row.status.title()} for row in result.rows],columns=['row','score','status'])
