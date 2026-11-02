from backend.test_update_helpers import skip_comparison
import pytest

from backend.kobo import parse_data
from backend.test_kobo import sample, workbook
from backend.test_kobo_preview import preview_client


def sources():
    form = workbook({'survey': [['type', 'name', 'label'], ['text', 'answer', 'Answer']]})
    data = workbook({'First': [['answer'], ['first']], 'Second': [['answer'], ['second']], 'Empty': [], 'Header only': [['answer']]})
    return form, data


def test_lists_worksheets_without_creating_project(preview_client):
    client, store, _ = preview_client
    before = store.list()
    _, data = sources()
    response = client.post('/api/kobo/imports/worksheets', files={'data': ('responses.xlsx', data)})
    assert response.status_code == 200, response.text
    assert response.json() == {'worksheets': ['First', 'Second', 'Empty', 'Header only']}
    assert store.list() == before
    single = workbook({'Only sheet': [['answer'], ['hello']]})
    assert client.post('/api/kobo/imports/worksheets', files={'data': ('single.xlsx', single)}).json() == {'worksheets': ['Only sheet']}


@pytest.mark.parametrize('filename,raw', [('invalid.xlsx', b'broken'), ('responses.csv', b'answer\nhello\n')])
def test_list_rejects_invalid_files(preview_client, filename, raw):
    client, _, _ = preview_client
    assert client.post('/api/kobo/imports/worksheets', files={'data': (filename, raw)}).status_code == 400


@pytest.mark.parametrize('worksheet', ['Missing', 'Empty', 'Header only'])
def test_preview_rejects_missing_or_empty_sheet(preview_client, worksheet):
    client, _, _ = preview_client
    form, data = sources()
    response = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form), 'data': ('responses.xlsx', data)}, data={'worksheet': worksheet})
    assert response.status_code == 400, response.text
    assert worksheet in response.json()['detail']


def confirm(client, preview):
    response = client.post('/api/kobo/imports/confirm', json={'token': preview['token'], 'name': 'Selected sheet', 'mappings': preview['mappings'], 'matching':skip_comparison(client,'kobo',preview['token'],{'mappings':preview['mappings']})})
    assert response.status_code == 200, response.text
    return response.json()


def test_selected_sheet_survives_save_reload_review_and_replacement(preview_client):
    client, store, _ = preview_client
    form, data = sources()
    response = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form), 'data': ('responses.xlsx', data)}, data={'worksheet': 'Second'})
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview['sheets'] == [{'name': 'Second', 'rows': 1, 'columns': 1}]
    project = confirm(client, preview)
    pid = project['id']
    assert project['source'] == {'worksheet': 'Second','filename':'responses.xlsx','formFilename':'form.xlsx','tables':[{'name':'Second','role':'Main table'}]}
    assert client.get(f'/api/kobo/projects/{pid}').json()['source'] == project['source']
    assert store.get(pid)['records'][0]['values']['answer'] == 'second'
    assert store.sources(pid) == (form, data)
    review = client.post(f'/api/kobo/projects/{pid}/review').json()
    assert review['sheets'] == preview['sheets']
    confirm(client, review)
    assert store.get(pid)['source'] == project['source']
    replacement = workbook({'First': [['answer'], ['wrong']], 'Second': [['answer'], ['updated']]})
    review = client.post(f'/api/kobo/projects/{pid}/review', files={'data': ('new.xlsx', replacement)}).json()
    assert review['sheets'] == preview['sheets']
    confirm(client, review)
    assert store.get(pid)['records'][0]['values']['answer'] == 'updated'
    missing = workbook({'Other': [['answer'], ['wrong']]})
    before = store.get(pid)
    changed = client.post(f'/api/kobo/projects/{pid}/review', files={'data': ('new.xlsx', missing)})
    assert changed.status_code == 400, changed.text
    assert 'Choose a replacement worksheet' in changed.json()['detail']
    assert store.get(pid)==before
    changed = client.post(f'/api/kobo/projects/{pid}/review', files={'data': ('new.xlsx', missing)},data={'worksheet':'Other'})
    assert changed.status_code == 200, changed.text
    assert not changed.json()['reuse']['eligible']
    assert store.get(pid) == before
    csv_review = client.post(f'/api/kobo/projects/{pid}/review', files={'data': ('new.csv', b'answer\ncsv\n')}).json()
    confirm(client, csv_review)
    assert store.get(pid)['source']['worksheet'] == ''
    assert store.get(pid)['records'][0]['values']['answer'] == 'csv'


