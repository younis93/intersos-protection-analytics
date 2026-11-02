from copy import deepcopy
import pytest
from backend.kobo import KoboSettings, KoboFilter, QuestionSettings, analyze, ProjectStore
from backend.kobo_data import data_rows
from backend.kobo_saved_views import snapshot_issues
from backend.kobo_excel_slicers import slicer_specs
from backend.test_kobo_answer_order import fixture


def setup(local=None):
    return KoboSettings(filters=[{'field': 'region', 'values': ['north']}], questions={
        'answer': QuestionSettings(filterMode='additional', ownFilters=local or [{'field': 'number', 'kind': 'number', 'minimum': 10}])})


def result(project, settings, qid='answer'):
    return next(question for question in analyze(project, settings)['questions'] if question['id'] == qid)


def test_additional_filters_narrow_page_selection_without_changing_other_questions():
    project = fixture()
    settings = setup()
    original = deepcopy(settings.model_dump())
    question = result(project, settings)
    assert question['cohortCount'] == 3
    assert question['filterMode'] == 'additional'
    assert [row['count'] for row in question['rows']] == [2, 1]
    assert question['filterSummary'] == ['region: north', 'number: 10.0 - Any']
    assert result(project, settings, 'region')['cohortCount'] == 4
    assert settings.model_dump() == original
    settings.filters = [KoboFilter(field='region', values=['south'])]
    assert result(project, settings)['cohortCount'] == 3


def test_conflicting_same_field_filters_keep_an_empty_card_available():
    settings = setup([{'field': 'region', 'values': ['south']}])
    question = result(fixture(), settings)
    assert question['cohortCount'] == 0 and question['rows'] == []
    settings.questions['answer'] = QuestionSettings()
    assert result(fixture(), settings)['cohortCount'] == 4


def test_matching_response_records_agree_with_question_counts():
    settings = setup()
    selection = {'question': 'answer', 'answer': 'b', 'baseFilters': [f.model_dump() for f in settings.filters]}
    selected = data_rows(fixture(), settings, '', ['answer'], drilldown=selection)
    assert len(selected['rows']) == 2
    settings.filters.append(KoboFilter(field='number', kind='number', minimum=11))
    assert data_rows(fixture(), settings, '', ['answer'], drilldown=selection)['rows'] == []


def test_dates_and_inactive_selected_fields():
    settings = setup([{'field': 'date', 'kind': 'date', 'months': ['2026-02']}, {'field': 'region', 'values': []}])
    question = result(fixture(), settings)
    assert question['cohortCount'] == 3
    assert len(question['filterSummary']) == 2


def test_selecting_an_empty_range_field_does_not_exclude_blank_responses():
    project = fixture()
    project['records'][0]['values']['date'] = None
    project['records'][0]['values']['number'] = None
    settings = setup([{'field': 'region', 'values': ['north']}, {'field': 'date', 'kind': 'date'}, {'field': 'number', 'kind': 'number'}])
    assert result(project, settings)['cohortCount'] == 4
    assert result(project, settings)['filterSummary'] == ['region: north', 'region: north']


def test_repeat_question_additional_filters_resolve_ancestor_values():
    project = fixture()
    child = deepcopy(project['form']['questions'][0])
    child.update(id='child', name='child', repeat='people')
    project['form']['questions'].append(child)
    project['records'] += [dict(id='child'+str(i), scope='people', parent=str(i), row=i+2, sheet=1, values={'child': 'a'}) for i in range(7)]
    settings = setup()
    settings.questions['child'] = settings.questions.pop('answer')
    assert result(project, settings, 'child')['cohortCount'] == 3
    settings.questions['answer'] = QuestionSettings(filterMode='additional', ownFilters=[{'field': 'child', 'values': ['a']}])
    with pytest.raises(ValueError, match='ancestor'):
        analyze(project, settings)


def test_legacy_independent_settings_and_additional_settings_round_trip(tmp_path):
    project = fixture()
    settings = setup()
    settings.questions['region'] = QuestionSettings(filterMode='own', ownFilters=[])
    store = ProjectStore(tmp_path/'additional.sqlite3')
    payload = {key: value for key, value in project.items() if key not in {'id', 'name', 'settings', 'updated'}}
    saved = store.create('Filters', {**payload, 'warnings': [], 'issues': []}, b'form', b'data', settings)
    reopened = ProjectStore(store.path).get(saved['id'])
    restored = KoboSettings.model_validate(reopened['settings'])
    assert result(reopened, restored)['cohortCount'] == 3
    assert result(reopened, restored, 'region')['cohortCount'] == 7
    restored.questions['answer'].ownFilters = [KoboFilter(field='missing', values=['x'])]
    assert any('unavailable' in issue for issue in snapshot_issues(project, restored))


def test_excel_slicer_selection_intersects_page_and_question_rules():
    settings = setup([{'field': 'region', 'values': ['north']}])
    settings.filters = [KoboFilter(field='region', values=['north', 'south'])]
    rules = [*settings.filters, *settings.questions['answer'].ownFilters]
    local = settings.model_copy(update={'filters': rules, 'filterFields': ['region']})
    assert slicer_specs(fixture(), local)[0]['selected'] == {'north'}


def test_selected_empty_filter_fields_keep_zero_answer_question_visible():
    project = fixture()
    settings = setup()
    settings.filters = [KoboFilter(field='region', values=['unmatched'])]
    settings.questions['answer'] = QuestionSettings(filterMode='page', ownFilters=[{'field':'number','kind':'number'}])
    assert result(project, settings)['denominator'] == 0


@pytest.mark.parametrize('order', ['answered-desc', 'answered-asc'])
def test_local_filters_do_not_reorder_count_sorted_questions(order):
    project = fixture()
    settings = KoboSettings(questionSort=order, hideEmpty=False)
    before = [q['id'] for q in analyze(project, settings)['questions']]
    settings.questions['answer'] = QuestionSettings(filterMode='additional', ownFilters=[{'field':'number','kind':'number','minimum':100}])
    after = analyze(project, settings)['questions']
    assert [q['id'] for q in after] == before
    assert next(q for q in after if q['id']=='answer')['denominator'] == 0
