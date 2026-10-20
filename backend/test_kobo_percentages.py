import random
import copy
from decimal import Decimal
import pytest
from backend.kobo import KoboSettings, QuestionSettings, analyze, question_result
from backend.kobo_api import QuestionResult
from backend.kobo_percentages import display_percentages
from backend.test_kobo import sample


@pytest.mark.parametrize('decimals',[0,1,2])
def test_exact_total_stable_ties_zeros_and_permutations(decimals):
    entries=[('c',1),('b',1),('a',1),('zero',0)]
    expected=display_percentages(entries,3,decimals)
    assert sum(Decimal(str(value)) for value in expected.values())==100
    assert expected['a']>expected['b']==expected['c']
    assert expected['zero']==0
    assert display_percentages(list(reversed(entries)),3,decimals)==expected
    assert all(value is None for value in display_percentages(entries,0,decimals).values())


@pytest.mark.parametrize('decimals',[0,1,2])
def test_random_distributions_keep_bounds_and_exact_total(decimals):
    rng=random.Random(72)
    for _ in range(100):
        entries=[(str(i),rng.randrange(200)) for i in range(rng.randrange(1,80))]
        denominator=sum(count for key,count in entries)
        if not denominator:continue
        values=display_percentages(entries,denominator,decimals)
        assert sum(Decimal(str(value)) for value in values.values())==100
        for key,count in entries:
            assert abs(values[key]-count*100/denominator)<=10**-decimals+1e-9
            assert count or values[key]==0


def test_multiple_and_incomplete_distributions_are_not_normalized():
    assert display_percentages([('a',2),('b',2)],3,1,False)=={'a':66.7,'b':66.7}
    assert display_percentages([('a',1)],3,1)=={'a':33.3}
    assert display_percentages([('a',1)],8,0)=={'a':13.0}


@pytest.mark.parametrize('decimals',[0,1,2])
def test_result_api_preserves_raw_values_blanks_and_breakdown_totals(sample,decimals):
    project=copy.deepcopy(sample[0]);questions={q['id']:q for q in project['form']['questions']}
    settings=KoboSettings(percentageDecimals=decimals,hideBlanks=False,hideZero=False,questions={'group/gender':QuestionSettings(answerSort='count-desc')})
    # Use an eligible categorical breakdown, including same-label categories.
    settings.questions['group/age']=QuestionSettings(breakdowns=['group/gender'],numericMode='bins',bins=2)
    result=analyze(project,settings)
    for q in result['questions']:
        model=QuestionResult.model_validate(q).model_dump()
        assert model['percentageDecimals']==decimals
        for row in model['rows']:
            if row['percent'] is not None:
                assert row['percent']==row['count']/model['denominator']*100
            else:assert row['displayPercent'] is None
        if q['kind']!='multiple' and q['denominator']:
            assert sum(Decimal(str(row['displayPercent'])) for row in q['rows'] if row['displayPercent'] is not None)==100
        for column in q['breakdowns']:
            entries=[entry for row in q['rows'] for entry in row.get('series',[]) if entry['id']==column['id']]
            if q['kind']!='multiple' and column['denominator']:
                assert sum(Decimal(str(entry['displayPercent'])) for entry in entries)==100
    empty=settings.model_copy(update={'filters':[], 'hidden':['group/age']})
    direct=question_result(questions['group/age'],[],empty,questions,{})
    assert direct['denominator']==0
    assert all(row['displayPercent'] is None for row in direct['rows'])


def test_defaults_chart_choices_and_validation(sample):
    project=sample[0]
    result=analyze(project,KoboSettings(hideEmpty=False))
    assert all(q['chart']==('line' if q['kind']=='date' else 'column') for q in result['questions'])
    assert next(q for q in analyze(project,KoboSettings(questions={'group/gender':QuestionSettings(chart='donut')}))['questions'] if q['name']=='gender')['chart']=='donut'
    assert KoboSettings().percentageDecimals==0
    with pytest.raises(ValueError):KoboSettings(percentageDecimals=3)
