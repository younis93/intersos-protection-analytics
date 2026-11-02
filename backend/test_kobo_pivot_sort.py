from copy import deepcopy
import pytest
from backend.kobo import KoboSettings, QuestionSettings, analyze
from backend.kobo_api import AnalysisResponse
from backend.kobo_excel import order_export_answers
from backend.test_kobo_answer_order import fixture


def run(sort, **config):
    settings = KoboSettings(questions={'answer': QuestionSettings(pivotSort=sort, **config)})
    return analyze(fixture(), settings), settings


def spec(metric='answer', direction='asc', series=None):
    return dict(id='answer' if metric=='answer' else 'total:'+metric, label=metric, metric=metric, direction=direction, series=series)


@pytest.mark.parametrize('metric,direction,expected', [('answer','asc',['a','b','c']), ('answer','desc',['c','b','a']), ('count','asc',['a','c','b']), ('count','desc',['c','b','a']), ('percent','asc',['a','c','b'])])
def test_sort_shared_by_results_charts_api_and_export(metric,direction,expected):
    snapshot, settings = run(spec(metric,direction))
    question = next(q for q in snapshot['questions'] if q['id']=='answer')
    assert [r['id'] for r in question['rows']] == expected
    assert AnalysisResponse.model_validate(snapshot).model_dump()['questions'][0]['pivotSort']['metric'] == metric
    export = deepcopy(question);export['rows'].reverse()
    order_export_answers(export,question,settings.questions['answer'])
    assert [r['id'] for r in export['rows']] == expected
    assert KoboSettings.model_validate_json(settings.model_dump_json()).questions['answer'].pivotSort.metric == metric


def test_breakdown_sort_fallback_and_top_n_membership():
    original, _ = run(None, chartTopN=2, chartOther=True)
    snapshot, _ = run(spec('count','asc',['north']), breakdowns=['region'],chartTopN=2,chartOther=True)
    q = snapshot['questions'][0]
    assert [r['id'] for r in q['rows']] == ['c','a','b']
    assert {r['id'] for r in q['chartProjection']['rows']} == {r['id'] for r in original['questions'][0]['chartProjection']['rows']}
    assert [r['id'] for r in q['chartProjection']['rows']] == ['c','b','__chart_other__']
    stale, _ = run(spec('count','asc',['removed']), breakdowns=['region'])
    assert stale['questions'][0]['pivotSort'] is None


def test_dates_keep_chart_axis_order_while_table_sorts():
    project=fixture()
    settings=KoboSettings(questions={'date':QuestionSettings(pivotSort=spec('count','desc'))})
    q=next(q for q in analyze(project,settings)['questions'] if q['id']=='date')
    assert [r['id'] for r in q['rows']] == ['2026-02','2026-01']
    assert [r['id'] for r in q['chartProjection']['rows']] == ['2026-01','2026-02']
    assert q['chartProjection']['axisOrder']


def test_measure_sort_and_hidden_answers():
    snapshot,_=run(spec('count','asc'), calculation={'operation':'sum','field':'number'}, hiddenAnswers=['b'], trendDateField='date', chart='line')
    q=snapshot['questions'][0]
    assert [r['id'] for r in q['rows']] == ['a','c']
    assert [s['id'] for s in q['trend']['series']] == ['a','c']


@pytest.mark.parametrize('direction', ['asc','desc'])
def test_null_values_and_blanks_stay_last_and_labels_are_natural(direction):
    from backend.kobo_pivot_sort import apply_pivot_sort
    q={'kind':'category','chart':'bar','rows':[{'id':'ten','label':'إجابة ١٠','count':10,'percent':None}, {'id':'two','label':'إجابة ٢','count':2,'percent':50}, {'id':'__blank__','label':'Blank','count':1,'percent':None}], 'breakdowns':[]}
    result=apply_pivot_sort(deepcopy(q), QuestionSettings(pivotSort=spec('answer',direction)))
    assert [r['id'] for r in result['rows']] == (['two','ten','__blank__'] if direction=='asc' else ['ten','two','__blank__'])
    result=apply_pivot_sort(deepcopy(q), QuestionSettings(pivotSort=spec('percent',direction)))
    assert [r['id'] for r in result['rows']] == ['two','ten','__blank__']


def test_histogram_and_zero_results_remain_valid():
    project=fixture()
    settings=KoboSettings(questions={'number':QuestionSettings(chart='histogram',numericMode='bins',bins=3,pivotSort=spec('count','desc'))})
    q=next(q for q in analyze(project,settings)['questions'] if q['id']=='number')
    assert q['chartProjection']['axisOrder']
    assert q['chartProjection']['rows'] != q['rows']
    empty=KoboSettings(hideEmpty=False,filters=[{'field':'region','values':['missing']}],questions={'answer':QuestionSettings(pivotSort=spec('answer'))})
    assert next(q for q in analyze(project,empty)['questions'] if q['id']=='answer')['denominator']==0
