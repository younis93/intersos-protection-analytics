"""Verify live balanced percentages using an isolated Excel application and synthetic data."""
from pathlib import Path
import sys, queue, copy
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.kobo import KoboSettings, QuestionSettings
from backend.kobo_excel import excel_worker

def fixture():
    def question(name, choices, kind='category'):
        return dict(id=name,name=name,labels={'en':name,'ar':'سؤال '+name},type='select_one x',kind=kind,group='',repeat='',metadata=False,identifying=False,choices=[{'name':value,'labels':{'en':value,'ar':'خيار '+value}} for value in choices])
    questions=[question('choice',['c','b','a','zero']),question('region',['north','south']),question('multiple',['x','y'],'multiple')]
    records=[]
    for i in range(6):
        records.append(dict(id=f'r{i}',scope='',parent='',row=i+2,sheet=0,values={'choice':['c','b','a'][i%3],'region':'north' if i<3 else 'south','multiple':['x','y'] if i%2 else ['x']}))
    return dict(id='rounding-check',name='Percentage verification',form={'questions':questions,'groups':[],'warnings':[],'language':'en'},records=records)

def run():
    import pythoncom, win32com.client
    from backend.kobo_percentages import display_percentages
    target=Path('output/kobo-refine/percentages.xlsx').resolve();target.parent.mkdir(exist_ok=True,parents=True)
    decimals=int(sys.argv[1]) if len(sys.argv)>1 else 1
    language=sys.argv[2] if len(sys.argv)>2 else 'en'
    target=target.with_name(f'percentages-{decimals}-{language}.xlsx')
    settings=KoboSettings(language=language,percentageDecimals=decimals,filterFields=['region'],hideZero=False,questions={'choice':QuestionSettings(breakdowns=['region'])})
    messages=queue.Queue();excel_worker(fixture(),None,settings.model_dump(),target,messages,chart_metric='both')
    while not messages.empty():
        message=messages.get();print(message,flush=True)
        if 'error' in message:raise AssertionError(message['error'])
    assert target.exists()
    pythoncom.CoInitialize();app=win32com.client.DispatchEx('Excel.Application');app.Visible=False;app.DisplayAlerts=False
    book=None
    try:
        book=app.Workbooks.Open(str(target),UpdateLinks=0);app.CalculateFull()
        support=book.Worksheets('_Kobo rounding');report=next(sheet for sheet in book.Worksheets if sheet.Name not in {'Pivot data','_Kobo rounding','_Kobo slicer totals','_Kobo chart labels','_Kobo chart pivots'} and sheet.ChartObjects().Count)
        blocks=[]
        for row in range(1,support.UsedRange.Row+support.UsedRange.Rows.Count):
            if support.Cells(row,1).Value=='Answer ID':
                end=row+1
                while support.Cells(end,1).Value is not None:end+=1
                blocks.append((row+1,end-1))
        assert len(blocks)>=4,blocks
        for first,last in blocks:
            entries=[(str(support.Cells(r,1).Value),int(support.Cells(r,2).Value or 0)) for r in range(first,last+1)]
            denominator=int(support.Cells(first,3).Value or 0)
            balance=entries[0][0] not in {'x','y'}
            expected=display_percentages(entries,denominator,decimals,balance)
            for r,(key,count) in zip(range(first,last+1),entries):
                value=support.Cells(r,7).Value
                assert value=='-' if expected[key] is None else abs(float(value)*100-expected[key])<1e-8,(key,value,expected)
        assert book.Worksheets('Pivot data').PivotTables().Count>=3
        assert book.Worksheets('Pivot data').Visible==-1
        # Change a native slicer filter, then clear it. GETPIVOTDATA-based rounding must update.
        for cache in book.SlicerCaches:
            cache.ClearManualFilter()
            items=list(cache.SlicerItems)
            if len(items)>1:
                for item in items[1:]:item.Selected=False
                app.CalculateFull()
                for first,last in blocks:
                    if 'choice' in str(support.Cells(first-2,1).Value):
                        denominator=int(support.Cells(first,3).Value or 0)
                        values=[support.Cells(r,7).Value for r in range(first,last+1)]
                        assert (all(v=='-' for v in values) if not denominator else abs(sum(values)-1)<1e-8),values
                cache.ClearManualFilter();app.CalculateFull()
        # Recalculate after refreshing native pivots too.
        book.RefreshAll();app.CalculateFull()
        for sheet in book.Worksheets:
            for chart in sheet.ChartObjects():
                for series in chart.Chart.SeriesCollection():
                    assert series.HasDataLabels, 'Refresh removed data labels'
                    assert any('_Kobo chart labels' in str(point.DataLabel.Formula) for point in series.Points() if point.HasDataLabel), 'Labels lost formula links'
        for first,last in blocks:
            for r in range(first,last+1):assert support.Cells(r,7).Text not in {'#REF!','#VALUE!','#DIV/0!','#NAME?'}
        report.Activate();report.PageSetup.PrintArea='A1:O52'
        report.ExportAsFixedFormat(0,str(target.with_suffix('.pdf')))
        import subprocess
        subprocess.run(['pdftoppm','-f','1','-singlefile','-scale-to','1600','-png',str(target.with_suffix('.pdf')),str(target.with_suffix(''))],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        print('PASS: cached values, native pivots, chart labels, slicers, empty cohorts, refresh, and screenshot',target,flush=True)
    finally:
        if book is not None:book.Close(False)
        app.Quit();pythoncom.CoUninitialize()
if __name__=='__main__':run()
