from types import SimpleNamespace
from backend.kobo_excel_count_cells import plan_count_cells,count_sum
from backend.kobo_excel_ratio import ratio


def helper():return SimpleNamespace(Name='_Counts',UsedRange=SimpleNamespace(Row=1,Rows=SimpleNamespace(Count=1)))


def test_large_count_percentages_use_bounded_live_formulas():
    answers=[{'id':str(i),'label':str(i)} for i in range(300)]
    result={'rows':answers,'percentageMode':'grand-total','breakdowns':[]}
    plan_count_cells(result,helper(),[{'labels':[]}],answers,1)
    formula=ratio("'Pivot'!$A$1",result,'0')
    assert len(formula)<500
    assert "'_Counts'!$A$6:$A$305" in formula
    assert 'GETPIVOTDATA' not in formula


def test_nested_group_bases_keep_other_status_groups_separate():
    answers=[{'id':'a','label':'A'},{'id':'b','label':'B'}]
    columns=[{'id':str(i),'labels':list(path)} for i,path in enumerate([('IDP','Men'),('IDP','Women'),('Refugee','Men'),('Refugee','Women')])]
    result={'rows':answers,'percentageMode':'breakdown-group','percentageGroupLevel':1,'breakdowns':columns}
    plan_count_cells(result,helper(),columns,answers,2)
    formula=ratio("'Pivot'!$A$1",result,'a',['IDP','Men'])
    assert '$B$6:$B$7' in formula and '$B$12:$B$13' in formula
    assert '$B$18' not in formula and '$B$24' not in formula
    assert count_sum(result,'a',['Refugee'])=="SUM('_Counts'!$B$18,'_Counts'!$B$24)"
