"""Portable Legal Platform projects and managed restoration sources."""
import hashlib
import io
import json
import os
import stat
import zipfile
from pathlib import Path
from uuid import uuid4

from .legal_platform import FILES
from .app_settings import settings_lock

MAX_BACKUP = 200 * 1024 * 1024
MAX_CSV = 100 * 1024 * 1024
FORMAT = 'intersos-legal-backup'


def validate_exclusions(rows):
    if not isinstance(rows, list):
        raise ValueError('Invalid saved review exclusions.')
    for row in rows:
        if not isinstance(row, dict) or row.get('dataset') not in FILES:
            raise ValueError('Invalid saved review exclusions.')
        for key in ('rule', 'identifierType', 'identifierValue'):
            if not isinstance(row.get(key), str) or not row[key].strip():
                raise ValueError('Invalid saved review exclusions.')
        if 'duplicateContext' in row:
            context = row['duplicateContext']
            if not isinstance(context, dict) or not isinstance(context.get('members'), list) or not all(isinstance(value, str) for value in context['members']) or not isinstance(context.get('settings', {}), dict):
                raise ValueError('Invalid saved duplicate review context.')
    return rows


def backup_project(store, exclusions):
    if not store.source_files or set(store.source_files) != set(store.frames):
        raise ValueError('Original CSV files are unavailable. Reload the data source before exporting.')
    if sum(map(len, store.source_files.values())) > MAX_CSV:
        raise ValueError('Legal Platform CSV files must total 100 MB or smaller.')
    files = {f'{name}.csv': raw for name, raw in store.source_files.items()}
    files['exclusions.json'] = json.dumps(validate_exclusions(exclusions), ensure_ascii=False).encode('utf-8')
    files['manifest.json'] = json.dumps({'format': FORMAT, 'version': 1,
        'checksums': {name: hashlib.sha256(raw).hexdigest() for name, raw in files.items()}}).encode('utf-8')
    if sum(map(len, files.values())) > MAX_BACKUP:
        raise ValueError('Project exceeds the 200 MB expanded backup limit.')
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, raw in files.items():
            archive.writestr(name, raw)
    if output.tell() > MAX_BACKUP:
        raise ValueError('Project exceeds the 200 MB backup limit.')
    return output.getvalue()


def read_backup(raw):
    if len(raw) > MAX_BACKUP:
        raise ValueError('Project ZIP exceeds the 200 MB limit.')
    try:
        allowed = {'manifest.json', 'exclusions.json', *(f'{name}.csv' for name in FILES)}
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            entries = archive.infolist()
            names = {entry.filename for entry in entries}
            if len(entries) != len(names) or not names <= allowed or not {'manifest.json', 'exclusions.json'} <= names:
                raise ValueError('Invalid project ZIP contents.')
            if sum(entry.file_size for entry in entries) > MAX_BACKUP:
                raise ValueError('Project ZIP expanded size exceeds 200 MB.')
            if sum(entry.file_size for entry in entries if entry.filename.endswith('.csv')) > MAX_CSV:
                raise ValueError('Legal Platform CSV files must total 100 MB or smaller.')
            if any(entry.flag_bits & 1 or stat.S_ISLNK(entry.external_attr >> 16) for entry in entries):
                raise ValueError('Encrypted files and symbolic links are not supported.')
            files = {entry.filename: archive.read(entry) for entry in entries}
        manifest = json.loads(files.pop('manifest.json'))
        if not isinstance(manifest, dict) or manifest.get('format') != FORMAT or type(manifest.get('version')) is not int or manifest['version'] != 1:
            raise ValueError('Unsupported Legal Platform project format or version.')
        checksums = manifest.get('checksums')
        if not isinstance(checksums, dict) or set(checksums) != set(files):
            raise ValueError('Invalid project ZIP checksums.')
        if any(checksums[name] != hashlib.sha256(value).hexdigest() for name, value in files.items()):
            raise ValueError('Project checksum failed. Choose an intact ZIP.')
        exclusions = validate_exclusions(json.loads(files.pop('exclusions.json')))
        return {name[:-4]: value for name, value in files.items()}, exclusions
    except (OSError, KeyError, TypeError, UnicodeError, RuntimeError, NotImplementedError, zipfile.BadZipFile, json.JSONDecodeError) as exc:
        raise ValueError('This file is not a valid Legal Platform project ZIP.') from exc


def app_data_dir():
    return Path(os.getenv('LOCALAPPDATA', str(Path.home()))) / 'INTERSOS Legal Platform'


def atomic_bytes(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid4().hex + '.tmp')
    try:
        temporary.write_bytes(raw)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def persist_restored_project(payload, exclusions, registry):
    """Commit the managed source and exclusions, rolling back on write failure."""
    with settings_lock:
        return _persist_restored_project(payload, exclusions, registry)


def _persist_restored_project(payload, exclusions, registry):
    root = app_data_dir()
    settings_path = root / 'settings.json'
    previous_settings = settings_path.read_bytes() if settings_path.exists() else None
    previous_exclusions = registry.path.read_bytes() if registry.path.exists() else None
    settings = json.loads(previous_settings) if previous_settings is not None else {}
    if not isinstance(settings, dict):
        raise ValueError('Unable to read application settings.')
    folder = root / 'restored-projects' / uuid4().hex
    folder.mkdir(parents=True)
    written = []
    try:
        for name, raw in payload.items():
            path = folder / f'{name}.csv'
            written.append(path)
            path.write_bytes(raw)
        settings.update(legalSource='folder', legalFolder=str(folder))
        atomic_bytes(registry.path, json.dumps(exclusions, ensure_ascii=False, indent=2).encode('utf-8'))
        atomic_bytes(settings_path, json.dumps(settings, ensure_ascii=False, indent=2).encode('utf-8'))
    except Exception:
        for path, previous in ((registry.path, previous_exclusions), (settings_path, previous_settings)):
            if previous is None:
                path.unlink(missing_ok=True)
            elif not path.exists() or path.read_bytes() != previous:
                atomic_bytes(path, previous)
        for path in written:
            path.unlink(missing_ok=True)
        folder.rmdir()
        raise
    return folder
