import copy
import pytest
from backend.kobo import CHART_PALETTES, KoboSettings, QuestionSettings, analyze, palette_color
from backend.test_kobo import sample

@pytest.mark.parametrize('palette',list(CHART_PALETTES))
def test_palette_resolves_answers_breakdowns_and_line_colors(sample,palette):
    project=copy.deepcopy(sample[0]);qid='group/needs'
    settings=KoboSettings(questions={qid:QuestionSettings(palette=palette,breakdowns=['group/gender'])})
    result=next(question for question in analyze(project,settings)['questions'] if question['id']==qid)
    for item in [*result['rows'],*result['breakdowns']]:assert result['colors'][item['id']]==palette_color(palette,item['id'])
    assert result['colors']['series']==CHART_PALETTES[palette][0]
    settings.questions[qid].answerSort='label-desc'
    reordered=next(question for question in analyze(project,settings)['questions'] if question['id']==qid)
    assert reordered['colors']==result['colors']
    settings.questions[qid].colors={'f':'#ABCDEF'}
    assert next(question for question in analyze(project,settings)['questions'] if question['id']==qid)['colors']['f']=='#ABCDEF'

def test_existing_projects_keep_automatic_colors_without_palette(sample):
    assert all(question['colors']=={} for question in analyze(sample[0],KoboSettings())['questions'])
    assert QuestionSettings.model_validate({'colors':{}}).palette is None
