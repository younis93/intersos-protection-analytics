"""Project live chart ranges without changing pivot rows or slicer membership."""
from .kobo_excel_ranges import excel_cell,excel_range


def numeric_sum(expressions):
    terms=[f'IFERROR({expression},"")' for expression in expressions]
    if not terms:return '"-"'
    return 'IF(COUNT('+','.join(terms)+')=0,"-",SUM('+','.join(f'N({term})' for term in terms)+'))'


def projected_cell(result,answer,column,metric):
    cells=result['_displayCells']
    if answer!='__chart_other__':return cells[(answer,column)][metric]
    kept={r['id'] for r in result['chartProjection']['rows']}
    omitted=[r['id'] for r in result['rows'] if r['id']!='__blank__' and r['id'] not in kept]
    if metric=='percent' and result.get('percentageMode')=='row-total':
        columns=result.get('_excelBreakdowns',result['breakdowns']) or [{'id':''}]
        raw=result.get('_chartRawCells',cells)
        n=numeric_sum([raw[(answer,column)]['count'] for answer in omitted])
        d=numeric_sum([raw[(answer,c['id'])]['count'] for answer in omitted for c in columns])
        return f'IFERROR(IF({d}=0,"-",{n}/{d}),"-")'
    return numeric_sum([cells[(answer,column)][metric] for answer in omitted])


def measured_heatmap(report,result,area,footer):
    """A separate projected matrix keeps the complete measured pivot untouched."""
    from .kobo_excel_layout import excel_literal
    from .kobo_excel_percentages import percent_format
    columns=result.get('_excelBreakdowns',result['breakdowns'])
    answers=result['chartProjection']['rows']
    first=area.Column+area.Columns.Count+2;top=area.Row
    metric=result.get('appearance',{}).get('metric','count') if result['measure']['operation']=='sum' else 'count'
    excel_cell(report,top,first).Value=f"Heatmap - Top {result['chartProjection']['topNShown']} of {result['chartProjection']['topNTotal']}"
    for index,column in enumerate(columns,first+1):excel_cell(report,top+2,index).Value=column['label']
    for offset,answer in enumerate(answers,top+3):
        excel_cell(report,offset,first).Formula='='+excel_literal(answer['label'])
        for index,column in enumerate(columns,first+1):excel_cell(report,offset,index).Formula2='='+projected_cell(result,answer['id'],column['id'],metric)
    if answers and columns:
        matrix=excel_range(report,top+3,first+1,top+2+len(answers),first+len(columns))
        matrix.FormatConditions.AddColorScale(3)
        matrix.NumberFormat=percent_format(result.get('percentageDecimals',0)) if metric=='percent' else '#,##0'+('.'+'0'*result['measure']['decimals'] if result['measure']['decimals'] else '')
    bottom=max(footer.Row,top+3+len(answers))
    return excel_range(report,area.Row,area.Column,bottom,first+len(columns)),excel_cell(report,bottom,1)


def series_arguments(formula):
    text=formula[formula.index('(')+1:formula.rfind(')')]
    parts=[];start=0;depth=0;quote='';index=0
    while index<len(text):
        char=text[index]
        if quote:
            if char==quote:
                if index+1<len(text) and text[index+1]==quote:index+=1
                else:quote=''
        elif char in "\"'":quote=char
        elif char in '({':depth+=1
        elif char in ')}':depth-=1
        elif char==',' and depth==0:parts.append(text[start:index]);start=index+1
        index+=1
    parts.append(text[start:])
    return parts


