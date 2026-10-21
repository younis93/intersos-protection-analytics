import copy
import pytest
from backend.kobo import KoboSettings, QuestionSettings, analyze
from backend.kobo_api import AnalysisResponse
from backend.kobo_settings_share import export_settings, preview_settings
from backend.kobo_excel_source import response_layout, query_config, multi_config
from backend.kobo_excel_direct import direct_helpers
from backend.kobo_excel_prepare import helper_values, materialize_multi
from backend.test_kobo import sample


def fixture(sample):
    project = copy.deepcopy(sample[0])
    template = project['records'][0]
    project['records'] = [
        {**copy.deepcopy(template), 'id': str(i), 'row': i+1, 'values': {**template['values'], 'group/gender': gender, 'group/age': age, 'group/day': day, 'group/needs': needs}}
        for i, (gender, age, day, needs) in enumerate([
            ('f', 0, '2026-01-10', ['water', 'food']),
            ('m', 10, '2026-03-10', ['water']),
            ('f', 20, None, ['food']),
            ('m', 5, 'invalid', ['food']),
        ])]
    return project


def result(project, settings, qid='group/needs'):
    snapshot = analyze(project, settings, qid)
    AnalysisResponse.model_validate(snapshot)
    return snapshot['questions'][0]


def test_trends_preserve_pivot_and_multiple_answer_denominators(sample):
    project = fixture(sample)
    baseline = result(project, KoboSettings())
    settings = KoboSettings(questions={'group/needs': QuestionSettings(chart='line', trendDateField='group/day')})
    actual = result(project, settings)
    assert actual['rows'] == baseline['rows']
    trend = actual['trend']
    assert trend['periods'] == ['2026-01', '2026-02', '2026-03']
    assert trend['denominators'] == [1, 0, 1]
    assert trend['excluded'] == 2
    water, food = trend['series']
    assert water['points'] == [{'count': 1, 'percent': 100}, {'count': 0, 'percent': None}, {'count': 1, 'percent': 100}]
    assert food['points'][0]['percent'] == 100
    assert sum(s['points'][0]['percent'] for s in trend['series']) == 200


@pytest.mark.parametrize('unit,periods', [('day', ['2026-01-10', '2026-01-11', '2026-01-12']), ('year', ['2025', '2026', '2027'])])
def test_period_gaps_and_order(sample, unit, periods):
    project = fixture(sample)
    project['records'] = project['records'][:2]
    for record, value in zip(project['records'], [periods[-1], periods[0]]):
        record['values']['group/day'] = value if unit == 'day' else value+'-01-10'
    settings = KoboSettings(questions={'group/needs': QuestionSettings(chart='line', trendDateField='group/day', trendUnit=unit)})
    assert result(project, settings)['trend']['periods'] == periods


def test_no_valid_dates_and_hidden_metadata(sample):
    project = fixture(sample)
    date_field = next(q for q in project['form']['questions'] if q['kind'] == 'date')
    date_field['metadata'] = True
    for record in project['records']: record['values']['group/day'] = None
    settings = KoboSettings(hidden=['group/day'], questions={'group/needs': QuestionSettings(chart='line', trendDateField='group/day')})
    trend = result(project, settings)['trend']
    assert trend['periods'] == [] and trend['excluded'] == 4


def test_repeat_trends_use_parent_dates(sample):
    project = fixture(sample)
    question = copy.deepcopy(project['form']['questions'][0])
    question.update(id='visits/gender', repeat='visits')
    project['form']['questions'].append(question)
    project['records'].extend({'id': 'child'+str(i), 'parent': str(i), 'scope': 'visits', 'row': 20+i, 'values': {'visits/gender': 'f'}} for i in range(2))
    settings = KoboSettings(questions={'visits/gender': QuestionSettings(chart='line', trendDateField='group/day')})
    trend = result(project, settings, 'visits/gender')['trend']
    assert trend['denominators'] == [1, 0, 1]


@pytest.mark.parametrize('field', ['missing', 'group/gender', 'identifying', 'other/date'])
def test_invalid_date_references_are_rejected(sample, field):
    project = fixture(sample)
    date_field = copy.deepcopy(next(q for q in project['form']['questions'] if q['kind'] == 'date'))
    project['form']['questions'].extend([{**date_field, 'id': 'identifying', 'identifying': True}, {**date_field, 'id': 'other/date', 'repeat': 'other'}])
    settings = KoboSettings(questions={'group/needs': QuestionSettings(chart='line', trendDateField=field)})
    with pytest.raises(ValueError, match='date|response table'): result(project, settings)