def test_legacy_and_csv_parsing():
    _, data = sources()
    assert [s['name'] for s in parse_data(data, 'responses.xlsx')] == ['First', 'Second', 'Header only']
    assert parse_data(b'answer\nhello\n', 'responses.csv')[0]['rows'] == [['hello']]
    with pytest.raises(ValueError, match='only available for Excel'):
        parse_data(b'answer\nhello\n', 'responses.csv', 'Second')


@pytest.mark.parametrize('worksheet', ['Missing', 'Empty', 'Header only'])
def test_replacement_rejects_explicit_invalid_worksheet(preview_client, worksheet):
    client, store, _ = preview_client
    form, data = sources()
    preview = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form), 'data': ('data.xlsx', data)}, data={'worksheet': 'Second'}).json()
    saved = confirm(client, preview)
    before = store.get(saved['id'])
    response = client.post(f"/api/kobo/projects/{saved['id']}/review", files={'data': ('replacement.xlsx', data)}, data={'worksheet': worksheet})
    assert response.status_code == 400, response.text
    assert worksheet in response.json()['detail']
    assert store.get(saved['id']) == before


def test_replacement_explicit_worksheet_persists(preview_client):
    client, store, _ = preview_client
    form, data = sources()
    preview = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form), 'data': ('data.xlsx', data)}, data={'worksheet': 'Second'}).json()
    saved = confirm(client, preview)
    review = client.post(f"/api/kobo/projects/{saved['id']}/review", files={'data': ('replacement.xlsx', data)}, data={'worksheet': 'First'})
    assert review.status_code == 200, review.text
    updated = confirm(client, review.json())
    assert updated['source']['worksheet'] == 'First'
    assert store.get(saved['id'])['records'][0]['values']['answer'] == 'first'
    reopened = client.post(f"/api/kobo/projects/{saved['id']}/review").json()
    assert reopened['sheets'] == [{'name': 'First', 'rows': 1, 'columns': 1}]


def test_replacement_explicit_all_worksheets_preserves_repeat_tables(preview_client):
    client, store, _ = preview_client
    form = workbook({'survey': [['type', 'name', 'label'], ['text', 'Code', 'Code'], ['begin_repeat', 'members', 'Members'], ['integer', 'age', 'Age'], ['end_repeat', '', '']]})
    data = workbook({'submissions': [['_index', 'Code'], [1, '001']], 'members': [['_index', '_parent_index', 'age'], [2, 1, 10]]})
    preview = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form), 'data': ('data.xlsx', data)}).json()
    saved = confirm(client, preview)
    review = client.post(f"/api/kobo/projects/{saved['id']}/review", files={'data': ('replacement.xlsx', data)}, data={'worksheet': ''})
    assert review.status_code == 200, review.text
    assert [s['name'] for s in review.json()['sheets']] == ['submissions', 'members']
    updated = confirm(client, review.json())
    assert updated['source']['worksheet'] == ''
    assert any(r['scope'] == 'members' for r in store.get(saved['id'])['records'])


def test_explicit_empty_worksheet_overrides_saved_selection(preview_client):
    client, store, _ = preview_client
    form, data = sources()
    preview = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form), 'data': ('data.xlsx', data)}, data={'worksheet': 'First'}).json()
    saved = confirm(client, preview)
    review = client.post(f"/api/kobo/projects/{saved['id']}/review", files={'data': ('new.xlsx', data)}, data={'worksheet': ''})
    assert review.status_code == 200, review.text
    assert [sheet['name'] for sheet in review.json()['sheets']] == ['First', 'Second', 'Header only']
    assert store.get(saved['id'])['source']['worksheet'] == 'First'
