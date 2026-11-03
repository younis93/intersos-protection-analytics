"""Verify native Excel parent bases using synthetic records only."""
import sys
import time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))


if __name__=='__main__':
    from backend.test_kobo_connections import project
    from backend.kobo import KoboSettings,QuestionSettings,analyze
    from backend.kobo_excel import ExportJobs
    from openpyxl import load_workbook
    folder=Path(__file__).resolve().parents[1]/'output/conditional-questions'
    folder=folder/f'live-{time.time_ns()}'
    folder.mkdir(parents=True,exist_ok=True)
    import pythoncom
    pythoncom.CoInitialize()
    jobs=ExportJobs()
    try:
        for kind,mode in [('category','native'),('multiple','binary'),('multiple','native')]:
            p=project();p['form']['questions'][1]['kind']=kind
            if kind=='multiple':
                for record in p['records']:
                    value=record['values']['follow'];record['values']['follow']=[value] if value else None
            settings=KoboSettings(questions={'follow':QuestionSettings(percentageBase='parent',percentageParent='main',chart='bar')})
            job=jobs.start(p,analyze(p,settings),settings,question='follow',chart_metric='percent',excel_mode=mode)
            started=time.monotonic();last=''
            while job['state'] not in {'complete','error','cancelled'}:
                if job.get('stage')!=last:print(kind,mode,job['state'],job.get('stage'),flush=True);last=job.get('stage')
                if time.monotonic()-started>180:raise TimeoutError(job)
                time.sleep(.5);job=jobs.status(job['id'])
            assert job['state']=='complete',job
            jobs.jobs[job['id']]['thread'].join(timeout=20)
            path=folder/f'parent-base-{kind}-{mode}.xlsx';path.write_bytes(jobs.download(job['id']))
            book=load_workbook(path,data_only=True)
            errors=[(ws.title,c.coordinate,c.value) for ws in book for row in ws for c in row if c.data_type=='e']
            assert not errors,errors[:10]
            report=next(ws for ws in book if not ws.title.startswith('_') and not ws.title.startswith('Data'))
            rows={row[0].value:row for row in report if row[0].value in {'a','b'}}
            assert rows['a'][1].value==3,[(c.coordinate,c.value) for c in rows['a'][:4]]
            assert rows['b'][1].value==2
            assert abs(rows['a'][2].value-.03)<.000001,[c.value for c in rows['a'][:4]]
            assert abs(rows['b'][2].value-.02)<.000001
            totals=[row for row in report if row[0].value=='Total']
            assert totals and totals[0][1].value==5 and abs(totals[0][2].value-.05)<.000001,[c.value for c in totals[0][:4]]
            print('PASS live Excel parent base:',kind,mode,flush=True)
            import pythoncom
            from backend.kobo_excel_runtime import create_excel
            excel=None;workbook=None
            try:
                print('Refreshing workbook:',kind,mode,flush=True)
                excel=create_excel();excel.Visible=False;excel.DisplayAlerts=False
                workbook=excel.Workbooks.Open(str(path.resolve()),UpdateLinks=0)
                data=next(workbook.Worksheets(i) for i in range(1,workbook.Worksheets.Count+1) if str(workbook.Worksheets(i).Name).startswith('Data'))
                table=data.ListObjects(1)
                parent_values=table.ListColumns('main').DataBodyRange
                data.Range(parent_values.Cells(51,1),parent_values.Cells(100,1)).ClearContents()
                excel.CalculateFull();workbook.RefreshAll();excel.CalculateUntilAsyncQueriesDone()
                for i in range(1,workbook.PivotCaches().Count+1):workbook.PivotCaches()(i).Refresh()
                excel.CalculateFull();workbook.Save();workbook.Close(False);workbook=None
            finally:
                if workbook is not None:workbook.Close(False)
                if excel is not None:excel.Quit()
                parent_values=None;table=None;data=None;excel=None
            refreshed=load_workbook(path,data_only=True)
            report=next(ws for ws in refreshed if not ws.title.startswith('_') and not ws.title.startswith('Data'))
            rows={row[0].value:row for row in report if row[0].value in {'a','b'}}
            assert abs(rows['a'][2].value-.06)<.000001,[c.value for c in rows['a'][:4]]
            assert abs(rows['b'][2].value-.04)<.000001
            print('PASS live Excel refresh changes parent base from 100 to 50:',kind,mode,flush=True)
    finally:
        jobs.close()
        pythoncom.CoUninitialize()
