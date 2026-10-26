from copy import deepcopy

import pytest

from backend.kobo import parse_form, parse_data, propose_mapping, normalize
from backend.kobo_review_schema import effective_form, choice_comparison, choice_setting_impacts
from backend.test_kobo_import_links import client_store, form_bytes
from backend.test_kobo import workbook


def preview(client, raw):
    result = client.post('/api/kobo/imports/preview', files={'form': ('form.xlsx', form_bytes()), 'data': ('data.csv', raw)})
    assert result.status_code == 200, result.text
    return result.json()


def added(kind='category', **kwargs):
    return {'id': 'added_status', 'label': 'Status from data', 'kind': kind, 'sheet': 0, 'column': 1,
            'repeat': '', 'choices': [], 'separator': '', **kwargs}


def test_choice_suggestions_scan_full_data_preserve_codes_and_unused_options():
    form = parse_form(form_bytes())
    sheets = parse_data(('gender\n' + '\n'.join(['Female'] * 205 + ['Other'])).encode(), 'data.csv')
    mappings = propose_mapping(form, sheets)[0]
    review = choice_comparison(form, sheets, mappings, 'gender')
    assert review['answers'][0]['count'] == 205
    assert review['answers'][0]['matches'] == ['f']
    assert review['proposedChoices'][0]['name'] == 'f'
    assert review['unusedChoices'] == ['m']
    assert review['proposedChoices'][1]['name'].startswith('data_')
    assert review == choice_comparison(form, sheets, mappings, 'gender')


def test_add_choices_check_save_reopen_refresh_and_original_uploads(client_store):
    client, store = client_store
    raw = b'gender,status\nf,Returnee\nm,IDP\n'
    p = preview(client, raw)
    mappings = p['mappings']
    mappings[1].update(question='added_status', status='matched')
    config = {'excludedQuestionIds': ['age', 'needs', 'new_field'], 'addedQuestions': [added()], 'choiceOverrides': {}}
    body = {'token': p['token'], 'name': 'Reviewed', 'mappings': mappings, 'reviewConfig': config}
    comparison = client.post(f"/api/kobo/imports/{p['token']}/choices", json={**body, 'question': 'added_status'})
    assert comparison.status_code == 200, comparison.text
    result = comparison.json()
    config['choiceOverrides']['added_status'] = {'mode': 'data', 'choices': result['proposedChoices']}
    mappings[1]['answerMap'] = {a['value']: a['suggestedCode'] for a in result['answers']}
    checked = client.post(f"/api/kobo/imports/{p['token']}/check", json=body)
    assert checked.status_code == 200, checked.text
    assert not checked.json()['issues']
    saved = client.post('/api/kobo/imports/confirm', json=body)
    assert saved.status_code == 200, saved.text
    pid = saved.json()['id']
    assert store.sources(pid)[1] == raw
    assert parse_form(store.sources(pid)[0]) == parse_form(form_bytes())
    project = store.get(pid)
    assert project['form']['questions'][-1]['id'] == 'added_status'
    assert saved.json()['form']['questions'][-1]['addedFromData'] is True
    assert 'added_status' in saved.json()['settings']['filterFields']
    analysis = client.post(f'/api/kobo/projects/{pid}/analysis', json={'settings': saved.json()['settings']})
    assert analysis.status_code == 200, analysis.text
    assert any(q['id'] == 'added_status' and q['addedFromData'] and q['denominator'] == 2 for q in analysis.json()['questions'])
    assert project['records'][0]['values']['added_status'] == mappings[1]['answerMap']['Returnee']
    review = client.post(f'/api/kobo/projects/{pid}/review').json()
    assert review['reviewConfig']['addedQuestions'][0]['label'] == 'Status from data'
    assert next(m for m in review['mappings'] if m['header'] == 'status')['question'] == 'added_status'
    client.delete('/api/kobo/imports/' + review['token'])
    # The original column is absent. Retain the definition and show missing data.
    review = client.post(f'/api/kobo/projects/{pid}/review', files={'data': ('new.csv', b'gender\nf\n')})
    assert review.status_code == 200, review.text
    assert 'added_status' in review.json()['linkReview']['noSource']


@pytest.mark.parametrize('kind,raw,expected', [('text', 'hello', 'hello'), ('number', '12.5', 12.5), ('date', '2026-10-22', '2026-10-22T00:00:00')])
def test_added_types_normalize(kind, raw, expected):
    form = parse_form(form_bytes())
    sheets = parse_data(f'value\n{raw}\n'.encode(), 'data.csv')
    effective = effective_form(form, {'addedQuestions': [added(kind, column=0)]}, sheets)
    rows, issues = normalize(effective, sheets, [{'sheet': 0, 'column': 0, 'question': 'added_status', 'status': 'matched', 'option': ''}])
    assert not issues
    assert rows[0]['values']['added_status'] == expected


