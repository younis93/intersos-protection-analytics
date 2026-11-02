"""Isolated Excel COM checks for slicer isolation, refresh and native drilldown."""
import json,time
from pathlib import Path
import win32com.client
root=Path(__file__).resolve().parents[1];out=root/'output/analysis-features'
excel=win32com.client.DispatchEx('Excel.Application');excel.Visible=False;excel.DisplayAlerts=False
report=[]
def selected(cache,label):
    items=[cache.SlicerItems.Item(i) for i in range(1,cache.SlicerItems.Count+1)]
    target=next(item for item in items if str(item.Name).casefold()==label.casefold());target.Selected=True
    for item in items:
        if str(item.Name).casefold()!=label.casefold():item.Selected=False
    excel.CalculateFull()
def chart_values(chart):return [list(chart.SeriesCollection(i).Values) for i in range(1,chart.SeriesCollection().Count+1)]
try:
    path=out/'controls-kobo-count-native-grand-total.xlsx';book=excel.Workbooks.Open(str(path),UpdateLinks=0,ReadOnly=True)
    try:
        own=next(book.SlicerCaches.Item(i) for i in range(1,book.SlicerCaches.Count+1) if 'q1_' in str(book.SlicerCaches.Item(i).Name))
        page=next(book.SlicerCaches.Item(i) for i in range(1,book.SlicerCaches.Count+1) if 'q1_' not in str(book.SlicerCaches.Item(i).Name))
        connections=lambda cache:{str(cache.PivotTables.Item(i).Name) for i in range(1,cache.PivotTables.Count+1)}
        assert connections(own).isdisjoint(connections(page))
        chart=book.Worksheets('General').ChartObjects(1).Chart;before=chart_values(chart)
        selected(page,'South');assert chart_values(chart)==before
        selected(own,'North');assert chart_values(chart)!=before
        selected(own,'South')
        pivot=book.Worksheets('General').PivotTables('KoboPivot001');count=book.Worksheets.Count
        found=False
        for row in range(1,pivot.DataBodyRange.Rows.Count+1):
            for col in range(1,pivot.DataBodyRange.Columns.Count+1):
                cell=pivot.DataBodyRange.Cells(row,col)
                if cell.Value and str(cell.PivotCell.DataField.Name)=='#':cell.ShowDetail=True;found=True;break
            if found:break
        assert found and book.Worksheets.Count==count+1
        report.append({'check':'count native','independentConnections':sorted(connections(own)),'pageConnections':sorted(connections(page)),'drilldown':True})
        print('PASS independent count slicers and native count drilldown',flush=True)
    finally:book.Close(SaveChanges=False)
    path=out/'controls-kobo-sum-native-grand-total.xlsx';book=excel.Workbooks.Open(str(path),UpdateLinks=0,ReadOnly=True)
    try:
        chart=book.Worksheets('General').ChartObjects(1).Chart
        before=chart_values(chart)
        data=book.Worksheets('Data').ListObjects(1)
        data.ListColumns('Amount').DataBodyRange.Cells(3,1).Value=40
        book.RefreshAll();excel.CalculateUntilAsyncQueriesDone();excel.CalculateFullRebuild()
        values=chart_values(chart)
        assert values!=before
        assert any(any(isinstance(value,(int,float)) and abs(value-2/3)<1e-6 for value in series) for series in values),values
        report.append({'check':'sum refresh','before':before,'after':values})
        print('PASS live Sum Top N formulas after data edit and Refresh All',flush=True)
    finally:book.Close(SaveChanges=False)
finally:excel.Quit()
out.joinpath('live-controls-excel.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
