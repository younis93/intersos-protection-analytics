"""Synthetic native Excel acceptance checks for editable response exports."""
from pathlib import Path
import copy
import queue
import sys
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.test_kobo import sample
from backend.kobo import KoboSettings, QuestionSettings
from backend.kobo_excel import excel_worker


def fixture():
    project = copy.deepcopy(sample.__wrapped__()[0]); project.update(id='export-improvements', name='Survey export verification')
    needs = next(q for q in project['form']['questions'] if q['name'] == 'needs')
    duplicate = {**copy.deepcopy(needs), 'id': 'group/needs2', 'name': 'needs2', 'labels': {'en': 'Second multi-select question'}}
    project['form']['questions'].append(duplicate)
    project['form']['questions'].extend([
        {'id': 'group/location', 'name': 'location', 'kind': 'text', 'type': 'text', 'repeat': '', 'group': 'group', 'labels': {'en': 'Location'}, 'metadata': False, 'identifying': False, 'choices': []},
        {'id': 'group/score', 'name': 'score', 'kind': 'number', 'type': 'integer', 'repeat': '', 'group': 'group', 'labels': {'en': 'Score'}, 'metadata': False, 'identifying': False, 'choices': []},
        {'id': 'meta', 'name': 'meta', 'kind': 'text', 'type': 'text', 'repeat': '', 'group': '', 'labels': {'en': 'Technical metadata'}, 'metadata': True, 'identifying': False, 'choices': []},
    ])
    for index, record in enumerate(project['records']):
        record['values'].update({'group/location': 'North' if index != 1 else 'South', 'group/score': [0, 20, 5][index], 'meta': 'metadata'})
    for record in project['records']: record['values']['group/needs2'] = record['values']['group/needs']
    project['form']['groups'].append({'id': 'visits', 'name': 'visits', 'labels': {'en': 'Visits'}, 'parent': '', 'repeat': True})
    project['form']['questions'].append({'id': 'visits/service', 'name': 'service', 'kind': 'category', 'type': 'select_one', 'repeat': 'visits', 'group': 'visits', 'labels': {'en': 'Service'}, 'metadata': False, 'identifying': False, 'choices': [{'name': 'yes', 'labels': {'en': 'Yes'}}]})
    project['records'].append({'id': 'visit1', 'parent': project['records'][0]['id'], 'scope': 'visits', 'row': 2, 'sheet': 1, 'values': {'visits/service': 'yes'}})
    settings = KoboSettings(hidden=['group/respondent_name', 'group/age', 'group/location'], filterFields=['group/gender', 'group/location'], filters=[{'field': 'group/gender', 'values': ['f']}], hideZero=False, hideEmpty=False,
        questions={'group/gender': QuestionSettings(chart='donut'), 'group/score': QuestionSettings(numericMode='bins', bins=2), 'group/needs': QuestionSettings(breakdowns=['group/gender']), 'group/needs2': QuestionSettings(breakdowns=['group/gender'])})
    return project, settings


def export(target, metric):
    project, settings = fixture(); messages = queue.Queue()
    excel_worker(project, None, settings.model_dump(), target, messages, chart_metric=metric)
    while not messages.empty():
        message = messages.get(); print(message, flush=True)
        if 'error' in message: raise AssertionError(message['error'])
    assert target.exists()