def test_choice_edits_preserve_translations_and_compare_after_recoding(client_store):
    client, store = client_store
    p = preview(client, b'gender,old_gender\nf,Female\nf,Woman\n')
    maps = p['mappings']
    maps[1].update(question='gender', status='matched', answerMap={'Woman': 'f'}, mergeMode='coalesce')
    maps[0]['mergeMode'] = 'coalesce'
    config = {'excludedQuestionIds': ['age', 'needs', 'new_field'], 'choiceOverrides': {'gender': {'mode': 'custom', 'choices': [
        {'name': 'f', 'labels': {'en': 'Woman', 'ar': 'امرأة'}}, {'name': 'm', 'labels': {'en': 'Man'}}]}}}
    maps[1]['answerMap']['Female'] = 'f'
    body = {'token': p['token'], 'name': 'Edited', 'mappings': maps, 'reviewConfig': config}
    checked = client.post(f"/api/kobo/imports/{p['token']}/check", json=body)
    assert checked.status_code == 200, checked.text
    assert not checked.json()['issues']
    assert not checked.json()['linkReview'].get('conflicts')
    saved = client.post('/api/kobo/imports/confirm', json=body)
    assert saved.status_code == 200, saved.text
    assert saved.json()['form']['questions'][0]['choices'][0]['labels']['ar'] == 'امرأة'


def test_multiple_choice_explicit_separator_and_mapped_atoms(client_store):
    client, store = client_store
    p = preview(client, b'gender,needs\nf,Food|Shelter\n')
    body = {'token': p['token'], 'name': 'Multiple', 'mappings': p['mappings']}
    comparison = client.post(f"/api/kobo/imports/{p['token']}/choices", json={**body, 'question': 'needs', 'separator': '|'})
    assert comparison.status_code == 200, comparison.text
    data = comparison.json()
    assert data['examples'][0]['parts'] == ['Food', 'Shelter']
    body['reviewConfig'] = {'excludedQuestionIds': ['age', 'new_field'], 'choiceOverrides': {'needs': {'mode': 'data', 'choices': data['proposedChoices'], 'separator': '|'}}}
    body['mappings'][1]['answerMap'] = {a['value']: a['suggestedCode'] for a in data['answers']}
    result = client.post('/api/kobo/imports/confirm', json=body)
    assert result.status_code == 200, result.text
    row = store.get(result.json()['id'])['records'][0]['values']['needs']
    assert set(row) == {c['name'] for c in data['proposedChoices']}


def test_invalid_choices_and_filtered_choice_attributes():
    form = parse_form(form_bytes())
    sheets = parse_data(b'gender\nf\n', 'data.csv')
    choices = form['questions'][0]['choices']
    for invalid in [[choices[0], choices[0]], [{'name': 'one', 'labels': {'en': 'Same'}}, {'name': 'two', 'labels': {'en': 'same'}}]]:
        with pytest.raises(ValueError): effective_form(form, {'choiceOverrides': {'gender': {'mode': 'custom', 'choices': invalid}}}, sheets)
    form['questions'][0]['choiceFilter'] = 'region=1'
    form['questions'][0]['choices'][0]['attributes'] = {'region': '1'}
    edited = deepcopy(choices); edited[0]['labels']['en'] = 'Updated'
    result = effective_form(form, {'choiceOverrides': {'gender': {'mode': 'custom', 'choices': edited}}}, sheets)
    assert result['questions'][0]['choices'][0]['attributes'] == {'region': '1'}
    with pytest.raises(ValueError, match='filter'):
        effective_form(form, {'choiceOverrides': {'gender': {'mode': 'data', 'choices': [{'name': 'new', 'labels': {'en': 'New'}}]}}}, sheets)


def test_removed_choices_cannot_keep_stale_answer_maps_even_accept_invalid(client_store):
    client, store = client_store
    p = preview(client, b'gender\nm\n')
    body = {'token': p['token'], 'name': 'Invalid', 'mappings': p['mappings'], 'acceptInvalid': True,
            'reviewConfig': {'excludedQuestionIds': ['age', 'needs', 'new_field'], 'choiceOverrides': {'gender': {'mode': 'custom', 'choices': [{'name': 'f', 'labels': {'en': 'Female'}}]}}}}
    body['mappings'][0]['answerMap'] = {'m': 'm'}
    assert client.post('/api/kobo/imports/confirm', json=body).status_code == 400
    body['mappings'][0]['answerMap'] = {}
    assert client.post('/api/kobo/imports/confirm', json=body).status_code == 400
    body['mappings'][0]['answerMap'] = {'m': ''}
    result = client.post('/api/kobo/imports/confirm', json=body)
    assert result.status_code == 200, result.text
    assert store.get(result.json()['id'])['records'][0]['values']['gender'] is None


