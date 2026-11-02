"""Formula-backed additive Sum reports with live slicer-aware percentage bases."""
from openpyxl.utils import get_column_letter
from .kobo_excel_measures import measure_formula
from .kobo_excel_ranges import excel_cell,excel_range
from .kobo_excel_percentages import percent_format
from .file_security import safe_spreadsheet_value


def live_sum(refs):
    args=','.join(refs) or '0'
    return f'IF(COUNT({args})=0,"-",SUM({args}))'
def live_ratio(numerator,denominator):return f'IFERROR(IF({denominator}=0,"-",{numerator}/{denominator}),"-")'


def additive_sum_report(book,report,result,position,start,support_sheet,values,visible,series,columns,scalar,helper_column):
    measure=result['measure'];rows=result['rows'];base_columns=result['breakdowns'] or [None]
    policy=result.get('_totalsPolicy',(len(rows)>1,len(result['breakdowns'])>1));groups=[*base_columns,*([None] if result['breakdowns'] and policy[1] else [])]
    metrics=['count','percent'] if result.get('breakdownDisplay','both')=='both' else [result.get('breakdownDisplay','both')]
    helper=support_sheet(book,'_Kobo sum values');first=helper.UsedRange.Row+helper.UsedRange.Rows.Count+4
    quoted="'"+helper.Name.replace("'","''")+"'!"
    def reference(r,c):return f'{quoted}${get_column_letter(c)}${r}'
    basis_rows=result.get('percentageRows',rows)
    basis_indices={answer['id']:i for i,answer in enumerate(basis_rows)}
    matrix=[]
    for ri,answer in enumerate(basis_rows,first):
        refs=[]
        for ci,column in enumerate(base_columns,1):
            mask='*'.join([visible,series[answer['id']],*([columns[column['id']]] if column else [])])
            excel_cell(helper,ri,ci).Formula2=measure_formula(values,mask,'sum');refs.append(reference(ri,ci))
        matrix.append(refs)
    result['_chartRawCells']={(answer['id'],column['id'] if column else ''):{'count':matrix[basis_indices[answer['id']]][ci]} for ri,answer in enumerate(rows) for ci,column in enumerate(base_columns)}
    column_totals=[live_sum([r[ci] for r in matrix]) for ci in range(len(base_columns))]
    row_totals=[live_sum(r) for r in matrix];grand=live_sum([cell for r in matrix for cell in r])
    mode=result['percentageMode'];decimals=measure['decimals'];heading=start+5
    nf='#,##0'+('.'+'0'*decimals if decimals else '')
    excel_cell(report,heading,1).Value='Answer'
    def formula(ri,ci,total_row=False):
        if total_row:
            n=column_totals[ci] if ci<len(base_columns) else grand
            d=n if mode=='column-total' else grand
        else:
            ri=basis_indices[rows[ri]['id']]
            n=matrix[ri][ci] if ci<len(base_columns) else row_totals[ri]
            d=grand if mode=='grand-total' else (column_totals[ci] if ci<len(base_columns) else grand) if mode=='column-total' else row_totals[ri]
        if mode=='breakdown-group':
            level=result.get('percentageGroupLevel',1)
            key=(base_columns[ci].get('values') or [base_columns[ci]['id']])[:level] if ci<len(base_columns) and base_columns[ci] else None
            d=live_sum([cell for row in matrix for i,cell in enumerate(row) if key is None or base_columns[i] and (base_columns[i].get('values') or [base_columns[i]['id']])[:level]==key])
        return n,live_ratio(n,d)
    for ci,column in enumerate(groups):
        for mi,metric in enumerate(metrics):excel_cell(report,heading,2+ci*len(metrics)+mi).Value=safe_spreadsheet_value((column['label']+' - ' if column else 'Total - ' if result['breakdowns'] else '')+(measure['label'] if metric=='count' else '%'))
    for ri,answer in enumerate(rows):
        excel_cell(report,heading+1+ri,1).Value=safe_spreadsheet_value(answer['label'])
        for ci,column in enumerate(groups):
            raw,percent=formula(ri,ci)
            for mi,metric in enumerate(metrics):
                target=excel_cell(report,heading+1+ri,2+ci*len(metrics)+mi);target.Formula2='='+(raw if metric=='count' else percent);target.NumberFormat=nf if metric=='count' else percent_format(result.get('percentageDecimals',0))
    bottom=heading+len(rows)
    if policy[0]:
        bottom+=1;excel_cell(report,bottom,1).Value='Total'
        for ci,column in enumerate(groups):
            raw,percent=formula(0,ci,True)
            for mi,metric in enumerate(metrics):
                target=excel_cell(report,bottom,2+ci*len(metrics)+mi);target.Formula2='='+(raw if metric=='count' else percent);target.NumberFormat=nf if metric=='count' else percent_format(result.get('percentageDecimals',0))
    width=1+len(groups)*len(metrics);area=excel_range(report,start,1,bottom,width);head=excel_range(report,heading,1,heading,width)
    head.Font.Bold=True;head.Interior.Color=0x704B23;head.Font.Color=0xFFFFFF;head.WrapText=True;head.RowHeight=36
    area.Borders.Color=0xEADACF;area.Font.Name='Arial';report.Columns(1).ColumnWidth=28
    footer=excel_range(report,bottom,1,bottom,width)
    if policy[0]:footer.Font.Bold=True;footer.Interior.Color=0xEBDFD2
    excel_cell(report,start+2,1).Value='Live values follow slicers. Formula-backed values: inspect contributing records in the Data worksheet.'
    excel_cell(report,start+3,1).Value=result['percentageBasis']
    result['_displayCells']={(answer['id'],column['id'] if column else ''):{'count':formula(ri,ci)[0],'percent':formula(ri,ci)[1]} for ri,answer in enumerate(rows) for ci,column in enumerate(base_columns)}
    if result['chart']=='heatmap':
        if result.get('chartProjection'):
            from .kobo_excel_chart_projection import measured_heatmap
            area,footer=measured_heatmap(report,result,area,footer)
            return area,footer,None
        if rows:excel_range(report,heading+1,2,heading+len(rows),width).FormatConditions.AddColorScale(3)
        return area,footer,None
    chart=report.ChartObjects().Add(area.Left+area.Width+30,area.Top,650,max(360,len(rows)*35));chart.Name=f'Chart_KoboMeasure{position:03d}';plot=chart.Chart
    plot.ChartType=57 if result['chart']=='bar' else 4 if result['chart']=='line' else 51
    percent_mode=result.get('appearance',{}).get('metric')=='percent'
    for ci,column in enumerate(base_columns):
        chart_col=len(base_columns)+3+ci
        for ri,answer in enumerate(rows,first):excel_cell(helper,ri,chart_col).Formula2='='+formula(ri-first,ci)[1 if percent_mode else 0]
        item=plot.SeriesCollection().NewSeries();item.Name=safe_spreadsheet_value(column['label'] if column else measure['label']);item.XValues=excel_range(report,heading+1,1,heading+len(rows),1);item.Values=excel_range(helper,first,chart_col,first+len(rows)-1,chart_col)
        labels_mode=result.get('appearance',{}).get('labels','auto')
        if labels_mode!='hidden':
            item.ApplyDataLabels()
            label_col=2*len(base_columns)+5+ci
            for ri,answer in enumerate(rows,first):
                raw,percent=formula(ri-first,ci)
                label=f'TEXT({percent},"{percent_format(result.get("percentageDecimals",0))}")' if percent_mode else f'TEXT({raw},"{nf}")'
                if labels_mode=='both':label=f'TEXT({raw},"{nf}")&" ("&TEXT({percent},"{percent_format(result.get("percentageDecimals",0))}")&")"'
                excel_cell(helper,ri,label_col).Formula2='=IFERROR('+label+',"-")'
                present=next((cell.get('value') for cell in answer.get('series',[]) if cell['id']==column['id']),None) if column else answer.get('value')
                if present is not None:
                    point=item.Points(ri-first+1);point.HasDataLabel=True;point.DataLabel.Formula='='+reference(ri,label_col)

    if result.get('trend'):
        from .kobo_excel_layout import excel_literal
        trend=result['trend'];date_raw=scalar(trend['dateField']);fmt={'day':'yyyy-mm-dd','month':'yyyy-mm','year':'yyyy'}[trend['unit']]
        dates=helper_column('period',f'IFERROR(IF({date_raw}="","",TEXT({date_raw},{excel_literal(fmt)})),"")')
        answers=[r for r in basis_rows if r['id']!='__blank__'];top=first+len(basis_rows)+5;point_refs=[]
        for pi,period in enumerate(trend['periods'],top):
            excel_cell(helper,pi,1).Value=period;refs=[]
            for ai,answer in enumerate(answers,2):
                mask=f'{visible}*{series[answer["id"]]}*({dates}={excel_literal(period)})';excel_cell(helper,pi,ai).Formula2=measure_formula(values,mask,'sum');refs.append(reference(pi,ai))
            point_refs.append(refs)
        result['_trendBasisIds']=[answer['id'] for answer in answers]
        result['_trendRawCells']={answer['id']:[point_refs[pi][ai] for pi in range(len(point_refs))] for ai,answer in enumerate(answers)}
        from .kobo_excel_trend_projection import write_trend_series
        write_trend_series(book,plot,result,point_refs,['percent'] if percent_mode else ['count'],support_sheet)
    try:plot.Axes(2).TickLabels.NumberFormat=percent_format(result.get('percentageDecimals',0)) if percent_mode else nf
    except Exception:pass
    plot.HasTitle=True;plot.ChartTitle.Text=result.get('_trendChartTitle',measure['label']+(' - '+result['percentageBasis'] if percent_mode else ''));plot.HasLegend=result.get('appearance',{}).get('legend')!='hidden' and (len((result.get('chartProjection') or {}).get('trend',result['trend'])['series'])>1 if result.get('trend') else len(base_columns)>1)
    if result['chart']=='bar':plot.Axes(1).ReversePlotOrder=True;plot.Axes(1).Crosses=2
    return area,footer,chart
