
import pytest

from backend.test_custom_analysis import env, stage, confirm
from backend.test_custom_preparation import configure, csv_data


def matching(client, p, indices=(0,)):
    p['config']['duplicateReview']['fields'] = [p['config']['columns'][i]['id'] for i in indices]
    return configure(client, p)


@pytest.mark.parametrize('mode,rows,expected', [('all', [], [2,3,4]), ('first', [], [2,4]), ('last', [], [3,4]), ('custom', [3], [3,4]), ('custom', [], [4])])
def test_explicit_decisions_and_original_source(env, mode, rows, expected):
    client, store = env
    raw = csv_data(['ID','City'], [['001','Mosul'],['001','Baghdad'],['002','Erbil']])
    p = stage(client, raw)
    assert p['duplicateResult']['groups'] == []
    p = matching(client, p)
    assert p['duplicateResult']['unresolved'] == 1
    confirm(client, p, 422)
    group = p['duplicateResult']['groups'][0]
    assert group['records'][0]['original'] == ['001','Mosul']
    p['config']['duplicateReview']['decisions'][group['signature']] = {'mode': mode, 'rows': rows}
    p = configure(client, p)
    assert not p['issues']
    saved = confirm(client, p)
    assert [r['row'] for r in store.get(saved['id'])['records']] == expected
    assert store.sources(saved['id'])[1] == raw
    reopened = client.post(f"/api/custom/projects/{saved['id']}/columns").json()
    assert reopened['duplicateResult']['unresolved'] == 0
    assert reopened['duplicateResult']['included'] == len(expected)


def test_composite_keys_cleaning_missing_and_arabic(env):
    client, _ = env
    p = stage(client, csv_data(['Name','Date'], [[' علي ','2026-10-25'],['علي','2026-10-25'],['علي','2026-10-26'],['','2026-10-25'],['','2026-10-25']]))
    p['config']['columns'][0]['preparation']['trim'] = True
    p = matching(client, p, (0,1))
    assert len(p['duplicateResult']['groups']) == 1
    assert p['duplicateResult']['groups'][0]['values'] == ['علي','2026-10-25']
    assert p['duplicateResult']['skipped'] == 2


def test_stale_and_tampered_decisions_and_clear(env):
    client, _ = env
    p = matching(client, stage(client, b'ID,Amount\n001,2\n001,3\n'))
    group = p['duplicateResult']['groups'][0]
    p['config']['duplicateReview']['decisions'][group['signature']] = {'mode':'custom','rows':[999]}
    assert configure(client,p)['duplicateResult']['unresolved'] == 1
    p['config']['duplicateReview']['decisions'][group['signature']] = {'mode':'first'}
    saved = confirm(client, p)
    replacement = stage(client, b'ID,Amount\n001,2\n001,4\n', pid=saved['id'])
    assert replacement['duplicateResult']['unresolved'] == 1
    assert replacement['duplicateResult']['excluded'] == 0
    replacement['config']['duplicateReview']['fields'] = []
    replacement = configure(client, replacement)
    assert replacement['duplicateResult']['included'] == 2
    assert not replacement['issues']


def test_unknown_excluded_columns_and_zero_records_block(env):
    client, _ = env
    p = matching(client, stage(client, b'ID,Amount\n001,2\n001,3\n'))
    group = p['duplicateResult']['groups'][0]
    p['config']['duplicateReview']['decisions'][group['signature']] = {'mode':'custom','rows':[]}
    p = configure(client,p)
    assert any('at least one record' in issue['message'] for issue in p['issues'])
    p['config']['columns'][0]['included'] = False
    p = configure(client,p)
    assert p['duplicateResult']['error']
    confirm(client,p,422)


def test_validation_runs_on_retained_records(env):
    client, _ = env
    p = matching(client, stage(client, b'ID,Age\n001,25\n001,999\n'))
    group = p['duplicateResult']['groups'][0]
    p['config']['duplicateReview']['decisions'][group['signature']] = {'mode':'first'}
    p['config']['validationRules'] = [{'id':'rule_age','label':'Age range','kind':'number_range','field':p['config']['columns'][1]['id'],'minimum':0,'maximum':120}]
    p = configure(client,p)
    assert p['validationResults'][0]['matched'] == 0
    assert not p['issues']


def test_calculated_key_and_changed_cleaning_reset_decision(env):
    client, _ = env
    p = stage(client,b'Count,Name\n2,A\n2,a\n')
    p['config']['calculatedColumns'] = [{'id':'calc_key','label':'Key','operation':'multiply','left':p['config']['columns'][0]['id'],'useLiteral':True,'literal':'2'}]
    p['config']['duplicateReview']['fields'] = ['calc_key']
    p = configure(client,p)
    group=p['duplicateResult']['groups'][0]
    p['config']['duplicateReview']['decisions'][group['signature']]={'mode':'last'}
    p['config']['columns'][1]['preparation']['letterCase']='lower'
    assert configure(client,p)['duplicateResult']['unresolved'] == 1


def test_excel_native_dates_match_and_leading_zero_ids_stay_distinct(env):
    import io
    from datetime import datetime
    import openpyxl
    client, _ = env
    book=openpyxl.Workbook();sheet=book.active
    sheet.append(['ID','Date']);sheet.append(['001',datetime(2026,10,25)]);sheet.append(['001',datetime(2026,10,25)]);sheet.append(['1',datetime(2026,10,25)])
    buffer=io.BytesIO();book.save(buffer)
    p=matching(client,stage(client,buffer.getvalue(),'data.xlsx'),(0,1))
    assert len(p['duplicateResult']['groups']) == 1
    assert len(p['duplicateResult']['groups'][0]['records']) == 2


def test_backup_restore_retains_duplicate_choices(env):
    client, store = env
    p=matching(client,stage(client,b'ID,Amount\n001,2\n001,3\n'))
    group=p['duplicateResult']['groups'][0]
    p['config']['duplicateReview']['decisions'][group['signature']]={'mode':'last'}
    saved=confirm(client,p)
    backup=client.get('/api/custom/projects/'+saved['id']+'/backup')
    restored=client.post('/api/custom/backups/restore',files={'file':('duplicates.zip',backup.content)})
    assert restored.status_code == 200, restored.text
    restored_id=restored.json()['id']
    assert [r['row'] for r in store.get(restored_id)['records']] == [3]
    reopened=client.post(f'/api/custom/projects/{restored_id}/columns').json()
    assert reopened['duplicateResult']['unresolved'] == 0
    assert reopened['duplicateResult']['groups'][0]['mode'] == 'last'
