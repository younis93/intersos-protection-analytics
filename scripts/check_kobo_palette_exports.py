import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.check_kobo_grouped_excel import fixture,export,verify
from backend.kobo import analyze
from backend.kobo_excel import _rgb

if __name__=='__main__':
    project,settings,_=fixture()
    settings.questions['group/needs'].palette='Teal'
    snapshot=analyze(project,settings,'group/needs');target=Path('output/kobo-bulk/palette-native.xlsx').resolve();target.parent.mkdir(parents=True,exist_ok=True)
    export(project,settings,snapshot,target);verify(target,project,settings,snapshot)
    import pythoncom,win32com.client,win32com.client.dynamic
    pythoncom.CoInitialize();excel=win32com.client.dynamic.Dispatch(win32com.client.DispatchEx('Excel.Application')._oleobj_);excel.Visible=False;excel.DisplayAlerts=False;book=None
    try:
        book=excel.Workbooks.Open(str(target));result=snapshot['questions'][0]
        chart=book.Worksheets(2).ChartObjects(1).Chart
        for index in range(1,chart.SeriesCollection().Count+1):
            key=result['breakdowns'][(index-1)//2]['id']
            assert chart.SeriesCollection(index).Format.Fill.ForeColor.RGB==_rgb(result['colors'][key])
        print('PASS: shared palette colors preserved in native editable PivotCharts, with original pivot values and layout.')
    finally:
        if book is not None:book.Close(False)
        excel.Quit();pythoncom.CoUninitialize()
