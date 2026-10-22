import io
import os
from pathlib import Path

import openpyxl
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.kobo import KoboFilter, KoboSettings, ProjectStore, QuestionSettings, analyze, decode_choice, normalize, parse_data, parse_form, propose_mapping
from backend.kobo_api import make_router
from backend.kobo_excel import source_rows


def workbook(sheets):
    book = openpyxl.Workbook(); book.remove(book.active)
    for name, rows in sheets.items():
        sheet = book.create_sheet(name)
        for row in rows: sheet.append(row)
    out = io.BytesIO(); book.save(out); return out.getvalue()


@pytest.fixture
def sample():
    form = parse_form(workbook({
        'survey': [['type', 'name', 'label::English (en)', 'label::العربية (ar)'],
                   ['begin_group', 'group', 'Household', 'الأسرة'],
                   ['select_one gender', 'gender', 'Gender', 'الجنس'],
                   ['select_multiple needs', 'needs', 'Needs', 'الاحتياجات'],
                   ['integer', 'age', 'Age', 'العمر'],
                   ['date', 'day', 'Date', 'التاريخ'],
                   ['text', 'respondent_name', 'Name of respondent', 'اسم المستجيب'],
                   ['note', 'note', 'Instructions', 'تعليمات'],
                   ['end_group', '', '', '']],
        'choices': [['list_name', 'name', 'label::English (en)', 'label::العربية (ar)'],
                    ['gender', 'f', 'Female', 'أنثى'], ['gender', 'm', 'Male', 'ذكر'],
                    ['needs', 'water', 'Clean water', 'المياه النظيفة'], ['needs', 'food', 'Food', 'الغذاء'], ['needs', 'none', 'None', 'لا شيء']],
        'settings': [['default_language', 'version'], ['العربية (ar)', '1']],
    }))
    sheets = parse_data(b'gender,needs,needs/water,needs/food,needs/none,age,day,respondent_name\nf,water food,1,1,0,0,2026-01-01,A\nm,none,0,0,1,20,2026-02-01,B\nf,,0,0,0,,2026-02-02,C\n', 'data.csv')
    mappings, _ = propose_mapping(form, sheets)
    records, issues = normalize(form, sheets, mappings)
    assert not issues
    return {'form': form, 'records': records}, sheets, mappings


def question(result, name): return next(q for q in result['questions'] if q['name'] == name)


def test_multi_select_denominator_zero_and_explicit_none(sample):
    project, _, _ = sample
    settings = KoboSettings(hideBlanks=False)
    result = analyze(project, settings)
    q = question(result, 'needs')
    assert q['denominator'] == 2 and q['missing'] == 1
    assert [(r['id'], r['count'], r['percent']) for r in q['rows']] == [('water', 1, 50), ('food', 1, 50), ('none', 1, 50), ('__blank__', 1, None)]
    assert question(result, 'age')['statistics']['min'] == 0
    assert not any(q['name'] == 'note' for q in result['questions'])


def test_filter_and_breakdown_consistency(sample):
    project, _, _ = sample
    qid = 'group/needs'
    settings = KoboSettings(filters=[KoboFilter(field='group/gender', values=['f'])], questions={qid: QuestionSettings(breakdown='group/gender')})
    result = analyze(project, settings)
    q = question(result, 'needs')
    assert result['filtered'] == 2 and q['denominator'] == 1
    assert q['breakdowns'] == [{'id': 'f', 'label': 'Female', 'denominator': 1, 'values': ['f'], 'labels': ['Female']}]
    assert q['rows'][0]['series'][0]['percent'] == 100
    rows = source_rows(project, q, settings)
    assert sum(r[2] for r in rows if r[5] == 'water') == 1
    assert sum(r[3] for r in rows if r[5] == 'water') == q['denominator']
    settings.filters = [KoboFilter(field='group/age', kind='number', minimum=0, maximum=0)]
    assert analyze(project, settings)['filtered'] == 1
    settings.filters = [KoboFilter(field='group/day', kind='date', minimum='2026-02-01', maximum='2026-02-28')]
    assert analyze(project, settings)['filtered'] == 2


