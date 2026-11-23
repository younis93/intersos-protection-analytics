import pytest

from backend.kobo import KoboSettings, QuestionSettings
from backend.test_kobo_edits import saved, apply
from backend.kobo_edits import EditRequest, EditOperation, commit_edit, choices_for, edit_preview


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
    copied_original = changed['form']['questions'][0]
    assert {key: value for key, value in copied_original.items() if key != 'order'} == {key: value for key, value in original.items() if key != 'order'}
    assert copied_original['order'] == 0
    copy = next(question for question in changed['form']['questions'] if question.get('derivedFrom') == 'answer')
    assert next(choice for choice in copy['choices'] if choice['name'] == 'a')['labels']['en'] == 'Renamed answer'
    assert all(record['values'][copy['id']] == record['values']['answer'] for record in changed['records'])


@pytest.mark.parametrize('destination', ['same', 'new'])
def test_batch_rename_preserves_codes_and_can_be_undone_together(saved, destination):
    store, project = saved
    field = project['form']['questions'][0]
    original_codes = [choice['name'] for choice in field['choices']]
    store.save(project['id'], KoboSettings(questions={
        'answer': QuestionSettings(hiddenAnswers=['a'], colors={'b': '#123456'}),
    }))
    old = store.get(project['id'], raw=True)
    request = EditRequest(revision=0, operation=EditOperation(
        kind='answers', field='answer', destination=destination, name='Renamed field copy',
        renames=[{'id': 'a', 'label': '  Cafe\u0301  '}, {'id': 'b', 'label': 'New B'}],
    ))
    preview = edit_preview(old, request)
    assert [option['id'] for option in preview['options']] == original_codes
    labels = {option['id']: option['label'] for option in preview['options']}
    assert (labels['a'], labels['b']) == ('Café', 'New B')
    assert [option['count'] for option in preview['options']] == [option['count'] for option in preview['beforeOptions']]
    request.signature = preview['signature']
    changed = commit_edit(store, project['id'], request)
    updated = next(q for q in changed['form']['questions'] if q['id'] == preview['field'])
    assert [choice['name'] for choice in updated['choices']] == original_codes
    assert {choice['name']: choice['labels']['en'] for choice in updated['choices']}['a'] == 'Café'
    assert changed['dataEdits']['revision'] == 1
    assert len(changed['dataEdits']['history']) == 1
    if destination == 'same':
        assert changed['records'] == project['records']
        assert preview['affectedRecords'] == 0
    else:
        assert changed['form']['questions'][0] == {**field, 'order': 0}
        assert changed['form']['questions'][1]['id'] == updated['id']
        copied_settings = changed['settings']['questions'][updated['id']]
        assert copied_settings['hiddenAnswers'] == ['a']
        assert copied_settings['colors'] == {'b': '#123456'}
        assert all(r['values'][updated['id']] == r['values']['answer'] for r in changed['records'])
    assert store.sources(project['id']) == (b'form', b'source')
    with pytest.raises(ValueError, match='data changed'):
        commit_edit(store, project['id'], request)
    assert store.get(project['id'], raw=True)['dataEdits']['revision'] == 1
    undo = EditRequest(revision=1, operation=EditOperation(kind='cells'))
    undone = commit_edit(store, project['id'], undo, undo=True)
    assert undone['form']['questions'] == project['form']['questions']
    assert undone['records'] == project['records']


@pytest.mark.parametrize(('second', 'message'), [
    ({'id': 'a', 'label': 'Again'}, 'only once'),
    ({'id': 'unknown', 'label': 'Another'}, 'available answers'),
    ({'id': 'b', 'label': '  '}, 'Enter an answer label'),
    ({'id': 'b', 'label': 'Cafe\u0301'}, 'already used'),
])
def test_invalid_batch_rename_is_atomic(saved, second, message):
    store, project = saved
    before = store.get(project['id'], raw=True)
    request = EditRequest(revision=0, operation=EditOperation(
        kind='answers', field='answer', destination='same',
        renames=[{'id': 'a', 'label': 'Café'}, second],
    ))
    with pytest.raises(ValueError, match=message):
        edit_preview(before, request)
    with pytest.raises(ValueError, match=message):
        commit_edit(store, project['id'], request)
    assert store.get(project['id'], raw=True) == before
