from backend.test_kobo import sample
from backend.test_kobo_preview import preview_client


def test_answers_searches_choice_labels_in_both_languages_without_saving(preview_client):
    client, store, pid = preview_client
    before = store.get(pid)
    for language, search in [('en', 'Clean water'), ('ar', 'المياه النظيفة'), ('en', 'water')]:
        response = client.post(f'/api/kobo/projects/{pid}/responses', json={'settings': {**before['settings'], 'language': language}, 'question': 'group/needs', 'search': search})
        assert response.status_code == 200
        assert response.json()['total'] == 1
        assert set(response.json()['rows'][0]['value']) == {'water', 'food'}
    assert store.get(pid)['settings'] == before['settings']


def test_answers_preserves_filters_zero_and_pagination(preview_client):
    client, store, pid = preview_client
    settings = store.get(pid)['settings']
    body = {'settings': {**settings, 'filters': [{'field': 'group/gender', 'kind': 'category', 'values': ['f']}]}, 'question': 'group/age', 'pageSize': 1}
    response = client.post(f'/api/kobo/projects/{pid}/responses', json=body)
    assert response.status_code == 200
    assert response.json()['total'] == 1
    assert response.json()['rows'][0]['value'] == 0
    assert client.post(f'/api/kobo/projects/{pid}/responses', json={**body, 'page': 2}).json()['rows'] == []
