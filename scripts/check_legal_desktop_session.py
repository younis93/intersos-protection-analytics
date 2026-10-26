"""Check a running desktop session without logging beneficiary values."""
import argparse
import csv
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--label', required=True)
    args = parser.parse_args()
    root = Path(os.environ['LOCALAPPDATA']) / 'INTERSOS Legal Platform'
    source = Path('C:/Legal Platform')
    with (source / 'beneficiaries.csv').open(encoding='utf-8-sig', newline='') as stream:
        records = list(csv.DictReader(stream))
    expected = next(row for row in records if row['Case ID'] == '15974')
    client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    deadline = time.monotonic() + 60
    while True:
        try:
            port = json.loads((root / 'workspace-cache/origin.json').read_text())['port']
            base = f'http://127.0.0.1:{port}'
            client.open(base + '/', timeout=3).close()
            with client.open(base + '/api/legal/metadata', timeout=5) as response:
                metadata = json.load(response)
            if metadata['ready']:
                break
            if not metadata.get('loading'):
                raise AssertionError('Desktop source restoration failed')
        except (urllib.error.URLError, TimeoutError):
            pass
        assert time.monotonic() < deadline, 'Desktop did not become ready'
        time.sleep(.25)
    assert metadata['source'] == str(source), 'Desktop loaded an unexpected source'
    assert next(sheet['rows'] for sheet in metadata['sheets'] if sheet['id'] == 'beneficiaries') == len(records)
    request = urllib.request.Request(base + '/api/legal/case', data=b'{"query":"15974"}', headers={'Content-Type': 'application/json'})
    with client.open(request, timeout=15) as response:
        profile = json.load(response)['cases'][0]['beneficiary']
    assert profile['Name (Filter Color Red)'] == expected['Name (Filter Color Red)'], 'Restored name differs from source'
    assert any(value for key, value in profile.items() if key.startswith('Contact Number')), 'Restored primary contact is missing'
    diagnostic = next(line for line in reversed((root / 'startup.log').read_text().splitlines()) if ' legal-source-restored ' in line)
    restored = json.loads(diagnostic.split(' legal-source-restored ', 1)[1])
    assert restored['source'] == str(source) and not restored['error']
    safety = Path('output/performance/legal-desktop-source-safety.json')
    protected = json.loads(safety.read_text())['hashes']
    assert all(Path(path).is_file() and hashlib.sha256(Path(path).read_bytes()).hexdigest() == checksum
               for path, checksum in protected.items()), 'A protected source or preference file changed'
    result = {'launch': args.label, 'source': metadata['source'], 'beneficiaries': len(records),
              'case_name_matches_source': True, 'primary_contact_present': True,
              'cache_hit': restored['cache_hit'], 'cache_miss': restored['cache_miss'],
              'protected_files_unchanged': len(protected)}
    output = Path('output/performance/legal-desktop-restarts.json')
    history = json.loads(output.read_text()) if output.exists() else []
    history.append(result)
    output.write_text(json.dumps(history, indent=2), encoding='utf-8')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
