import sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.check_kobo_grouped_excel import fixture,verify
from backend.kobo import analyze
from backend.kobo_excel import jobs

if __name__=='__main__':
    project,settings,_=fixture()
    began=time.perf_counter();job=jobs.start(project,None,settings,'group/needs',separate_groups=[]);queued_ms=(time.perf_counter()-began)*1000
    assert queued_ms<1000, queued_ms
    cancelled=jobs.start(project,None,settings);jobs.cancel(cancelled['id'])
    deadline=time.monotonic()+180
    while time.monotonic()<deadline:
        state=jobs.status(job['id'])
        if state['state'] in {'complete','error','cancelled'}:break
        time.sleep(.2)
    assert state['state']=='complete',state
    assert jobs.status(cancelled['id'])['state']=='cancelled'
    target=Path('output/kobo-exports/background-native.xlsx').resolve();target.parent.mkdir(exist_ok=True,parents=True);target.write_bytes(jobs.download(job['id']))
    snapshot=analyze(project,settings,'group/needs');verify(target,project,settings,snapshot,separate_groups=[])
    active=jobs.start(project,None,settings)
    deadline=time.monotonic()+30
    while time.monotonic()<deadline and not jobs.jobs[active['id']]['excelPid']:time.sleep(.05)
    assert jobs.jobs[active['id']]['excelPid'], jobs.status(active['id'])
    jobs.cancel(active['id']);deadline=time.monotonic()+15
    while time.monotonic()<deadline and jobs.jobs[active['id']]['thread'].is_alive():time.sleep(.1)
    assert jobs.status(active['id'])['state']=='cancelled'
    assert not jobs.jobs[active['id']]['thread'].is_alive()
    assert not jobs.jobs[active['id']]['folder'].exists()
    print(f'PASS: background preparation, targeted calculation, queued and active cancellation, native workbook verification; queue response {queued_ms:.0f}ms',flush=True)
    jobs.close()
