"""Live measured reports over editable response tables and slicer membership."""
from .file_security import safe_spreadsheet_value
from .kobo_excel_layout import excel_literal
from .kobo_excel_direct import structured_column
from .kobo_excel_ranges import excel_cell, excel_range
from .kobo_excel_slicers import pivot_reference


def measure_formula(values, mask, operation):
    valid = f'({mask})*' + (f'({values}<>"")' if operation=='unique' else f'ISNUMBER({values})')
    function = {'sum':'SUM','average':'AVERAGE','median':'MEDIAN','unique':'ROWS'}[operation]
    filtered = f'_xlfn._xlws.FILTER({values},{valid})'
    if operation=='unique': filtered=f'_xlfn.UNIQUE({filtered})'
    return f'=IFERROR({function}({filtered}),'+('0)' if operation=='unique' else '"-")')


def measured_report(book, report, project, result, position, start, layouts, config, cache, support_sheet):
    measure=result['measure']; operation=measure['operation']
    if book.Application.Evaluate('IFERROR(SUM(FILTER({1,2},{1,0})),-1)') != 1:
        raise ValueError('Live calculation exports require Excel with FILTER and UNIQUE support. Count exports remain available.')
    layout=next(item for item in layouts if item['scope']==result['repeat'])
    table=book.Worksheets(layout['sheet']).ListObjects(layout['table'])
    lookup={item['scope']:item for item in layouts}
    questions={q['id']:q for q in project['form']['questions']}
    helper=support_sheet(book,'_Kobo measure pivots')
    row=helper.UsedRange.Row+helper.UsedRange.Rows.Count+6
    pivot=cache.CreatePivotTable(excel_cell(helper,row,1),f'KoboMeasure{position:03d}')
    pivot.ManualUpdate=True
    field=pivot.PivotFields('Response ID'); field.Orientation=1;field.Subtotals=(False,)*12
    pivot.AddDataField(pivot.PivotFields('[Calc] Response'),'Records',-4157)
    pivot.RowGrand=False;pivot.ColumnGrand=False;pivot.RowAxisLayout(1);pivot.ManualUpdate=False
    reference=pivot_reference(pivot)
    def scalar(qid):
        field=config['fields'][qid]; target=lookup[field['scope']]
        current=layout;key='[@[Response ID]]'
        while current['scope']!=target['scope']:
            parent=lookup[current['parent_scope']]
            key=f'INDEX({current["table"]}[Parent ID],MATCH({key},{current["table"]}[Response ID],0))'
            current=parent
        if target['scope']==layout['scope']:
            return '[@['+structured_column(field['column'])+']]'
        return f'INDEX({target["table"]}[{structured_column(field["column"])}],MATCH({key},{target["table"]}[Response ID],0))'
    def helper_column(name, formula):
        column=table.ListColumns.Add();column.Name=f'[Measure {position}] '+name
        if column.DataBodyRange is not None: column.DataBodyRange.Formula='='+formula
        return table.Name+'['+structured_column(column.Name)+']'
    raw=scalar(measure['field'])
    values=helper_column('value',f'IFERROR(IF(OR(ISBLANK({raw}),{raw}=""),"",{raw}),"")')
    visible=helper_column('visible',f'IFERROR(--(GETPIVOTDATA("Records",{reference},"Response ID",[@[Response ID]])>0),0)')
    answer_raw=scalar(result['id'])
    from .kobo_excel_direct import hidden_answer_formula
    question = next(q for q in config['questions'] if q['id']==result['id'])
    if question.get('hiddenAnswers'):
        allowed=helper_column('allowed',f'--NOT({hidden_answer_formula(question,answer_raw)})')
        visible=f'({visible}*{allowed})'
    answered=helper_column('answered',f'--({answer_raw}<>"")')
    # One source column per dimension keeps high-cardinality answer fields out
    # of Excel's column limit. Cell-specific membership remains an array mask.
    answer_values=helper_column('answer',f'IFERROR(IF(ISBLANK({answer_raw}),"",{answer_raw}),"")')
    series={}
    for answer in result.get('percentageRows',result['rows']):
        if answer['id']=='__blank__': condition=f'({answer_values}="")'
        elif result['kind']=='multiple':condition=f'ISNUMBER(FIND({excel_literal(" "+answer["id"]+" ")}," "&{answer_values}&" "))'
        elif result['kind']=='date':
            fmt={'day':'yyyy-mm-dd','month':'yyyy-mm','year':'yyyy'}[next(q for q in config['questions'] if q['id']==result['id']).get('dateUnit','month')]
            condition=f'(TEXT({answer_values},{excel_literal(fmt)})={excel_literal(answer["id"])})'
        elif answer['id'].startswith('bin:'):
            bucket=next(b for b in result['bins'] if b['id']==answer['id']);op='<=' if bucket==result['bins'][-1] else '<'
            condition=f'(ISNUMBER({answer_values})*({answer_values}>={bucket["min"]})*({answer_values}{op}{bucket["max"]}))'
        else:condition=f'(({answer_values}&"")={excel_literal(answer["id"])})'
        series[answer['id']]=condition
    dimension_values=[]
    for index,field in enumerate(result.get('breakdownFields',[])):
        raw=scalar(field['id'])
        dimension_values.append(helper_column(f'dimension {index+1}',f'IFERROR(IF({raw}="","__blank__",{raw}&""),"__blank__")'))
    columns={}
    for column in result['breakdowns']:
        predicates=[f'({values}={excel_literal(part)})' for values,part in zip(dimension_values,column.get('values',[column['id']]))]
        columns[column['id']]='*'.join(predicates) or '1'
    title=excel_range(report,start,1,start,7);title.Merge();title.Value=safe_spreadsheet_value(result['label']);title.Font.Bold=True;title.Font.Size=14
    excel_cell(report,start+1,1).Value=safe_spreadsheet_value(measure['label']+' · '+measure['unit'])
    excel_cell(report,start+2,1).Value='Live values follow the response slicers. Inspect contributing records in the Data worksheet.'
    if measure.get('parentValuesRepeated'):excel_cell(report,start+3,1).Value='Parent values contribute once per matching repeat entry.'
    if operation=='sum' and result.get('percentageMode','legacy-respondents')!='legacy-respondents':
        from .kobo_excel_sum_report import additive_sum_report
        area,footer,chart=additive_sum_report(book,report,result,position,start,support_sheet,values,visible,series,columns,scalar,helper_column)
        return area,footer,chart,pivot
    heading=start+5
    show_total=result.get('_totalsPolicy',(len(result['rows'])>1,len(result['breakdowns'])>1))
    groups=result['breakdowns'] or [None]
    if result['breakdowns'] and show_total[1]:groups=[*groups,None]
    excel_cell(report,heading,1).Value='Answer'
    decimals=0 if operation=='unique' else measure['decimals']
    number_format='#,##0'+('.'+'0'*decimals if decimals else '')
    for c,column in enumerate(groups,2):
        excel_cell(report,heading,c).Value=safe_spreadsheet_value((column['label']+' - ' if column else 'Total - ' if result['breakdowns'] else '')+measure['label'])
    for offset,answer in enumerate(result['rows'],heading+1):
        excel_cell(report,offset,1).Value=safe_spreadsheet_value(answer['label'])
        for c,column in enumerate(groups,2):
            mask='*'.join([visible,answered,series[answer['id']],*([columns[column['id']]] if column else [])])
            cell=excel_cell(report,offset,c);cell.Formula2=measure_formula(values,mask,operation);cell.NumberFormat=number_format
    quoted="'"+report.Name.replace("'","''")+"'!"
    from openpyxl.utils import get_column_letter
    result['_displayCells']={(answer['id'],column['id'] if column else ''):{'count':f'{quoted}${get_column_letter(ci+2)}${heading+1+ri}'} for ri,answer in enumerate(result['rows']) for ci,column in enumerate(groups)}
    bottom=heading+len(result['rows'])
    if show_total[0]:
        bottom+=1;excel_cell(report,bottom,1).Value='Total'
        for c,column in enumerate(groups,2):
            mask='*'.join([visible,answered,*([columns[column['id']]] if column else [])])
            cell=excel_cell(report,bottom,c);cell.Formula2=measure_formula(values,mask,operation);cell.NumberFormat=number_format
        excel_range(report,bottom,1,bottom,len(groups)+1).Font.Bold=True
    area=excel_range(report,start,1,bottom,len(groups)+1)
    head=excel_range(report,heading,1,heading,len(groups)+1);head.Font.Bold=True;head.Interior.Color=0x704B23;head.Font.Color=0xFFFFFF;head.WrapText=True;head.RowHeight=36
    area.Borders.Color=0xEADACF;area.Font.Name='Arial';report.Columns(1).ColumnWidth=28
    if result['chart']=='heatmap':
        if result.get('chartProjection'):
            from .kobo_excel_chart_projection import measured_heatmap
            area,footer=measured_heatmap(report,result,area,excel_range(report,bottom,1,bottom,len(groups)+1))
            return area,footer,None,pivot
        if result['rows']:
            matrix=excel_range(report,heading+1,2,heading+len(result['rows']),len(groups)+1)
            matrix.FormatConditions.AddColorScale(3)
        return area,excel_range(report,bottom,1,bottom,len(groups)+1),None,pivot
    chart=report.ChartObjects().Add(area.Left+area.Width+30,area.Top,650,max(360,len(result['rows'])*35))
    chart.Name=f'Chart_KoboMeasure{position:03d}'
    plot=chart.Chart;plot.ChartType=57 if result['chart']=='bar' else 4 if result['chart']=='line' else 51
    for c,column in enumerate(groups,2):
        if column is None and result['breakdowns']:continue
        item=plot.SeriesCollection().NewSeries();item.Name=safe_spreadsheet_value(column['label'] if column else measure['label'])
        item.XValues=excel_range(report,heading+1,1,heading+len(result['rows']),1)
        item.Values=excel_range(report,heading+1,c,heading+len(result['rows']),c)
    if result.get('trend'):
        trend=result['trend'];date_raw=scalar(trend['dateField'])
        fmt={'day':'yyyy-mm-dd','month':'yyyy-mm','year':'yyyy'}[trend['unit']]
        dates=helper_column('period',f'IFERROR(IF({date_raw}="","",TEXT({date_raw},{excel_literal(fmt)})),"")')
        chart_sheet=support_sheet(book,'_Kobo measure charts')
        top=chart_sheet.UsedRange.Row+chart_sheet.UsedRange.Rows.Count+3
        from openpyxl.utils import get_column_letter
        quoted="'"+chart_sheet.Name.replace("'","''")+"'!"
        answers=[r for r in result['rows'] if r['id']!='__blank__']
        matrix=[]
        for row,period in enumerate(trend['periods'],top+1):
            excel_cell(chart_sheet,row,1).Value=period;refs=[]
            for index,answer in enumerate(answers,2):
                mask=f'{visible}*{answered}*{series[answer["id"]]}*({dates}={excel_literal(period)})'
                excel_cell(chart_sheet,row,index).Formula2=measure_formula(values,mask,operation)
                refs.append(f'{quoted}${get_column_letter(index)}${row}')
            matrix.append(refs)
        from .kobo_excel_trend_projection import write_trend_series
        write_trend_series(book,plot,result,matrix,['count'],support_sheet)
    plot.HasTitle=True;plot.ChartTitle.Text=result.get('_trendChartTitle',measure['label']);plot.HasLegend=result.get('appearance',{}).get('legend')!='hidden' and (len((result.get('chartProjection') or {}).get('trend',result['trend'])['series'])>1 if result.get('trend') else len(groups)>1)
    if result['chart']=='bar':plot.Axes(1).ReversePlotOrder=True;plot.Axes(1).Crosses=2
    return area,excel_range(report,bottom,1,bottom,len(groups)+1),chart,pivot