def verify(target, metric):
    import pythoncom
    import win32com.client
    import win32com.client.dynamic
    pythoncom.CoInitialize()
    app = win32com.client.dynamic.Dispatch(win32com.client.DispatchEx('Excel.Application')._oleobj_)
    app.Visible = False; app.DisplayAlerts = False; app.EnableEvents = False
    book = None
    try:
        book = app.Workbooks.Open(str(target), UpdateLinks=0)
        data = book.Worksheets('Data').ListObjects('KoboResponses000')
        headers = [str(data.HeaderRowRange.Cells(1, i).Value) for i in range(1, data.ListColumns.Count+1)]
        assert 'Age' in headers and 'Technical metadata' in headers and 'Name of respondent' not in headers, headers
        assert data.ListRows.Count == 3
        assert book.Worksheets('Data - Visits').ListObjects(1).ListRows.Count == 1
        assert book.Queries.Count == 2
        assert all(str(sheet.Name) != '_Kobo pivot data' for sheet in book.Worksheets)
        for name in ('_Kobo multi 002', '_Kobo multi 004'): assert book.Worksheets(name).Visible == 0
        report = book.Worksheets('Household')
        chart_count = 0
        for sheet in book.Worksheets:
            for chart_object in sheet.ChartObjects():
                chart = chart_object.Chart; chart_count += 1
                for axis_type in (1, 2):
                    for group in (1, 2):
                        try:
                            axis = chart.Axes(axis_type, group)
                            gridlines = axis.HasMajorGridlines or axis.HasMinorGridlines
                        except Exception: continue
                        assert not gridlines
                assert chart.SeriesCollection().Count <= 2
        assert chart_count == 6
        def pivot(qid):
            return report.PivotTables('KoboPivot002' if qid == 'group/needs' else 'KoboPivot004')
        first, second = pivot('group/needs'), pivot('group/needs2')
        assert first.CacheIndex != second.CacheIndex
        cache = next(c for c in book.SlicerCaches if any(p.Name == first.Name for p in c.PivotTables))
        second_cache = next(c for c in book.SlicerCaches if any(p.Name == second.Name for p in c.PivotTables))
        assert cache.Name != second_cache.Name
        for control, table in [(cache, first), (second_cache, second)]:
            assert control.Slicers(1).Top + control.Slicers(1).Height < table.TableRange2.Top
        def choose(cache, caption):
            items = list(cache.SlicerItems)
            for item in items:
                if str(item.Name) == caption: item.Selected = True
            for item in items:
                if str(item.Name) != caption: item.Selected = False
        choose(cache, 'Male')
        assert any(str(item.Name) == 'Female' and item.Selected for item in second_cache.SlicerItems)
        def edit(row, header, value): data.DataBodyRange.Cells(row, headers.index(header)+1).Value = value
        edit(1, 'Needs', 'none'); edit(3, 'Gender', 'm'); edit(3, 'Needs', 'food')
        edit(2, 'Score', 8); edit(1, 'Date', __import__('datetime').datetime(2026, 2, 15)); edit(3, 'Location', 'West')
        added = data.ListRows.Add()
        raw_width = headers.index('[Calc] Response')
        for index in range(1, raw_width+1): added.Range.Cells(1, index).Value = data.ListRows(1).Range.Cells(1, index).Value
        assert added.Range.Cells(1, raw_width+1).HasFormula
        added.Range.Cells(1, headers.index('Response ID')+1).Value = 'new-response'
        added.Range.Cells(1, headers.index('Gender')+1).Value = 'f'
        added.Range.Cells(1, headers.index('Needs')+1).Value = 'water'
        book.RefreshAll(); app.CalculateUntilAsyncQueriesDone(); app.CalculateFull()
        support = book.Worksheets('_Kobo multi 002').ListObjects(1)
        columns = [str(support.HeaderRowRange.Cells(1, i).Value) for i in range(1, support.ListColumns.Count+1)]
        records = [dict(zip(columns, row)) for row in support.DataBodyRange.Value]
        counts = {code: sum(r['Selected'] for r in records if r['QuestionId'] == 'group/needs' and r['AnswerCode'] == code) for code in ['water','food','none']}
        assert counts == {'water': 1, 'food': 1, 'none': 2}, counts
        # Regular questions source the editable response table, not a query snapshot.
        for name in ['KoboPivot001', 'KoboPivot003', 'KoboPivot005']:
            assert str(report.PivotTables(name).PivotCache().SourceData) == 'KoboResponses000'
        assert first.PivotCache().SourceType == 2
        assert 'KoboMulti002' in str(first.PivotCache().Connection)
        date_pivot = report.PivotTables('KoboPivot003')
        assert date_pivot.GetPivotData('#', '[Calc] Q003 answer', '2026-02').Value == 2
        score_pivot = report.PivotTables('KoboPivot005')
        assert score_pivot.GetPivotData('#', '[Calc] Q005 answer', '0 - 10 (upper excluded)').Value == 2
        assert any(str(item.Name) == 'West' for c in book.SlicerCaches for item in c.SlicerItems)
        # One Refresh All must update the pivots, not just the query table.
        values = str(first.TableRange2.Value)
        assert 'Food' in values and 'None' in values
        female = second.GetPivotData('#', 'Answer', 'Clean water', 'Breakdown1', 'Female').Value
        assert female == 2, ('Stale pivot after one Refresh All', female, second.TableRange2.Value)
        male_food = first.GetPivotData('#', 'Answer', 'Food', 'Breakdown1', 'Male').Value
        assert male_food == 1, ('Edited responses did not refresh', male_food, first.TableRange2.Value)
        gender = report.PivotTables('KoboPivot001')
        ordinary = next(c for c in book.SlicerCaches if any(p.Name == gender.Name for p in c.PivotTables) and str(c.SourceName) == 'Filter001')
        ordinary.ClearManualFilter()
        for caption in ['Female', 'Male']:
            assert gender.GetPivotData('#', '[Calc] Q001 answer', caption).Value == 2
            assert gender.GetPivotData('%', '[Calc] Q001 answer', caption).Value == .5
        assert any(str(item.Name) == 'Female' and item.Selected for item in second_cache.SlicerItems)
        labels = []
        for sheet in book.Worksheets:
            for obj in sheet.ChartObjects():
                for series in obj.Chart.SeriesCollection():
                    for point in series.Points():
                        if point.HasDataLabel: labels.append(str(point.DataLabel.Text))
        if metric == 'both': assert any('(' in text and '%' in text for text in labels), labels
        elif metric == 'percent': assert any('%' in text for text in labels), labels
        else: assert not any('%' in text for text in labels), labels
        folder = target.parent
        report.ChartObjects(1).Chart.Export(str(folder / f'{metric}-chart.png'))
        print('PASS native:', metric, 'response fields, repeats, independent slicers, chart metrics/gridlines, appended rows and one Refresh All', flush=True)
    finally:
        if book is not None: book.Close(False)
        app.Quit(); pythoncom.CoUninitialize()


