"""Synthetic Excel COM acceptance checks and comparative timing for 0/1 exports."""
import copy
import json
import queue
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.check_kobo_excel_improvements import fixture
from backend.kobo_excel import excel_worker
from backend.kobo_excel_runtime import create_excel


def export(project, settings, target, mode):
    messages=queue.Queue();started=time.perf_counter()
    excel_worker(project,None,settings.model_dump(),target,messages,chart_metric='both',excel_mode=mode)
    while not messages.empty():
        message=messages.get()
        if 'error' in message: raise AssertionError(message['error'])
    return {'seconds':round(time.perf_counter()-started,3),'bytes':target.stat().st_size}


def verify(target):
    import pythoncom
    pythoncom.CoInitialize();app=create_excel();app.Visible=False;app.DisplayAlerts=False;app.EnableEvents=False;book=None
    try:
        book=app.Workbooks.Open(str(target),UpdateLinks=0)
        assert book.Queries.Count==0
        assert not any(str(s.Name).startswith('_Kobo multi') for s in book.Worksheets)
        report=book.Worksheets('Household');first=report.PivotTables('KoboPivot002');second=report.PivotTables('KoboPivot004')
        assert first.EnableDrilldown and str(first.PivotCache().SourceData)=='KoboResponses000'
        assert all(f.Function==-4157 for f in first.DataFields)
        field='[Calc] Q002 breakdown 1'
        def count(answer,group):return first.GetPivotData(answer,field,group).Value
        def percent(answer,group,index):
            cell=first.GetPivotData(answer,field,group)
            return report.Cells(cell.Row,first.TableRange1.Column+first.TableRange1.Columns.Count+1+index).Value
        assert count('Clean water','Female')==1 and percent('Clean water','Female',0)==1
        data=book.Worksheets('Data').ListObjects(1);headers=[str(c.Value) for c in data.HeaderRowRange]
        assert data.ListRows.Count==3 and 'Name of respondent' not in headers
        selection=next(h for h in headers if h.startswith('[Calc] Q002 0/1') and '[water]' in h)
        # Drilldown includes zero-value records in general. The selected option's flag identifies contributors.
        cache=next(c for c in book.SlicerCaches if any(p.Name==first.Name for p in c.PivotTables) and str(c.SourceName)=='Filter001')
        def choose(caption):
            for item in cache.SlicerItems:
                if str(item.Name)==caption:item.Selected=True
            for item in cache.SlicerItems:
                if str(item.Name)!=caption:item.Selected=False
        def details(cell):
            cell.ShowDetail=True;detail=book.ActiveSheet;values=detail.UsedRange.Value
            header=next(i for i,row in enumerate(values) if 'Response ID' in row)
            rows=[dict(zip(values[header],row)) for row in values[header+1:] if any(v is not None for v in row)]
            detail.Delete();return rows
        rows=details(first.GetPivotData('Clean water',field,'Female'))
        assert sum(row[selection]==1 for row in rows)==count('Clean water','Female')
        assert all(row[selection] in (0,1) for row in rows)
        first.DataFields.Item('Food').Position=1;app.CalculateFull()
        assert percent('Food','Female',0)==1
        choose('Male');app.CalculateFull();assert count('None','Male')==1 and percent('None','Male',1)==1
        assert second.GetPivotData('None','[Calc] Q004 breakdown 1','Male').Value==1
        assert first.CacheIndex==second.CacheIndex
        assert {'KoboPivot001','KoboPivot002','KoboPivot004'} <= {str(p.Name) for p in cache.PivotTables}
        assert report.Shapes.Count>=cache.Slicers.Count
        choose('Female')
        data.DataBodyRange.Cells(1,headers.index('Needs')+1).Value='none'
        added=data.ListRows.Add()
        for col in range(1,headers.index('[Calc] Response')+1):added.Range.Cells(1,col).Value=data.ListRows(1).Range.Cells(1,col).Value
        added.Range.Cells(1,headers.index('Response ID')+1).Value='new-response'
        added.Range.Cells(1,headers.index('Needs')+1).Value='food food'
        app.CalculateFull();book.RefreshAll();app.CalculateUntilAsyncQueriesDone();app.CalculateFull()
        assert count('None','Female')==1 and count('Food','Female')==1
        assert percent('Food','Female',0)==.5
        assert list(report.ChartObjects('Chart_KoboPivot002').Chart.SeriesCollection(1).Values)==[0.,1.,1.]
        selected=details(first.GetPivotData('Food',field,'Female'))
        foodfield=next(h for h in headers if h.startswith('[Calc] Q002 0/1') and '[food]' in h)
        assert [row['Response ID'] for row in selected if row[foodfield]==1]==['new-response']
        assert all(any('Double-click counts may include' in str(value) for row in sheet.UsedRange.Value for value in row) for sheet in [report])
        output=target.with_name('binary-refreshed.xlsx');book.SaveAs(str(output),FileFormat=51);book.Close(False);book=None
        book=app.Workbooks.Open(str(output),UpdateLinks=0)
        assert book.Worksheets('Household').PivotTables('KoboPivot002').GetPivotData('Food',field,'Female').Value==1
        return {'shared_sheet_slicers':True,'counts_percentages':True,'refresh_and_added_rows':True,'drilldown_flags':True,'reopen':True,'queries':0}
    finally:
        if book is not None:book.Close(False)
        app.Quit();pythoncom.CoUninitialize()


