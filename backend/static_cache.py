"""Cache only existing Vite content-hashed assets indefinitely."""
from pathlib import Path
import re
import json
from functools import lru_cache

HASHED_ASSET=re.compile(r'^/assets/[^/]+-[A-Za-z0-9_-]{8}\.(?:js|css|woff2?|ttf|otf|png|webp|svg|jpg|jpeg|gif|ico)$')

@lru_cache(maxsize=8)
def manifest_assets(directory: str, modified: int, size: int) -> frozenset[str]:
    try:
        manifest=json.loads((Path(directory)/'.vite/manifest.json').read_text(encoding='utf-8'))
        assets=set()
        for entry in manifest.values():
            assets.update('/'+name for name in [entry.get('file',''),*entry.get('css',[]),*entry.get('assets',[])] if name)
        return frozenset(assets)
    except (OSError,ValueError,TypeError,AttributeError):
        return frozenset()

def static_cache_policy(path: str, status: int, content_type: str, directory: Path) -> str:
    if path.startswith('/api/') or path.endswith('/') or path.lower().endswith(('.html','.htm')) or content_type.split(';',1)[0]=='text/html' or status not in {200,206,304}:
        return 'no-store, no-cache, must-revalidate'
    if HASHED_ASSET.fullmatch(path):
        candidate=(directory/path.lstrip('/')).resolve()
        manifest=directory/'.vite/manifest.json'
        try:
            stamp=manifest.stat()
            verified=path in manifest_assets(str(directory.resolve()),stamp.st_mtime_ns,stamp.st_size)
        except OSError:
            verified=False
        if verified and candidate.is_relative_to(directory.resolve()) and candidate.is_file():
            return 'public, max-age=31536000, immutable'
    return 'no-cache, must-revalidate'
