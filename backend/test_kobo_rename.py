from backend.kobo import ProjectStore
from backend.test_kobo import sample
from backend.test_kobo_preview import preview_client


def test_rename_persists_without_changing_responses_settings_or_sources(preview_client):
    client, store, pid = preview_client
    before = store.get(pid)
    sources = store.sources(pid)
    response = client.patch(f'/api/kobo/projects/{pid}', json={'name': '  Protection monitoring  '})
    assert response.status_code == 200
    assert response.json()['name'] == 'Protection monitoring'
    after = ProjectStore(store.path).get(pid)
    assert after['name'] == 'Protection monitoring'
    assert {k: v for k, v in after.items() if k not in {'name', 'updated'}} == {k: v for k, v in before.items() if k not in {'name', 'updated'}}
    assert store.sources(pid) == sources
    assert client.get('/api/kobo/projects').json()[0]['name'] == after['name']
    assert client.get(f'/api/kobo/projects/{pid}').json()['name'] == after['name']
    assert client.put(f'/api/kobo/projects/{pid}/settings', json=before['settings']).status_code == 200
    assert store.get(pid)['name'] == after['name']


def test_rename_validation_unicode_and_missing_project(preview_client):
    client, store, pid = preview_client
    for name in ['', '   ', 'x' * 201]:
        assert client.patch(f'/api/kobo/projects/{pid}', json={'name': name}).status_code in {400, 422}
    name = 'تقييم الحماية - أكتوبر'
    assert client.patch(f'/api/kobo/projects/{pid}', json={'name': name}).json()['name'] == name
    assert store.get(pid)['name'] == name
    assert client.patch('/api/kobo/projects/missing', json={'name': 'New name'}).status_code == 404