def test_visibility_does_not_change_denominator(sample):
    project, _, _ = sample
    settings = KoboSettings(hideZero=True, hideBlanks=True, language='ar')
    q = question(analyze(project, settings), 'needs')
    assert q['label'] == 'الاحتياجات' and q['denominator'] == 2
    settings.filters = [KoboFilter(field='group/gender', values=['absent'])]
    assert all(q['name'] != 'needs' for q in analyze(project, settings)['questions'])
    settings.hideEmpty = False
    assert question(analyze(project, settings), 'needs')['denominator'] == 0
    settings.hideEmpty = True
    assert not analyze(project, settings)['questions']


def test_codes_labels_conflicts_and_unknowns(sample):
    project, sheets, mappings = sample
    q = next(q for q in project['form']['questions'] if q['name'] == 'needs')
    assert decode_choice('Clean water, Food', q, True) == (['food', 'water'], None)
    assert decode_choice('المياه النظيفة الغذاء', q, True)[1] is None
    sheets[0]['rows'][0][1] = 'none'
    records, issues = normalize(project['form'], sheets, mappings)
    assert not issues and records[0]['values']['group/needs'] == ['food', 'water']
    combined, combined_issues = normalize(project['form'], sheets, mappings, {'group/needs': 'combined'})
    assert not combined_issues and combined[0]['values']['group/needs'] == ['none']
    records, issues = normalize(project['form'], sheets, mappings, {'group/needs': 'split'})
    assert not issues and records[0]['values']['group/needs'] == ['food', 'water']
    sheets[0]['rows'][0][0] = 'unknown'
    assert any('unknown' in i['message'] for i in normalize(project['form'], sheets, mappings)[1])


def test_duplicate_columns_require_mapping_review(sample):
    project, _, _ = sample
    sheets = parse_data(b'Gender,Gender\nf,m\n', 'data.csv')
    mappings, _ = propose_mapping(project['form'], sheets)
    assert [m['status'] for m in mappings] == ['ambiguous', 'ambiguous']
    assert [m['column'] for m in mappings] == [0, 1]


def test_repeat_parent_filter_and_denominator():
    raw = workbook({'survey': [['type', 'name', 'label'], ['select_one g', 'gender', 'Gender'], ['begin_repeat', 'members', 'Members'], ['integer', 'age', 'Age'], ['end_repeat', '', '']], 'choices': [['list_name', 'name', 'label'], ['g', 'f', 'Female'], ['g', 'm', 'Male']]})
    form = parse_form(raw)
    data = parse_data(workbook({'submissions': [['_index', 'gender'], [1, 'f'], [2, 'm']], 'members': [['_index', '_parent_index', 'age'], [3, 1, 0], [4, 1, 5], [5, 2, 10]]}), 'data.xlsx')
    mappings, _ = propose_mapping(form, data)
    records, issues = normalize(form, data, mappings)
    assert not issues
    result = analyze({'form': form, 'records': records}, KoboSettings(filters=[KoboFilter(field='gender', values=['f'])]))
    assert result['filtered'] == 1
    assert question(result, 'age')['denominator'] == 2


def test_saved_settings_survive_reopen_and_delete(sample, tmp_path):
    project, _, mappings = sample
    path = tmp_path / 'projects.sqlite3'; store = ProjectStore(path)
    p = store.create('Example', {**project, 'mappings': mappings}, b'form', b'data')
    assert 'group/respondent_name' in p['settings']['hidden']
    settings = KoboSettings(language='ar', hidden=['group/age'], filterFields=['group/gender'], questions={'group/needs': QuestionSettings(chart='donut', colors={'none': '#123456'})})
    store.save(p['id'], settings)
    restored = ProjectStore(path).get(p['id'])
    assert restored['settings'] == settings.model_dump()
    assert restored['records'] == project['records']
    store.delete(p['id']); assert not store.list()


def test_api_mapping_and_settings_validation(sample, tmp_path):
    store = ProjectStore(tmp_path / 'api.sqlite3')
    project, _, _ = sample
    p = store.create('Example', project, b'form', b'data')
    app = FastAPI(); app.include_router(make_router(store))
    client = TestClient(app)
    assert client.get('/api/kobo/projects/' + p['id']).status_code == 200
    assert 'records' not in client.get('/api/kobo/projects/' + p['id']).json()
    payload = {'settings': KoboSettings().model_dump()}
    response = client.post(f"/api/kobo/projects/{p['id']}/analysis", json=payload)
    assert response.status_code == 200 and response.json()['filtered'] == 3
    assert client.put(f"/api/kobo/projects/{p['id']}/settings", json={**payload['settings'], 'language': 'xx'}).status_code == 422
    assert client.delete('/api/kobo/projects/' + p['id']).status_code == 200
    assert client.get('/api/kobo/projects/' + p['id']).status_code == 404


