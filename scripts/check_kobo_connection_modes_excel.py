"""Real Excel checks for manual eligibility, hidden answers and original bases."""
import sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

if __name__=='__main__':
    import pythoncom
    from openpyxl import load_workbook
    from backend.test_kobo_connection_modes import example,group,leaf
    from backend.kobo import KoboSettings,QuestionSettings,analyze
    from backend.kobo_excel import ExportJobs
    from backend.kobo_excel_runtime import create_excel
    folder=Path(__file__).resolve().parents[1]/'output/conditional-correction'/f'live-{time.time_ns()}'
    folder.mkdir(parents=True,exist_ok=True);jobs=ExportJobs();pythoncom.CoInitialize()
    try:
        for kind,excel_mode,mode in [('category','native','keep-original'),('multiple','binary','keep-original'),('multiple','native','keep-original'),('category','native','adjust')]:
            p=example();p['form']['questions'][1].update(kind=kind,relevant='')
            if kind=='multiple':
                for record in p['records']:
                    value=record['values']['follow'];record['values']['follow']=[value] if value else None
            rules=group(group(leaf('main','other'),leaf('main','other'),match='any'),leaf('region','north'))
            cfg=KoboSettings(questions={'follow':QuestionSettings(connectionSource='manual',connectionRules=rules,connectedPercentageMode=mode,percentageParent='main',hiddenAnswers=['a'],chart='bar')})
            job=jobs.start(p,analyze(p,cfg),cfg,question='follow',chart_metric='percent',excel_mode=excel_mode);started=time.monotonic()
            while job['state'] not in {'complete','error','cancelled'}:
                if time.monotonic()-started>180:raise TimeoutError(job)
                time.sleep(.4);job=jobs.status(job['id'])
            assert job['state']=='complete',job
            jobs.jobs[job['id']]['thread'].join(timeout=20)
            path=folder/f'{kind}-{excel_mode}-{mode}.xlsx';path.write_bytes(jobs.download(job['id']))
            def check(expected):
                book=load_workbook(path,data_only=True)
                errors=[(ws.title,c.coordinate,c.value) for ws in book for row in ws for c in row if c.data_type=='e'];assert not errors,errors[:10]
                report=next(ws for ws in book if not ws.title.startswith('_') and not ws.title.startswith('Data'))
                rows=[row for row in report if row[0].value=='b'];assert rows,[ws.title for ws in book]
                assert rows[0][1].value==4,[c.value for c in rows[0][:4]]
                assert abs(rows[0][2].value-expected)<.000001,[c.value for c in rows[0][:4]]
                assert not any(row[0].value=='a' for row in report)
            check(.04 if mode=='keep-original' else 1)
            excel=None;workbook=None
            try:
                excel=create_excel();excel.Visible=False;excel.DisplayAlerts=False
                workbook=excel.Workbooks.Open(str(path.resolve()),UpdateLinks=0)
                data=next(workbook.Worksheets(i) for i in range(1,workbook.Worksheets.Count+1) if str(workbook.Worksheets(i).Name).startswith('Data'))
                table=data.ListObjects(1);parent=table.ListColumns('main').DataBodyRange
                data.Range(parent.Cells(51,1),parent.Cells(100,1)).ClearContents()
                excel.CalculateFull();workbook.RefreshAll();excel.CalculateUntilAsyncQueriesDone()
                for i in range(1,workbook.PivotCaches().Count+1):workbook.PivotCaches()(i).Refresh()
                excel.CalculateFull();workbook.Save();workbook.Close(False);workbook=None
            finally:
                if workbook is not None:workbook.Close(False)
                if excel is not None:excel.Quit()
                parent=None;table=None;data=None;excel=None
            check(.08 if mode=='keep-original' else 1)
            print('PASS manual AND/OR, hidden answers and live refresh:',kind,excel_mode,mode,flush=True)
    finally:
        jobs.close();pythoncom.CoUninitialize()
