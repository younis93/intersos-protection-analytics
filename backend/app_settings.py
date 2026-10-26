"""Serialize preference updates and publish complete JSON files atomically."""
import json
import os
from pathlib import Path
import tempfile
import time
from threading import RLock

settings_lock = RLock()


def read_settings(path: Path) -> dict:
    with settings_lock:
        settings = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(settings, dict):
            raise ValueError('Application settings must contain an object.')
        return settings


def update_settings(path: Path, changes: dict) -> None:
    with settings_lock:
        try:
            settings = read_settings(path)
        except FileNotFoundError:
            settings = {}
        settings.update(changes)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                             prefix=path.name + '.', suffix='.tmp', delete=False) as stream:
                temporary = Path(stream.name)
                json.dump(settings, stream, ensure_ascii=False, indent=2)
                stream.flush()
                os.fsync(stream.fileno())
            for attempt in range(10):
                try:
                    temporary.replace(path)
                    break
                except PermissionError:
                    # Windows readers can briefly deny replacement. Retain the
                    # old complete file while waiting for their handles to close.
                    if attempt == 9:
                        raise
                    time.sleep(.01 * (attempt + 1))
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
