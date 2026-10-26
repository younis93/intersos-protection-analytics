import io

import openpyxl
import pytest
from pydantic import ValidationError

from backend.kobo import KoboFilter, KoboSettings, AnalysisViewSettings, SavedAnalysisView, matches, filter_rule_summary
from backend.kobo_saved_views import apply_saved_view
from backend.kobo_indicators import filter_descriptions
from backend.test_custom_analysis import env, stage, confirm


@pytest.mark.parametrize('month', ['2026-00', '2026-13', '2026-2', '0000-01', '26-02', '2026-02-01'])
def test_reject_invalid_months(month):
    with pytest.raises(ValidationError): KoboFilter(field='date', kind='date', months=[month])


def test_date_month_membership_and_inclusive_intersection():
    rule = KoboFilter(field='date', kind='date', months=['2026-02', '2026-04'], minimum='2026-02-15', maximum='2026-04-20')
    assert matches('2026-02-15', rule) and matches('2026-04-20', rule)
    for value in ['2026-02-14', '2026-03-01', '2026-04-21', '2026-02-30', None, '', 'bad']:
        assert not matches(value, rule)
    assert matches('2024-02-29', KoboFilter(field='date', kind='date', months=['2024-02']))
    assert not matches('2025-02-29', KoboFilter(field='date', kind='date', months=['2025-02']))
    assert matches('2025-12-31', KoboFilter(field='date', kind='date', months=[]))
    with pytest.raises(ValidationError): KoboFilter(field='number', kind='number', months=['2026-02'])


def setup_project(client):
    p = stage(client, b'Date,Other,Amount\n2026-02-01,2025-12-31,1\n2026-02-15,2026-01-01,2\n2026-03-10,2026-02-01,3\n2026-04-20,2026-02-01,4\n,,5\n')
    fields = [c['id'] for c in p['config']['columns']]
    p['config']['filterFields'] = fields[:2]
    p['config']['dateFilterModes'] = {fields[0]: 'both', fields[1]: 'month'}
    return confirm(client, p), fields


def test_months_apply_to_analysis_data_exports_insights_and_saved_views(env):
    client, store = env
    project, (day, other, amount) = setup_project(client)
    url = '/api/custom/projects/' + project['id']
    settings = project['settings']
    assert settings['dateFilterModes'] == {day: 'both', other: 'month'}
    settings['filters'] = [{'field': day, 'kind': 'date', 'months': ['2026-02', '2026-04'], 'minimum': '2026-02-15', 'maximum': '2026-04-20'}]
    assert client.put(url+'/settings', json=settings).status_code == 200
    body = {'settings': settings}
    analysis = client.post(url+'/analysis', json=body).json()
    assert analysis['filtered'] == 2
    assert 'Months: 2026-04, 2026-02' in analysis['filterSummary'][0]
    data = client.post(url+'/data', json={**body, 'columns': [day, amount]}).json()
    assert len(data['rows']) == 2
    export = client.post(url+'/data/export', json={**body, 'columns': [day, amount]})
    assert export.status_code == 200
    book = openpyxl.load_workbook(io.BytesIO(export.content), data_only=True)
    assert book.active.max_row == 3
    typed = KoboSettings.model_validate(settings)
    assert filter_descriptions(store.get(project['id']), typed) == analysis['filterSummary']
    indicator = {'id': 'total', 'name': 'Total', 'mode': 'numeric_sum', 'questions': [{'question': amount, 'kind': 'number'}]}
    insight = client.post(url+'/indicators/preview', json={**body, 'indicator': indicator})
    assert insight.status_code == 200, insight.text
    assert insight.json()['complete'] == 2 and insight.json()['value'] == 6
    view = SavedAnalysisView(id='months', name='Months', snapshot=AnalysisViewSettings.model_validate(settings))
    typed.savedViews = [view]
    applied = apply_saved_view(store.get(project['id']), typed, 'months')
    assert applied.dateFilterModes == typed.dateFilterModes and applied.filters == typed.filters
    assert client.put(url+'/settings', json=typed.model_dump()).status_code == 200
    package = client.post(url+'/settings/export', json=typed.model_dump()).json()
    imported = client.post(url+'/settings/import-preview', json={'settings': typed.model_dump(), 'package': package}).json()['settings']
    assert imported['dateFilterModes'] == typed.dateFilterModes
    assert imported['savedViews'][0]['snapshot']['filters'][0]['months'] == typed.filters[0].months
    settings['filters'].append({'field': other, 'kind': 'date', 'months': ['2026-01']})
    assert client.post(url+'/analysis', json={'settings': settings}).json()['filtered'] == 1
    settings['filters'][0]['months'] = ['2027-01']
    assert client.post(url+'/analysis', json={'settings': settings}).json()['filtered'] == 0


def test_current_modes_reopen_backup_reupload_and_clear_hidden_constraints(env):
    client, store = env
    project, (day, other, amount) = setup_project(client)
    url = '/api/custom/projects/' + project['id']
    settings = project['settings']
    settings['dateFilterModes'][day] = 'month'
    settings['filters'] = [{'field': day, 'kind': 'date', 'months': ['2026-02']}]
    assert client.put(url+'/settings', json=settings).status_code == 200
    edit = client.post(url+'/columns').json()
    assert edit['config']['dateFilterModes'][day] == 'month'
    edit['config']['dateFilterModes'][day] = 'range'
    updated = confirm(client, edit)
    assert updated['settings']['filters'] == []
    backup = client.get(url+'/backup')
    restored = client.post('/api/custom/backups/restore', files={'file': ('backup.zip', backup.content)}).json()
    assert restored['settings']['dateFilterModes'] == updated['settings']['dateFilterModes']
    replacement = stage(client, b'Date,Other,Amount\n2026-02-15,2026-01-01,9\n', pid=project['id'])
    assert replacement['config']['dateFilterModes'] == updated['settings']['dateFilterModes']
    assert replacement['reuse']['eligible']
    reused = client.post('/api/custom/columns/confirm', json={'token': replacement['token'], 'name': project['name'], 'config': replacement['config'], 'reuseOnly': True})
    assert reused.status_code == 200, reused.text
    assert reused.json()['settings']['dateFilterModes'] == updated['settings']['dateFilterModes']
    edit = client.post(url+'/columns').json()
    edit['config']['columns'][0]['kind'] = 'text'
    edit['config']['dateFilterModes'].pop(day)
    changed = confirm(client, edit)
    assert day not in changed['settings']['dateFilterModes']


def test_month_summary_without_range():
    assert filter_rule_summary(KoboFilter(field='d', kind='date', months=['2026-02'])) == 'Months: 2026-02'
