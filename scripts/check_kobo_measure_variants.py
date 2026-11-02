"""Live measured Excel coverage for repeats, multiple answers, trends and heatmaps."""
import copy,queue,sys
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
    for scenario in (sys.argv[1:] or ['native-multiple','binary-multiple','repeat-parent','trend','heatmap','numeric-bins']):
        project=fixture();qid='answer';cfg=QuestionSettings(chart='bar',breakdowns=['region'],calculation=Calculation(operation='median',field='number'))
        if 'multiple' in scenario:
            project['form']['questions'][0]['kind']='multiple'
            for record in project['records']:record['values']['answer']=[record['values']['answer'],'b'] if record['values']['answer']!='b' else ['b']
        if scenario=='repeat-parent':
            q=copy.deepcopy(project['form']['questions'][0]);q.update(id='visits/answer',repeat='visits');project['form']['questions'].append(q)
            project['form']['groups'].append({'id':'visits','name':'visits','labels':{'en':'Visits'},'parent':'','repeat':True})
            for i in range(3):project['records'].append({'id':f'v{i}','scope':'visits','parent':'1','row':i+2,'sheet':1,'values':{'visits/answer':'a' if i<2 else 'b'}})
            qid=q['id'];cfg.breakdowns=[]
        if scenario=='numeric-bins':qid='number';cfg.numericMode='bins';cfg.bins=2
        if scenario=='trend':cfg.chart='line';cfg.trendDateField='date'
        if scenario=='heatmap':cfg.chart='heatmap'
        settings=KoboSettings(hidden=[q['id'] for q in project['form']['questions'] if q['id']!=qid],questions={qid:cfg})
        target=folder/(scenario+'.xlsx');messages=queue.Queue();excel_worker(project,None,settings.model_dump(),target,messages,excel_mode='binary' if scenario.startswith('binary') else 'native')
        while not messages.empty():
            message=messages.get()
            if 'error' in message:raise AssertionError(message['error'])
        pythoncom.CoInitialize();app=create_excel();app.Visible=False;app.DisplayAlerts=False;book=None
        try:
            book=app.Workbooks.Open(str(target),UpdateLinks=0);app.CalculateFull();book.RefreshAll();app.CalculateUntilAsyncQueriesDone();app.CalculateFull()
            expected=analyze(project,settings)['questions'][0]
            report=next(sheet for sheet in book.Worksheets if sheet.Visible==-1 and any(row[0]=='Total' for row in sheet.UsedRange.Value))
            values=report.UsedRange.Value;total_row=next(i for i,row in enumerate(values,report.UsedRange.Row) if row[0]=='Total')
            col=4 if expected['breakdowns'] else 2
            assert abs(report.Cells(total_row,col).Value-expected['measureTotal']['value'])<1e-8,(scenario,report.Cells(total_row,col).Value,expected)
            if scenario=='trend':
                chart=report.ChartObjects(1).Chart
                assert list(chart.SeriesCollection(1).XValues)==expected['trend']['periods']
                actual=list(chart.SeriesCollection(1).Values)
                expected_values=expected['trend']['series'][0]['points']
                assert all((v in ['-',None] or isinstance(v,(int,float)) and v < -2000000000) if p['value'] is None else abs(v-p['value'])<1e-8 for v,p in zip(actual,expected_values)),(actual,expected_values)
            if scenario=='heatmap':assert report.ChartObjects().Count==0
            book.Save();print('PASS',scenario,'live measured values and totals',flush=True)
        finally:
            if book is not None:book.Close(False)
            app.Quit();pythoncom.CoUninitialize()

if __name__=='__main__':run()
