"""Compact live Count ranges avoid repeating every pivot query in each percentage."""
from openpyxl.utils import get_column_letter


def plan_count_cells(result,helper,columns,answers,count_column):
    start=helper.UsedRange.Row+helper.UsedRange.Rows.Count+3
    quoted="'"+helper.Name.replace("'","''")+"'!"
    letter=get_column_letter(count_column)
    cells={};ranges={}
    for ci,column in enumerate(columns):
        first=start+ci*(len(answers)+4)+1;path=tuple(column['labels'])
        if first+len(answers)-1>1048576:raise ValueError('Chart values exceed the Excel row limit.')
        for ri,answer in enumerate(answers):cells[(answer['id'],path)]=f'{quoted}${letter}${first+ri}'
        if answers:ranges[path]=f'{quoted}${letter}${first}:${letter}${first+len(answers)-1}'
    result['_additiveCountCells']=cells;result['_additiveCountRanges']=ranges
    return start


def count_sum(result,answer=None,parts=()):
    prefix=tuple(parts)
    if answer is None:refs=[ref for path,ref in result['_additiveCountRanges'].items() if path[:len(prefix)]==prefix]
    else:refs=[ref for (qid,path),ref in result['_additiveCountCells'].items() if qid==answer and path[:len(prefix)]==prefix]
    return 'SUM('+','.join(refs)+')' if refs else '0'
