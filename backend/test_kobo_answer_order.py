import copy

import pytest

from backend.kobo import KoboSettings, QuestionSettings, analyze, new_project_settings
from backend.kobo_excel import order_export_answers
from backend.kobo_api import ProjectResponse


def fixture():
    def question(name, kind, choices=()):
        return dict(id=name, name=name, labels={'en': name}, kind=kind, type=kind,
                    repeat='', group='', metadata=False, identifying=False,
                    choices=[{'name': code, 'labels': {'en': code}} for code in choices])
    questions = [question('answer', 'category', ['a', 'c', 'b']), question('region', 'category', ['north', 'south']),
                 question('date', 'date'), question('number', 'number')]
    values = [('a','north'), ('c','north'), ('b','north'), ('b','north'), ('c','south'), ('c','south'), ('b','south')]
    records = [dict(id=str(i), parent='', scope='', row=i+2, sheet=0,
                    values={'answer': answer, 'region': region, 'date': '2026-01-01' if i == 0 else '2026-02-01', 'number': 0 if i == 0 else 10})
               for i, (answer, region) in enumerate(values)]
    return {'id': 'order', 'name': 'Order', 'form': {'questions': questions, 'groups': [], 'warnings': [], 'settings': {}, 'language': 'en'}, 'records': records}


def answer_ids(snapshot, name='answer'):
    return [row['id'] for row in next(q for q in snapshot['questions'] if q['id'] == name)['rows']]


def test_defaults_rank_counts_and_preserve_form_ties_without_mutating_settings():
    settings = KoboSettings(questions={'answer': QuestionSettings(palette='Blue')})
    before = settings.model_dump()
    result = analyze(fixture(), settings)
    assert answer_ids(result) == ['c','b','a']
    assert settings.model_dump() == before
    assert result['settings']['questions']['answer']['answerSort'] == 'count-desc'
    assert answer_ids(result, 'date') == ['2026-01', '2026-02']
    assert result['settings']['questions']['date']['answerSort'] == 'form'


@pytest.mark.parametrize('sort,expected', [('form',['a','c','b']), ('count-desc',['c','b','a']),
    ('count-asc',['a','c','b']), ('label-asc',['a','b','c']), ('label-desc',['c','b','a'])])
def test_saved_sort_choices_are_preserved(sort, expected):
    settings = KoboSettings(questions={'answer': QuestionSettings(answerSort=sort)})
    assert answer_ids(analyze(fixture(), settings)) == expected


def test_filters_rank_overall_counts_not_individual_breakdown_values():
    settings = KoboSettings(filters=[{'field':'region','values':['north']}],
                            questions={'answer': QuestionSettings(breakdowns=['region'])})
    result = analyze(fixture(), settings)
    assert answer_ids(result) == ['b','a','c']


def test_histogram_bins_dates_and_blanks_keep_natural_positions():
    project = fixture()
    project['records'] += [dict(id='blank'+str(i), parent='',scope='',row=20+i,sheet=0,values={}) for i in range(8)]
    settings = KoboSettings(hideBlanks=False,questions={'number':QuestionSettings(chart='histogram',numericMode='bins',bins=2)})
    result = analyze(project, settings)
    assert answer_ids(result)[-1] == '__blank__'
    assert answer_ids(result, 'date') == ['2026-01','2026-02','__blank__']
    numeric = next(q for q in result['questions'] if q['id'] == 'number')
    assert numeric['rows'][0]['count'] == 1 and numeric['rows'][1]['count'] == 6


def test_new_project_defaults_survive_serialization():
    project = fixture()
    settings = new_project_settings(project['form'], project['records'])
    loaded = KoboSettings.model_validate(settings.model_dump())
    assert loaded.questions['date'].answerSort == 'form'
    assert loaded.questions['answer'].answerSort == 'count-desc'
    assert answer_ids(analyze(project, loaded)) == ['c','b','a']


def test_project_response_resolves_missing_date_sort_but_keeps_saved_form_order():
    project = fixture()
    value = {**project, 'updated': 'now', 'settings': {'questions': {'answer': {'answerSort':'form'}, 'date': {'palette':'Blue'}}}}
    result = ProjectResponse.model_validate(value)
    assert result.settings.questions['date'].answerSort == 'form'
    assert result.settings.questions['answer'].answerSort == 'form'
    assert 'answerSort' not in value['settings']['questions']['date']


def test_excel_uses_filtered_counts_with_stable_ties_and_retains_source_universe():
    project = fixture()
    settings = KoboSettings(filters=[{'field':'region','values':['north']}])
    shown = analyze(project, settings)['questions'][0]
    source = analyze(project, KoboSettings(questions={'answer':QuestionSettings(answerSort='form')}))['questions'][0]
    source['rows'] += [{'id':'zero','count':0}, {'id':'__blank__','count':20}]
    order_export_answers(source, shown, QuestionSettings())
    assert [row['id'] for row in source['rows']] == ['b','a','c','zero','__blank__']
    original = copy.deepcopy(source)
    order_export_answers(source, shown, QuestionSettings(answerSort='form'))
    assert source == original
