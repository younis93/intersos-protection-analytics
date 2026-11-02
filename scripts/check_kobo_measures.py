"""Synthetic live Excel measure acceptance check."""
import queue
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.test_kobo_answer_order import fixture
from backend.kobo import KoboSettings,QuestionSettings,analyze
from backend.kobo_measures import Calculation
from backend.kobo_excel import excel_worker
from backend.kobo_excel_runtime import create_excel


def run():
    import pythoncom
    folder=Path('output/pivot-measures').resolve();folder.mkdir(parents=True,exist_ok=True)
    for operation in ['sum','average','median','unique']:
        project=fixture();settings=KoboSettings(hidden=['region','date','number'],filterFields=['region'],questions={'answer':QuestionSettings(chart='bar',breakdowns=['region'],calculation=Calculation(operation=operation,field='number'))})
        target=folder/f'{operation}.xlsx';messages=queue.Queue()
        excel_worker(project,None,settings.model_dump(),target,messages)
        while not messages.empty():
            event=messages.get()
            if 'error' in event:raise AssertionError(event['error'])
        pythoncom.CoInitialize();app=create_excel();app.Visible=False;app.DisplayAlerts=False;book=None
        try:
            book=app.Workbooks.Open(str(target),UpdateLinks=0);app.CalculateFull();book.RefreshAll();app.CalculateUntilAsyncQueriesDone();app.CalculateFull()
            report=book.Worksheets('General')
            def verify(expected):
                used=report.UsedRange.Value
                for answer in expected['rows']:
                    row=next(i for i,values in enumerate(used,report.UsedRange.Row) if values[0]==answer['label'])
                    actual=report.Cells(row,4).Value
                    assert isinstance(actual,(int,float)) and abs(actual-answer['value'])<1e-8,(operation,answer,actual,report.Cells(row,4).Formula2)
                row=next(i for i,values in enumerate(used,report.UsedRange.Row) if values[0]=='Total')
                actual=report.Cells(row,4).Value
                assert abs(actual-expected['measureTotal']['value'])<1e-8,(operation,actual,expected)
            verify(analyze(project,settings)['questions'][0])
            cache=next(iter(book.SlicerCaches))
            for item in cache.SlicerItems:
                if str(item.Name)=='north':item.Selected=True
            for item in cache.SlicerItems:
                if str(item.Name)!='north':item.Selected=False
            app.CalculateFull()
            selected=settings.model_copy(update={'filters':[__import__('backend.kobo',fromlist=['KoboFilter']).KoboFilter(field='region',values=['north'])]})
            verify(analyze(project,selected)['questions'][0])
            cache.ClearManualFilter();app.CalculateFull()
            data=book.Worksheets('Data').ListObjects(1)
            # Source columns are found by label, independent of helper positions.
            headers=[str(cell.Value) for cell in data.HeaderRowRange]
            data.DataBodyRange.Cells(1,headers.index('number')+1).Value=20
            project['records'][0]['values']['number']=20
            app.CalculateFull();book.RefreshAll();app.CalculateFull();verify(analyze(project,settings)['questions'][0])
            book.Save();print('PASS',operation,'live totals, slicers, source edits and refresh',flush=True)
        finally:
            if book is not None:book.Close(False)
            app.Quit();pythoncom.CoUninitialize()

if __name__=='__main__':run()
