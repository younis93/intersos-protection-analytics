"""Exercise actual Excel slicers, editable values, refresh and native count drilldown."""
from pathlib import Path
import pythoncom
import win32com.client
root=Path(__file__).resolve().parents[1]
pythoncom.CoInitialize();excel=win32com.client.DispatchEx('Excel.Application');excel.Visible=False;excel.DisplayAlerts=False
try:
    for calculation in ['count','sum']:
        path=root/'output/data-editing'/f'kobo-{calculation}-grand-total-native.xlsx'
        book=excel.Workbooks.Open(str(path),UpdateLinks=0)
        try:
            sheet=book.Worksheets('General');cache=book.SlicerCaches(1)
            items=[cache.SlicerItems.Item(i) for i in range(1,cache.SlicerItems.Count+1)]
            for item in items:
                if str(item.Name)=='North':item.Selected=True
            for item in items:
                if str(item.Name)!='North':item.Selected=False
            excel.CalculateFull()
            total=next(r for r in range(1,sheet.UsedRange.Row+sheet.UsedRange.Rows.Count+1) if sheet.Cells(r,1).Value=='Total')
            assert sheet.Cells(total,6).Value==(1 if calculation=='count' else book.Worksheets('Data').Cells(2,6).Value),(calculation,sheet.Cells(total,6).Value)
            assert sheet.Cells(total,7).Value==1
            if calculation=='sum':
                book.Worksheets('Data').Cells(2,6).Value=40;excel.CalculateFull();assert sheet.Cells(total,6).Value==40
                book.RefreshAll();excel.CalculateUntilAsyncQueriesDone();excel.CalculateFull();assert sheet.Cells(total,6).Value==40
            else:
                pivot=sheet.PivotTables('KoboPivot001');before=book.Worksheets.Count
                target=next(pivot.DataBodyRange.Cells(r,c) for r in range(1,pivot.DataBodyRange.Rows.Count+1) for c in range(1,pivot.DataBodyRange.Columns.Count+1) if pivot.DataBodyRange.Cells(r,c).Value==1 and str(pivot.DataBodyRange.Cells(r,c).PivotCell.DataField.Name)=='#')
                target.ShowDetail=True;assert book.Worksheets.Count==before+1
            print('PASS',calculation,'live slicer, recalculated totals,', 'native count drilldown' if calculation=='count' else 'editable numeric source and Refresh All',flush=True)
        finally:book.Close(False)
finally:excel.Quit();pythoncom.CoUninitialize()