def verify_variants(folder):
    import pythoncom
    from backend.kobo import QuestionSettings
    cases=[]
    project,settings=fixture()
    settings.questions['group/needs']=QuestionSettings(chart='line',trendDateField='group/day',trendUnit='month')
    cases.append(('trend',project,settings,'group/needs'))
    project,settings=fixture();settings.filters=[]
    settings.questions['group/needs']=QuestionSettings(chart='heatmap',breakdowns=['group/gender','group/location','meta'])
    cases.append(('breakdowns',project,settings,'group/needs'))
    project,settings=fixture()
    q=copy.deepcopy(next(q for q in project['form']['questions'] if q['id']=='group/needs'))
    q.update(id='visits/needs',name='needs',repeat='visits',group='visits')
    for choice in q['choices']:choice['labels']['ar']='\u062e\u064a\u0627\u0631'
    project['form']['questions'].append(q)
    visit=next(r for r in project['records'] if r['scope']=='visits');visit['values'][q['id']]=['water','water','food']
    project['records'].append({**copy.deepcopy(visit),'id':'visit2','values':{}})
    settings.language='ar';settings.hideBlanks=False;settings.questions[q['id']]=QuestionSettings(breakdowns=['group/gender'])
    cases.append(('repeat-arabic',project,settings,q['id']))
    project,settings=fixture();project['records']=[];settings.hideEmpty=False;settings.filters=[]
    cases.append(('empty',project,settings,'group/needs'))
    project,settings=fixture()
    for r in project['records']:
        if not r['scope']:r['values']['group/needs']=None
    settings.hideBlanks=False
    cases.append(('missing',project,settings,'group/needs'))
    project,settings=fixture()
    q=next(q for q in project['form']['questions'] if q['id']=='group/needs');q['choices']=q['choices'][:1]
    for r in project['records']:
        if not r['scope']:r['values']['group/needs']=['water']
    settings.questions['group/needs']=QuestionSettings()
    cases.append(('single',project,settings,'group/needs'))
    project,settings=fixture();settings.filters=[];settings.questions['group/needs']=QuestionSettings()
    cases.append(('percent',project,settings,'group/needs'))
    checked=[]
    for name,project,settings,qid in cases:
        messages=queue.Queue();target=folder/(name+'.xlsx')
        excel_worker(project,None,settings.model_dump(),target,messages,question=qid,excel_mode='binary',chart_metric='percent' if name=='percent' else 'both')
        while not messages.empty():
            item=messages.get()
            if 'error' in item:raise AssertionError((name,item['error']))
        pythoncom.CoInitialize();app=create_excel();app.Visible=False;app.DisplayAlerts=False;book=None
        try:
            book=app.Workbooks.Open(str(target),UpdateLinks=0)
            assert book.Queries.Count==0
            if name=='empty':
                assert sum(s.PivotTables().Count for s in book.Worksheets)==0
            else:
                report=next(s for s in book.Worksheets if s.Visible==-1 and s.PivotTables().Count)
                pivot=report.PivotTables(1)
                for sheet in book.Worksheets:
                    values=sheet.UsedRange.Value
                    assert not any(v in {'#REF!','#DIV/0!','#VALUE!','#NAME?'} for row in values for v in row if isinstance(v,str)),(name,sheet.Name)
                if name=='trend':
                    table=book.Worksheets('_Kobo trend pivots')
                    assert table.PivotTables().Count==2
                    assert sum(s.ChartObjects().Count for s in book.Worksheets)>=1
                    assert report.ChartObjects(1).Chart.SeriesCollection(1).Values[0]==1
                elif name=='repeat-arabic':
                    food=next(str(f.Name) for f in pivot.DataFields if '[food]' in str(f.Name))
                    cell=pivot.GetPivotData(food,'[Calc] Q001 breakdown 1','\u0623\u0646\u062b\u0649')
                    assert cell.Value==1
                    cell.ShowDetail=True;detail=book.ActiveSheet;values=detail.UsedRange.Value
                    assert 'Parent ID' in values[0]
                    assert any('[food]' in str(h) and '0/1' in str(h) for h in values[0])
                    detail.Delete()
                elif name=='missing':
                    blank=pivot.GetPivotData('Blank / unanswered','[Calc] Q001 breakdown 1','Female')
                    assert blank.Value==2
                    percentcol=pivot.TableRange1.Column+pivot.TableRange1.Columns.Count+1
                    assert report.Cells(blank.Row,percentcol).Value=='-'
                elif name=='single':
                    assert pivot.GetPivotData('#','[Calc] Q001 answer','Clean water').Value==2
                    assert report.ChartObjects(1).Chart.SeriesCollection(1).Values[0]==2
                elif name=='percent':
                    assert list(report.ChartObjects(1).Chart.SeriesCollection(1).Values)==[.5,.5,.5]
                elif name=='breakdowns':
                    assert pivot.ColumnFields.Count==3
                    assert pivot.GetPivotData('Clean water','[Calc] Q001 breakdown 1','Female','[Calc] Q001 breakdown 2','North','[Calc] Q001 breakdown 3','metadata').Value==1
            checked.append(name)
        finally:
            if book is not None:book.Close(False)
            app.Quit();pythoncom.CoUninitialize()
    return checked


