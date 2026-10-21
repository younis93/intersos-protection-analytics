"""Native Excel acceptance checks for sparse, fully drillable Kobo exports.

Uses generated survey records only. Run with an existing generated workbook path,
or omit the path to export a new fixture before checking it.
"""
import json
import queue
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.check_kobo_excel_improvements import fixture
from backend.kobo_excel import excel_worker
from backend.kobo_excel_runtime import create_excel


def export(project, settings, target):
    messages = queue.Queue()
    started = time.perf_counter()
    excel_worker(project, None, settings.model_dump(), target, messages, chart_metric='both')
    while not messages.empty():
        message = messages.get()
        if 'error' in message: raise AssertionError(message['error'])
    return {'seconds': time.perf_counter()-started, 'bytes': target.stat().st_size}


def verify(target):
    import pythoncom
    import win32com.client
    import win32com.client.dynamic
    pythoncom.CoInitialize()
    app = create_excel()
    app.Visible = False; app.DisplayAlerts = False; app.EnableEvents = False
    book = None
    try:
        book = app.Workbooks.Open(str(target), UpdateLinks=0)
        names = {str(sheet.Name) for sheet in book.Worksheets}
        assert not {'Workbook guide', 'Pivot data', '_Kobo rounding'} & names
        report = book.Worksheets('Household')
        ordinary = report.PivotTables('KoboPivot001')
        first = report.PivotTables('KoboPivot002')
        second = report.PivotTables('KoboPivot004')
        assert ordinary.EnableDrilldown and first.EnableDrilldown
        assert str(ordinary.PivotCache().SourceData) == 'KoboResponses000'
        assert first.CacheIndex != second.CacheIndex
        data = book.Worksheets('Data').ListObjects(1)
        headers = [str(cell.Value) for cell in data.HeaderRowRange]
        ids = [str(row[0]) for row in data.DataBodyRange.Value]

        def records(cell):
            previous = book.Worksheets.Count
            cell.ShowDetail = True
            assert book.Worksheets.Count == previous+1
            detail = book.ActiveSheet
            # Some Excel versions prepend a report title above the detail table.
            table = detail.ListObjects(1) if detail.ListObjects.Count else None
            values = table.Range.Value if table is not None else detail.UsedRange.Value
            header_index = next(i for i, row in enumerate(values) if 'Response ID' in row)
            keys = values[header_index]
            rows = [dict(zip(keys, row)) for row in values[header_index+1:] if any(v is not None for v in row)]
            detail.Delete()
            return rows

        selected = records(first.GetPivotData('#', 'Answer', 'Clean water', 'Breakdown1', 'Female'))
        assert len(selected) == 1 and str(selected[0]['Response ID']) == ids[0]
        assert selected[0]['IncludeInPivot'] == 'Included'
        assert {'Age', 'Technical metadata', 'Location', 'Score'} <= set(selected[0])
        assert 'Name of respondent' not in selected[0]
        selected = records(ordinary.GetPivotData('#', '[Calc] Q001 answer', 'Female'))
        assert {str(row['Response ID']) for row in selected} == {ids[0], ids[2]}
        support = book.Worksheets('_Kobo multi 002').ListObjects(1)
        keys = [str(cell.Value) for cell in support.HeaderRowRange]
        reference = [dict(zip(keys, row)) for row in support.DataBodyRange.Value]
        assert sum(r['IncludeInPivot'] == 'Denominator' for r in reference) == 3
        assert sum(r['IncludeInPivot'] == 'Included' for r in reference) == 3
        assert sum(r['Selected'] for r in reference) == 3

        def control(pivot):
            return next(c for c in book.SlicerCaches if str(c.SourceName) == 'Filter001'
                        and any(p.Name == pivot.Name for p in c.PivotTables))

        def choose(cache, caption):
            for item in cache.SlicerItems:
                if str(item.Name) == caption: item.Selected = True
            for item in cache.SlicerItems:
                if str(item.Name) != caption: item.Selected = False

        def percent(pivot, answer, breakdown, index):
            cell = pivot.GetPivotData('#', 'Answer', answer, 'Breakdown1', breakdown)
            return report.Cells(cell.Row, pivot.TableRange1.Column+pivot.TableRange1.Columns.Count+1+index).Value

        left, right = control(first), control(second)
        assert left.Name != right.Name
        assert str(left.Slicers.Item(1).Caption) == 'Gender', str(left.Slicers.Item(1).Caption)
        assert percent(first, 'Clean water', 'Female', 0) == 1
        choose(left, 'Male'); app.CalculateFull()
        assert first.GetPivotData('#', 'Answer', 'None', 'Breakdown1', 'Male').Value == 1
        assert percent(first, 'None', 'Male', 1) == 1
        assert second.GetPivotData('#', 'Answer', 'Clean water', 'Breakdown1', 'Female').Value == 1
        selected = records(first.GetPivotData('#', 'Answer', 'None', 'Breakdown1', 'Male'))
        assert len(selected) == 1 and str(selected[0]['Response ID']) == ids[1]
        choose(left, 'Female')
        data.DataBodyRange.Cells(1, headers.index('Needs')+1).Value = 'none'
        added = data.ListRows.Add()
        for col in range(1, headers.index('[Calc] Response')+1):
            added.Range.Cells(1, col).Value = data.ListRows(1).Range.Cells(1, col).Value
        added.Range.Cells(1, headers.index('Response ID')+1).Value = 'added-response'
        added.Range.Cells(1, headers.index('Needs')+1).Value = 'food'
        book.RefreshAll(); app.CalculateUntilAsyncQueriesDone(); app.CalculateFull()
        assert first.GetPivotData('#', 'Answer', 'None', 'Breakdown1', 'Female').Value == 1
        assert first.GetPivotData('#', 'Answer', 'Food', 'Breakdown1', 'Female').Value == 1
        assert percent(first, 'Food', 'Female', 0) == .5, (percent(first, 'Food', 'Female', 0), first.TableRange1.Value, first.TableRange1.Address, report.Cells(first.GetPivotData('#', 'Answer', 'Food', 'Breakdown1', 'Female').Row, first.TableRange1.Column+first.TableRange1.Columns.Count+1).Formula, book.Worksheets('_Kobo slicer totals').PivotTables('KoboTotals002').TableRange2.Address)
        assert tuple(report.ChartObjects('Chart_KoboPivot002').Chart.SeriesCollection(1).Values) == (0., 1., 1.)
        selected = records(first.GetPivotData('#', 'Answer', 'Food', 'Breakdown1', 'Female'))
        assert len(selected) == 1 and selected[0]['Response ID'] == 'added-response'
        assert ordinary.GetPivotData('#', '[Calc] Q001 answer', 'Female').Value == 3
        for sheet in book.Worksheets:
            for pivot in sheet.PivotTables():
                if str(sheet.Name) != '_Kobo slicer totals':
                    assert pivot.DataBodyRange is not None
        for sheet in book.Worksheets:
            if sheet.Visible == -1:
                values = sheet.UsedRange.Value
                assert not any(value in {'#REF!', '#DIV/0!', '#VALUE!', '#NAME?', '#N/A'}
                               for row in values for value in row if isinstance(value, str)), sheet.Name
        # Verify that caches and drill-through survive a second save/open cycle.
        copy = target.with_name('refreshed.xlsx')
        book.SaveAs(str(copy), FileFormat=51); book.Close(False); book = None
        book = app.Workbooks.Open(str(copy), UpdateLinks=0)
        pivot = book.Worksheets('Household').PivotTables('KoboPivot002')
        selected = records(pivot.GetPivotData('#', 'Answer', 'Food', 'Breakdown1', 'Female'))
        assert len(selected) == 1 and selected[0]['Response ID'] == 'added-response'
        return {'passed': True, 'visible_sheets': [str(s.Name) for s in book.Worksheets if s.Visible == -1],
                'pivot_caches': book.PivotCaches().Count}
    finally:
        if book is not None: book.Close(False)
        app.Quit(); pythoncom.CoUninitialize()


