import io
import json
import pytest
from fastapi import HTTPException
from . import local_assistant as assistant
from .kobo import ProjectStore
from .kobo_api import make_router
from .kobo_workspace import backup_project, read_backup
from .test_kobo import sample
from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_disabled_assistant_cannot_generate(monkeypatch):
    monkeypatch.setattr(assistant, 'preferences', lambda: {'enabled': False})
    with pytest.raises(HTTPException) as error:
        assistant.chat(assistant.ChatRequest(model='local', question='Hello', evidence=''))
    assert error.value.status_code == 400


def test_remote_models_rejected(monkeypatch):
    monkeypatch.setattr(assistant, 'installed_models', lambda: [{'name': 'remote'}])
    monkeypatch.setattr(assistant, 'ollama', lambda *args, **kwargs: io.BytesIO(json.dumps({'remote_host': 'https://example.com'}).encode()))
    with pytest.raises(HTTPException):
        assistant.validate_model('remote')


def test_uninstalled_models_rejected(monkeypatch):
    monkeypatch.setattr(assistant, 'installed_models', lambda: [])
    with pytest.raises(HTTPException):
        assistant.validate_model('unknown')


def test_download_restricts_catalog():
    with pytest.raises(HTTPException):
        assistant.download(assistant.DownloadRequest(model='arbitrary/model'))


def test_download_checks_free_space(monkeypatch):
    monkeypatch.setattr(assistant, 'status', lambda: {'freeGb': 1})
    with pytest.raises(HTTPException) as error:
        assistant.download(assistant.DownloadRequest(model='qwen3:4b-instruct'))
    assert 'disk space' in error.value.detail


def test_resume_reuses_allocated_disk_space(monkeypatch):
    monkeypatch.setattr(assistant, 'status', lambda: {'freeGb': 1})
    monkeypatch.setattr(assistant, 'stream_operation', lambda path, body, operation: (path, body['model']))
    request = assistant.DownloadRequest(model='qwen3:4b-instruct', resume=True)
    assert assistant.download(request) == ('pull', request.model)


def test_preferences_default_and_atomic_save(tmp_path, monkeypatch):
    monkeypatch.setattr(assistant, 'PREFERENCES', tmp_path / 'settings.json')
    assert assistant.preferences()['enabled'] is False
    assistant.save_settings(assistant.Preferences(enabled=True))
    assert assistant.preferences()['enabled'] is True


def test_chat_setup_reads_selection_without_starting_ollama(tmp_path, monkeypatch):
    monkeypatch.setattr(assistant, 'PREFERENCES', tmp_path / 'preferences.json')
    monkeypatch.setattr(assistant, 'executable', lambda: 'ollama.exe')
    monkeypatch.setattr(assistant, 'ollama', lambda *args, **kwargs: pytest.fail('Chat setup must not start Ollama'))
    assistant.update_settings(assistant.PREFERENCES, {'enabled': True, 'model': 'qwen3:4b-instruct'})
    assert assistant.selected_model() == {
        'enabled': True, 'model': 'qwen3:4b-instruct', 'installed': True, 'smallGroupMin': 5,
    }


def test_model_storage_switches_and_restores_without_moving_models(tmp_path, monkeypatch):
    monkeypatch.setattr(assistant, 'PREFERENCES', tmp_path / 'preferences.json')
    original = tmp_path / 'default'
    original.mkdir()
    marker = original / 'previous-model'
    marker.write_bytes(b'local')
    custom = tmp_path / 'custom'
    custom.mkdir()
    monkeypatch.setenv('OLLAMA_MODELS', str(original))
    monkeypatch.setattr(assistant, 'installed_models', lambda: [])
    assistant.update_settings(assistant.PREFERENCES, {'enabled': True, 'model': 'old', 'tested': True})
    selected = assistant.save_storage(assistant.ModelStorage(folder=str(custom)))
    assert selected['modelFolder'] == str(custom)
    assert selected['model'] == '' and selected['tested'] is False
    assert marker.read_bytes() == b'local'
    restored = assistant.save_storage(assistant.ModelStorage())
    assert restored['modelFolder'] == str(original)
    assert restored['usingDefaultFolder']


def test_model_storage_rejects_missing_folder(tmp_path):
    with pytest.raises(HTTPException, match='existing folder'):
        assistant.save_storage(assistant.ModelStorage(folder=str(tmp_path / 'missing')))


def test_activate_model_selects_ready_model_without_running_inference(tmp_path, monkeypatch):
    monkeypatch.setattr(assistant, 'PREFERENCES', tmp_path / 'preferences.json')
    assistant.update_settings(assistant.PREFERENCES, {'enabled': True, 'model': 'old', 'tested': True})
    model = 'qwen3:4b-instruct'
    monkeypatch.setattr(assistant, 'installed_models', lambda: [{'name': model}])
    monkeypatch.setattr(assistant, 'ollama', lambda path, *args: io.BytesIO(b'{"capabilities":["completion"]}')
                        if path == 'show' else pytest.fail(f'Unexpected model request: {path}'))
    result = assistant.activate_model(assistant.ModelRequest(model=model))
    assert result['connected'] and result['model'] == model and not result['tested']


@pytest.mark.parametrize('prefix', ['/api/kobo', '/api/custom'])
def test_project_history_and_saved_work_travel_with_backup(tmp_path, sample, prefix):
    payload, _, _ = sample
    store = ProjectStore(tmp_path / 'projects.sqlite3')
    project = store.create('Survey', payload, b'', b'')
    pid = project['id']
    app = FastAPI()
    app.include_router(make_router(store, prefix=prefix))
    with TestClient(app) as client:
        endpoint = f'{prefix}/projects/{pid}/assistant'
        saved = {'outline': 'Findings', 'conversation': [{'question': 'What changed?', 'answer': 'See the source.'}]}
        assert client.patch(endpoint, json=saved).is_success
        previous = payload['form']['questions'][0]
        payload['form']['questions'].append({**previous, 'id': 'added', 'name': 'added'})
        store.repair(pid, payload, b'', b'')
        state = client.get(endpoint).json()
        assert state['outline'] == 'Findings'
        assert {'question': 'added', 'change': 'New question'} in state['fieldHistory'][-1]['changes']
        _, restored, *_ = read_backup(backup_project(store, pid))
        assert restored['assistant']['conversation'] == saved['conversation']
        assert client.patch(endpoint, json={'conversation': None}).is_success
        assert client.get(endpoint).json()['conversation'] is None
