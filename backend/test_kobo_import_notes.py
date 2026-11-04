from copy import deepcopy

from backend.kobo import ProjectStore
from backend.kobo_import_notes import note_key, refresh_notes
from backend.kobo_workspace import backup_project, read_backup
from backend.test_kobo import workbook
from backend.test_kobo_import_links import client_store
from backend.test_update_helpers import skip_comparison


def stage(client, data=b'district,other\nShared,Hello\n'):
    form = workbook({
        'survey': [['type', 'name', 'label', 'choice_filter'], ['text', 'status', 'Status', ''],
                   ['select_one districts', 'district', 'District', 'status=${status}'], ['text', 'other', 'Other', '']],
        'choices': [['list_name', 'name', 'label', 'status'], ['districts', 'a', 'Shared', 'one'], ['districts', 'b', 'Shared', 'two']],
        'settings': [['version'], ['1']],
    })
    response = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form), 'data': ('data.csv', data)})
    assert response.status_code == 200, response.text
    preview = response.json()
    body = {'token': preview['token'], 'name': 'Notes', 'mappings': preview['mappings'],
            'reviewConfig': {'excludedQuestionIds': ['status']}, 'acceptInvalid': True}
    return preview, body


def check(client, body):
    response = client.post(f"/api/kobo/imports/{body['token']}/check", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def confirm(client, body):
    response = client.post('/api/kobo/imports/confirm', json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_live_exclusion_restoration_and_single_dependency_warning(client_store):
    client, _ = client_store
    preview, body = stage(client)
    checked = check(client, body)
    assert len(checked['warnings']) == 1
    assert len(checked['importNotes']) == 2
    assert checked['importNotes'][0]['question'] == 'district'
    body['reviewConfig']['excludedQuestionIds'].append('district')
    body['mappings'][0].update(question='', status='excluded')
    assert not check(client, body)['importNotes']
    body['reviewConfig']['excludedQuestionIds'].remove('district')
    body['mappings'][0] = preview['mappings'][0]
    # Restore the source link after its explicit exclusion.
    body['mappings'][0].update(question='district', status='matched')
    assert len(check(client, body)['importNotes']) == 2


def test_acceptance_persists_reopen_review_and_backup(client_store):
    client, store = client_store
    _, body = stage(client)
    checked = check(client, body)
    body['reviewedImportNotes'] = [note_key(n) for n in checked['importNotes'] if n['kind'] == 'warning']
    saved = confirm(client, body)
    assert all(n['reviewed'] for n in saved['importNotes'])
    reopened = ProjectStore(store.path).get(saved['id'])
    assert all(n['reviewed'] for n in reopened['importNotes'])
    preview = client.post(f"/api/kobo/projects/{saved['id']}/review").json()
    assert all(n['reviewed'] for n in preview['importNotes'])
    checked = check(client, {**body, 'token': preview['token'], 'mappings': preview['mappings'], 'reviewConfig': preview['reviewConfig']})
    assert all(n['reviewed'] for n in checked['importNotes'])
    name, payload, settings, form_raw, data_raw = read_backup(backup_project(store, saved['id']))
    restored = store.create(name, payload, form_raw, data_raw, settings)
    assert all(n['reviewed'] for n in restored['importNotes'])


def test_review_existing_notes_and_stale_keys(client_store):
    client, store = client_store
    _, body = stage(client)
    saved = confirm(client, body)  # Invalid answers accepted; warning still needs review.
    pending = [n for n in saved['importNotes'] if not n['reviewed']]
    assert len(pending) == 1
    response = client.post(f"/api/kobo/projects/{saved['id']}/import-notes/review", json={'reviewedImportNotes': [note_key(n) for n in pending]})
    assert response.status_code == 200, response.text
    assert all(n['reviewed'] for n in response.json()['importNotes'])
    before = store.get(saved['id'], raw=True)
    response = client.post(f"/api/kobo/projects/{saved['id']}/import-notes/review", json={'reviewedImportNotes': ['stale:key']})
    assert response.status_code == 409
    assert store.get(saved['id'], raw=True) == before


def test_relevant_source_changes_reopen_but_unrelated_values_do_not(client_store):
    client, _ = client_store
    _, body = stage(client)
    checked = check(client, body)
    body['reviewedImportNotes'] = [note_key(n) for n in checked['importNotes']]
    saved = confirm(client, body)
    for raw, expected in [(b'district,other\nShared,Different\n', True), (b'district,other\nUnknown,Hello\n', False)]:
        response = client.post(f"/api/kobo/projects/{saved['id']}/review", files={'data': ('data.csv', raw)})
        assert response.status_code == 200, response.text
        preview = response.json()
        assert preview['importNotes']
        assert all(n['reviewed'] == expected for n in preview['importNotes'])
        client.delete(f"/api/kobo/imports/{preview['token']}")


def test_cancel_failed_confirm_and_display_settings_do_not_change_acceptance(client_store):
    client, store = client_store
    _, body = stage(client)
    saved = confirm(client, body)
    before = store.get(saved['id'])
    preview = client.post(f"/api/kobo/projects/{saved['id']}/review").json()
    keys = [note_key(n) for n in preview['importNotes']]
    failed = client.post('/api/kobo/imports/confirm', json={**body, 'token': preview['token'], 'acceptInvalid': False, 'reviewedImportNotes': keys})
    assert failed.status_code == 422
    assert store.get(saved['id']) == before
    client.delete(f"/api/kobo/imports/{preview['token']}")
    settings = deepcopy(saved['settings'])
    settings['language'] = 'ar'
    response = client.put(f"/api/kobo/projects/{saved['id']}/settings", json=settings)
    assert response.status_code == 200
    assert store.get(saved['id'])['importNotes'] == before['importNotes']


def test_missing_source_warning_removed_after_ignoring_owner(client_store):
    client, _ = client_store
    _, body = stage(client, b'status,district,other\none,a,Hello\n')
    body['reviewConfig']['excludedQuestionIds'] = []
    saved = confirm(client, body)
    preview = client.post(f"/api/kobo/projects/{saved['id']}/review", files={'data': ('data.csv', b'district,other\na,Hello\n')}).json()
    assert any('Saved source column status is absent' in w for w in preview['warnings'])
    request = {**body, 'token': preview['token'], 'mappings': preview['mappings'], 'reviewConfig': {'excludedQuestionIds': ['status']}}
    checked = check(client, request)
    assert not any('Saved source column status is absent' in w for w in checked['warnings'])
    assert sum('choice filter depends' in w for w in checked['warnings']) == 1
    request['matching'] = skip_comparison(client, 'kobo', preview['token'], request)
    saved = confirm(client, request)
    assert not any('Saved source column status is absent' in w for w in saved['warnings'])


def test_legacy_project_gets_explicit_review_without_assuming_history(client_store):
    client, store = client_store
    _, body = stage(client)
    saved = confirm(client, body)
    import json
    with store.connect() as db:
        row = db.execute('SELECT payload FROM projects WHERE id=?', (saved['id'],)).fetchone()
        payload = json.loads(row[0])
        for key in ['importNotes', 'reviewedImportNotes', 'noteSourceContexts']:
            payload.pop(key, None)
        db.execute('UPDATE projects SET payload=? WHERE id=?', (json.dumps(payload), saved['id']))
    legacy = client.get(f"/api/kobo/projects/{saved['id']}").json()
    assert all(not n['reviewed'] for n in legacy['importNotes'])
    marked = client.post(f"/api/kobo/projects/{saved['id']}/import-notes/review", json={'reviewedImportNotes': [note_key(n) for n in legacy['importNotes']]})
    assert marked.status_code == 200, marked.text
    assert all(n['reviewed'] for n in marked.json()['importNotes'])


def test_local_changes_invalidate_relevant_review(client_store):
    client, store = client_store
    _, body = stage(client)
    saved = confirm(client, body)
    payload = deepcopy(store.get(saved['id'], raw=True))
    refresh_notes(payload)
    issue = next(n for n in payload['importNotes'] if n['kind'] == 'issue')
    assert issue['reviewed']
    payload['records'][0]['values']['other'] = 'Changed'
    assert next(n for n in refresh_notes(payload) if n['kind'] == 'issue')['reviewed']
    payload['records'][0]['values']['district'] = 'a'
    assert not next(n for n in refresh_notes(payload) if n['kind'] == 'issue')['reviewed']


def test_legacy_missing_source_and_ignored_column_notes_are_obsolete():
    payload = {'baseForm': {'questions': [{'id': 'status', 'name': 'status', 'labels': {'en': 'Current status'}}]},
               'form': {'questions': []}, 'reviewConfig': {'excludedQuestionIds': ['status']},
               'mappings': [{'header': 'Old field', 'status': 'excluded'}],
               'warnings': ['Saved source column current status is absent from the replacement data. Its previous link was not applied.',
                            'Saved link for Old field could not be reused safely.',
                            'Old field: unsupported type mystery; retained in source only.']}
    assert refresh_notes(payload) == []


def test_note_acknowledgment_with_pending_connection_does_not_change_data(client_store):
    import io
    from openpyxl import load_workbook
    client,store=client_store
    _,body=stage(client);saved=confirm(client,body);pid=saved['id']
    source=store.sources(pid)[0];book=load_workbook(io.BytesIO(source))
    book['survey'].cell(1,5,'relevant')
    for row in book['survey'].iter_rows(min_row=2):
        if row[1].value=='district':book['survey'].cell(row[0].row,5,"${other} = 'Hello'")
    output=io.BytesIO();book.save(output)
    with store.connect() as db:db.execute('UPDATE projects SET form=? WHERE id=?',(output.getvalue(),pid))
    current=store.get(pid)
    assert next(q for q in current['form']['questions'] if q['id']=='district')['connectionSetup']['pending']
    before=deepcopy(current)
    response=client.post(f'/api/kobo/projects/{pid}/import-notes/review',json={'reviewedImportNotes':[note_key(n) for n in current['importNotes'] if not n['reviewed']]})
    assert response.status_code==200,response.text
    after=store.get(pid)
    assert all(n['reviewed'] for n in after['importNotes'])
    assert after['records']==before['records']
    assert after['settings']==before['settings']
    assert after.get('dataEdits')==before.get('dataEdits')
    assert after.get('conditionalReview')==before.get('conditionalReview')
    assert next(q for q in after['form']['questions'] if q['id']=='district')['connectionSetup']['pending']


def test_grouped_review_keeps_import_notes_out_of_coverage_duplicates(client_store):
    client,store=client_store
    _,body=stage(client);saved=confirm(client,body);pid=saved['id']
    query={'settings':saved['settings']}
    from backend.kobo import KoboSettings
    from backend.kobo_quality import quality_review
    legacy=quality_review(store.get(pid),KoboSettings.model_validate(saved['settings']))
    assert any(n.startswith('Saved import note (whole import, not filter-scoped):') for n in legacy.notes)
    result=client.post(f'/api/kobo/projects/{pid}/data-review',json=query)
    assert result.status_code==200,result.text
    assert not any(n.startswith('Saved import note (whole import, not filter-scoped):') for n in result.json()['notes'])
    assert any('normalized responses' in n for n in result.json()['notes'])
    assert saved['importNotes']
