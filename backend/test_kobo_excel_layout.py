from backend.kobo import KoboSettings, QuestionSettings
from backend.kobo_excel import source_rows, native_breakdown_columns
from backend.kobo_excel_layout import group_sections, unique_sheet_name, combined_row_count, answered_formula
from backend.test_kobo import sample
import pytest


def test_main_group_order_nested_headings_and_general():
    groups = [{'id': 'a', 'label': 'First', 'parent': ''}, {'id': 'a/n', 'label': 'Nested', 'parent': 'a'}, {'id': 'b', 'label': 'Second', 'parent': ''}]
    questions = [{'group': 'b', 'id': 'q1'}, {'group': 'a/n', 'id': 'q2'}, {'group': '', 'id': 'q3'}, {'group': 'a', 'id': 'q4'}]
    sections = group_sections({'groups': groups, 'questions': questions})
    assert [section['label'] for section in sections] == ['First', 'Second', 'General']
    assert [item['result']['id'] for item in sections[0]['questions']] == ['q2', 'q4']
    assert sections[0]['questions'][0]['nested'] == 'Nested'
    assert sections[0]['questions'][0]['position'] == 2


def test_sheet_names_are_valid_unique_and_case_insensitive():
    used = {'data'}
    assert unique_sheet_name('Data', used) == 'Data (2)'
    assert unique_sheet_name('data', used) == 'data (3)'
    assert unique_sheet_name("'A/B:*?[]\\'", used) == 'A B'
    assert unique_sheet_name('', used) == 'Analysis'
    name = unique_sheet_name('x' * 60, used)
    second = unique_sheet_name('x' * 60, used)
    assert len(name) == len(second) == 31 and name != second
    assert unique_sheet_name('الأسرة', used) == 'الأسرة'
    assert not unique_sheet_name('a' * 30 + "'ending", used).endswith("'")


def test_preflight_matches_source_rows_and_rejects_combined_limit(sample):
    project = sample[0]
    from backend.kobo import analyze
    settings = KoboSettings(hideBlanks=False)
    snapshot = analyze(project, settings)
    expected = sum(len(source_rows(project, result, settings)) for result in snapshot['questions'])
    assert combined_row_count(project, snapshot, settings) == expected
    with pytest.raises(ValueError, match='combined Data table'):
        combined_row_count(project, snapshot, settings, limit=expected - 1)


def test_total_formula_escapes_literal_criteria_and_supports_conditional_formatting():
    formula = answered_formula('q*?', 'a"b', ['North*', 'Host~'])
    assert '"q~*~?"' in formula and '"a""b"' in formula
    assert 'KoboData[IncludeInPivot],"Included"' in formula
    assert 'KoboData[Breakdown1],"North~*"' in formula
    assert 'KoboData[Breakdown2],"Host~~"' in formula
    assert 'INDIRECT("KoboData[QuestionId]")' in answered_formula('q', 'a', indirect=True)


def test_duplicate_breakdown_captions_keep_distinct_codes(sample):
    import copy
    from backend.kobo import analyze
    project = copy.deepcopy(sample[0])
    gender = project['form']['questions'][0]
    for choice in gender['choices']: choice['labels'] = {'en': 'Same label'}
    settings = KoboSettings(questions={'group/needs': QuestionSettings(breakdowns=['group/gender'])})
    result = next(question for question in analyze(project, settings)['questions'] if question['name'] == 'needs')
    assert [column['labels'] for column in native_breakdown_columns(project, result, settings)] == [['Same label [f]'], ['Same label [m]']]
    assert {row[4] for row in source_rows(project, result, settings)} == {'Same label [f]', 'Same label [m]'}

def test_selected_groups_use_nearest_selected_ancestor_without_duplicating_questions():
    groups = [{'id':'a','label':'First','parent':''},{'id':'a/n','label':'Nested','parent':'a'},{'id':'b','label':'Second','parent':''}]
    questions = [{'id':'nested','group':'a/n'},{'id':'parent','group':'a'},{'id':'other','group':'b'},{'id':'ungrouped','group':''}]
    snapshot = {'groups':groups,'questions':questions}
    sections = group_sections(snapshot,['a','a/n'])
    assert [section['label'] for section in sections] == ['First','Nested']
    assert [[item['result']['id'] for item in section['questions']] for section in sections] == [['parent'],['nested']]
    assert sorted(item['position'] for section in sections for item in section['questions']) == [1,2]
    assert group_sections(snapshot,[]) == []
    assert [item['result']['id'] for item in group_sections(snapshot,['a'])[0]['questions']] == ['nested','parent']
    with pytest.raises(ValueError,match='no longer exists'): group_sections(snapshot,['missing'])