def edge_cases(folder):
    import pythoncom
    import win32com.client
    import win32com.client.dynamic
    project, settings = fixture()
    settings.filterFields = []; settings.filters = []; settings.language = 'ar'
    for q in project['form']['questions']:
        if q['id'] == 'group/gender':
            for choice in q['choices']: choice['labels']['ar'] = 'نفس التسمية'
        if q['id'] == 'group/needs':
            for choice in q['choices']: choice['labels']['ar'] = 'خيار'
    project['records'][0]['values']['meta'] = '=1+1'
    for empty in (False, True):
        target = folder / ('empty.xlsx' if empty else 'arabic-single-question.xlsx')
        payload = {**project, 'records': []} if empty else project
        messages = queue.Queue(); excel_worker(payload, None, settings.model_dump(), target, messages, question='group/needs')
        while not messages.empty():
            message = messages.get()
            if 'error' in message: raise AssertionError(message['error'])
        pythoncom.CoInitialize(); app = win32com.client.dynamic.Dispatch(win32com.client.DispatchEx('Excel.Application')._oleobj_)
        app.Visible = False; app.DisplayAlerts = False; book = None
        try:
            book = app.Workbooks.Open(str(target), UpdateLinks=0)
            assert book.SlicerCaches.Count == 0
            data = book.Worksheets('Data').ListObjects(1)
            assert data.ListRows.Count == (0 if empty else 3)
            if not empty:
                headers = [str(c.Value) for c in data.HeaderRowRange]
                assert 'الاحتياجات' in headers and 'العمر' in headers
                cell = data.DataBodyRange.Cells(1, headers.index('Technical metadata')+1)
                assert not cell.HasFormula and str(cell.Value).lstrip("'") == '=1+1'
                support = book.Worksheets('_Kobo multi 001').ListObjects(1)
                captions = {row[6] for row in support.DataBodyRange.Value}
                assert {'خيار [water]', 'خيار [food]', 'خيار [none]'} <= captions, captions
                counts = [row[7] for row in support.DataBodyRange.Value]
                assert sum(counts) == 3
        finally:
            if book is not None: book.Close(False)
            app.Quit(); pythoncom.CoUninitialize()
    print('PASS native: Arabic and duplicate labels; literal text; single-question export with complete Data; no slicers; empty response tables.', flush=True)


