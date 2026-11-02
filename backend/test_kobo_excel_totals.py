from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from backend.kobo_excel_totals import append_overall_totals, totals_policy


@pytest.mark.parametrize('rows', [0, 1, 3])
@pytest.mark.parametrize('columns', [0, 1, 3])
def test_axes_are_independent(rows, columns):
    assert totals_policy({'rows': [None] * rows, 'breakdowns': [None] * columns}) == (rows > 1, columns > 1)


def sheet(name):
    cells = {}
    value = Mock(Name=name, UsedRange=SimpleNamespace(Row=1, Rows=SimpleNamespace(Count=1)))
    value.Range.side_effect = lambda address: cells.setdefault(address, Mock())
    return value, cells


@pytest.mark.parametrize('metrics', [['count'], ['percent'], ['count', 'percent']])
@pytest.mark.parametrize('kind', ['category', 'multiple'])
def test_live_overall_values_use_unrestricted_pivot_aggregates_and_caption_lookup(metrics, kind):
    report, output = sheet('Report')
    helper, formulas = sheet('Overall')
    result = {'label': 'Question', 'kind': kind, 'percentageDecimals': 1,
              'rows': [{'id': 'a', 'label': 'Same'}, {'id': 'b', 'label': 'Same'}],
              'breakdowns': [{'id': 'n'}, {'id': 's'}], '_source': {'direct': True}}
    right = append_overall_totals(None, report, "'Totals'!$A$1", result, metrics, lambda *args: helper, 10, 1, 5, 14)
    assert right == 5 + len(metrics)
    assert formulas['A6'].Formula == '="Same [a]"'
    assert '"Answer","Same [a]"' in formulas['B6'].Formula
    assert 'Breakdown' not in formulas['B6'].Formula
    assert 'Breakdown' not in formulas['C6'].Formula
    assert ('SUM(' in formulas['D6:G6'].Formula[0][-1]) == (kind == 'category')
    for index, metric in enumerate(metrics, 6):
        col = chr(64 + index)
        assert output[f'{col}9'].Value == 'Total ' + ('#' if metric == 'count' else '%')
        assert 'MATCH(1,INDEX(' in output[f'{col}10:{col}11'].Formula[0][0]
        assert '$A10' in output[f'{col}10:{col}11'].Formula[0][0]
        assert 'GETPIVOTDATA' in output[f'{col}14'].Formula


def test_single_row_keeps_total_column_without_footer_and_blank_percentage_stays_missing():
    report, output = sheet('Report')
    helper, formulas = sheet('Overall')
    result = {'label': 'Question', 'kind': 'multiple', 'rows': [{'id': '__blank__', 'label': 'Blank'}],
              'breakdowns': [{'id': 'n'}, {'id': 's'}], '_source': {'direct': True}}
    assert append_overall_totals(None, report, "'Totals'!$A$1", result, ['count', 'percent'], lambda *args: helper, 10, 1, 5, 14) == 7
    assert formulas['D6:G6'].Formula[0][-1] == '="-"'
    assert 'F14' not in output and 'G14' not in output


def test_filtered_analysis_controls_eligibility_even_when_excel_keeps_all_source_categories():
    result = {'rows': [None] * 3, 'breakdowns': [None] * 3, '_totalsPolicy': (False, False)}
    assert totals_policy(result) == (False, False)
    assert append_overall_totals(None, None, None, result, ['count'], None, 10, 1, 5, 14) == 5
