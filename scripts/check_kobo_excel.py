"""Exercise real Excel exports in an isolated temporary project (no user workbooks)."""
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.kobo import KoboSettings, QuestionSettings, analyze, normalize, parse_data, parse_form, propose_mapping
from backend.kobo_excel import jobs, answer_label


def main():
    root = Path.home() / 'Downloads'
    form = parse_form((root / 'Form.xlsx').read_bytes())
    sheets = parse_data((root / 'Data.xlsx').read_bytes(), 'Data.xlsx')
    mappings, warnings = propose_mapping(form, sheets)
    records, issues = normalize(form, sheets, mappings)
    project = {'id': 'verification', 'name': 'Kobo Excel verification', 'form': form, 'records': records}
    q12 = next(q for q in form['questions'] if q['name'] == 'q12')
    q14 = next(q for q in form['questions'] if q['name'] == 'q14_1_1')
    gender = next(q for q in form['questions'] if q['name'] == 'q2')
    q19 = next(q for q in form['questions'] if q['name'] == 'q19')
    numeric = next(q for q in form['questions'] if q['kind'] == 'number')
    settings = KoboSettings(metadata='--full' not in sys.argv, hideBlanks='--blanks' not in sys.argv, hidden=[q['id'] for q in form['questions'] if q['identifying']], questions={q12['id']: QuestionSettings(chart='donut'), q14['id']: QuestionSettings(chart='pie'), q19['id']: QuestionSettings(chart='bar', breakdown=gender['id'])})
    snapshot = analyze(project, settings)
    if '--full' not in sys.argv: snapshot['questions'] = [q for q in snapshot['questions'] if q['name'] in {'q12', 'q14_1_1', 'q19', numeric['name'], 'today'}]
    target = Path(__file__).resolve().parents[1] / 'output' / ('kobo-full-verification.xlsx' if '--full' in sys.argv else 'kobo-verification.xlsx')
    if '--verify-only' in sys.argv:
        verify(target, snapshot, project, settings); return
    job = jobs.start(project, snapshot, settings)
    while job['state'] in {'queued', 'running'}:
        time.sleep(1)
        job = jobs.status(job['id'])
        print(job, flush=True)
    if job['state'] != 'complete': raise RuntimeError(job)
    target.write_bytes(jobs.download(job['id']))
    print(target)
    verify(target, snapshot, project, settings)


def verify(target, snapshot, project, settings):
    from scripts.check_kobo_grouped_excel import verify as verify_grouped
    result = verify_grouped(target, project, settings, snapshot)
    print('PASS: one combined Data table, group sheets, native pivots/charts, selected breakdowns, counts, percentages, totals and layout', result)


if __name__ == '__main__': main()
