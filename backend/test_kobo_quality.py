import copy
from backend.kobo import KoboSettings
from backend.kobo_quality import quality_review
from backend.test_kobo import sample
from backend.test_kobo_preview import preview_client


def test_missing_is_a_check_and_review_never_changes_data(sample):
    project = sample[0]; before = copy.deepcopy(project)
    result = quality_review(project, KoboSettings())
    missing = next(c for c in result.checks if c.id == 'missing:group/needs')
    assert missing.severity == 'check' and missing.count == 1 and missing.total == 3
    assert 'skip' in missing.explanation
    assert not any('respondent_name' in c.id for c in result.checks)
    assert result.affected == 1 and project == before


def test_invalid_values_filters_and_pagination(sample):
    project = copy.deepcopy(sample[0]); first = project['records'][0]
    first['values']['group/gender'] = 'unrecognized'
    first['values']['group/age'] = True
    first['values']['group/day'] = '2026-02-30'
    result = quality_review(project, KoboSettings(), check_id='invalid:group/gender', page_size=1)
    assert result.matched == 1 and result.rows[0].answer == 'unrecognized'
    assert next(c for c in result.checks if c.id == 'invalid:group/age').severity == 'correction'
    assert any(c.id == 'invalid:group/day' for c in result.checks)
    assert quality_review(project, KoboSettings(), check_id='invalid:group/gender', page=2, page_size=1).rows == []
    filtered = quality_review(project, KoboSettings(filters=[{'field':'group/gender','values':['m']}]))
    assert filtered.total == 1 and not any(c.id.startswith('invalid:') for c in filtered.checks)
    assert filtered.filterSummary


def test_possible_duplicates_ignore_identity_and_metadata_and_count_unique_records(sample):
    project = copy.deepcopy(sample[0]); first = project['records'][0]
    project['records'].append({**copy.deepcopy(first), 'id':'duplicate','row':100})
    project['records'][-1]['values']['group/respondent_name'] = 'Private different name'
    result = quality_review(project, KoboSettings(), check_id='duplicates')
    assert result.matched == 2 and all('Private' not in row.answer+row.reason for row in result.rows)
    assert next(c for c in result.checks if c.id == 'duplicates').severity == 'check'
    assert result.affected == 3


def test_repeat_links_and_duplicate_entries_are_checked_within_parent(sample):
    project = copy.deepcopy(sample[0]); q = copy.deepcopy(project['form']['questions'][2]); q.update(id='visits/age', repeat='visits')
    project['form']['questions'].append(q); project['form']['groups'].append({'id':'visits','name':'Visits','labels':{},'repeat':True,'parent':''})
    roots = project['records']
    project['records'] += [{'id':f'v{i}','row':10+i,'scope':'visits','parent':parent,'values':{'visits/age':1}} for i,parent in enumerate([roots[0]['id'],roots[1]['id'],'missing'])]
    result = quality_review(project, KoboSettings(), check_id='links')
    assert result.matched == 1 and result.repeats == 3
    assert not any(c.id=='duplicates' for c in result.checks)
    project['records'][-1]['parent'] = 'v2'
    assert 'cycle' in quality_review(project, KoboSettings(), check_id='links').rows[0].reason
    filtered = quality_review(project, KoboSettings(filters=[{'field':'group/gender','values':['f']}]))
    assert any('cyclic' in note for note in filtered.notes)


def test_empty_review_and_api_read_only(preview_client):
    client,store,pid = preview_client; before = store.get(pid)
    settings = KoboSettings(filters=[{'field':'group/gender','values':['absent']}])
    response = client.post(f'/api/kobo/projects/{pid}/quality-review',json={'settings':settings.model_dump()})
    assert response.status_code == 200, response.text
    assert response.json()['total'] == 0 and response.json()['affected'] == 0
    assert response.json()['checks'] == []
    assert store.get(pid) == before
    assert client.post(f'/api/kobo/projects/{pid}/quality-review',json={'settings':settings.model_dump(),'page':0}).status_code == 422
