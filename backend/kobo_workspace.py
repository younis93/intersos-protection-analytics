"""Portable backups and offline geographic aggregates."""
import hashlib
import io
import json
import math
import zipfile
from collections import Counter
from .kobo import KoboSettings, filtered_records, label, missing

MAX_BACKUP = 200 * 1024 * 1024
MEMBERS = {'project.json', 'form.bin', 'data.bin', 'manifest.json'}


def backup_project(store, pid):
    # Read one SQLite snapshot so source uploads and normalized data stay consistent.
    with store.connect() as db:
        row = db.execute('SELECT name,payload,settings,form,data FROM projects WHERE id=?', (pid,)).fetchone()
    if row is None:
        raise KeyError('Project not found.')
    files = {'project.json': json.dumps({'name': row[0], 'payload': json.loads(row[1]), 'settings': json.loads(row[2])}, ensure_ascii=False).encode(), 'form.bin': bytes(row[3]), 'data.bin': bytes(row[4])}
    if sum(map(len, files.values())) > MAX_BACKUP - 4096:
        raise ValueError('This project exceeds the 200 MB portable backup limit.')
    files['manifest.json'] = json.dumps({'format': 'intersos-kobo-backup', 'version': 1, 'checksums': {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}}).encode()
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    if out.tell() > MAX_BACKUP:
        raise ValueError('This project exceeds the 200 MB portable backup limit.')
    return out.getvalue()


def read_backup(raw):
    if len(raw) > MAX_BACKUP:
        raise ValueError('Backup exceeds the 200 MB limit.')
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            info = archive.infolist()
            if len(info) != 4 or {i.filename for i in info} != MEMBERS or sum(i.file_size for i in info) > MAX_BACKUP:
                raise ValueError('Invalid backup contents or expanded size exceeds 200 MB.')
            files = {i.filename: archive.read(i) for i in info}
        manifest = json.loads(files['manifest.json'])
        if manifest.get('format') != 'intersos-kobo-backup' or manifest.get('version') != 1:
            raise ValueError('Unsupported backup format or version.')
        for name in MEMBERS - {'manifest.json'}:
            if manifest.get('checksums', {}).get(name) != hashlib.sha256(files[name]).hexdigest():
                raise ValueError('Backup checksum failed. Choose an intact backup.')
        project = json.loads(files['project.json'])
        if not isinstance(project['name'], str) or not project['name'].strip() or len(project['name']) > 200:
            raise ValueError('Invalid project name.')
        payload = project['payload']
        if not isinstance(payload, dict) or not isinstance(payload['records'], list):
            raise ValueError('Invalid project data.')
        if {'id', 'name', 'settings', 'updated'} & payload.keys():
            raise ValueError('Invalid reserved fields in backup payload.')
        ids = set()
        for record in payload['records']:
            if not isinstance(record['id'], str) or record['id'] in ids or not isinstance(record['values'], dict) or not isinstance(record['scope'], str):
                raise ValueError('Invalid or duplicate response records.')
            ids.add(record['id'])
        parents = {r['id']: r.get('parent') for r in payload['records']}
        for rid in parents:
            seen = set()
            current = rid
            while parents.get(current):
                if current in seen or parents[current] not in parents:
                    raise ValueError('Invalid response parent links.')
                seen.add(current)
                current = parents[current]
        settings = KoboSettings.model_validate(project['settings'])
        return project['name'], payload, settings, files['form.bin'], files['data.bin']
    except (KeyError, TypeError, AttributeError, UnicodeError, RuntimeError, zipfile.BadZipFile, json.JSONDecodeError) as exc:
        raise ValueError('This file is not a valid Kobo project backup.') from exc


def geography(project, settings, field):
    question = next((q for q in project['form']['questions'] if q['id'] == field), None)
    if not question or question['repeat'] or question['identifying'] or field in settings.hidden or (question['metadata'] and not settings.metadata):
        raise ValueError('Choose a visible, non-identifying main-submission location field.')
    if question['kind'] not in {'category', 'text'}:
        raise ValueError('Choose a category, text or geopoint location field.')
    records = [r for r in filtered_records(project, settings) if not r['scope']]
    if question['type'].split()[0] != 'geopoint':
        from .kobo_geography import governorate_analysis
        return governorate_analysis(project, settings, field, records)
    counts, cells = Counter(), Counter()
    blanks = invalid = 0
    spatial = question['type'].split()[0] == 'geopoint'
    choices = {c['name']: label(c, settings.language) for c in question['choices']}
    for record in records:
        value = record['values'].get(field)
        if missing(value):
            blanks += 1
            continue
        if spatial:
            try:
                lat, lon = map(float, str(value).split()[:2])
                if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
                    raise ValueError()
                # Aggregate cells, never return individual coordinates or response IDs.
                cells[(min(899, math.floor(lat * 10)), min(1799, math.floor(lon * 10)))] += 1
            except (ValueError, TypeError):
                invalid += 1
        else:
            counts[choices.get(str(value), str(value))] += 1
    return {'total': len(records), 'missing': blanks, 'invalid': invalid, 'spatial': True, 'mapped': sum(cells.values()), 'excluded': 0, 'unmapped': 0, 'fallbackUsed': 0, 'governorates': {}, 'matches': [], 'rows': [], 'reviewValues': [], 'warnings': [], 'governorateOptions': [], 'cells': [{'lat': (lat + .5) / 10, 'lon': (lon + .5) / 10, 'count': count} for (lat, lon), count in sorted(cells.items())]}