def test_replacing_form_retains_added_definitions_and_choice_overrides(client_store):
    client, store = client_store
    p = preview(client, b'gender,status\nf,Returnee\n')
    maps = p['mappings']; maps[1].update(question='added_status', status='matched')
    config = {'excludedQuestionIds': ['age', 'needs', 'new_field'], 'addedQuestions': [added('text')], 'choiceOverrides': {'gender': {'mode': 'custom', 'choices': [{'name': 'f', 'labels': {'en': 'Woman', 'ar': 'امرأة'}}]}}}
    saved = client.post('/api/kobo/imports/confirm', json={'token': p['token'], 'name': 'Saved', 'mappings': maps, 'reviewConfig': config})
    assert saved.status_code == 200, saved.text
    pid = saved.json()['id']; original = store.get(pid)
    review = client.post(f'/api/kobo/projects/{pid}/review', files={'form': ('new.xlsx', form_bytes('3'))})
    assert review.status_code == 200, review.text
    data = review.json()
    assert data['reviewConfig']['choiceOverrides']['gender']['choices'][0]['labels']['ar'] == 'امرأة'
    checked = client.post(f"/api/kobo/imports/{data['token']}/check", json={'mappings': data['mappings'], 'reviewConfig': data['reviewConfig']})
    assert checked.status_code == 200, checked.text
    client.delete('/api/kobo/imports/' + data['token'])
    assert store.get(pid) == original


def test_adding_question_can_change_previously_linked_column_type(client_store):
    client, store = client_store
    p = preview(client, b'gender,age\nf,12\n')
    # Simulate a reused source previously known as numeric.
    first = client.post('/api/kobo/imports/confirm', json={'token': p['token'], 'name': 'Original', 'mappings': p['mappings'], 'reviewConfig': {'excludedQuestionIds': ['needs', 'new_field']}}).json()
    p = client.post(f"/api/kobo/projects/{first['id']}/review").json()
    maps = p['mappings']; maps[1].update(question='added_status', status='matched')
    assert maps[1]['sourceKind'] == 'number'
    result = client.post('/api/kobo/imports/confirm', json={'token': p['token'], 'name': 'Original', 'mappings': maps, 'reviewConfig': {'excludedQuestionIds': ['age', 'needs', 'new_field'], 'addedQuestions': [added('text')]}})
    assert result.status_code == 200, result.text
    assert store.get(first['id'])['records'][0]['values']['added_status'] == '12'


def test_settings_impacts_report_removed_codes():
    form = parse_form(form_bytes()); effective = deepcopy(form)
    effective['questions'][0]['choices'] = [form['questions'][0]['choices'][0]]
    impacts = choice_setting_impacts({'filters': [{'field': 'gender', 'values': ['m']}, {'field': 'other', 'values': ['m']}], 'questions': {'gender': {'colors': {'m': '#abc'}}, 'other': {'colors': {'m': '#abc'}}}}, form, effective)
    assert {i['path'] for i in impacts} == {'settings.filters[0].values[0]', 'settings.questions.gender.colors.m'}


def test_added_repeat_cannot_map_to_main_sheet():
    form = parse_form(workbook({'survey': [['type','name','label'], ['text','name','Name'], ['begin_repeat','members','Members'], ['integer','age','Age'], ['end_repeat','','']]}))
    sheets = parse_data(workbook({'submissions': [['name'], ['A']], 'members': [['age'], [2]]}), 'data.xlsx')
    effective = effective_form(form, {'addedQuestions': [added('number', repeat='members', sheet=1, column=0)]}, sheets)
    with pytest.raises(ValueError, match='repeat'):
        normalize(effective, sheets, [{'sheet': 0, 'column': 0, 'question': 'added_status', 'option': ''}])


def test_new_question_requires_real_source_provenance(client_store):
    client, store = client_store
    p = preview(client, b'gender\nf\n')
    body = {'mappings': p['mappings'], 'reviewConfig': {'addedQuestions': [added('text', column=200)]}}
    result = client.post(f"/api/kobo/imports/{p['token']}/check", json=body)
    assert result.status_code == 400
    assert 'existing source column' in result.text


def test_repair_selects_only_genuinely_new_added_filters_and_preserves_removal(client_store):
    from backend.kobo import KoboSettings
    client, store = client_store
    p = preview(client, b'gender,status\nf,Returnee\n')
    maps = deepcopy(p['mappings']); maps[1].update(question='', status='excluded')
    saved = client.post('/api/kobo/imports/confirm', json={'token':p['token'], 'name':'Before', 'mappings':maps, 'reviewConfig':{'excludedQuestionIds':['age','needs','new_field']}})
    assert saved.status_code == 200, saved.text
    pid = saved.json()['id']
    settings = KoboSettings.model_validate(saved.json()['settings']);settings.filterFields=['gender']
    store.save(pid,settings)
    project=store.get(pid)
    sheets=parse_data(b'gender,status\nf,Returnee\n','data.csv')
    config={'addedQuestions':[added('text')], 'excludedQuestionIds':['age','needs','new_field']}
    form=effective_form(parse_form(form_bytes()),config,sheets)
    maps[1].update(question='added_status', status='matched')
    records,issues=normalize(form,sheets,maps)
    payload={**project,'form':form,'reviewConfig':config,'mappings':maps,'records':records,'issues':issues}
    repaired=store.repair(pid,payload,*store.sources(pid))
    assert repaired['settings']['filterFields']==['gender','added_status']
    settings=KoboSettings.model_validate(repaired['settings']);settings.filterFields=['gender']
    store.save(pid,settings)
    repaired=store.repair(pid,payload,*store.sources(pid))
    assert repaired['settings']['filterFields']==['gender']
