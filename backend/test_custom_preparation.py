import csv
import io

import pytest

from backend.custom_preparation import Preparation, clean_value, prepared_number
from backend.test_custom_analysis import env, stage, confirm


def csv_data(headers, rows):
    out = io.StringIO(newline=''); writer = csv.writer(out); writer.writerow(headers); writer.writerows(rows)
    return out.getvalue().encode()


def configure(client, p):
    response = client.post('/api/custom/columns/'+p['token']+'/configure', json=p['config'])
    assert response.status_code == 200, response.text
    return response.json()


def test_cleaning_is_opt_in_and_preserves_line_breaks():
    original = '  MoSUL   city\nStreet  Two  '
    assert clean_value(original, Preparation()) == original
    assert clean_value(original, Preparation(trim=True, collapseSpaces=True, letterCase='upper')) == 'MOSUL city\nStreet Two'.upper()
    assert clean_value(' n/A ', Preparation(missingTokens=['N/A'])) is None
    assert clean_value('000123', Preparation(trim=True)) == '000123'
    assert clean_value(25, Preparation(letterCase='upper')) == 25


@pytest.mark.parametrize('value,settings,expected', [
    ('1,250.50', {'numberFormat':'dot'}, 1250.5),
    ('1.250,50', {'numberFormat':'comma'}, 1250.5),
    ('USD 1,250.50', {'numberFormat':'dot','currency':'USD'}, 1250.5),
    ('1.250,50 EUR', {'numberFormat':'comma','currency':'EUR'}, 1250.5),
    ('25%', {'percent':True}, .25),
    ('-12,5%', {'numberFormat':'comma','percent':True}, -.125),
    (0.25, {'numberFormat':'comma','percent':True}, .25),
    ('-1,234.50', {'numberFormat':'dot'}, -1234.5),
])
def test_number_formats(value, settings, expected):
    assert prepared_number(value, Preparation(**settings)) == expected


@pytest.mark.parametrize('value,format', [('1,25','dot'), ('1.25','comma'), ('1,23,456','dot'), ('NaN','plain'), ('Infinity','plain'), ('25%','plain')])
def test_invalid_numbers_are_not_silently_reinterpreted(value, format):
    with pytest.raises(ValueError): prepared_number(value, Preparation(numberFormat=format))


def test_cleaning_and_numbers_preview_and_original_sources(env):
    client, store = env
    raw = csv_data(['City','Amount'], [['  mosul   CITY ','EUR 1.250,50'], [' N/A ','EUR 2.000,00']])
    p = stage(client, raw)
    city, amount = p['config']['columns']
    city['preparation'].update(trim=True, collapseSpaces=True, letterCase='upper', missingTokens=['N/A'])
    amount.update(kind='number'); amount['preparation'].update(numberFormat='comma', currency='EUR')
    review = configure(client, p)
    assert review['profiles'][0]['changed'] == 2
    assert review['profiles'][0]['preview'][0]['original'] == '  mosul   CITY '
    assert review['profiles'][0]['preview'][0]['prepared'] == 'MOSUL CITY'
    assert review['profiles'][1]['preview'][0]['value'] == 1250.5
    saved = confirm(client, p)
    assert store.sources(saved['id'])[1] == raw
    values = store.get(saved['id'])['records']
    assert values[0]['values'][city['id']] == 'MOSUL CITY'
    assert values[1]['values'][city['id']] is None


@pytest.mark.parametrize('operation,expected', [('add',12),('subtract',8),('multiply',20),('divide',5),('percentage',500)])
def test_calculation_operations_and_chaining(env, operation, expected):
    client, store = env
    p = stage(client, b'A,B\n10,2\n,2\n')
    a,b = [c['id'] for c in p['config']['columns']]
    p['config']['calculatedColumns'] = [dict(id='calc_first',label='First',operation=operation,left=a,right=b), dict(id='calc_second',label='Double',operation='multiply',left='calc_first',useLiteral=True,literal='2')]
    saved = confirm(client, p)
    records = store.get(saved['id'])['records']
    assert records[0]['values']['calc_first'] == expected
    assert records[0]['values']['calc_second'] == expected*2
    assert records[1]['values']['calc_first'] is None


def test_date_calculations_and_reference_dates(env):
    client, store = env
    p = stage(client, b'Birth,Visit\n2000-10-26,2026-10-25\n2000-10-25,2026-10-25\n')
    a,b = [c['id'] for c in p['config']['columns']]
    p['config']['calculatedColumns'] = [dict(id='calc_age',label='Age',operation='age_years',left=a,right=b), dict(id='calc_days',label='Days',operation='days_between',left=a,useLiteral=True,literal='2000-10-27')]
    saved = confirm(client, p)
    records = store.get(saved['id'])['records']
    assert [r['values']['calc_age'] for r in records] == [25,26]
    assert [r['values']['calc_days'] for r in records] == [1,2]


