"""Real Excel checks for default ordering and shared Custom Analysis totals."""
import queue
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.custom_analysis import read_tables, table_data, initial_columns, Configuration, build
from backend.kobo import KoboSettings, QuestionSettings, analyze
from backend.kobo_excel import excel_worker
from backend.kobo_excel_runtime import create_excel
from backend.test_kobo_answer_order import fixture


def custom_fixture():
    raw = b'Answer,Region,Single,Fixed,Needs\na,north,only,one,water;food\nc,north,only,one,food\nb,north,only,one,food\nb,north,only,one,water\nc,south,only,one,food\nc,south,only,one,water\nb,south,only,one,food\n'
    tables = read_tables(raw, 'synthetic.csv')
    config = Configuration(worksheet='CSV')
    headers, data = table_data(tables, config)
    columns = initial_columns(headers, data)
    for column in columns:
        column.kind = 'multiple' if column.header == 'Needs' else 'category'
        if column.kind == 'multiple': column.separator = ';'
    config.columns = columns
    payload, _ = build(tables, config, columns)
    return {**payload, 'id': 'custom-order', 'name': 'Custom ordering'}


def run():
    import pythoncom
    folder = Path('output/answer-order').resolve(); folder.mkdir(parents=True, exist_ok=True)
    for workspace, project in [('kobo', fixture()), ('custom', custom_fixture())]:
        ids = {q['name'].lower(): q['id'] for q in project['form']['questions']}
        region = ids['region']
        configured = {ids['answer']: QuestionSettings(breakdowns=[region], chart='bar')}
        if workspace == 'custom':
            configured[ids['single']] = QuestionSettings(breakdowns=[region])
            configured[ids['needs']] = QuestionSettings(breakdowns=[region], chart='bar')
            configured[region] = QuestionSettings(breakdowns=[ids['fixed']])
        settings = KoboSettings(hidden=[region, *([ids['date'],ids['number']] if workspace == 'kobo' else [ids['fixed']])],
            filterFields=[region], filters=[{'field':region,'values':['north']}], questions=configured)
        expected = analyze(project, settings)
        for mode in ['native','binary']:
            target = folder / f'{workspace}-{mode}.xlsx'
            messages = queue.Queue()
            excel_worker(project, None, settings.model_dump(), target, messages, excel_mode=mode)
            while not messages.empty():
                event = messages.get()
                if 'error' in event: raise AssertionError(event['error'])
            pythoncom.CoInitialize(); app = create_excel(); app.Visible = False; app.DisplayAlerts = False
            book = None
            try:
                book = app.Workbooks.Open(str(target), UpdateLinks=0)
                app.CalculateFull(); book.RefreshAll(); app.CalculateUntilAsyncQueriesDone(); app.CalculateFull()
                for index, result in enumerate(expected['questions'], 1):
                    pivot = next(p for sheet in book.Worksheets for p in sheet.PivotTables() if str(p.Name) == f'KoboPivot{index:03d}')
                    sheet = pivot.Parent; body = pivot.DataBodyRange
                    labels = [str(sheet.Cells(r, 1).Value) for r in range(body.Row,body.Row+body.Rows.Count)]
                    assert labels == [r['label'] for r in result['rows']], (workspace,mode,result['name'],labels,result['rows'])
                    chart = sheet.ChartObjects(f'Chart_{pivot.Name}').Chart
                    assert list(chart.SeriesCollection(1).XValues) == labels
                    if result['chart'] == 'bar': assert chart.Axes(1).ReversePlotOrder
                    headers = {str(sheet.Cells(body.Row-1,c).Value):c for c in range(body.Column, body.Column+body.Columns.Count+12)}
                    assert ('Total #' in headers) == (len(result['breakdowns'])>1)
                    bottom = pivot.TableRange1.Row + pivot.TableRange1.Rows.Count - 1
                    assert (sheet.Cells(bottom+2,1).Value in ['Total','Total answered']) == (len(result['rows'])>1)
                    if 'Total #' in headers:
                        for offset, answer in enumerate(result['rows']):
                            assert sheet.Cells(body.Row+offset, headers['Total #']).Value == answer['count']
                    assert pivot.EnableDrilldown
                book.Save()
                print(f'PASS {workspace} {mode}: filtered count order, matching charts, largest bar on top, independent totals, live refresh', flush=True)
            finally:
                if book is not None: book.Close(False)
                app.Quit(); pythoncom.CoUninitialize()


if __name__ == '__main__': run()
