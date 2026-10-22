from copy import deepcopy
import pytest
from backend.kobo import parse_form, parse_data, KoboSettings
from backend.kobo_review_schema import effective_form, ReviewConfig
from backend.test_kobo import workbook
from backend.test_kobo_import_links import client_store


def form_bytes(name='missing'):
    return workbook({'survey': [['type', 'name', 'label'], ['text', 'linked', 'Linked'], ['text', name, 'Question without data']]})


def stage(client, form=None, data=b'linked\nHello\n'):
    response = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form or form_bytes()), 'data': ('data.csv', data)})
    assert response.status_code == 200, response.text
    return response.json()


def body(p, excluded=None):
    return {'token': p['token'], 'name': 'Explicit decisions', 'mappings': p['mappings'], 'reviewConfig': {'excludedQuestionIds': excluded or []}}


def test_default_and_validation():
    assert ReviewConfig().excludedQuestionIds == []
    form = parse_form(form_bytes())
    sheets = parse_data(b'linked\nHello\n', 'data.csv')
    assert effective_form(form, {}, sheets) == form
    for excluded in [['unknown'], ['missing', 'missing']]:
        with pytest.raises(ValueError): effective_form(form, {'excludedQuestionIds': excluded}, sheets)
    edited = effective_form(form, {'excludedQuestionIds': ['missing']}, sheets)
    assert [q['id'] for q in edited['questions']] == ['linked']
    assert len(form['questions']) == 2


def test_require_link_or_ignore_and_reject_active_excluded_mapping(client_store):
    client, _ = client_store
    p = stage(client)
    response = client.post('/api/kobo/imports/confirm', json={**body(p), 'acceptInvalid': True})
    assert response.status_code == 400 and 'explicitly ignore' in response.text
    invalid = body(p, ['linked'])
    response = client.post(f"/api/kobo/imports/{p['token']}/check", json=invalid)
    assert response.status_code == 400 and 'active source' in response.text
    # Moving a column leaves its previous question requiring its own decision.
    moved = body(p, ['linked'])
    moved['mappings'][0]['question'] = 'missing'
    response = client.post('/api/kobo/imports/confirm', json=moved)
    assert response.status_code == 200, response.text


def test_exclusion_save_reopen_restore_and_replacement(client_store):
    client, store = client_store
    p = stage(client)
    payload = body(p, ['missing'])
    checked = client.post(f"/api/kobo/imports/{p['token']}/check", json=payload)
    assert checked.status_code == 200 and not checked.json()['linkReview']['noSource']
    saved = client.post('/api/kobo/imports/confirm', json=payload)
    assert saved.status_code == 200, saved.text
    pid = saved.json()['id']
    assert [q['id'] for q in saved.json()['form']['questions']] == ['linked']
    assert len(store.get(pid)['baseForm']['questions']) == 2
    assert parse_form(store.sources(pid)[0]) == parse_form(form_bytes())
    review = client.post(f'/api/kobo/projects/{pid}/review').json()
    assert review['reviewConfig']['excludedQuestionIds'] == ['missing']
    restore = body(review)
    restored = client.post(f"/api/kobo/imports/{review['token']}/check", json=restore)
    assert restored.status_code == 200 and restored.json()['linkReview']['noSource'] == ['missing']
    assert client.post('/api/kobo/imports/confirm', json=restore).status_code == 400
    client.delete(f"/api/kobo/imports/{review['token']}")
    replacement = client.post(f'/api/kobo/projects/{pid}/review', files={'form': ('new.xlsx', form_bytes('renamed')), 'data': ('data.csv', b'linked\nUpdated\n')})
    assert replacement.status_code == 200, replacement.text
    renewed = replacement.json()
    assert renewed['reviewConfig']['excludedQuestionIds'] == []
    assert 'renamed' in renewed['linkReview']['noSource']
    client.delete(f"/api/kobo/imports/{renewed['token']}")
    removed_form = workbook({'survey': [['type', 'name', 'label'], ['text', 'linked', 'Linked']]})
    removed = client.post(f'/api/kobo/projects/{pid}/review', files={'form': ('new.xlsx', removed_form)}).json()
    assert removed['reviewConfig']['excludedQuestionIds'] == []


def test_preserve_choice_edits_on_restore_and_block_choice_filter_dependencies():
    form = parse_form(form_bytes())
    form['questions'][1].update(kind='category', type='select_one x', choices=[{'name': 'a', 'labels': {'en': 'Original', 'ar': 'أ'}}])
    config = {'excludedQuestionIds': ['missing'], 'choiceOverrides': {'missing': {'mode': 'custom', 'choices': [{'name': 'a', 'labels': {'en': 'Edited', 'ar': 'أ'}}]}}}
    assert len(effective_form(form, config, [])['questions']) == 1
    restored = effective_form(form, {**config, 'excludedQuestionIds': []}, [])
    assert restored['questions'][1]['choices'][0]['labels'] == {'en': 'Edited', 'ar': 'أ'}
    dependent = deepcopy(form)
    dependent['questions'][0]['choiceFilter'] = 'district=${missing}'
    with pytest.raises(ValueError, match='choice filter'): effective_form(dependent, config, [])


def test_exclusion_reports_saved_configuration_dependencies(client_store):
    client, store = client_store
    p = stage(client, data=b'linked,missing\nHello,Value\n')
    saved = client.post('/api/kobo/imports/confirm', json=body(p)).json()
    pid = saved['id']
    project = store.get(pid)
    # Use the existing saved-view validator to identify a missing question.
    settings = project['settings']
    settings['savedViews'] = [{'id': 'view1', 'name': 'Affected view', 'snapshot': {'hidden': [], 'questions': {'missing': {}}}, 'questionKinds': {'linked': 'text', 'missing': 'text'}}]
    store.save(pid, KoboSettings.model_validate(settings))
    review = client.post(f'/api/kobo/projects/{pid}/review').json()
    payload = body(review, ['missing'])
    for m in payload['mappings']:
        if m['question'] == 'missing': m.update(question='', status='excluded')
    checked = client.post(f"/api/kobo/imports/{review['token']}/check", json=payload)
    assert checked.status_code == 200, checked.text
    assert any(item['name'] == 'Affected view' for item in checked.json()['questionImpacts'])