def test_import_api_requires_complete_explicit_mapping_review(tmp_path, monkeypatch):
    monkeypatch.setenv('INTERSOS_DEFER_LEGAL_LOAD', '1')
    app = FastAPI(); app.include_router(make_router(ProjectStore(tmp_path / 'imports.sqlite3')))
    client = TestClient(app)
    form = workbook({'survey': [['type', 'name', 'label'], ['text', 'answer', 'Answer']]})
    preview = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form), 'data': ('data.csv', b'Answer,unknown\nHello,unused\n')})
    assert preview.status_code == 200
    p = preview.json()
    body = {'token': p['token'], 'name': 'Reviewed', 'mappings': p['mappings']}
    assert client.post('/api/kobo/imports/confirm', json=body).status_code == 400
    body['mappings'][1].update(status='excluded', question='', option='')
    partial = {**body, 'mappings': body['mappings'][:1]}
    assert client.post('/api/kobo/imports/confirm', json=partial).status_code == 400
    response = client.post('/api/kobo/imports/confirm', json=body)
    assert response.status_code == 200
    assert client.post('/api/kobo/imports/confirm', json=body).status_code == 410


def test_excel_dependency_error_is_actionable(sample, monkeypatch):
    import sys
    from backend.kobo_excel import ExportJobs
    project, _, _ = sample
    settings = KoboSettings()
    monkeypatch.setitem(sys.modules, 'win32com.client', None)
    with pytest.raises(ValueError, match='requires'):
        ExportJobs().start(project, analyze(project, settings), settings)


def test_bad_workbooks_and_form_groups():
    with pytest.raises(ValueError, match='valid .xlsx'): parse_form(b'invalid')
    with pytest.raises(ValueError, match='survey'): parse_form(workbook({'wrong': [['type', 'name']]}))
    with pytest.raises(ValueError, match='unclosed'): parse_form(workbook({'survey': [['type', 'name'], ['begin_group', 'group']]}))


def test_invalid_filter_ranges_and_colors():
    with pytest.raises(ValueError, match='minimum'): KoboFilter(field='age', kind='number', minimum=20, maximum=1)
    with pytest.raises(ValueError, match='bound'): KoboFilter(field='date', kind='date', minimum='not-a-date')
    with pytest.raises(ValueError, match='RRGGBB'): QuestionSettings(colors={'food': 'invalid'})


def test_group_label_paths(sample):
    project, _, _ = sample
    data = parse_data('Household / Gender,Household / Needs/Food\nf,1\n'.encode(), 'data.csv')
    mappings, _ = propose_mapping(project['form'], data)
    assert all(m['status'] == 'matched' for m in mappings)
    assert mappings[1]['option'] == 'food'


@pytest.mark.skipif(os.name != 'nt', reason='Native Excel jobs require Windows.')
def test_export_cancelled_queue_and_temporary_cleanup(sample):
    import time
    from backend.kobo_excel import ExportJobs
    project, _, _ = sample
    settings = KoboSettings(hidden=[q['id'] for q in project['form']['questions'] if q['identifying']]); snapshot = analyze(project, settings)
    jobs = ExportJobs(); jobs.serial.acquire()
    try:
        job = jobs.start(project, snapshot, settings)
        folder = jobs.jobs[job['id']]['folder']
        jobs.cancel(job['id'])
        jobs.jobs[job['id']]['thread'].join(timeout=3)
        assert jobs.status(job['id'])['state'] == 'cancelled'
        assert not folder.exists()
    finally: jobs.serial.release(); jobs.close()


