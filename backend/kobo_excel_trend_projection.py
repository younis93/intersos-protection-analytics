"""Live trend chart ranges with bounded Top N series and compact denominators."""
from .kobo_excel_ranges import excel_cell,excel_range
from .kobo_excel_percentages import percent_format
from .file_security import safe_spreadsheet_value


def matrix_range(matrix):
    return matrix[0][0]+':'+matrix[-1][-1].split('!',1)[1]


def remaining_sum(source,selected):
    selected=','.join(selected) or '0'
    return f'IF(COUNT({source})-COUNT({selected})=0,"-",SUM({source})-SUM({selected}))'


def write_trend_series(book,chart,result,matrix,metrics,support_sheet,legacy_bases=None):
    while chart.SeriesCollection().Count:chart.SeriesCollection(1).Delete()
    if not matrix or not matrix[0]:return
    trend=result['trend'];projection=result.get('chartProjection')
    original=trend['series'];indices={series['id']:i for i,series in enumerate(original)}
    display=(projection or {}).get('trend',trend)['series']
    measure=result.get('measure');mode=result.get('percentageMode','legacy-respondents')
    if measure and (measure['operation']!='sum' or mode=='legacy-respondents'):metrics=['count']
    if len(display)*len(metrics)>255:raise ValueError('Excel trend charts support up to 255 series. Choose a smaller Top N or export one chart metric.')
    helper=support_sheet(book,'_Kobo trend chart values');first=helper.UsedRange.Row+helper.UsedRange.Rows.Count+4
    chosen=[indices[series['id']] for series in display if series['id'] in indices]
    grand=f'SUM({matrix_range(matrix)})'
    for pi,period in enumerate(trend['periods'],first):excel_cell(helper,pi,1).Value=period
    for ai,series in enumerate(display):
        other=series['id']=='__chart_other__'
        own_index=indices.get(series['id'])
        selected_columns=[matrix_range([[row[index]] for row in matrix]) for index in chosen]
        row_total=remaining_sum(matrix_range(matrix),selected_columns) if other else f'SUM({matrix_range([[row[own_index]] for row in matrix])})'
        for mi,metric in enumerate(metrics):
            column=2+ai*len(metrics)+mi
            for pi,row in enumerate(matrix):
                numerator=remaining_sum(matrix_range([row]),[row[index] for index in chosen]) if other else row[own_index]
                denominator=legacy_bases[pi] if mode=='legacy-respondents' and legacy_bases else grand if mode=='grand-total' else f'SUM({matrix_range([row])})' if mode in {'column-total','breakdown-group'} else row_total
                formula=numerator if metric=='count' else f'IFERROR(IF({denominator}=0,"-",{numerator}/{denominator}),"-")'
                excel_cell(helper,first+pi,column).Formula2='='+formula
            native=chart.SeriesCollection().NewSeries();native.Name=safe_spreadsheet_value(series['label']+(' %' if metric=='percent' else ' #'))
            native.XValues=excel_range(helper,first,1,first+len(matrix)-1,1)
            native.Values=excel_range(helper,first,column,first+len(matrix)-1,column)
    if projection:
        result['_trendProjected']=True
        chart.HasTitle=True;chart.ChartTitle.Text=result['label'][:180]+f" - Top {projection['topNShown']} of {projection['topNTotal']}"+(' + Other' if projection['topNOther'] else '')
        result['_trendChartTitle']=str(chart.ChartTitle.Text)
    if metrics==['percent']:chart.Axes(2).TickLabels.NumberFormat=percent_format(result.get('percentageDecimals',0))
