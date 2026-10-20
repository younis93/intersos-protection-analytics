import base64
import copy
import json

import pytest

from backend.kobo import KoboSettings, QuestionSettings, analyze
from backend.kobo_excel_source import response_layout, response_values, query_config, query_formula, validate_export_fields
from backend.kobo_excel_slicers import slicer_specs
from backend.test_kobo import sample


def settings():
    return KoboSettings(hidden=['group/respondent_name', 'group/age'], hideZero=False, hideEmpty=False)


def test_response_data_includes_hidden_fields_all_records_and_typed_values(sample):
    project = sample[0]; config = settings(); config.filters = [{'field': 'group/gender', 'kind': 'category', 'values': ['f']}]
    layout = response_layout(project, config)[0]
    assert len(layout['rows']) == 3
    assert 'Age' in layout['headers'] and 'Name of respondent' not in layout['headers']
    values = dict(zip(layout['headers'], response_values(layout, layout['rows'][0])))
    assert values['Age'] == 0
    assert set(values['Needs'].split()) == {'water', 'food'}
    assert values['Date'] == 46023  # 2026-01-01 in Excel's date system


def test_identifying_questions_filters_and_breakdowns_are_rejected(sample):
    project = sample[0]
    with pytest.raises(ValueError, match='Identifying fields'): validate_export_fields(project, KoboSettings())
    config = settings(); validate_export_fields(project, config)
    config.filterFields = ['group/respondent_name']
    with pytest.raises(ValueError, match='filters and breakdowns'): validate_export_fields(project, config)
    config.filterFields = []; config.questions['group/needs'] = QuestionSettings(breakdowns=['group/respondent_name'])
    with pytest.raises(ValueError, match='Identifying fields'): validate_export_fields(project, config)


def test_query_is_workbook_local_preserves_zero_choices_and_omits_identifying_fields(sample):
    project = sample[0]; config = settings(); config.filterFields = ['group/gender']
    snapshot = analyze(project, config)
    metadata = query_config(project, snapshot, config, slicer_specs(project, config), response_layout(project, config))
    assert 'group/respondent_name' not in metadata['fields']
    assert 'group/age' in metadata['fields']
    needs = next(q for q in metadata['questions'] if q['id'] == 'group/needs')
    assert [a['id'] for a in needs['answers']] == ['water', 'food', 'none']
    expression = query_formula(metadata)
    assert 'Excel.CurrentWorkbook()' in expression
    assert 'Web.Contents' not in expression and 'File.Contents' not in expression
    encoded = expression.split('Binary.FromText("')[1].split('"')[0]
    assert json.loads(base64.b64decode(encoded)) == metadata


def test_repeat_tables_and_duplicate_column_headers(sample):
    project = copy.deepcopy(sample[0]); config = settings()
    duplicate = copy.deepcopy(project['form']['questions'][0]); duplicate['id'] = 'other'; duplicate['name'] = 'other'
    project['form']['questions'].append(duplicate)
    repeat = {**duplicate, 'id': 'repeat/q', 'repeat': 'repeat', 'group': 'repeat'}; project['form']['questions'].append(repeat)
    project['records'].append({'id': 'repeat1', 'parent': project['records'][0]['id'], 'row': 2, 'scope': 'repeat', 'values': {'repeat/q': 'f'}})
    main, repeated = response_layout(project, config)
    assert len(set(header.casefold() for header in main['headers'])) == len(main['headers'])
    assert len(main['rows']) == 3 and len(repeated['rows']) == 1
    assert repeated['rows'][0]['parent'] == main['rows'][0]['id']


def test_response_sheet_limits_fail_without_truncating(sample, monkeypatch):
    import backend.kobo_excel_source as source
    monkeypatch.setattr(source, 'EXCEL_DATA_ROWS', 2)
    with pytest.raises(ValueError, match='row limit'): response_layout(sample[0], settings())
    monkeypatch.setattr(source, 'EXCEL_DATA_ROWS', 1048575)
    monkeypatch.setattr(source, 'EXCEL_COLUMNS', 3)
    with pytest.raises(ValueError, match='column limit'): response_layout(sample[0], settings())
