"""Synthetic end-to-end validation of the grouped native Excel workbook."""
from pathlib import Path
import copy
import json
import queue
import sys
import time
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.test_kobo import sample
from backend.kobo import KoboSettings, QuestionSettings, analyze
from backend.kobo_excel import excel_worker, answer_label, source_rows, native_breakdown_columns
from backend.kobo_excel_layout import group_sections, unique_sheet_name, combined_row_count


def fixture(language='en'):
    project = copy.deepcopy(sample.__wrapped__()[0]); project.update(id='grouped-test', name='Community survey')
    project['form']['groups'].extend([
        {'id':'group/details','name':'details','label':'Details','labels':{'en':'Details','ar':'التفاصيل'},'parent':'group','repeat':False},
        {'id':'services','name':'services','label':'Services','labels':{'en':'Services','ar':'الخدمات'},'parent':'','repeat':False},
        {'id':'services/visits','name':'visits','label':'Visits','labels':{'en':'Visits','ar':'الزيارات'},'parent':'services','repeat':True}])
    for question in project['form']['questions']:
        if question['name'] in {'age','day'}: question['group']='group/details'
    def add(qid,kind,group='',repeat='',choices=()):
        project['form']['questions'].append({'id':qid,'name':qid.split('/')[-1],'type':'select_one' if choices else 'integer' if kind=='number' else 'text','kind':kind,'labels':{'en':qid.split('/')[-1].title(),'ar':'سؤال '+qid.split('/')[-1]},'group':group,'repeat':repeat,'metadata':False,'identifying':False,'choices':[{'name':value,'labels':{'en':title,'ar':title}} for value,title in choices]})
    add('services/status','category','services',choices=[('yes','Yes'),('no','No')])
    add('group/location','category','group',choices=[('north','Area'),('south','Area')])
    add('zero','number')
    add('score','number')
    add('services/visits/help','category','services/visits','services/visits',choices=[('yes','Yes'),('no','No')])
    for i,record in enumerate(project['records']):
        record['values'].update({'services/status':'yes' if i!=1 else 'no','group/location':'north' if i!=1 else 'south','zero':0,'score':10+i*10})
    for i in range(2):project['records'].append({'id':f'visit:{i}','parent':f'0:{i}','scope':'services/visits','sheet':1,'row':i+2,'values':{'services/visits/help':'yes' if i==0 else 'no'}})
    settings=KoboSettings(language=language,hideBlanks=False,questions={
        'group/needs':QuestionSettings(breakdowns=['group/gender','group/location','group/respondent_name']),
        'group/age':QuestionSettings(breakdowns=['group/gender'],breakdownDisplay='count',numericMode='values'),
        'services/status':QuestionSettings(breakdowns=['group/gender'],breakdownDisplay='percent'),
        'services/visits/help':QuestionSettings(breakdowns=['group/gender'],breakdownDisplay='both'),
        'group/location':QuestionSettings(chart='donut'),
        'group/day':QuestionSettings(breakdowns=['group/gender','group/location'],chart='line',dateUnit='month'),
        'score':QuestionSettings(numericMode='bins',bins=2,chart='column'),
    })
    return project,settings,analyze(project,settings)


def export(project,settings,snapshot,target,separate_groups=None):
    messages=queue.Queue();excel_worker(project,snapshot,settings.model_dump(),target,messages,separate_groups=separate_groups)
    while not messages.empty():
        message=messages.get()
        if 'error' in message:raise AssertionError(message['error'])
    assert target.exists()