def test_histogram_keeps_empty_bins_and_numeric_order(sample):
    project = fixture(sample)
    settings = KoboSettings(questions={'group/age': QuestionSettings(chart='histogram', bins=5, numericMode='values', answerSort='count-desc')})
    actual = result(project, settings, 'group/age')
    assert len(actual['bins']) == len(actual['rows']) == 5
    assert [r['id'] for r in actual['rows']] == ['bin:0', 'bin:1', 'bin:2', 'bin:3', 'bin:4']
    assert sum(r['count'] for r in actual['rows']) == 4
    assert any(r['count'] == 0 for r in actual['rows'])


def test_settings_sharing_preserves_trend_and_heatmap(sample):
    project = fixture(sample)
    settings = KoboSettings(questions={'group/needs': QuestionSettings(chart='line', trendDateField='group/day', trendUnit='year'), 'group/gender': QuestionSettings(chart='heatmap', breakdowns=['group/respondent_name'])})
    imported = KoboSettings.model_validate(preview_settings(project, KoboSettings(), export_settings(project, settings))['settings'])
    assert imported.questions['group/needs'].trendDateField == 'group/day'
    assert imported.questions['group/needs'].trendUnit == 'year'
    assert imported.questions['group/gender'].chart == 'heatmap'


def test_excel_period_helpers_and_multi_seed_match_refresh_schema(sample):
    project = fixture(sample)
    project['records'][-1]['values']['group/day'] = None
    settings = KoboSettings(hidden=['group/respondent_name'], questions={qid: QuestionSettings(chart='line', trendDateField='group/day') for qid in ['group/gender', 'group/needs']})
    snapshot = analyze(project, settings)
    layouts = response_layout(project, settings)
    config = query_config(project, snapshot, settings, [], layouts)
    helpers, sources = direct_helpers(config, layouts)
    values = helper_values(layouts, config, sources, helpers)
    field = sources['group/gender']['fields']['TrendPeriod']
    index = list(helpers['']).index(field)
    assert [row[index] for row in values[0]] == ['2026-01', '2026-03', '', '']
    question = next(q for q in config['questions'] if q['id'] == 'group/needs')
    own = multi_config(config, question)
    rows = materialize_multi((own, project['records']))
    assert all(len(row) == len(own['headers']) for row in rows)
    period_index = own['headers'].index('TrendPeriod')
    assert rows[0][period_index] == '2026-01'


def test_heatmap_workbook_rules_preserve_other_package_members(tmp_path):
    from openpyxl import Workbook
    from zipfile import ZipFile, ZIP_DEFLATED
    from xml.etree import ElementTree as ET
    from backend.kobo_excel_trends import write_heatmap_formats
    path = tmp_path/'heatmap.xlsx'
    book = Workbook(); book.active.title = 'Heatmap'
    book.active.append(['Answer', 'North', 'South'])
    book.active.append(['Water', 1, 2]); book.save(path)
    with ZipFile(path, 'a', ZIP_DEFLATED) as archive:
        archive.writestr('xl/slicerCaches/preserve.bin', b'preserve native workbook parts')
    with ZipFile(path) as archive:
        before = {name: archive.read(name) for name in archive.namelist()}
    write_heatmap_formats(path, [('Heatmap', '$B$2:$C$2')])
    with ZipFile(path) as archive:
        for name, data in before.items():
            if name != 'xl/worksheets/sheet1.xml': assert archive.read(name) == data
        sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
    ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    rule = sheet.find('s:conditionalFormatting', ns)
    assert rule.attrib == {'sqref': 'B2:C2'}
    assert rule.find('s:cfRule', ns).attrib['type'] == 'colorScale'


def test_one_month_can_be_regrouped_by_day(sample):
    project = fixture(sample)
    project['records'] = project['records'][:2]
    for record, value in zip(project['records'], ['2026-10-01', '2026-10-03']):
        record['values']['group/day'] = value
    cfg = QuestionSettings(chart='line', trendDateField='group/day', trendUnit='month')
    settings = KoboSettings(questions={'group/needs': cfg})
    monthly = result(project, settings)['trend']
    assert monthly['periods'] == ['2026-10']
    cfg.trendUnit = 'day'
    daily = result(project, settings)['trend']
    assert daily['periods'] == ['2026-10-01', '2026-10-02', '2026-10-03']
    assert sum(monthly['denominators']) == sum(daily['denominators']) == 2
