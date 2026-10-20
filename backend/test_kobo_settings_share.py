from copy import deepcopy

import pytest

from backend.kobo import KoboSettings, analyze
from backend.kobo_settings_share import SettingsFile, export_settings, preview_settings
from backend.test_kobo import sample
from backend.test_kobo_preview import preview_client


def configuration():
    return KoboSettings(language='ar', percentageDecimals=1, filterFields=['group/gender', 'group/age'], hidden=['group/day'],
        filters=[{'field': 'group/gender', 'values': ['f']}], excelGroups=['group'], hideZero=True,
        questions={'group/needs': {'chart': 'column', 'breakdowns': ['group/gender'], 'colors': {'water': '#123456'}}})


def test_round_trip_current_settings_without_data_and_apply(preview_client):
    client, store, pid = preview_client
    before = store.get(pid)
    config = configuration().model_dump()
    package = client.post(f'/api/kobo/projects/{pid}/settings/export', json=config).json()
    assert set(package) == {'format', 'version', 'settings', 'questions', 'groups'}
    assert all(set(q) == {'id', 'name', 'type', 'kind', 'repeat', 'choices'} for q in package['questions'])
    assert package['settings'] == config  # includes unsaved edits, not the stored defaults
    response = client.post(f'/api/kobo/projects/{pid}/settings/import-preview', json={'settings': before['settings'], 'package': package})
    assert response.status_code == 200, response.text
    review = response.json()
    assert not review['skipped'] and not review['warnings']
    assert review['settings'] == config
    assert store.get(pid) == before  # preview and cancellation never save
    assert client.put(f'/api/kobo/projects/{pid}/settings', json=review['settings']).status_code == 200
    assert store.get(pid)['settings'] == config
    assert store.get(pid)['records'] == before['records']
    assert store.sources(pid) == (b'form', b'data')
    assert client.get(f'/api/kobo/projects/{pid}').json()['settings']['excelGroups'] == ['group']


def test_unique_names_remap_references_and_keep_unmatched_settings(sample):
    project = deepcopy(sample[0]); package = export_settings(project, configuration())
    for q in project['form']['questions']:
        q['id'] = 'new/' + q['name']; q['labels'] = {'en': 'Changed label'}
    project['form']['questions'].append({**project['form']['questions'][0], 'id': 'only-here', 'name': 'extra'})
    for r in project['records']:
        r['values'] = {'new/' + k.split('/')[-1]: v for k, v in r['values'].items()}
    current = KoboSettings(hidden=['only-here'], questions={'only-here': {'chart': 'pie'}, 'new/age': {'bins': 20}})
    review = preview_settings(project, current, package)
    cfg = review['settings']
    assert cfg['filters'][0]['field'] == 'new/gender'
    assert cfg['questions']['new/needs']['breakdowns'] == ['new/gender']
    assert cfg['questions']['only-here']['chart'] == 'pie'
    assert 'new/age' not in cfg['questions']  # matched default replaces prior customization
    assert cfg['hidden'] == ['only-here', 'new/day']
    assert not review['warnings']
    analyze(project, KoboSettings.model_validate(cfg))


def test_skips_ambiguous_incompatible_choices_and_breakdowns(sample):
    project = deepcopy(sample[0]); package = export_settings(project, configuration())
    gender = next(q for q in project['form']['questions'] if q['name'] == 'gender')
    gender['choices'] = [c for c in gender['choices'] if c['name'] != 'f']
    age = next(q for q in project['form']['questions'] if q['name'] == 'age')
    age['type'] = 'text'; age['kind'] = 'text'
    needs = next(q for q in project['form']['questions'] if q['name'] == 'needs')
    needs['id'] = 'renamed/needs'
    project['form']['questions'].append({**needs, 'id': 'duplicate/needs'})
    result = preview_settings(project, KoboSettings(), package)
    assert result['settings']['filters'] == []
    assert {'group/age', 'group/needs'} <= set(result['skipped'])
    assert result['warnings']


def test_ranges_repeat_context_and_missing_references(sample):
    project = deepcopy(sample[0]); settings = configuration()
    settings.filters = KoboSettings(filters=[{'field': 'group/age', 'kind': 'number', 'minimum': 0, 'maximum': 20},
        {'field': 'group/day', 'kind': 'date', 'minimum': '2026-01-01'}]).filters
    package = export_settings(project, settings)
    result = preview_settings(project, KoboSettings(), package)
    assert result['settings']['filters'] == settings.model_dump()['filters']
    project['form']['questions'][0]['repeat'] = 'unrelated-repeat'
    result = preview_settings(project, KoboSettings(), package)
    assert project['form']['questions'][0]['id'] in result['skipped']
    package.settings.questions['group/needs'].breakdowns = ['missing', 'group/age']
    package.settings.excelGroups = ['missing']
    result = preview_settings(project, KoboSettings(), package)
    assert result['settings']['questions']['group/needs']['breakdowns'] == []
    assert result['settings']['excelGroups'] == []
    assert len(result['warnings']) >= 3


def test_preserves_blank_text_filters_and_series_color_overrides(sample):
    project = sample[0]; settings = configuration()
    settings.filters = KoboSettings(filters=[{'field': 'group/gender', 'values': ['__blank__']},
        {'field': 'group/respondent_name', 'values': ['A', 'unavailable']}]).filters
    settings.questions['group/needs'].colors = {'f': '#123456', 'series': '#123456', '__blank__': '#123456', 'water': '#123456', 'obsolete': '#123456'}
    result = preview_settings(project, KoboSettings(), export_settings(project, settings))
    assert result['settings']['filters'][0]['values'] == ['__blank__']
    assert result['settings']['filters'][1]['values'] == ['A']
    assert set(result['settings']['questions']['group/needs']['colors']) == {'f', 'series', '__blank__', 'water'}


def test_saved_excel_groups_are_used_by_export_endpoint(preview_client, monkeypatch):
    from backend.kobo_excel import jobs
    client, _, pid = preview_client; captured = []
    monkeypatch.setattr(jobs, 'start', lambda *args, **kwargs: captured.append(kwargs['separate_groups']) or {'id': 'job', 'state': 'queued', 'progress': 0, 'message': 'Queued'})
    for explicit, expected in [(None, ['group']), ([], [])]:
        body = {'settings': configuration().model_dump()}
        if explicit is not None: body['separateGroups'] = explicit
        response = client.post(f'/api/kobo/projects/{pid}/exports', json=body)
        assert response.status_code == 200, response.text
        assert captured[-1] == expected


@pytest.mark.parametrize('mutation', ['version', 'format', 'duplicate', 'settings-version', 'color', 'bounds'])
def test_rejects_invalid_packages_without_saving(preview_client, mutation):
    client, store, pid = preview_client; before = store.get(pid)
    package = export_settings(before, configuration()).model_dump()
    if mutation == 'version': package['version'] = 2
    elif mutation == 'format': package['format'] = 'other'
    elif mutation == 'duplicate': package['questions'].append(package['questions'][0])
    elif mutation == 'settings-version': package['settings']['version'] = 2
    elif mutation == 'color': package['settings']['questions']['group/needs']['colors'] = {'water': 'bad'}
    else: package['settings']['filters'] = [{'field': 'group/age', 'kind': 'number', 'minimum': 10, 'maximum': 1}]
    response = client.post(f'/api/kobo/projects/{pid}/settings/import-preview', json={'settings': before['settings'], 'package': package})
    assert response.status_code in {400, 422}
    assert store.get(pid) == before
