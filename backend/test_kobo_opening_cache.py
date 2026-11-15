from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import kobo_api
from backend.kobo import KoboSettings, ProjectStore
from backend.test_kobo import sample


def test_opening_cache_uses_current_revision_and_settings(tmp_path, sample):
    store = ProjectStore(tmp_path / 'projects.sqlite3')
    project = store.create('Assessment', sample[0], b'form', b'data')
    app = FastAPI()
    app.include_router(kobo_api.make_router(store))
    app.include_router(kobo_api.make_router(store, prefix='/api/custom'))
    path = f'/api/kobo/projects/{project["id"]}'
    settings = {'settings': {'language': 'en'}}

    with TestClient(app) as client, patch.object(store, 'get', wraps=store.get) as hydrate, patch.object(
        kobo_api, 'analyze', wraps=kobo_api.analyze
    ) as analyze:
        first = client.get(path)
        result = client.post(f'{path}/analysis', json=settings)
        assert first.status_code == result.status_code == 200
        assert client.get(path).content == first.content
        assert client.post(f'{path}/analysis', json=settings).content == result.content
        assert (hydrate.call_count, analyze.call_count) == (2, 1)

        alternate = client.post(f'{path}/analysis', json={'settings': {'language': 'ar'}})
        assert alternate.json()['settings']['language'] == 'ar'
        assert analyze.call_count == 2
        custom_path = path.replace('/kobo/', '/custom/')
        for _ in range(2):
            assert client.get(custom_path).content == first.content
            assert client.post(f'{custom_path}/analysis', json=settings).content == result.content
        assert (hydrate.call_count, analyze.call_count) == (5, 3)

        store.rename(project['id'], 'Updated')
        store.save(project['id'], KoboSettings(language='ar'))
        reopened = client.get(path).json()
        assert reopened['name'] == 'Updated'
        assert reopened['settings']['language'] == 'ar'

        store.repair(project['id'], {**sample[0], 'records': sample[0]['records'][:1]}, b'form', b'data')
        assert client.post(f'{path}/analysis', json=settings).json()['total'] == 1
        assert analyze.call_count == 4

        store.delete(project['id'])
        assert client.get(path).status_code == 404
        assert client.post(f'{path}/analysis', json=settings).status_code == 404


def test_opening_cache_eviction_and_size_limit():
    cache = kobo_api.ProjectResponseCache()
    cache.max_entries = 2
    cache.max_bytes = 5
    cache.put(('a',), b'aa')
    cache.put(('b',), b'b')
    assert cache.get(('a',)) == b'aa'
    cache.put(('c',), b'c')
    assert cache.get(('b',)) is None
    cache.put(('a',), b'aaaaa')
    assert cache.get(('c',)) is None
    cache.put(('big',), b'123456')
    assert cache.get(('big',)) is None
    assert cache.get(('a',)) == b'aaaaa'