def verify(target,project,settings,snapshot,refresh=False,render=False,separate_groups=None):
    import pythoncom, pywintypes, win32com.client, win32com.client.dynamic
    pythoncom.CoInitialize();excel=win32com.client.dynamic.Dispatch(win32com.client.DispatchEx('Excel.Application')._oleobj_)
    excel.Visible=False;excel.DisplayAlerts=False;excel.EnableEvents=False;excel.AutomationSecurity=3
    def retry(callback):
        deadline=time.monotonic()+30
        while True:
            try:return callback()
            except (pywintypes.com_error,AttributeError):
                if time.monotonic()>deadline:raise
                pythoncom.PumpWaitingMessages();time.sleep(.2)
    book=None
    try:
        book=retry(lambda:excel.Workbooks.Open(str(target)))
        retry(lambda:excel.CalculateUntilAsyncQueriesDone());retry(lambda:excel.CalculateFull())
        sections=group_sections(snapshot,separate_groups);used={'data'};names=['Data']+[unique_sheet_name(section['label'],used) for section in sections]
        expected_by_sheet={name:section for name,section in zip(names[1:],sections)}
        def validate():
            actual=[book.Worksheets(i).Name for i in range(1,book.Worksheets.Count+1)]
            assert actual==names,actual
            assert book.ActiveSheet.Name==names[1]
            data=book.Worksheets('Data');assert data.ListObjects.Count==1
            assert data.ListObjects(1).Name=='KoboData'
            assert data.ListObjects(1).ListRows.Count==combined_row_count(project,snapshot,settings)
            assert sum(book.Worksheets(i).ListObjects.Count for i in range(2,book.Worksheets.Count+1))==0
            pivots={}
            for sheet_name,section in expected_by_sheet.items():
                sheet=book.Worksheets(sheet_name);previous_bottom=0
                for item in section['questions']:
                    result=item['result'];name=f'KoboPivot{item["position"]:03d}'
                    columns=native_breakdown_columns(project,result,settings);dimensions=len(result.get('breakdownFields',[]))
                    allowed={tuple(column['labels']) for column in columns}
                    included=[row for row in source_rows(project,result,settings) if not dimensions or tuple([row[4],*row[6:]]) in allowed]
                    if not included:continue
                    pivot=sheet.PivotTables().Item(name);pivots[result['id']]=pivot
                    assert str(pivot.PivotFields('QuestionId').CurrentPage)==result['id']
                    assert str(pivot.PivotFields('IncludeInPivot').CurrentPage)=='Included'
                    assert pivot.DataBodyRange.Rows.Count==len(result['rows']),(result['id'],pivot.DataBodyRange.Value)
                    mode=result.get('breakdownDisplay','both') if dimensions else 'both'
                    metrics=['count','percent'] if mode=='both' else [mode]
                    assert pivot.DataFields.Count==len(metrics)
                    assert pivot.DataBodyRange.Columns.Count==max(1,len(columns))*len(metrics)
                    for level in range(dimensions):assert pivot.PivotFields(f'Breakdown{level+1}').Orientation==2
                    for answer in result['rows']:
                        if dimensions and answer['id']=='__blank__':continue
                        if dimensions:
                            for column in columns:
                                series=next(value for value in answer['series'] if value['id']==column['id'])
                                args=['Answer',answer_label(result,answer)]
                                for level,caption in enumerate(column['labels'],1):args.extend([f'Breakdown{level}',caption])
                                if 'count' in metrics:assert pivot.GetPivotData('#',*args).Value==series['count'],(result['id'],column)
                                if 'percent' in metrics:assert abs(pivot.GetPivotData('%',*args).Value-series['percent']/100)<1e-9
                        else:
                            args=['Answer',answer_label(result,answer)]
                            assert pivot.GetPivotData('#',*args).Value==answer['count']
                            if answer['percent'] is not None:assert abs(pivot.GetPivotData('%',*args).Value-answer['percent']/100)<1e-9
                            else:assert pivot.GetPivotData('%',*args).Text=='-'
                    footer_row=pivot.TableRange2.Row+pivot.TableRange2.Rows.Count+1
                    assert sheet.Cells(footer_row,1).Value==('الإجمالي' if settings.language=='ar' else 'Total')
                    footer=[sheet.Cells(footer_row,pivot.DataBodyRange.Column+index).Value for index in range(pivot.DataBodyRange.Columns.Count)]
                    denominators=[column['denominator'] for column in columns] if dimensions else [result['denominator']]
                    expected=[number if metric=='count' else 1 if number else None for number in denominators for metric in metrics]
                    assert footer==expected,(result['id'],footer,expected)
                    title=sheet.Cells.Find(What=result['label'],LookAt=1)
                    assert title.Top>=previous_bottom+72 or previous_bottom==0,(sheet_name,result['id'],title.Row,title.Top,previous_bottom)
                    if result['denominator']:
                        chart=sheet.ChartObjects().Item(f'Chart_{name}')
                        assert chart.Chart.PivotLayout.PivotTable.Name==name
                        assert abs(chart.Left-pivot.TableRange2.Left-pivot.TableRange2.Width-24)<1,(settings.language,result['id'],chart.Left,pivot.TableRange2.Left,pivot.TableRange2.Width)
                        previous_bottom=max(chart.Top+chart.Height,sheet.Cells(footer_row,1).Top+sheet.Rows(footer_row).Height)
                    else:previous_bottom=sheet.Cells(footer_row,1).Top+sheet.Rows(footer_row).Height
            assert book.PivotCaches().Count==bool(pivots)
            return pivots
        pivots=retry(validate)
        if render:
            for sheet_name in names:
                sheet=book.Worksheets(sheet_name);sheet.Activate();sheet.PageSetup.Orientation=2;sheet.PageSetup.Zoom=False;sheet.PageSetup.FitToPagesWide=1;sheet.PageSetup.FitToPagesTall=1
                last=min(sheet.UsedRange.Row+sheet.UsedRange.Rows.Count-1,36)
                right=15 if sheet_name=='Data' else 8
                if sheet_name!='Data':
                    bottom=sheet.Cells(last,1).Top
                    for index in range(1,sheet.ChartObjects().Count+1):
                        chart=sheet.ChartObjects().Item(index)
                        if chart.Top<bottom:
                            while sheet.Cells(1,right).Left<chart.Left+chart.Width:right+=1
                            while sheet.Cells(last,1).Top<chart.Top+chart.Height:last+=1
                sheet.PageSetup.PrintArea=sheet.Range(sheet.Cells(1,1),sheet.Cells(last,right)).Address
                sheet.ExportAsFixedFormat(0,str(target.parent/(target.stem+'-'+sheet_name+'.pdf')))
        if refresh:
            data=book.Worksheets('Data');table=data.ListObjects(1);values=list(table.DataBodyRange.Value)
            target_q='group/gender';pivot=pivots[target_q];other=pivots['group/needs']
            before=pivot.GetPivotData('#','Answer','Female').Value
            other_before=other.TableRange1.Value
            row_index=next(i for i,row in enumerate(values) if row[0]==target_q and row[5]=='f' and row[7]==0)
            data.Cells(row_index+2,8).Value=1
            book.RefreshAll();retry(lambda:excel.CalculateUntilAsyncQueriesDone());retry(lambda:excel.CalculateFull())
            assert retry(lambda:pivot.GetPivotData('#','Answer','Female').Value)==before+1
            assert retry(lambda:other.TableRange1.Value)==other_before
            template=[row for row in values if row[0]==target_q and row[4]==values[0][4]]
            for row in template:
                updated=list(row);updated[4]='new-test-respondent';updated[7]=1 if row[5]=='f' else 0;updated[8]=1
                table.ListRows.Add().Range.Value=(tuple(updated),)
            book.RefreshAll();retry(lambda:excel.CalculateUntilAsyncQueriesDone());retry(lambda:excel.CalculateFull())
            assert retry(lambda:pivot.GetPivotData('#','Answer','Female').Value)==before+2
            assert abs(retry(lambda:pivot.GetPivotData('%','Answer','Female').Value)-(before+2)/4)<1e-9
            footer_row=pivot.TableRange2.Row+pivot.TableRange2.Rows.Count+1
            assert retry(lambda:pivot.Parent.Cells(footer_row,2).Value)==4
            assert retry(lambda:other.TableRange1.Value)==other_before
            # Native chart follows an actual pivot layout edit.
            chart=pivot.Parent.ChartObjects().Item(f'Chart_{pivot.Name}').Chart
            pivot.PivotFields('Answer').Orientation=2
            assert chart.PivotLayout.PivotTable.Name==pivot.Name
            pivot.PivotFields('Answer').Orientation=1
            book.Save();book.Close(False);book=None
            book=retry(lambda:excel.Workbooks.Open(str(target)));retry(lambda:excel.CalculateUntilAsyncQueriesDone())
            for name in names[1:]:
                sheet=book.Worksheets(name)
                for index in range(1,sheet.ChartObjects().Count+1):assert sheet.ChartObjects().Item(index).Chart.PivotLayout.PivotTable is not None
        return {'sheets':names,'pivots':len(pivots),'refresh':refresh,'passed':True}
    finally:
        if book is not None:retry(lambda:book.Close(False))
        retry(lambda:excel.Quit());pythoncom.CoUninitialize()


def main():
    root=Path('output/grouped-excel').resolve();root.mkdir(parents=True,exist_ok=True);checks=[]
    for language in (['ar'] if '--arabic-only' in sys.argv else ['en','ar']):
        project,settings,snapshot=fixture(language)
        target=root/f'grouped-{language}.xlsx';export(project,settings,snapshot,target)
        checks.append(verify(target,project,settings,snapshot,refresh=language=='en',render=True))
        print(language,checks[-1],flush=True)
    project,settings,snapshot=fixture()
    single={**snapshot,'questions':[question for question in snapshot['questions'] if question['id']=='group/needs']}
    target=root/'single-question.xlsx';export(project,settings,single,target);checks.append(verify(target,project,settings,single))
    project={**project,'records':[]};empty=analyze(project,settings)
    target=root/'empty.xlsx';export(project,settings,empty,target);checks.append(verify(target,project,settings,empty))
    (root/'verification.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
    print('PASS: grouped sheets, native pivots/charts, all breakdown modes, counts and percentages, totals, shared-data isolation, source edits/appends, Refresh All, chart links, save/reopen, Arabic, single-question and empty exports.')

if __name__=='__main__':main()
