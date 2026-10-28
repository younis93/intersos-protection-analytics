from backend.kobo import KoboSettings
from backend.kobo_settings_share import export_settings
from backend.test_kobo import sample, workbook
from backend.test_kobo_preview import preview_client


def test_large_text_defaults_and_explicit_selection_survive_reopen_and_repair(preview_client):
    from backend.kobo import new_project_settings
    client, store, _ = preview_client
    form = workbook({'survey': [['type', 'name', 'label'], ['text', 'comment', 'Comment'], ['text', 'code', 'Code'], ['integer', 'amount', 'Amount'], ['date', 'day', 'Day']]})
    raw = ('comment,code,amount,day\n' + '\n'.join(f'Response {i},Same,{i},2026-01-01' for i in range(101))).encode()
    staged = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form), 'data': ('data.csv', raw)})
    assert staged.status_code == 200, staged.text
    p = staged.json()
    saved = client.post('/api/kobo/imports/confirm', json={'token': p['token'], 'name': 'Large text', 'mappings': p['mappings']})
    assert saved.status_code == 200, saved.text
    project = saved.json()
    assert project['settings']['hidden'] == ['comment']
    stored = store.get(project['id'])
    assert not new_project_settings(stored['form'], stored['records'][:100]).hidden
    settings = KoboSettings.model_validate(project['settings'])
    settings.hidden = ['code']  # Explicitly include the large field and hide a different field.
    store.save(project['id'], settings)
    assert store.get(project['id'])['settings']['hidden'] == ['code']
    repaired = store.repair(project['id'], {k: v for k, v in stored.items() if k not in {'id', 'name', 'settings', 'updated'}}, form, raw)
    assert repaired['settings']['hidden'] == ['code']
    explicit = store.create('Explicit settings', stored, form, raw, settings=KoboSettings())
    assert explicit['settings']['hidden'] == []


def staged_import(client):
    form = workbook({'survey': [['type', 'name', 'label'], ['begin_group', 'group', 'Group'], ['select_one g', 'gender', 'Gender'], ['end_group', '', '']],
        'choices': [['list_name', 'name', 'label'], ['g', 'f', 'Female'], ['g', 'm', 'Male']]})
    response = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form), 'data': ('responses.csv', b'gender\nf\nm\n')})
    assert response.status_code == 200, response.text
    return response.json()


def test_creation_reviews_then_atomically_saves_shared_settings(preview_client):
    client, store, pid = preview_client
    before = store.list(); staged = staged_import(client)
    config = KoboSettings(language='ar', hideZero=True, filterFields=['group/gender'], filters=[{'field': 'group/gender', 'values': ['f']}], excelGroups=['group'], questions={'group/gender': {'chart': 'pie'}})
    package = export_settings(store.get(pid), config).model_dump()
    body = {'mappings': staged['mappings'], 'policies': {}, 'package': package}
    review = client.post(f'/api/kobo/imports/{staged["token"]}/settings-preview', json=body)
    assert review.status_code == 200, review.text
    assert review.json()['matches']
    assert store.list() == before  # review/cancellation never creates a project
    confirmed = client.post('/api/kobo/imports/confirm', json={'token': staged['token'], 'name': 'Configured project', 'mappings': staged['mappings'], 'settingsPackage': package})
    assert confirmed.status_code == 200, confirmed.text
    project = confirmed.json()
    assert project['settings'] == review.json()['settings']
    saved = store.get(project['id'])
    assert saved['settings']['hideZero'] is True
    assert saved['settings']['language'] == 'ar'
    assert saved['settings']['excelGroups'] == ['group']
    assert saved['settings']['questions']['group/gender']['chart'] == 'pie'
    assert len(saved['records']) == 2
    assert len(store.list()) == len(before)+1


def test_invalid_settings_dont_create_project_and_can_be_removed(preview_client):
    client, store, pid = preview_client; before = store.list(); staged = staged_import(client)
    package = export_settings(store.get(pid), KoboSettings()).model_dump(); package['settings']['version'] = 999
    body = {'token': staged['token'], 'name': 'Default project', 'mappings': staged['mappings'], 'settingsPackage': package}
    assert client.post('/api/kobo/imports/confirm', json=body).status_code == 400
    assert store.list() == before
    body.pop('settingsPackage')
    response = client.post('/api/kobo/imports/confirm', json=body)
    assert response.status_code == 200, response.text
    assert response.json()['settings']['questions']['group/gender']['palette'] == 'Blue'
    assert len(store.list()) == len(before)+1


def test_creation_preview_rejects_malformed_settings_and_expired_stage(preview_client):
    client, store, pid = preview_client; staged = staged_import(client)
    body = {'mappings': staged['mappings'], 'package': {'format': 'wrong'}}
    assert client.post(f'/api/kobo/imports/{staged["token"]}/settings-preview', json=body).status_code == 422
    body['package'] = export_settings(store.get(pid), KoboSettings()).model_dump()
    assert client.post('/api/kobo/imports/expired/settings-preview', json=body).status_code == 410


def test_arabic_default_form_creates_english_project_and_preserves_explicit_language(preview_client, sample):
    client, store, pid = preview_client
    payload = sample[0]
    assert payload['form']['language'] == 'ar'
    payload = {**payload, 'mappings': [], 'policies': {}, 'warnings': [], 'issues': []}
    created = store.create('Bilingual default', payload, b'form', b'data')
    assert created['settings']['language'] == 'en'
    assert created['form']['language'] == 'ar'
    explicit = store.create('Arabic labels', payload, b'form', b'data', settings=KoboSettings(language='ar'))
    assert explicit['settings']['language'] == 'ar'
    assert store.get(explicit['id'])['settings']['language'] == 'ar'


def test_new_projects_use_blue_gradient_without_recoloring_explicit_settings(preview_client, sample):
    from backend.kobo import analyze, palette_color
    _, store, _ = preview_client
    payload = {**sample[0], 'mappings': [], 'policies': {}, 'warnings': [], 'issues': []}
    created = store.create('Blue default', payload, b'form', b'data')
    settings = KoboSettings.model_validate(created['settings'])
    assert all(cfg.palette == 'Blue' for cfg in settings.questions.values())
    results = analyze(store.get(created['id']), settings)['questions']
    assert results
    for result in results:
        assert result['colors']
        assert all(color == palette_color('Blue', key) for key, color in result['colors'].items())
    assert len({color for result in results for color in result['colors'].values()}) > 1
    explicit = KoboSettings(questions={'group/gender': {'palette': 'Jewel', 'colors': {'f': '#ABCDEF'}}})
    saved = store.create('Configured', payload, b'form', b'data', settings=explicit)
    assert saved['settings'] == explicit.model_dump()
    automatic = store.create('Automatic', payload, b'form', b'data', settings=KoboSettings())
    assert automatic['settings']['questions'] == {}