def verify_repeat_arabic(folder):
    """Full parent context, duplicate Arabic choices, missing answers and no data."""
    import copy
    import pythoncom
    import win32com.client
    import win32com.client.dynamic
    project, settings = fixture()
    question = copy.deepcopy(next(q for q in project['form']['questions'] if q['kind'] == 'multiple'))
    question.update(id='visits/needs', name='visit_needs', repeat='visits', group='visits', labels={'ar': 'احتياجات الزيارة'})
    for choice in question['choices']: choice['labels']['ar'] = 'خيار'
    project['form']['questions'].append(question)
    visit = next(r for r in project['records'] if r['scope'] == 'visits')
    visit['values'][question['id']] = ['food', 'food']
    project['records'].append({**copy.deepcopy(visit), 'id': 'visit2', 'row': 3, 'values': {}})
    settings.language = 'ar'; settings.hideBlanks = False; settings.filters = []
    for empty in (False, True):
        target = folder / ('empty.xlsx' if empty else 'repeat-arabic.xlsx')
        messages = queue.Queue()
        payload = {**project, 'records': []} if empty else project
        excel_worker(payload, None, settings.model_dump(), target, messages, question=question['id'])
        while not messages.empty():
            message = messages.get()
            if 'error' in message: raise AssertionError(message['error'])
        pythoncom.CoInitialize()
        app = create_excel()
        app.Visible = False; app.DisplayAlerts = False; book = None
        try:
            book = app.Workbooks.Open(str(target), UpdateLinks=0)
            if empty:
                assert book.Worksheets('Data').ListObjects(1).ListRows.Count == 0
                assert sum(s.PivotTables().Count for s in book.Worksheets) == 0
            else:
                report = next(s for s in book.Worksheets if s.Visible == -1 and s.PivotTables().Count)
                pivot = report.PivotTables(1)
                cell = pivot.GetPivotData('#', 'Answer', 'خيار [food]')
                assert cell.Value == 1  # Duplicate codes do not duplicate responses.
                cell.ShowDetail = True
                values = book.ActiveSheet.UsedRange.Value
                row = dict(zip(values[0], values[1]))
                assert row['Response ID'] == 'visit1' and row['Parent ID'] == visit['parent']
                assert row['العمر'] == 0 and row['Technical metadata'] == 'metadata'
                assert 'اسم المستجيب' not in row
                book.ActiveSheet.Delete()
                source = book.Worksheets('_Kobo multi 001').ListObjects(1)
                keys = [str(c.Value) for c in source.HeaderRowRange]
                rows = [dict(zip(keys, r)) for r in source.DataBodyRange.Value]
                assert sum(r['Answered'] for r in rows if r['IncludeInPivot'] == 'Denominator') == 1
                assert sum(r['Selected'] for r in rows if r['AnswerCode'] == '__blank__') == 1
                assert all(str(c.Slicers.Item(1).Caption) != 'Filter001' for c in book.SlicerCaches)
        finally:
            if book is not None: book.Close(False)
            app.Quit(); pythoncom.CoUninitialize()
    return {'repeat_parent_context': True, 'arabic_duplicate_labels': True, 'missing_answers': True, 'empty_data': True}


