"""Measure local Legal restoration without logging beneficiary values."""
import argparse
import io
import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd
from openpyxl import load_workbook
from backend import legal_processing_cache as processing, legal_page_cache as pages
from backend.legal_platform import LegalStore


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    results = {}

    def timed(name, build):
        start = perf_counter()
        value = build()
        results[name] = round(perf_counter() - start, 4)
        return value

    # Also measure rejection against the real large snapshot, without changing it.
    timed('unmatched_snapshot_seconds', lambda: processing.load('0' * 64))
    with TemporaryDirectory(prefix='legal-startup-check-') as temporary:
        processing.cache_directory = lambda: Path(temporary)
        fresh = timed('cold_import_seconds', lambda: LegalStore.from_folder(args.source, use_cache=False))
        restored = timed('cached_restore_seconds', lambda: LegalStore.from_folder(args.source))
        assert restored.import_timings['cache_hit'] == 1
        for dataset in fresh.frames:
            pd.testing.assert_frame_equal(fresh.frames[dataset], restored.frames[dataset])
        results['all_cached_fields_match'] = True
        original_case = fresh.case('15974')
        case = timed('case_first_seconds', lambda: restored.case('15974'))
        timed('case_repeat_seconds', lambda: restored.case('15974'))
        assert original_case == case and len(case['cases']) == 1
        profile = case['cases'][0]['beneficiary']
        assert str(profile['Name (Filter Color Red)']).strip()
        assert any(str(value).strip() for key, value in profile.items() if key.startswith('Contact Number'))
        results['case_15974_name_and_primary_contact_present'] = True
        def workbook(store):
            book = load_workbook(io.BytesIO(store.case_export('15974')), data_only=True)
            return {sheet.title: list(sheet.values) for sheet in book}
        assert workbook(fresh) == workbook(restored)
        results['case_export_matches'] = True
        parameters = {'query': ''}
        first = timed('cases_page_first_seconds', lambda: pages.compute(restored, 'benchmark:cases', parameters, lambda: restored.case('')))
        second = timed('cases_page_cached_seconds', lambda: pages.compute(restored, 'benchmark:cases', parameters, lambda: restored.case('')))
        assert first == second
        results['cold_stages'] = fresh.import_timings
        results['cached_stages'] = restored.import_timings
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2), encoding='utf-8')
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