def test_supplied_examples_read_only():
    root = Path.home() / 'Downloads'
    if not (root / 'Form.xlsx').exists() or not (root / 'Data.xlsx').exists(): pytest.skip('Local acceptance examples are not installed.')
    form = parse_form((root / 'Form.xlsx').read_bytes()); data = parse_data((root / 'Data.xlsx').read_bytes(), 'Data.xlsx')
    mappings, _ = propose_mapping(form, data); records, _ = normalize(form, data, mappings)
    result = analyze({'form': form, 'records': records}, KoboSettings(hideZero=False, hideEmpty=False))
    assert result['total'] == 268
    assert question(result, 'q12')['denominator'] == 268
    assert question(result, 'q14_1_1')['denominator'] == 105
    assert len(form['groups']) == 11
    # Independent counts from option columns verify every multi-select option.
    for q in form['questions']:
        if q['kind'] != 'multiple': continue
        answer = question(result, q['name']); by_code = {r['id']: r['count'] for r in answer['rows']}
        for m in mappings:
            if m['question'] != q['id'] or not m['option']: continue
            expected = sum(str(r[m['column']]) in {'1', '1.0', 'True'} for r in data[m['sheet']]['rows'])
            assert by_code[m['option']] == expected


def test_saved_import_review_and_repair(tmp_path, monkeypatch):
    monkeypatch.setenv('INTERSOS_DEFER_LEGAL_LOAD', '1')
    store = ProjectStore(tmp_path / 'repair.sqlite3')
    app = FastAPI(); app.include_router(make_router(store)); client = TestClient(app)
    def make_form(version):
        return workbook({'survey': [['type', 'name', 'label'], ['integer', 'age', 'Age']], 'settings': [['version'], [version]]})
    original_form = make_form('1')
    original_data = b'Age,__version__\ninvalid,2\n'
    preview = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', original_form), 'data': ('data.csv', original_data)}).json()
    created = client.post('/api/kobo/imports/confirm', json={'token': preview['token'], 'name': 'Existing project', 'mappings': preview['mappings'], 'acceptInvalid': True})
    assert created.status_code == 200, created.text
    pid = created.json()['id']
    settings = created.json()['settings']; settings['hideBlanks'] = False
    assert client.put(f'/api/kobo/projects/{pid}/settings', json=settings).status_code == 200
    review = client.post(f'/api/kobo/projects/{pid}/review').json()
    assert review['expectedVersion'] == '1' and review['sourceVersions'] == {'2': 1}
    assert review['mappings'][0]['header'] == 'Age'
    assert review['examples']['age'][0]['values'][0]['value'] == 'invalid'
    checked = client.post(f"/api/kobo/imports/{review['token']}/check", json={'mappings': review['mappings']}).json()
    assert checked['issues'][0]['message'] == 'invalid numeric answer'
    assert checked['examples']['age'][0]['row'] == 2
    assert checked['examples']['age'][0]['values'][0]['value'] == 'invalid'
    assert checked['examples'] == review['examples']
    failed = client.post('/api/kobo/imports/confirm', json={'token': review['token'], 'name': 'Existing project', 'mappings': review['mappings']})
    assert failed.status_code == 422
    assert store.sources(pid) == (original_form, original_data)
    client.delete(f"/api/kobo/imports/{review['token']}")
    corrected_form, corrected_data = make_form('2'), b'Age,__version__\n25,2\n'
    corrected = client.post(f'/api/kobo/projects/{pid}/review', files={'form': ('matching.xlsx', corrected_form), 'data': ('corrected.csv', corrected_data)})
    assert corrected.status_code == 200, corrected.text
    corrected = corrected.json()
    assert not corrected['issues'] and not corrected['warnings']
    assert store.sources(pid) == (original_form, original_data), 'Preview must not modify saved data'
    applied = client.post('/api/kobo/imports/confirm', json={'token': corrected['token'], 'name': 'Existing project', 'mappings': corrected['mappings']})
    assert applied.status_code == 200, applied.text
    assert applied.json()['id'] == pid and len(store.list()) == 1
    assert not applied.json()['issues'] and not applied.json()['warnings']
    assert applied.json()['settings']['hideBlanks'] is False
    assert store.sources(pid) == (corrected_form, corrected_data)
    assert store.get(pid)['records'][0]['values']['age'] == 25
    assert client.post('/api/kobo/imports/confirm', json={'token': corrected['token'], 'name': 'Existing project', 'mappings': corrected['mappings']}).status_code == 410


