import pytest

from backend.custom_preparation import Preparation, active_preparation, clean_value, PREPARATION_POLICY
from backend.test_custom_analysis import env, stage, confirm
from backend.test_custom_preparation import configure


@pytest.mark.parametrize('kind', ['text','number','date','category','multiple'])
def test_only_relevant_preparation_is_active(kind):
    saved = Preparation(trim=True, collapseSpaces=True, letterCase='upper', missingTokens=['N/A'], numberFormat='comma', currency='EUR', percent=True)
    active = active_preparation(kind, saved)
    for field, value in saved.model_dump().items():
        assert getattr(active, field) == (value if field in PREPARATION_POLICY[kind] else getattr(Preparation(), field))
    assert saved.trim and saved.currency == 'EUR'  # Saved recipe is never rewritten.
    assert clean_value(' N/A ', active) is None


def test_text_date_text_pauses_and_restores_cleaning_without_mutation(env):
    client, store = env
    p=stage(client,b'Value\n 2026-10-25 \n')
    column=p['config']['columns'][0]
    column.update(kind='text',preparation=Preparation(trim=True,letterCase='upper',currency='EUR').model_dump())
    p=configure(client,p)
    assert p['profiles'][0]['preview'][0]['value'] == '2026-10-25'
    p['config']['columns'][0]['kind']='date'
    p=configure(client,p)
    assert p['profiles'][0]['changed'] == 0
    assert p['profiles'][0]['preview'][0]['prepared'] == ' 2026-10-25 '
    assert p['profiles'][0]['preview'][0]['value'] == '2026-10-25'
    assert p['config']['columns'][0]['preparation']['trim']
    saved=confirm(client,p)
    reopened=client.post(f"/api/custom/projects/{saved['id']}/columns").json()
    reopened['config']['columns'][0]['kind']='text'
    reopened=configure(client,reopened)
    assert reopened['profiles'][0]['changed'] == 1
    assert store.get(saved['id'])['customConfig']['columns'][0]['kind'] == 'date'
    assert store.sources(saved['id'])[1] == b'Value\n 2026-10-25 \n'


def test_number_settings_pause_for_text_and_restore_after_backup(env):
    client, store = env
    p=stage(client,b'Amount\n"EUR 1.250,50"\n')
    column=p['config']['columns'][0]
    column.update(kind='text',preparation=Preparation(numberFormat='comma',currency='EUR',percent=True,letterCase='lower').model_dump())
    p=configure(client,p)
    assert p['profiles'][0]['preview'][0]['value'] == 'eur 1.250,50'
    saved=confirm(client,p)
    backup=client.get(f"/api/custom/projects/{saved['id']}/backup")
    restored=client.post('/api/custom/backups/restore',files={'file':('types.zip',backup.content)})
    assert restored.status_code == 200
    p=client.post(f"/api/custom/projects/{restored.json()['id']}/columns").json()
    p['config']['columns'][0]['kind']='number'
    p=configure(client,p)
    assert p['profiles'][0]['preview'][0]['value'] == 1250.5
    assert p['profiles'][0]['changed'] == 0  # Capitalization is paused for numbers.
    assert p['config']['columns'][0]['preparation']['letterCase'] == 'lower'


def test_type_change_invalidates_dependent_calculations_rules_and_duplicates(env):
    client,_=env
    p=stage(client,b'Age,Name\n20,Ali\n20,Ali\n')
    field=p['config']['columns'][0]['id']
    p['config']['calculatedColumns']=[dict(id='calc_total',label='Total',operation='add',left=field,useLiteral=True,literal='1')]
    p['config']['validationRules']=[dict(id='rule_age',label='Age range',kind='number_range',field=field,minimum=0,maximum=100)]
    p['config']['filterFields']=[field]
    p['config']['duplicateReview']['fields']=[field]
    p=configure(client,p)
    group=p['duplicateResult']['groups'][0]
    p['config']['duplicateReview']['decisions'][group['signature']]={'mode':'first'}
    p['config']['columns'][0]['kind']='text'
    p=configure(client,p)
    assert p['duplicateResult']['unresolved'] == 1
    assert p['validationResults'][0]['error']
    assert any(issue['question']=='calc_total' for issue in p['issues'])
    assert p['config']['filterFields']==[field]
    confirm(client,p,422)
