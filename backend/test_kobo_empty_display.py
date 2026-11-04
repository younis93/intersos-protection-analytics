import pytest
from backend.kobo import KoboSettings, analyze
from backend.test_kobo_answer_order import fixture


@pytest.mark.parametrize('hide_blanks',[False,True])
@pytest.mark.parametrize('hide_zero',[False,True])
def test_blank_and_zero_choice_visibility_are_independent(hide_blanks,hide_zero):
    project=fixture()
    project['form']['questions'][0]['choices'].append({'name':'unused','labels':{'en':'Unused'}})
    project['records'][0]['values']['answer']=None
    settings=KoboSettings(hideEmpty=False,hideBlanks=hide_blanks,hideZero=hide_zero)
    result=next(q for q in analyze(project,settings)['questions'] if q['id']=='answer')
    ids={r['id'] for r in result['rows']}
    assert ('__blank__' in ids)==(not hide_blanks)
    assert ('unused' in ids)==(not hide_zero)


def test_hide_unanswered_questions_is_separate_from_answer_row_visibility():
    project=fixture()
    for q in project['form']['questions']:q.update(relevant='',inheritedRelevant=[],relevanceMetadataVersion=1,required=False)
    for record in project['records']:record['values']['answer']=None
    hidden=analyze(project,KoboSettings(hideEmpty=True))
    assert not any(q['id']=='answer' for q in hidden['questions'])
    shown=analyze(project,KoboSettings(hideEmpty=False,hideBlanks=True,hideZero=True))
    result=next(q for q in shown['questions'] if q['id']=='answer')
    assert result['rows']==[] and result['denominator']==0
