import copy
import pytest
from backend.kobo import KoboFilter, KoboSettings, ProjectStore, analyze
from backend.kobo_geography import GeographyConfig
from backend.kobo_workspace import geography, backup_project, read_backup
from backend.test_kobo import sample


def locations(sample):
    project = copy.deepcopy(sample[0])
    primary = copy.deepcopy(project['form']['questions'][0])
    primary.update(id='loc', name='loc', choices=[{'name':'1','labels':{'en':'Baghdad','ar':'بغداد'}},{'name':'2','labels':{'en':'Baghdad','ar':'بغداد'}}])
    fallback = {**copy.deepcopy(primary),'id':'fallback','name':'fallback','kind':'text','type':'text','choices':[]}
    project['form']['questions'] += [primary, fallback]
    template = project['records'][0]
    project['records'] = [{**copy.deepcopy(template),'id':str(i),'values':{'loc':value,'fallback':other}} for i,(value,other) in enumerate([('1',None),('2',None),('unknown','Erbil'),(None,'السليمانية'),(None,None),('excluded','Baghdad'),('نِينوى',None)])]
    settings = KoboSettings(geographyField='loc',geographyConfigs={'loc':{'fallbackField':'fallback','mappings':{'loc':{'2':'Erbil','excluded':'__exclude__'}}}})
    return project, settings


def test_interpretations_and_reconciled_counts(sample):
    project, settings = locations(sample)
    before = copy.deepcopy(project)
    result = geography(project, settings, 'loc')
    assert (result['mapped'],result['missing'],result['unmapped'],result['excluded']) == (4,1,1,1)
    assert sum(result[k] for k in ['mapped','missing','unmapped','excluded']) == result['total'] == 7
    assert result['fallbackUsed'] == 1 and result['primaryMissing'] == 2
    assert result['governorates'] == {'Baghdad':1,'Erbil':1,'Al-Sulaimaniyah':1,'Ninawa':1}
    duplicate = [r for r in result['reviewValues'] if r['field']=='loc' and r['raw'] in ['1','2']]
    assert duplicate[0]['label'] == duplicate[1]['label'] == 'Baghdad'
    assert duplicate[0]['governorate'] != duplicate[1]['governorate']
    assert next(r for r in result['rows'] if r['raw']=='unknown')['status'] == 'Unmatched'
    assert project == before
    plain = settings.model_copy(update={'geographyConfigs':{}})
    assert analyze(project,settings)['questions'] == analyze(project,plain)['questions']


def test_review_all_values_while_filtered(sample):
    project, settings = locations(sample)
    settings.filters = [KoboFilter(field='loc',kind='category',values=['1'])]
    settings = KoboSettings.model_validate(settings.model_dump())
    result = geography(project,settings,'loc')
    assert result['total'] == result['mapped'] == 1
    assert len([v for v in result['reviewValues'] if v['field']=='loc']) == 6
    assert next(v for v in result['reviewValues'] if v['raw']=='unknown')['filtered'] == 0
    assert next(v for v in result['reviewValues'] if v['raw']=='unknown')['total'] == 1


def test_invalid_or_removed_fallback_and_mapping_warning(sample):
    project, settings = locations(sample)
    project['form']['questions'] = [q for q in project['form']['questions'] if q['id']!='fallback']
    settings.geographyConfigs['loc'].mappings['loc']['old'] = 'Wasit'
    result = geography(project,settings,'loc')
    assert result['missing'] == 2 and result['fallbackUsed'] == 0
    assert any('Fallback' in warning for warning in result['warnings'])
    assert any('old' in warning for warning in result['warnings'])
    assert settings.geographyConfigs['loc'].mappings['loc']['old'] == 'Wasit'
    with pytest.raises(ValueError): GeographyConfig(mappings={'loc':{'foo':'Invented governorate'}})


def test_reupload_and_backup_keep_configs(tmp_path,sample):
    project, settings = locations(sample)
    store = ProjectStore(tmp_path/'geo.sqlite3')
    original = store.create('Map',project,b'form',b'data',settings)
    corrected = copy.deepcopy(project)
    corrected['records'].append({**copy.deepcopy(project['records'][0]),'id':'new','values':{'loc':'New unmatched'}})
    repaired = store.repair(original['id'],corrected,b'new-form',b'new-data')
    assert repaired['settings']['geographyConfigs'] == settings.model_dump()['geographyConfigs']
    result = geography(repaired,KoboSettings.model_validate(repaired['settings']),'loc')
    assert any(v['raw']=='New unmatched' and v['status']=='Unmatched' for v in result['reviewValues'])
    name,payload,restored,form,data=read_backup(backup_project(store,original['id']))
    assert restored.geographyConfigs == settings.geographyConfigs
    assert payload['records'] == corrected['records']
    assert (form,data)==(b'new-form',b'new-data')
