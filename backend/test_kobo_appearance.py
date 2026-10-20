import copy
import pytest
from pydantic import ValidationError
from backend.kobo import KoboSettings, ChartAppearance, QuestionSettings, analyze
from backend.kobo_api import QuestionResult
from backend.test_kobo import sample


def test_appearance_roundtrip_preserves_results_and_settings_version(sample):
    project = copy.deepcopy(sample[0])
    settings = KoboSettings(questions={'group/needs': QuestionSettings(breakdowns=['group/gender'])})
    before = analyze(project, settings)
    settings.questions['group/needs'].appearance = ChartAppearance(metric='percent', labels='both', legend='right', fontSize=14, height=560, grid='hide', bars='stack')
    after = analyze(project, settings)
    original = next(q for q in before['questions'] if q['id'] == 'group/needs')
    changed = next(q for q in after['questions'] if q['id'] == 'group/needs')
    assert changed['rows'] == original['rows']
    assert changed['denominator'] == original['denominator']
    assert changed['breakdownDisplay'] == original['breakdownDisplay']
    assert QuestionResult.model_validate(changed).appearance.metric == 'percent'
    assert KoboSettings.model_validate(settings.model_dump()).questions['group/needs'].appearance.height == 560
    assert settings.version == 1


def test_legacy_settings_and_result_default_to_automatic():
    assert QuestionSettings().appearance == ChartAppearance()


@pytest.mark.parametrize('value', [{'metric':'both'}, {'height':99999}, {'fontSize':-1}, {'legend':'elsewhere'}, {'bars':'normalized'}])
def test_invalid_appearance_rejected(value):
    with pytest.raises(ValidationError): QuestionSettings(appearance=value)


def test_native_automatic_labels_follow_series_metric_and_keep_formulas(monkeypatch):
    from types import SimpleNamespace as NS
    from unittest.mock import Mock
    import backend.kobo_excel as native
    cells = {}
    sheet = Mock(Name='_Kobo chart labels')
    sheet.UsedRange = NS(Row=1, Rows=NS(Count=1))
    sheet.Cells.side_effect = lambda row, column: cells.setdefault((row, column), NS(Formula='', Address=f'R{row}C{column}'))
    monkeypatch.setattr(native, '_support_sheet', lambda *_: sheet)
    monkeypatch.setattr(native, 'native_breakdown_columns', lambda *_: [])
    series = []
    points_by_series = []
    for _ in range(2):
        points = [NS(DataLabel=NS(Formula='', Font=NS()), HasDataLabel=True, Format=NS(Fill=NS(ForeColor=NS(RGB=0x7E4A17)))) for _ in range(2)]
        item = Mock(Values=(10, 0))
        item.Points.side_effect = lambda index=None, points=points: NS(Count=len(points)) if index is None else points[index-1]
        series.append(item); points_by_series.append(points)
    chart = Mock()
    chart.SeriesCollection.side_effect = lambda index=None: NS(Count=2) if index is None else series[index-1]
    result = {'id':'q', 'chart':'bar', 'rows':[{'id':'a'}, {'id':'b'}], 'breakdowns':[], 'colors': {'a': '#174A7E'}, 'appearance':{}}
    native._chart_labels(Mock(), chart, result, ['count','percent'], {}, KoboSettings())
    written = sheet.Range.return_value.Formula
    assert 'TEXT(SUMIFS' in written[0][0]
    assert '0%' in written[0][1]
    assert ' / ' not in written[0][0]
    assert sheet.Range.call_count == 1
    assert points_by_series[0][0].DataLabel.Formula.startswith("='_Kobo chart labels'!")
    assert points_by_series[0][0].DataLabel.Position == 3
    assert points_by_series[0][0].DataLabel.Font.Color == 0xFFFFFF
    assert points_by_series[0][0].DataLabel.Font.Size == 11
    assert points_by_series[0][0].DataLabel.Font.Bold is True
    assert points_by_series[0][1].HasDataLabel is False


def test_native_hidden_labels_stay_hidden():
    from types import SimpleNamespace as NS
    from unittest.mock import Mock
    from backend.kobo_excel import _chart_labels
    series = NS(HasDataLabels=True)
    chart = Mock()
    chart.SeriesCollection.side_effect = lambda index=None: NS(Count=1) if index is None else series
    _chart_labels(Mock(), chart, {'appearance':{'labels':'hidden'}}, ['count'], {}, KoboSettings())
    assert series.HasDataLabels is False


def test_deferred_native_labels_reacquire_series_after_slicer_refresh():
    from types import SimpleNamespace as NS
    from unittest.mock import Mock
    from backend.kobo_excel import _apply_label_style
    point = NS(HasDataLabel=False, DataLabel=NS(Formula='', Font=NS()))
    fresh = Mock()
    fresh.Points.side_effect = lambda index=None: NS(Count=1) if index is None else point
    chart = Mock()
    chart.SeriesCollection.side_effect = lambda index=None: NS(Count=1) if index is None else fresh
    _apply_label_style((chart, 1, 1, True, 11, 3, '#ffffff', "='_Kobo chart labels'!$A$5"))
    assert point.HasDataLabel and point.DataLabel.Font.Bold
    assert point.DataLabel.Formula == "='_Kobo chart labels'!$A$5"
    assert fresh.DataLabels().Font.Bold
    # An initially empty slicer intersection can remove the former points.
    _apply_label_style((chart, 1, 2, True, 11, 3, '#ffffff', '=A6'))
    assert fresh.Points.call_args.args == ()


def test_native_contrast_and_label_fit_use_actual_fill_and_font_size():
    from backend.kobo_excel import _label_ink, _rgb, _label_fits
    assert _label_ink(_rgb('#1683d8')) == '#081827'
    assert _label_ink(_rgb('#ffffff')) == '#081827'
    assert _label_ink(_rgb('#123456')) == '#ffffff'
    assert _label_fits('145', 145, 150, 300, 50, 11, False)
    assert not _label_fits('1234567', 145, 150, 300, 30, 16, False)
    assert not _label_fits('1', 1, 150, 300, 50, 11, True)
