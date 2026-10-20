from copy import deepcopy
from unittest.mock import Mock

from backend.kobo import analyze, KoboSettings, QuestionSettings
from backend.kobo_excel_direct import direct_helpers, choice_lookup_rows, add_metric
from backend.kobo_excel_source import response_layout, query_config
from backend.kobo_excel_slicers import slicer_specs, pivot_value
from backend.test_kobo import sample


def fixture(project):
    settings = KoboSettings(hidden=['group/respondent_name'], hideEmpty=False, hideZero=False,
                            filterFields=['group/gender'], questions={'group/age': QuestionSettings(numericMode='bins', bins=2)})
    layouts = response_layout(project, settings)
    config = query_config(project, analyze(project, settings), settings, slicer_specs(project, settings), layouts)
    return config, layouts


def test_regular_sources_use_response_tables_without_answer_expansion(sample):
    config, layouts = fixture(sample[0])
    helpers, sources = direct_helpers(config, layouts)
    assert 'group/needs' not in sources
    assert sources['group/gender']['table'] == 'KoboResponses000'
    assert sources['group/gender']['direct']
    assert len(layouts[0]['rows']) == 3
    assert '[Calc] Response' in helpers['']
    assert 'Filter001' in helpers['']
    assert 'KoboChoices' in helpers['']['Filter001']
    assert all('KoboData' not in formula for formula in helpers[''].values())


def test_source_fields_and_formulas_resolve_escaped_headers_and_repeat_parents(sample):
    project = deepcopy(sample[0])
    project['form']['questions'][0]['labels']['en'] = "Gender [code] # @ '"
    project['form']['groups'].append({'id': 'repeat', 'parent': 'group', 'repeat': True, 'labels': {'en': 'Visits'}})
    project['form']['questions'].append({**deepcopy(project['form']['questions'][0]), 'id': 'repeat/gender', 'repeat': 'repeat', 'group': 'repeat'})
    config, layouts = fixture(project)
    helpers, sources = direct_helpers(config, layouts)
    assert "Gender '[code'] '# '@ ''" in helpers['']['Filter001']
    assert 'INDEX(KoboResponses000[' in helpers['repeat']['Filter001']
    assert 'MATCH([@[Parent ID]],KoboResponses000[Response ID],0)' in helpers['repeat']['Filter001']
    assert sources['repeat/gender']['table'] == 'KoboResponses001'


def test_direct_percentage_uses_column_percent_not_calculated_field(sample):
    config, layouts = fixture(sample[0]); _, sources = direct_helpers(config, layouts)
    result = {'_source': sources['group/gender']}; pivot = Mock()
    calculated = Mock(side_effect=AssertionError('Direct pivots must use native column percentages'))
    add_metric(pivot, result, 'percent', calculated)
    assert pivot.AddDataField.return_value.Calculation == 7
    assert pivot.AddDataField.return_value.NumberFormat == '0%'
    calculated.assert_not_called()


def test_direct_totals_do_not_limit_denominator_to_one_answer(sample):
    config, layouts = fixture(sample[0]); _, sources = direct_helpers(config, layouts)
    result = {'_source': sources['group/gender'], 'rows': [{'id': 'f', 'label': 'Female'}]}
    denominator = pivot_value("'Totals'!$A$1", 'Answered total', 'f', result=result)
    count = pivot_value("'Totals'!$A$1", 'Responses', 'f', result=result)
    assert 'Female' not in denominator and 'AnswerCode' not in denominator
    assert 'Female' in count and sources['group/gender']['fields']['Answer'] in count


def test_raw_headers_are_unique_bounded_and_do_not_conflict_with_helpers(sample):
    project = deepcopy(sample[0])
    fields = project['form']['questions']
    fields[0]['labels']['en'] = 'A' * 300
    fields[1]['labels']['en'] = 'A' * 300
    fields[2]['labels']['en'] = '[Calc] Response'
    fields[3]['labels']['en'] = 'Filter001'
    layout = response_layout(project, KoboSettings())[0]
    assert all(len(header) <= 255 for header in layout['headers'])
    assert len({header.casefold() for header in layout['headers']}) == len(layout['headers'])
    assert '[Calc] Response' not in layout['headers'] and 'Filter001' not in layout['headers']


def test_numeric_category_lookup_preserves_existing_decimal_labels(sample):
    project = deepcopy(sample[0]); project['records'][0]['values']['group/age'] = 0.0
    config, _ = fixture(project)
    age = next(q for q in config['questions'] if q['id'] == 'group/age')
    age['bins'] = []; age['answers'] = [{'id': '0.0', 'label': '0.0'}]
    assert ('field:group/age|0', '0.0') in choice_lookup_rows(config)
