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
    response = client.post('/api/kobo/imports/confirm', json={'token': preview['token'], 'name': 'Selected sheet', 'mappings': preview['mappings']})
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
    assert project['source'] == {'worksheet': 'Second'}
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
    assert client.post(f'/api/kobo/projects/{pid}/review', files={'data': ('new.xlsx', missing)}).status_code == 400
    csv_review = client.post(f'/api/kobo/projects/{pid}/review', files={'data': ('new.csv', b'answer\ncsv\n')}).json()
    confirm(client, csv_review)
    assert store.get(pid)['source'] == {'worksheet': ''}
    assert store.get(pid)['records'][0]['values']['answer'] == 'csv'


def test_legacy_and_csv_parsing():
    _, data = sources()
    assert [s['name'] for s in parse_data(data, 'responses.xlsx')] == ['First', 'Second', 'Header only']
    assert parse_data(b'answer\nhello\n', 'responses.csv')[0]['rows'] == [['hello']]
    with pytest.raises(ValueError, match='only available for Excel'):
        parse_data(b'answer\nhello\n', 'responses.csv', 'Second')
