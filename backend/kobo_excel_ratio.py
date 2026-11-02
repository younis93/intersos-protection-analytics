"""Live additive percentage expressions over the existing connected count pivots."""
from .kobo_excel_slicers import pivot_value

def modern(result):return result.get('percentageMode','legacy-respondents')!='legacy-respondents'
def selection_base(totals,result,parts=()):
    if '_additiveCountRanges' in result:
        from .kobo_excel_count_cells import count_sum
        return count_sum(result,parts=parts)
    source={**result,'_countPivot':result['_overallCountPivot']} if not parts and '_overallCountPivot' in result else result
    counts=[pivot_value(totals,'Responses',a['id'],parts,source) for a in result.get('percentageRows',result['rows'])]
    return '('+'+'.join(counts)+')' if counts else '0'
def group_base(totals,result,parts):
    if not parts:return selection_base(totals,result)
    prefix=list(parts[:result.get('percentageGroupLevel',1)])
    columns=result.get('_excelBreakdowns',result.get('breakdowns',[]))
    leaves=[column.get('labels',[column.get('label','')]) for column in columns if column.get('labels',[column.get('label','')])[:len(prefix)]==prefix]
    return '('+'+'.join(selection_base(totals,result,leaf) for leaf in leaves)+')' if leaves else '0'


def ratio(totals,result,answer,parts=(),margin=False):
    source={**result,'_countPivot':result['_overallCountPivot']} if not parts and '_overallCountPivot' in result else result
    numerator=selection_base(totals,result,parts) if answer is None else pivot_value(totals,'Responses',answer,parts,source)
    row_base=None
    if '_additiveCountRanges' in result:
        from .kobo_excel_count_cells import count_sum
        numerator=count_sum(result,answer,parts)
        row_base=count_sum(result,answer)
    mode=result.get('percentageMode','legacy-respondents')
    denominator=selection_base(totals,result) if mode=='grand-total' or margin and mode=='row-total' else selection_base(totals,result,parts) if mode=='column-total' else pivot_value(totals,'Responses',answer,(),source) if answer is not None else selection_base(totals,result)
    if mode=='breakdown-group':denominator=group_base(totals,result,parts)
    elif mode=='row-total' and not margin and answer is not None and row_base is not None:denominator=row_base
    return f'IF({denominator}=0,"-",{numerator}/{denominator})'
