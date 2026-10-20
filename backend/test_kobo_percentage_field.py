from types import SimpleNamespace
from unittest.mock import Mock

from backend.kobo_excel import _percentage_field


def test_existing_percentage_field_is_resolved_on_the_current_pivot():
    field = object()
    calculated = Mock(); calculated.Item.return_value = field
    pivot = Mock(); pivot.CalculatedFields.return_value = calculated
    assert _percentage_field(pivot) is field
    calculated.Item.assert_called_once_with('ResponsePercent')
    calculated.Add.assert_not_called()


def test_reused_cache_number_does_not_skip_missing_percentage_field():
    pivots = []
    for _ in range(2):
        calculated = Mock(); calculated.Item.side_effect = KeyError('ResponsePercent')
        calculated.Add.return_value = object()
        pivots.append(SimpleNamespace(CacheIndex=1, CalculatedFields=lambda fields=calculated: fields))
    for pivot in pivots:
        assert _percentage_field(pivot) is pivot.CalculatedFields().Add.return_value
        pivot.CalculatedFields().Add.assert_called_once_with('ResponsePercent', '=IF(Answered=0,0,Selected/Answered)', True)


def test_subsequent_lookup_uses_the_field_instead_of_adding_it_again():
    field = object(); calculated = Mock(); calculated.Item.side_effect = [KeyError('missing'), field]
    calculated.Add.return_value = field
    pivot = SimpleNamespace(CalculatedFields=lambda: calculated)
    assert _percentage_field(pivot) is field
    assert _percentage_field(pivot) is field
    calculated.Add.assert_called_once()


def test_percentage_chart_uses_resolved_field_without_stale_pivotfields_lookup(monkeypatch):
    import backend.kobo_excel as native
    sheet = Mock(); sheet.UsedRange = SimpleNamespace(Row=1, Rows=SimpleNamespace(Count=1))
    monkeypatch.setattr(native, '_support_sheet', lambda *_: sheet)
    resolved = object(); helper = Mock(return_value=resolved)
    monkeypatch.setattr(native, '_percentage_field', helper)
    cache = Mock(); pivot = cache.CreatePivotTable.return_value
    def field(name):
        assert name != 'ResponsePercent'
        return Mock()
    pivot.PivotFields.side_effect = field
    result = {'id': 'q', 'appearance': {'metric': 'percent'}, 'rows': [], 'breakdowns': []}
    native._metric_pivot(Mock(), cache, Mock(), result, 1)
    helper.assert_called_once_with(pivot)
    pivot.AddDataField.assert_called_once_with(resolved, '%', -4157)