def verify_three_breakdowns(folder):
    from backend.kobo import QuestionSettings
    import pythoncom
    import win32com.client
    import win32com.client.dynamic
    project, settings = fixture()
    settings.questions['group/needs'] = QuestionSettings(breakdowns=['group/gender', 'group/location', 'meta'])
    settings.filters = []
    target = folder / 'three-breakdowns.xlsx'
    messages = queue.Queue()
    excel_worker(project, None, settings.model_dump(), target, messages, question='group/needs')
    while not messages.empty():
        message = messages.get()
        if 'error' in message: raise AssertionError(message['error'])
    pythoncom.CoInitialize()
    app = create_excel()
    app.Visible = False; app.DisplayAlerts = False; book = None
    try:
        book = app.Workbooks.Open(str(target), UpdateLinks=0)
        report = book.Worksheets('Household'); pivot = report.PivotTables('KoboPivot001')
        assert pivot.GetPivotData('#', 'Answer', 'Clean water', 'Breakdown1', 'Female', 'Breakdown2', 'North', 'Breakdown3', 'metadata').Value == 1
        # Four native combinations exist; only two combinations have source data.
        assert pivot.DataBodyRange.Columns.Count == 4
        footer = next(row for row in report.UsedRange.Value if row[0] == 'Total answered')
        assert footer[1:5] == (1., 0., 0., 1.), footer
        assert footer[6:8] == (1., 1.), footer
        return {'three_breakdowns': True, 'empty_combinations': True, 'footer_alignment': True}
    finally:
        if book is not None: book.Close(False)
        app.Quit(); pythoncom.CoUninitialize()


if __name__ == '__main__':
    if '--breakdowns' in sys.argv:
        print(json.dumps(verify_three_breakdowns(Path('output/kobo-excel-optimized').resolve()), indent=2), flush=True)
        raise SystemExit(0)
    if '--edge' in sys.argv:
        print(json.dumps(verify_repeat_arabic(Path('output/kobo-excel-optimized').resolve()), indent=2), flush=True)
        raise SystemExit(0)
    target = Path(sys.argv[1] if len(sys.argv)>1 else 'output/kobo-excel-optimized/acceptance.xlsx').resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    result = {}
    if len(sys.argv) < 2:
        project, settings = fixture(); result['export'] = export(project, settings, target)
    result['verification'] = verify(target)
    print(json.dumps(result, indent=2), flush=True)