def verify_shared_scopes(folder):
    import pythoncom
    project,settings=fixture()
    visits=next(g for g in project['form']['groups'] if g['id']=='visits');visits['parent']='group'
    project['form']['groups'].append({'id':'other','name':'other','labels':{'en':'Other analysis'},'parent':'','repeat':False})
    template=next(q for q in project['form']['questions'] if q['id']=='group/needs')
    for qid,group,repeat in [('visits/needs','visits','visits'),('other/needs','other','')]:
        q=copy.deepcopy(template);q.update(id=qid,name=qid.split('/')[0]+'_needs',group=group,repeat=repeat)
        project['form']['questions'].append(q)
        for record in project['records']:
            if record['scope']==repeat:record['values'][qid]=['food'] if repeat else record['values'].get('group/needs')
    target=folder/'shared-scopes.xlsx';messages=queue.Queue()
    excel_worker(project,None,settings.model_dump(),target,messages,excel_mode='binary',separate_groups=['group','other'])
    while not messages.empty():
        message=messages.get()
        if 'error' in message:raise AssertionError(message['error'])
    pythoncom.CoInitialize();app=create_excel();app.Visible=False;app.DisplayAlerts=False;book=None
    try:
        book=app.Workbooks.Open(str(target),UpdateLinks=0)
        first=book.Worksheets('Household');second=book.Worksheets('Other analysis')
        main=next(p for p in first.PivotTables() if str(p.PivotCache().SourceData)=='KoboResponses000' and any(str(f.Name)=='Food' for f in p.DataFields))
        repeat=next(p for p in first.PivotTables() if str(p.PivotCache().SourceData)=='KoboResponses001' and any(str(f.Name)=='Food' for f in p.DataFields))
        other=second.PivotTables(1)
        def control(pivot):return next(c for c in book.SlicerCaches if str(c.SourceName)=='Filter001' and any(p.Name==pivot.Name for p in c.PivotTables))
        main_control,repeat_control,other_control=map(control,[main,repeat,other])
        assert len({main_control.Name,repeat_control.Name,other_control.Name})==3
        assert main.CacheIndex!=other.CacheIndex and main.CacheIndex!=repeat.CacheIndex
        for cache in (main_control,repeat_control):
            for pivot in cache.PivotTables:
                if pivot.Parent.Visible==-1:assert str(pivot.Parent.Name)=='Household'
        for cache in book.SlicerCaches:
            for slicer in cache.Slicers:
                if str(slicer.Shape.Parent.Name)=='Household':
                    assert slicer.Top+slicer.Height < min(p.TableRange1.Top for p in first.PivotTables())
        slicers=[s for cache in book.SlicerCaches for s in cache.Slicers]
        assert sum(str(s.Shape.Parent.Name)=='Household' for s in slicers)==4
        assert sum(str(s.Shape.Parent.Name)=='Other analysis' for s in slicers)==2
        for item in main_control.SlicerItems:
            if str(item.Name)=='Male':item.Selected=True
        for item in main_control.SlicerItems:
            if str(item.Name)!='Male':item.Selected=False
        app.CalculateFull()
        assert main.GetPivotData('None','[Calc] Q002 breakdown 1','Male').Value==1
        assert other.GetPivotData('Clean water').Value==1
        assert repeat.GetPivotData('Food').Value==1
        assert str(repeat_control.Slicers.Item(1).Caption).startswith('Visits - ')
        return {'shared_main_controls':True,'separate_repeat_controls':True,'independent_analysis_sheets':True,'controls_above_pivots':True}
    finally:
        if book is not None:book.Close(False)
        app.Quit();pythoncom.CoUninitialize()


if __name__=='__main__':
    folder=Path('output/kobo-binary').resolve();folder.mkdir(parents=True,exist_ok=True)
    project,settings=fixture()
    result={'binary':export(project,settings,folder/'binary.xlsx','binary')}
    result['checks']=verify(folder/'binary.xlsx')
    result['variants']=verify_variants(folder)
    result['shared_scopes']=verify_shared_scopes(folder)
    result['native']=export(project,settings,folder/'native.xlsx','native')
    (folder/'acceptance.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result))
