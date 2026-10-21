from copy import deepcopy
from types import SimpleNamespace
import pytest

from backend.kobo import KoboSettings
from backend.kobo_excel_slicers import slicer_specs, slicer_fields, filter_values, scalar_key, pivot_value
from backend.test_kobo import sample


def test_union_of_chosen_and_active_fields_with_initial_selection(sample):
    project = sample[0]
    specs = slicer_specs(project, KoboSettings(filterFields=['group/gender', 'group/gender'],
        filters=[{'field': 'group/age', 'kind': 'number', 'minimum': 0, 'maximum': 0}]))
    assert [s['id'] for s in specs] == ['group/gender', 'group/age']
    assert specs[0]['selected'] is None
    assert specs[1]['selected'] == {'0'}
    assert specs[1]['captions']['__blank__'] == 'Blank / unanswered'
    assert len(filter_values(project, specs)) == 3


def test_date_ranges_and_arabic_labels_keep_source_codes(sample):
    specs = slicer_specs(sample[0], KoboSettings(language='ar', filterFields=['group/gender'], filters=[
        {'field': 'group/gender', 'values': ['f']},
        {'field': 'group/day', 'kind': 'date', 'minimum': '2026-02-01', 'maximum': '2026-02-02'}]))
    assert specs[0]['caption'] == 'الجنس'
    assert specs[0]['selected'] == {'أنثى'}
    assert specs[1]['selected'] == {'2026-02-01', '2026-02-02'}
    assert scalar_key('2026-02-01T00:00:00', 'date') == '2026-02-01'


def test_duplicate_case_insensitive_labels_are_disambiguated(sample):
    project = deepcopy(sample[0])
    for choice in project['form']['questions'][0]['choices']: choice['labels'] = {'en': 'Same'}
    spec = slicer_specs(project, KoboSettings(filterFields=['group/gender'], filters=[{'field': 'group/gender', 'values': ['m']}]))[0]
    assert spec['captions'] == {'f': 'Same [f]', 'm': 'Same [m]'}
    assert spec['selected'] == {'Same [m]'}


@pytest.mark.parametrize('field', ['group/needs', 'missing'])
def test_unsupported_and_missing_fields_are_actionable(sample, field):
    with pytest.raises(ValueError, match='Filter responses'):
        slicer_fields(sample[0], KoboSettings(filterFields=[field]))


def test_repeat_filter_rejected_but_main_filters_inherit_into_repeat_entries(sample):
    project = deepcopy(sample[0]); main = project['records'][0]
    project['records'].append({'id': 'child', 'parent': main['id'], 'scope': 'members', 'values': {}})
    specs = slicer_specs(project, KoboSettings(filterFields=['group/gender']))
    values = filter_values(project, specs)
    assert values['child'] == values[main['id']]
    project['form']['questions'][0]['repeat'] = 'members'
    with pytest.raises(ValueError, match='repeat filter'):
        slicer_specs(project, KoboSettings(filterFields=['group/gender']))


def test_unavailable_filter_selection_cannot_silently_export_all(sample):
    with pytest.raises(ValueError, match='no matching values'):
        slicer_specs(sample[0], KoboSettings(filters=[{'field': 'group/gender', 'values': ['unavailable']}]))


def test_sheet_specific_pivot_formulas_escape_names_and_coerce_empty_values():
    cell = SimpleNamespace(Address='$A$4')
    pivot = SimpleNamespace(Parent=SimpleNamespace(Name="Sheet's totals"), TableRange2=SimpleNamespace(Cells=lambda *_: cell))
    formula = pivot_value(pivot, 'Answered total', 'a"b', ['North*'])
    assert "'Sheet''s totals'!$A$4" in formula
    assert '"a""b"' in formula and '"North*"' in formula
    assert formula.startswith('IFERROR(N(GETPIVOTDATA(')


def test_sparse_counts_read_visible_pivot_and_denominators_do_not_filter_by_answer():
    result = {'_source': {'sparse': True}, '_countPivot': "'Report'!$A$20",
              'rows': [{'id': 'food', 'label': 'Food'}]}
    count = pivot_value("'Totals'!$A$1", 'Responses', 'food', ['North'], result)
    denominator = pivot_value("'Totals'!$A$1", 'Answered total', 'food', ['North'], result)
    assert "'Report'!$A$20" in count and '"#"' in count and '"Answer","Food"' in count
    assert "'Totals'!$A$1" in denominator and 'AnswerCode' not in denominator and '"Food"' not in denominator


def test_slicer_connections_defer_pivot_updates_and_restore_them_on_failure(monkeypatch):
    import backend.kobo_excel_slicers as native
    pivots = [SimpleNamespace(ManualUpdate=False), SimpleNamespace(ManualUpdate=False)]
    cache = SimpleNamespace(CrossFilterType=1)
    def fail(*args):
        args[5].append((cache, 2))
        assert all(pivot.ManualUpdate for pivot in pivots)
        raise ValueError('Connection failed')
    monkeypatch.setattr(native, '_connect_sheet_slicers', fail)
    with pytest.raises(ValueError, match='Connection failed'):
        native.add_sheet_slicers(None, None, pivots, [{}], 1)
    assert not any(pivot.ManualUpdate for pivot in pivots)
    assert cache.CrossFilterType == 2
