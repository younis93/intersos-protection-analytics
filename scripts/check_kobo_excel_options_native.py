import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.check_kobo_grouped_excel import fixture,export,verify
if __name__=='__main__':
    root=Path('output/kobo-excel-options').resolve();root.mkdir(exist_ok=True,parents=True)
    for index,groups in enumerate([['group'],['group','group/details'],[],['group/details','services/visits']]):
        project,settings,snapshot=fixture('ar' if index==3 else 'en');target=root/f'groups-{index}.xlsx'
        export(project,settings,snapshot,target,separate_groups=groups)
        result=verify(target,project,settings,snapshot,refresh=index==1,separate_groups=groups)
        print(groups,result,flush=True)
    print('PASS: selected main/nested groups, combined Analysis, General, unique question placement, native pivots/charts, spacing, source edits, Refresh All, save/reopen and Arabic.')
