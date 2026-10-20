"""Exercise appearance settings against real, reopened native Excel workbooks."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.check_kobo_grouped_excel import fixture, export
from backend.kobo import ChartAppearance, analyze
from backend.kobo_excel_layout import CHART_GAP, BLOCK_GAP


def run(language):
    import pythoncom
    import win32com.client
    import win32com.client.dynamic
    project, settings, _ = fixture(language)
    for key, cfg in settings.questions.items():
        cfg.appearance = ChartAppearance(metric='percent' if key in {'group/needs', 'group/age', 'group/location'} else 'count', labels='both', legend='right', fontSize=14, height=560, grid='hide', bars='stack')
    snapshot = analyze(project, settings)
    root = Path('output/kobo-appearance').resolve(); root.mkdir(parents=True, exist_ok=True)
    path = root / f'native-{language}.xlsx'
    export(project, settings, snapshot, path)
    pythoncom.CoInitialize()
    app = win32com.client.dynamic.Dispatch(win32com.client.DispatchEx('Excel.Application')._oleobj_)
    app.Visible = False; app.DisplayAlerts = False; app.EnableEvents = False
    book = None
    try:
        book = app.Workbooks.Open(str(path))
        for cycle in range(2):
            supports = [book.Worksheets(name) for name in ['_Kobo chart pivots', '_Kobo chart labels']]
            assert all(sheet.Visible == 2 for sheet in supports)
            assert book.Worksheets('Data').ListObjects.Count == 1
            changed_label = None
            for i in range(2, book.Worksheets.Count+1):
                sheet = book.Worksheets(i)
                if sheet.Visible != -1: continue
                previous_end = 0
                ordered = sorted([sheet.PivotTables(j) for j in range(1, sheet.PivotTables().Count+1)], key=lambda pivot: pivot.TableRange1.Top)
                for visible in ordered:
                    result = next(q for q in snapshot['questions'] if q['id'] == str(visible.PivotFields('QuestionId').CurrentPage))
                    position = snapshot['questions'].index(result)+1
                    explicit = result.get('appearance', {}).get('metric', 'auto') != 'auto'
                    chart = sheet.ChartObjects(f'Chart_Kobo{"Chart" if explicit else ""}Pivot{position:03d}')
                    assert abs(chart.Left-visible.TableRange1.Left-visible.TableRange1.Width-CHART_GAP) < 1
                    assert visible.TableRange1.Top >= previous_end, (sheet.Name, visible.Name, visible.TableRange1.Top, previous_end)
                    previous_end = max(chart.Top+chart.Height, visible.TableRange1.Top+visible.TableRange1.Height)+BLOCK_GAP
                    if not explicit: continue
                    native = chart.Chart
                    assert native.PivotLayout.PivotTable.Name != visible.Name
                    assert str(native.PivotLayout.PivotTable.PivotFields('QuestionId').CurrentPage) == result['id']
                    assert native.PivotLayout.PivotTable.DataFields.Count == 1
                    dimensions = len(result.get('breakdownFields', []))
                    mode = result['breakdownDisplay'] if dimensions else 'both'
                    assert visible.DataFields.Count == (2 if mode == 'both' else 1)
                    assert abs(chart.Height-420) < .5
                    assert native.HasLegend
                    assert native.Legend.Position == -4152
                    if result['chart'] in {'bar', 'column'} and dimensions: assert native.ChartType in {58, 52}
                    series = native.SeriesCollection(1)
                    text = str(series.Points(1).DataLabel.Text)
                    assert ' / ' in text and '%' in text and '.%' not in text, text
                    assert '_Kobo chart labels' in series.Points(1).DataLabel.Formula
                    if result['id'] == 'group/location':
                        # Chart percentages and labels must use answered respondents, not sum of selections.
                        assert abs(series.Values[0]-(1 if cycle else 2/3)) < 1e-6
                        changed_label = series.Points(1).DataLabel
                        assert ('100' if cycle else '66.67') in str(changed_label.Text)
            if cycle == 0:
                # Edit existing records and append an included answered record, then refresh every pivot.
                table = book.Worksheets('Data').ListObjects('KoboData')
                values = table.DataBodyRange.Value
                template = next(row for row in values if row[0] == 'group/location' and row[5] == 'north')
                for row, values_row in enumerate(values, 1):
                    if values_row[0] == 'group/location' and values_row[5] == 'north': table.DataBodyRange.Cells(row, 8).Value = 1
                extra = list(template); extra[4] = 'appearance-added'; extra[7] = 1; extra[8] = 1
                table.ListRows.Add().Range.Value = (tuple(extra),)
                book.RefreshAll(); app.CalculateUntilAsyncQueriesDone(); app.CalculateFull()
                book.Save(); book.Close(False)
                book = app.Workbooks.Open(str(path))
        print(f'PASS {language}: native connections, independent metrics, refreshed labels, source edits/appends, hidden support, chart bounds and save/reopen.', flush=True)
    finally:
        if book is not None: book.Close(False)
        app.Quit(); pythoncom.CoUninitialize()


if __name__ == '__main__':
    run('en')
    run('ar')