def project_excel_chart(book,chart_object,result,support_sheet):
    projection=result.get('chartProjection')
    if chart_object is None or not projection or result.get('_trendProjected'):return
    chart=chart_object.Chart
    helper=support_sheet(book,'_Kobo Top N charts')
    top=helper.UsedRange.Row+helper.UsedRange.Rows.Count+4
    selected=[r for r in projection['rows'] if r['id']!='__chart_other__']
    original=[r for r in result['rows'] if r['id']!='__blank__']
    chosen={r['id'] for r in selected}
    indices={r['id']:i+1 for i,r in enumerate(original)}
    kept=[indices[r['id']] for r in selected if r['id'] in indices]
    omitted=[i+1 for i,r in enumerate(original) if r['id'] not in chosen]
    if result.get('trend'):
        source=list(result['trend']['series']);entries=[]
        metric_count=max(1,chart.SeriesCollection().Count//max(1,len(source)))
        for index in range(1,chart.SeriesCollection().Count+1):
            series=chart.SeriesCollection(index)
            answer=source[(index-1)//metric_count]
            entries.append((series,answer,series_arguments(str(series.Formula)),(index-1)%metric_count))
        extra=[entry for entry in entries if entry[1]['id'] not in chosen]
        if projection['topNOther'] and extra:
            periods=result['trend']['periods']
            omitted_ids={entry[1]['id'] for entry in extra}
            for slot in range(metric_count):
                removed=[entry for entry in extra if entry[3]==slot]
                percent=metric_count>1 and slot==1 or metric_count==1 and result.get('appearance',{}).get('metric')=='percent'
                for index,period in enumerate(periods,top):
                    excel_cell(helper,index,1).Value=period
                    formula=numeric_sum([f'INDEX({args[2]},{index-top+1})' for _,_,args,_ in removed])
                    if percent and result.get('percentageMode')=='row-total':
                        raw=result['_trendRawCells']
                        n=numeric_sum([raw[qid][index-top] for qid in omitted_ids])
                        d=numeric_sum([ref for qid in omitted_ids for ref in raw[qid]])
                        formula=f'IFERROR(IF({d}=0,"-",{n}/{d}),"-")'
                    excel_cell(helper,index,2+slot).Formula2='='+formula
                item=chart.SeriesCollection().NewSeries();item.Name='Other (chart aggregation)'+(' %' if percent else '')
                item.XValues=excel_range(helper,top,1,top+len(periods)-1,1)
                item.Values=excel_range(helper,top,2+slot,top+len(periods)-1,2+slot)
        for series,_,_,_ in reversed(extra):series.Delete()
    else:
        for index in range(1,chart.SeriesCollection().Count+1):
            series=chart.SeriesCollection(index);args=series_arguments(str(series.Formula))
            for offset,answer in enumerate(projection['rows']):
                row=top+offset;excel_cell(helper,row,1).Value=answer['label']
                positions=omitted if answer['id']=='__chart_other__' else [next(i+1 for i,r in enumerate(original) if r['id']==answer['id'])]
                formula=numeric_sum([f'INDEX({args[2]},{position})' for position in positions])
                if answer['id']=='__chart_other__' and result.get('percentageMode')=='row-total' and result.get('appearance',{}).get('metric')=='percent':
                    # Row percentages need a newly computed omitted-row denominator.
                    columns=result.get('_excelBreakdowns',result['breakdowns']) or [{'id':''}]
                    column=columns[min(index-1,len(columns)-1)]['id']
                    raw=result.get('_chartRawCells',result.get('_displayCells',{}))
                    def refs(column_ids):return [raw[(original[p-1]['id'],c)]['count'] for p in omitted for c in column_ids]
                    numerator=refs([column]);denominator=refs([c['id'] for c in columns])
                    formula='IFERROR(SUM('+','.join(numerator)+')/SUM('+','.join(denominator)+'),NA())'
                excel_cell(helper,row,index+1).Formula2='='+formula
            series.XValues=excel_range(helper,top,1,top+len(projection['rows'])-1,1)
            series.Values=excel_range(helper,top,index+1,top+len(projection['rows'])-1,index+1)
            if series.HasDataLabels:
                series.HasDataLabels=False
                if result.get('appearance',{}).get('labels')!='hidden':series.ApplyDataLabels()
    if chart.HasTitle and not projection.get('axisOrder'):chart.ChartTitle.Text=str(chart.ChartTitle.Text)[:180]+f" - Top {projection['topNShown']} of {projection['topNTotal']}"+(' + Other' if projection['topNOther'] else '')
    chart.PlotVisibleOnly=False