def test_selected_parent_without_remaining_questions_does_not_create_an_empty_sheet():
    sections = group_sections({'groups':[{'id':'a','label':'Parent','parent':''},{'id':'child','label':'Child','parent':'a'}],'questions':[{'id':'q','group':'child'}]},['a','child'])
    assert [section['label'] for section in sections] == ['Child']


def test_export_source_context_filters_once_and_preserves_zero_option_rows(sample, monkeypatch):
    from unittest.mock import Mock
    import backend.kobo_excel as native
    from backend.kobo import analyze
    project = sample[0]; settings = KoboSettings(filters=[{'field': 'group/gender', 'values': ['f']}], hideBlanks=False, hideZero=False)
    snapshot = analyze(project, settings)
    expected = [native.source_rows(project, result, settings) for result in snapshot['questions']]
    original = native.filtered_records
    spy = Mock(side_effect=original); monkeypatch.setattr(native, 'filtered_records', spy)
    context = native.source_context(project, settings)
    actual = [list(native.iter_source_rows(project, result, settings, context)) for result in snapshot['questions']]
    assert actual == expected
    assert spy.call_count == 1
    needs = next(rows for rows, result in zip(actual, snapshot['questions']) if result['name'] == 'needs')
    assert any(row[5] == 'none' and row[2] == 0 for row in needs)


def test_question_filter_does_not_enumerate_answers_from_other_questions():
    from unittest.mock import Mock
    from backend.kobo_excel import _fixed_pivot_items
    pivot = Mock()
    _fixed_pivot_items(pivot, {'breakdowns': [], 'id': 'q'}, {'form': {'questions': []}}, KoboSettings())
    pivot.PivotFields.assert_not_called()


def test_native_missing_answer_counts_are_not_formatted_as_dashes():
    from unittest.mock import Mock
    from backend.kobo_excel import _style_pivot
    pivot = Mock()
    pivot.DataBodyRange.Columns.Count = 1
    pivot.DataBodyRange.Cells.return_value.PivotCell.DataField.Name = '#'
    _style_pivot(pivot, Mock(), {'breakdownFields': [{'id': 'gender'}]})
    pivot.DataBodyRange.Cells.return_value.FormatConditions.Add.assert_not_called()


def test_native_percentage_formatting_supplies_com_operator_argument():
    from unittest.mock import Mock
    from backend.kobo_excel import _style_pivot
    pivot = Mock(); report = Mock()
    pivot.DataBodyRange.Columns.Count = 1
    pivot.DataBodyRange.Rows.Count = 2
    pivot.DataBodyRange.Row = 8
    first = pivot.DataBodyRange.Cells.return_value
    first.PivotCell.DataField.Name = '%'
    first.PivotCell.ColumnItems.Count = 0
    condition = Mock()

    # The native COM call rejects a missing Operator with DISP_E_PARAMNOTOPTIONAL.
    def add(condition_type, operator, formula):
        assert condition_type == 2 and operator == 0
        assert formula.startswith('=OR($A8="Blank / unanswered",')
        assert 'COUNTIFS(' in formula
        return condition

    report.Range.return_value.FormatConditions.Add.side_effect = add
    _style_pivot(pivot, report, {
        'id': 'question', 'breakdownFields': [],
        'rows': [{'id': 'yes', 'label': 'Yes'}],
    })
    report.Range.return_value.FormatConditions.Add.assert_called_once()
    assert condition.NumberFormat == '"-"'


def test_metric_pivot_orders_only_this_questions_items_without_enumerating_the_cache(monkeypatch):
    from unittest.mock import Mock, call
    import backend.kobo_excel as native
    book = Mock(); cache = Mock(); visible = Mock(); sheet = Mock()
    sheet.UsedRange.Row = 1; sheet.UsedRange.Rows.Count = 1
    monkeypatch.setattr(native, '_support_sheet', lambda *_: sheet)
    result = {'id': 'q', 'appearance': {'metric': 'count'}, 'breakdownFields': [{}],
              'rows': [{'id': 'a', 'label': 'Same'}, {'id': 'b', 'label': 'Same'}],
              'breakdowns': [{'labels': ['Shared']}], '_excelBreakdowns': [{'labels': ['Shared [one]']}]}
    pivot, metrics = native._metric_pivot(book, cache, visible, result, 1)
    assert metrics == ['count'] and pivot.ManualUpdate is False
    assert visible.PivotFields('Answer').PivotItems.call_args_list == [call('Same [a]'), call('Same [b]'), call('Shared [one]')]
    assert all(args.args for args in visible.PivotFields.return_value.PivotItems.call_args_list)


def test_ungrouped_only_export_retains_general_sheet():
    snapshot = {'groups': [], 'questions': [{'id': 'q', 'group': ''}]}
    assert [section['label'] for section in group_sections(snapshot, [])] == ['General']