def test_note_questions_are_ignored_with_grouped_export_headers():
    form = parse_form(workbook({
        'survey': [['type', 'name', 'label::English (en)', 'label::Arabic (ar)'],
                   ['begin_group', 'household', 'Household', 'الأسرة'],
                   ['note', '', 'Read this introduction', 'مقدمة'],
                   ['note', 'intro', 'Instructions', 'تعليمات'],
                   ['integer', 'age', 'Age', 'العمر'],
                   ['end_group', '', '', '']],
        'settings': [['version'], ['1']],
    }))
    assert [q['name'] for q in form['questions']] == ['age']
    for header in ['intro', 'household/intro', 'Instructions', 'Household / Instructions', 'الأسرة / تعليمات']:
        sheets = parse_data(f'{header},Age\nDisplay text,25\n'.encode('utf-8'), 'responses.csv')
        mappings, warnings = propose_mapping(form, sheets)
        assert mappings[0]['status'] == 'ignored', header
        assert mappings[0]['question'] == ''
        assert not warnings
        records, issues = normalize(form, sheets, mappings)
        assert not issues and records[0]['values'] == {'household/age': 25}
        result = analyze({'form': form, 'records': records}, KoboSettings(hideEmpty=False))
        assert [q['name'] for q in result['questions']] == ['age']


def test_three_pivot_breakdowns_and_excel_sources(sample):
    import copy
    from pydantic import ValidationError
    project = copy.deepcopy(sample[0])
    gender = 'group/gender'; name = 'group/respondent_name'; location = 'group/location'
    project['form']['questions'].append({**project['form']['questions'][0], 'id': location, 'name': 'location', 'labels': {'en': 'Location'}, 'choices': [], 'kind': 'text'})
    for index, record in enumerate(project['records']):
        record['values'][location] = 'North' if index != 1 else None
    project['records'][2]['values']['group/needs'] = ['food']
    settings = KoboSettings(questions={'group/needs': QuestionSettings(breakdowns=[gender, location, name])})
    result = question(analyze(project, settings), 'needs')
    assert [field['id'] for field in result['breakdownFields']] == [gender, location, name]
    assert len(result['breakdowns']) == 3
    assert sum(column['denominator'] for column in result['breakdowns']) == result['denominator'] == 3
    assert any(column['labels'][1] == 'Missing breakdown' for column in result['breakdowns'])
    for row in result['rows']:
        assert sum(value['count'] for value in row['series']) == row['count']
        assert all(value['percent'] == value['count'] * 100 for value in row['series'])
    rows = source_rows(project, result, settings)
    assert all(len(row) == 8 for row in rows)
    assert {row[6] for row in rows} == {'North', 'Missing breakdown'}
    assert {row[7] for row in rows} == {'A', 'B', 'C'}
    assert sum(row[2] for row in rows) == sum(row['count'] for row in result['rows'])
    with pytest.raises(ValidationError): QuestionSettings(breakdowns=[gender, location, name, 'fourth'])
    with pytest.raises(ValueError, match='different question'):
        analyze(project, KoboSettings(questions={'group/needs': QuestionSettings(breakdowns=[gender, gender])}))
    with pytest.raises(ValueError, match='unknown question'):
        analyze(project, KoboSettings(questions={'group/needs': QuestionSettings(breakdowns=['unknown'])}))


def test_breakdown_display_setting_persists_without_changing_values(sample, tmp_path):
    from pydantic import ValidationError
    project = sample[0]
    store = ProjectStore(tmp_path / 'display.sqlite3')
    saved = store.create('Display test', project, b'form', b'data')
    for display in ['count', 'percent', 'both']:
        settings = KoboSettings(questions={'group/needs': QuestionSettings(breakdown='group/gender', breakdownDisplay=display)})
        store.save(saved['id'], settings)
        reread = KoboSettings(**store.get(saved['id'])['settings'])
        result = question(analyze(project, reread), 'needs')
        assert result['breakdownDisplay'] == display
        assert result['denominator'] == 2
        assert all('count' in series and 'percent' in series for row in result['rows'] for series in row.get('series', []))
    with pytest.raises(ValidationError): QuestionSettings(breakdownDisplay='invalid')