def shared_scope_slicers(folder, generate=True):
    """Sharing response caches must not couple different sheets' filter controls."""
    import pythoncom
    import win32com.client
    import win32com.client.dynamic
    project, settings = fixture()
    original = next(q for q in project['form']['questions'] if q['id'] == 'group/gender')
    project['form']['groups'].append({'id': 'other', 'name': 'other', 'parent': '', 'repeat': False, 'labels': {'en': 'Other questions'}})
    project['form']['questions'].append({**copy.deepcopy(original), 'id': 'other/gender', 'group': 'other', 'name': 'other_gender', 'labels': {'en': 'Other gender'}})
    for record in project['records']:
        if not record['scope']: record['values']['other/gender'] = record['values']['group/gender']
    target = folder / 'shared-response-cache.xlsx'; messages = queue.Queue()
    if generate: excel_worker(project, None, settings.model_dump(), target, messages)
    while not messages.empty():
        message = messages.get()
        if 'error' in message: raise AssertionError(message['error'])
    pythoncom.CoInitialize(); app = win32com.client.dynamic.Dispatch(win32com.client.DispatchEx('Excel.Application')._oleobj_)
    app.Visible = False; app.DisplayAlerts = False; book = None
    try:
        book = app.Workbooks.Open(str(target), UpdateLinks=0)
        first = book.Worksheets('Household').PivotTables('KoboPivot001')
        other = book.Worksheets('Other questions').PivotTables('KoboPivot007')
        assert first.CacheIndex == other.CacheIndex
        def control(pivot):
            return next(c for c in book.SlicerCaches if str(c.SourceName) == 'Filter001' and any(p.Name == pivot.Name for p in c.PivotTables))
        left, right = control(first), control(other)
        assert left.Name != right.Name
        for item in left.SlicerItems:
            if item.Name == 'Male': item.Selected = True
        for item in left.SlicerItems:
            if item.Name != 'Male': item.Selected = False
        assert first.GetPivotData('#', first.RowFields.Item(1).Name, 'Male').Value == 1
        assert other.GetPivotData('#', other.RowFields.Item(1).Name, 'Female').Value == 2
        assert any(item.Name == 'Female' and item.Selected for item in right.SlicerItems)
        print('PASS native: ordinary sheets share one response cache and retain independent slicer selections.', flush=True)
    finally:
        if book is not None: book.Close(False)
        app.Quit(); pythoncom.CoUninitialize()


if __name__ == '__main__':
    folder = Path('output/kobo-excel-improvements').resolve(); folder.mkdir(parents=True, exist_ok=True)
    metric = sys.argv[1] if len(sys.argv) > 1 else 'both'
    if metric == 'edges': edge_cases(folder)
    elif metric == 'sheets': shared_scope_slicers(folder)
    else:
        export(folder / f'{metric}.xlsx', metric)
        verify(folder / f'{metric}.xlsx', metric)
