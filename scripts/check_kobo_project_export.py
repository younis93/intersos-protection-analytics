"""Validate a generated actual-project workbook without editing the saved project.

Only aggregate counts are printed. Source data and workbooks stay on this PC.
"""
import json
import os
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.kobo import KoboSettings, analyze
from backend.kobo_excel import answer_label
from backend.kobo_excel_direct import direct_helpers, field_name
from backend.kobo_excel_runtime import create_excel
from backend.kobo_excel_slicers import slicer_specs
from backend.kobo_excel_source import response_layout, query_config


def verify(target):
    import pythoncom
    path = Path(os.environ['LOCALAPPDATA'])/'INTERSOS Legal Platform/kobo-projects.sqlite3'
    with sqlite3.connect(path.as_uri()+'?mode=ro', uri=True) as db:
        payload, raw_settings = db.execute('SELECT payload,settings FROM projects WHERE name=?', ('Household Assessment 2026',)).fetchone()
    project = {**json.loads(payload), 'name': 'Household Assessment 2026'}
    settings = KoboSettings.model_validate(json.loads(raw_settings))
    settings = settings.model_copy(update={'filters': [], 'hideZero': False, 'hideEmpty': False})
    snapshot = analyze(project, settings)
    layouts = response_layout(project, settings)
    config = query_config(project, snapshot, settings, slicer_specs(project, settings), layouts)
    _, sources = direct_helpers(config, layouts)
    pythoncom.CoInitialize()
    app = create_excel(); app.Visible = False; app.DisplayAlerts = False; app.EnableEvents = False
    book = None
    try:
        book = app.Workbooks.Open(str(target.resolve()), UpdateLinks=0, ReadOnly=True)
        pivots = {str(p.Name): p for sheet in book.Worksheets if sheet.Visible == -1 for p in sheet.PivotTables()}
        charts = sum(sheet.ChartObjects().Count for sheet in book.Worksheets if sheet.Visible == -1)
        titles = {row[0] for sheet in book.Worksheets if sheet.Visible == -1
                  for row in sheet.UsedRange.Value if isinstance(row[0], str)}
        answered = sum(bool(q['denominator']) for q in snapshot['questions'])
        assert not {'Workbook guide', 'Pivot data'} & {str(s.Name) for s in book.Worksheets}
        assert len(snapshot['questions']) == 91
        assert len(pivots) == charts == answered == 86
        assert all(q['label'] in titles for q in snapshot['questions'])
        assert book.Queries.Count == 21
        assert book.PivotCaches().Count == 22
        checked = 0
        for index, question in enumerate(snapshot['questions'], 1):
            if not question['denominator'] and settings.hideBlanks:
                assert f'KoboPivot{index:03d}' not in pivots
                continue
            pivot = pivots[f'KoboPivot{index:03d}']
            question['_source'] = sources.get(question['id'], {})
            assert pivot.EnableDrilldown and pivot.SaveData
            expected_table = f'KoboMulti{index:03d}' if question['kind'] == 'multiple' else sources[question['id']]['table']
            assert str(pivot.PivotCache().SourceData) == expected_table
            for row in question['rows']:
                caption = answer_label(question, row)
                try: actual = pivot.GetPivotData('#', field_name(question, 'Answer'), caption).Value
                except Exception:
                    assert row['count'] == 0, f'Absent nonzero answer at question {index}'
                    continue
                assert actual == row['count'], f'Count mismatch at question {index}'
                checked += 1
        return {'questions': len(snapshot['questions']), 'answeredPivots': len(pivots), 'charts': charts, 'queries': book.Queries.Count,
                'pivotCaches': book.PivotCaches().Count, 'answerCountsChecked': checked, 'passed': True}
    finally:
        if book is not None: book.Close(False)
        app.Quit(); pythoncom.CoUninitialize()


if __name__ == '__main__':
    print(json.dumps(verify(Path(sys.argv[1])), indent=2), flush=True)