def test_calculation_errors_and_bad_dependencies(env):
    client, _ = env
    p = stage(client, b'A,B\n10,0\n')
    a,b = [c['id'] for c in p['config']['columns']]
    p['config']['calculatedColumns'] = [dict(id='calc_div',label='Ratio',operation='divide',left=a,right=b)]
    assert configure(client, p)['profiles'][-1]['invalid'] == 1
    confirm(client, p, 422)
    p['config']['calculatedColumns'][0]['invalidAsMissing'] = True
    assert configure(client, p)['issues'] == []
    p['config']['calculatedColumns'][0]['left'] = 'calc_div'  # A cycle cannot be accepted as missing.
    confirm(client, p, 422)


def test_validation_rules_block_errors_and_require_warning_acknowledgment(env):
    client, store = env
    p = stage(client, b'Age,Start,End,Name\n150,2026-10-26,2026-10-25,\n25,2026-10-25,2026-10-26,Ali\n')
    age,start,end,name = [c['id'] for c in p['config']['columns']]
    p['config']['validationRules'] = [
        dict(id='rule_required',label='Name required',kind='required',field=name,severity='warning'),
        dict(id='rule_age',label='Age 0 to 120',kind='number_range',field=age,minimum=0,maximum=120),
        dict(id='rule_order',label='Start before end',kind='date_order',field=start,otherField=end),
    ]
    review = configure(client, p)
    assert [r['matched'] for r in review['validationResults']] == [1,1,1]
    confirm(client, p, 422)
    for r in p['config']['validationRules']: r['severity'] = 'warning'
    review = configure(client, p)
    for r, result in zip(p['config']['validationRules'], review['validationResults']): r['acceptedSignature'] = result['signature']
    assert configure(client, p)['issues'] == []
    saved = confirm(client, p)
    assert len(saved['warnings']) == 3
    assert store.get(saved['id'])['records'][0]['values'][age] == 150  # Rules flag data, never rewrite it.


def test_warning_acknowledgment_expires_for_changed_findings(env):
    client, _ = env
    p = stage(client, b'Age\n150\n')
    p['config']['validationRules'] = [dict(id='rule_age',label='Age range',kind='number_range',field=p['config']['columns'][0]['id'],maximum=120,severity='warning')]
    result = configure(client, p)['validationResults'][0]
    p['config']['validationRules'][0]['acceptedSignature'] = result['signature']
    saved = confirm(client, p)
    replacement = stage(client, b'Age\n150\n200\n', pid=saved['id'])
    assert replacement['validationResults'][0]['matched'] == 2
    assert not replacement['validationResults'][0]['acknowledged']
    confirm(client, replacement, 422)


def test_recipes_calculations_filters_and_rules_survive_backup_and_reupload(env):
    client, store = env
    p = stage(client, csv_data(['Amount'], [['1.250,50']]))
    amount = p['config']['columns'][0]
    amount['kind'] = 'number'; amount['preparation']['numberFormat'] = 'comma'
    p['config']['calculatedColumns'] = [dict(id='calc_total',label='Total',operation='multiply',left=amount['id'],useLiteral=True,literal='2')]
    p['config']['filterFields'] = ['calc_total']
    p['config']['validationRules'] = [dict(id='rule_total',label='Total required',kind='required',field='calc_total')]
    saved = confirm(client, p)
    assert store.get(saved['id'])['records'][0]['values']['calc_total'] == 2501
    backup = client.get('/api/custom/projects/'+saved['id']+'/backup')
    restored = client.post('/api/custom/backups/restore', files={'file':('recipe.zip',backup.content)})
    assert restored.status_code == 200, restored.text
    replacement = stage(client, csv_data(['Amount'], [['2.000,00']]), pid=restored.json()['id'])
    updated = confirm(client, replacement)
    assert store.get(updated['id'])['records'][0]['values']['calc_total'] == 4000
    assert updated['settings']['filterFields'] == ['calc_total']


@pytest.mark.parametrize('mode', ['native', 'binary'])
def test_calculated_columns_are_included_in_excel_preparation(env, tmp_path, mode):
    import openpyxl
    from queue import Queue
    from backend.kobo import KoboSettings, analyze
    from backend.kobo_excel_source import response_layout, query_config
    from backend.kobo_excel_slicers import slicer_specs
    from backend.kobo_excel_prepare import prepare_workbook
    client, store = env
    p = stage(client, b'A,B\n10,2\n')
    a,b = [c['id'] for c in p['config']['columns']]
    p['config']['calculatedColumns'] = [dict(id='calc_product',label='Product',operation='multiply',left=a,right=b)]
    p['config']['filterFields'] = ['calc_product']
    saved = confirm(client, p)
    project = store.get(saved['id']); settings = KoboSettings.model_validate(saved['settings'])
    layouts = response_layout(project, settings)
    config = query_config(project, analyze(project, settings), settings, slicer_specs(project, settings), layouts)
    config['excelMode'] = mode
    target = tmp_path / f'calculated-{mode}.xlsx'
    prepare_workbook(target, layouts, config, settings, Queue())
    book = openpyxl.load_workbook(target, data_only=True)
    try: assert any(20 in row for sheet in book for row in sheet.iter_rows(values_only=True))
    finally: book.close()
