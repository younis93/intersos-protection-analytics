from backend.test_kobo_edits import saved, apply
from backend.kobo_edits import EditRequest, EditOperation, commit_edit, choices_for


def test_inline_rename_preserves_codes_records_and_undo(saved):
    store, project = saved
    original_records = project['records']
    original_codes = [choice['name'] for choice in project['form']['questions'][0]['choices']]
    changed = apply(store, project, {'kind': 'answers', 'field': 'answer', 'sources': ['a'],
                                    'target': 'a', 'label': 'إجابة جديدة', 'destination': 'same', 'language': 'en'})
    assert changed['records'] == original_records
    assert [choice['name'] for choice in changed['form']['questions'][0]['choices']] == original_codes
    assert next(option for option in choices_for(changed, 'answer', 'en') if option['id'] == 'a')['label'] == 'إجابة جديدة'
    assert store.sources(project['id']) == (b'form', b'source')
    undone = commit_edit(store, project['id'], EditRequest(revision=1, operation=EditOperation(kind='cells')), undo=True)
    assert undone['form']['questions'][0]['choices'] == project['form']['questions'][0]['choices']


def test_single_rename_can_create_a_field_copy_without_changing_the_original(saved):
    store, project = saved
    original = project['form']['questions'][0]
    changed = apply(store, project, {'kind': 'answers', 'field': 'answer', 'sources': ['a'],
                                    'target': 'a', 'label': 'Renamed answer', 'destination': 'new',
                                    'name': 'Renamed field copy', 'language': 'en'})
    assert changed['form']['questions'][0] == original
    copy = next(question for question in changed['form']['questions'] if question.get('derivedFrom') == 'answer')
    assert next(choice for choice in copy['choices'] if choice['name'] == 'a')['labels']['en'] == 'Renamed answer'
    assert all(record['values'][copy['id']] == record['values']['answer'] for record in changed['records'])
