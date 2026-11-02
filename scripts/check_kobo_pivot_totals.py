"""Verify conditional totals in real Excel using synthetic survey responses."""
import copy
import queue
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.kobo import KoboSettings, QuestionSettings, analyze
from backend.kobo_excel import excel_worker
from backend.kobo_excel_runtime import create_excel
from scripts.check_kobo_percentage_excel import fixture


def run():
    import pythoncom
    project = fixture()
    choice = project['form']['questions'][0]
    for name in ['singleton', 'one_column', 'plain_single', 'fixed_region']:
        question = copy.deepcopy(choice)
        question.update(id=name, name=name, labels={'en': name})
        if name != 'one_column': question['choices'] = [{'name': 'only', 'labels': {'en': 'only'}}]
        project['form']['questions'].append(question)
        for record in project['records']:
            record['values'][name] = record['values']['choice'] if name == 'one_column' else 'only'
    folder = Path('output/kobo-pivot-totals').resolve()
    folder.mkdir(parents=True, exist_ok=True)
    for mode in ['native', 'binary']:
        for display in ['count', 'percent', 'both']:
            settings = KoboSettings(hidden=['region', 'fixed_region'], percentageDecimals=1,
                filterFields=['region'], hideEmpty=False, hideZero=False, questions={
                    'choice': QuestionSettings(breakdowns=['region'], breakdownDisplay=display),
                    'multiple': QuestionSettings(breakdowns=['region'], breakdownDisplay=display),
                    'singleton': QuestionSettings(breakdowns=['region'], breakdownDisplay=display),
                    'one_column': QuestionSettings(breakdowns=['fixed_region'], breakdownDisplay=display),
                    'plain_single': QuestionSettings(breakdownDisplay=display)})
            snapshot = analyze(project, settings)
            target = folder / f'{mode}-{display}.xlsx'
            messages = queue.Queue()
            excel_worker(project, None, settings.model_dump(), target, messages, excel_mode=mode)
            while not messages.empty():
                message = messages.get()
                if 'error' in message: raise AssertionError(message['error'])
            pythoncom.CoInitialize()
            app = create_excel(); app.Visible = False; app.DisplayAlerts = False
            book = None
            try:
                book = app.Workbooks.Open(str(target), UpdateLinks=0)
                app.CalculateFull(); book.RefreshAll(); app.CalculateUntilAsyncQueriesDone(); app.CalculateFull()
                for index, result in enumerate(snapshot['questions'], 1):
                    pivot = next(p for sheet in book.Worksheets for p in sheet.PivotTables() if str(p.Name) == f'KoboPivot{index:03d}')
                    report = pivot.Parent
                    body = pivot.DataBodyRange
                    bottom = pivot.TableRange1.Row + pivot.TableRange1.Rows.Count - 1
                    label = report.Cells(bottom + 2, 1).Value
                    assert (label in ['Total', 'Total answered', 'إجمالي الإجابات']) == (len(result['rows']) > 1), (mode, display, result['id'], label)
                    headers = {str(report.Cells(body.Row-1, col).Value): col for col in range(body.Column, body.Column+body.Columns.Count+15)}
                    total_columns = {metric: headers.get('Total ' + ('#' if metric == 'count' else '%')) for metric in (['count','percent'] if display == 'both' else [display])}
                    assert all(bool(col) == (len(result['breakdowns']) > 1) for col in total_columns.values()), (result['id'], total_columns)
                    def check(expected_result=result):
                        rows = {str(report.Cells(row, 1).Value): row for row in range(body.Row, body.Row+body.Rows.Count)}
                        for answer in expected_result['rows']:
                            if answer['label'] not in rows and answer['count'] == 0: continue
                            row = rows[answer['label']]
                            for metric, col in total_columns.items():
                                if col is None: continue
                                actual = report.Cells(row, col).Value
                                expected = answer['count'] if metric == 'count' else answer['displayPercent']/100
                                assert isinstance(actual, (int, float)) and abs(actual-expected) < 1e-8, (mode, display, result['id'], answer['label'], metric, actual, expected)
                                if len(result['rows']) > 1:
                                    expected_total = expected_result['denominator'] if metric == 'count' else 1
                                    assert report.Cells(bottom+2, col).Value == expected_total
                    check()
                    # Reorder answer captions and confirm the formulas still follow them.
                    if mode == 'binary' and result['kind'] == 'multiple':
                        pivot.DataFields.Item(1).Position = pivot.DataFields.Count
                    elif len(result['rows']) > 1:
                        pivot.RowFields.Item(1).PivotItems(result['rows'][0]['label']).Position = body.Rows.Count
                    app.CalculateFull(); check()
                    assert pivot.EnableDrilldown
                    if len(result['breakdowns']) > 1:
                        cache = next(c for c in book.SlicerCaches if any(str(p.Name) == str(pivot.Name) for p in c.PivotTables))
                        for item in cache.SlicerItems:
                            if str(item.Name) == 'north': item.Selected = True
                        for item in cache.SlicerItems:
                            if str(item.Name) != 'north': item.Selected = False
                        app.CalculateFull()
                        filtered_settings = KoboSettings.model_validate({**settings.model_dump(), 'filters': [{'field': 'region', 'values': ['north']}]})
                        filtered_result = next(q for q in analyze(project, filtered_settings)['questions'] if q['id'] == result['id'])
                        check(filtered_result)
                        cache.ClearManualFilter(); app.CalculateFull(); check()
                book.RefreshAll(); app.CalculateUntilAsyncQueriesDone(); app.CalculateFull()
                for sheet in book.Worksheets:
                    if str(sheet.Name) == '_Kobo overall totals':
                        assert not any(isinstance(value, int) and value < -2000000000 for row in sheet.UsedRange.Value for value in row), sheet.UsedRange.Value
                book.Save()
                print(f'PASS {mode} {display}: independent axes, overall counts/percentages, sorting, slicer changes, native drilldown, refresh', flush=True)
            finally:
                if book is not None: book.Close(False)
                app.Quit(); pythoncom.CoUninitialize()


if __name__ == '__main__':
    run()
