import copy
import json

import pytest
from pydantic import ValidationError

from backend.kobo import KoboSettings, QuestionSettings, analyze
from backend.kobo_settings_share import export_settings, preview_settings
from backend.test_kobo import sample
from backend.test_kobo_preview import preview_client


def key(fields, column, answer):
    return json.dumps([fields, column, answer], separators=(',', ':'))


@pytest.mark.parametrize('colors', [
    {'bad': '#123456'}, {key([], None, 'a'): 'red'},
    {'[1,null,"a"]': '#123456'}, {'[[],false,"a"]': '#123456'},
])
def test_reject_invalid_mark_color_keys_and_hex(colors):
    with pytest.raises(ValidationError): QuestionSettings(pointColors=colors)


def test_mark_colors_survive_analysis_save_and_reload(preview_client):
    client, store, pid = preview_client
    color_key = key(['group/gender'], 'f', 'water')
    settings = KoboSettings(questions={'group/needs': {'breakdowns': ['group/gender'], 'pointColors': {color_key: '#ABCDEF'}}})
    assert client.put(f'/api/kobo/projects/{pid}/settings', json=settings.model_dump()).status_code == 200
    assert store.get(pid)['settings']['questions']['group/needs']['pointColors'] == {color_key: '#ABCDEF'}
    response = client.post(f'/api/kobo/projects/{pid}/analysis', json={'settings': settings.model_dump()})
    assert response.status_code == 200
    result = next(q for q in response.json()['questions'] if q['id'] == 'group/needs')
    assert result['pointColors'] == {color_key: '#ABCDEF'}
    assert result['denominator'] == next(q for q in analyze(store.get(pid), KoboSettings())['questions'] if q['id'] == 'group/needs')['denominator']


def test_share_preserves_and_remaps_compatible_mark_colors(sample):
    project = copy.deepcopy(sample[0])
    color_key = key(['group/gender'], 'f', 'water')
    config = KoboSettings(questions={'group/needs': {'breakdowns': ['group/gender'], 'pointColors': {color_key: '#ABCDEF'}}})
    package = export_settings(project, config)
    assert preview_settings(project, KoboSettings(), package)['settings']['questions']['group/needs']['pointColors'] == {color_key: '#ABCDEF'}
    next(q for q in project['form']['questions'] if q['id'] == 'group/gender')['id'] = 'gender_renamed'
    review = preview_settings(project, KoboSettings(), package)
    assert review['settings']['questions']['group/needs']['pointColors'] == {key(['gender_renamed'], 'f', 'water'): '#ABCDEF'}
    next(q for q in project['form']['questions'] if q['id'] == 'group/needs')['choices'] = []
    # A removed breakdown choice cannot be silently reassigned to a different category.
    next(q for q in project['form']['questions'] if q['id'] == 'gender_renamed')['choices'] = []
    review = preview_settings(project, KoboSettings(), package)
    assert review['settings']['questions']['group/needs']['pointColors'] == {}
    assert any('individual chart colors skipped' in warning for warning in review['warnings'])
