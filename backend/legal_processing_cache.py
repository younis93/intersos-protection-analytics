"""Disposable, authenticated local snapshots of successful Legal imports.

Only app-created cache bytes are deserialized. Uploaded CSVs and project ZIPs
never supply serialized state. CACHE_VERSION must change with processing rules.
"""
from __future__ import annotations

import hashlib
import hmac
import io
import json
import os
import pickle
import secrets
import sys
from datetime import date
from pathlib import Path
from threading import RLock
from uuid import uuid4

import pandas as pd
from .version import APP_VERSION
from .import_progress import ImportCancelled

CACHE_VERSION = 1
MAX_SNAPSHOT_BYTES = 512 * 1024 * 1024
MAGIC = b"INTERSOS-LEGAL-CACHE-1\n"
_lock = RLock()


def cache_directory():
    return Path(os.getenv("LOCALAPPDATA", str(Path.home()))) / "INTERSOS Legal Platform" / "processing-cache"


def cache_key(payload, exclusions):
    identity = {
        "version": CACHE_VERSION,
        "app_version": APP_VERSION,
        "python": list(sys.version_info[:3]),
        "pandas": pd.__version__,
        "date": date.today().isoformat(),
        "files": {name: hashlib.sha256(raw).hexdigest() for name, raw in sorted(payload.items())},
        "exclusions": list(exclusions),
    }
    return hashlib.sha256(json.dumps(identity, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def _secret(directory, create=False):
    path = directory / "authentication.key"
    try:
        raw = path.read_bytes()
        if len(raw) == 32:
            return raw
    except FileNotFoundError:
        pass
    if not create:
        raise ValueError("Invalid processing cache key")
    # A partial or lost key is repaired only when saving a fresh successful
    # import, never while authenticating an existing snapshot.
    directory.mkdir(parents=True, exist_ok=True)
    temporary = directory / (uuid4().hex + ".key.tmp")
    raw = secrets.token_bytes(32)
    try:
        temporary.write_bytes(raw)
        temporary.replace(path)
        return raw
    finally:
        temporary.unlink(missing_ok=True)


def load(key, *, before_restore=None):
    """A cache failure is always a miss; authenticate before invoking pickle."""
    try:
        with _lock:
            directory = cache_directory()
            with (directory / "snapshot.bin").open("rb") as source:
                snapshot_size = os.fstat(source.fileno()).st_size
                header_size = len(MAGIC) + 64 + 32
                if snapshot_size < header_size or snapshot_size > MAX_SNAPSHOT_BYTES:
                    return None
                header = source.read(header_size)
                stored_key = header[len(MAGIC):len(MAGIC) + 64]
                if len(header) != header_size or not header.startswith(MAGIC) or stored_key != key.encode("ascii"):
                    return None
                # Reject incompatible snapshots before reading their large bodies.
                body = source.read(snapshot_size - header_size + 1)
                if len(body) != snapshot_size - header_size:
                    return None
            signature = header[len(MAGIC) + 64:header_size]
            authentication = hmac.new(_secret(directory), MAGIC + stored_key, "sha256")
            authentication.update(body)
            expected = authentication.digest()
            if not hmac.compare_digest(signature, expected):
                return None
            if before_restore is not None:
                before_restore()
            state = pickle.loads(body)
            fields = {"frames", "source_files", "warnings", "dates", "flags", "review_exclusions", "_review_cache", "_metadata_cache"}
            if not isinstance(state, dict) or set(state) != fields:
                return None
            if not all(isinstance(state[name], dict) for name in ("frames", "source_files", "dates", "flags", "_review_cache")):
                return None
            if set(state["frames"]) != set(state["source_files"]) or not all(isinstance(frame, pd.DataFrame) for frame in state["frames"].values()):
                return None
            if not isinstance(state["warnings"], list) or not isinstance(state["review_exclusions"], list):
                return None
            if not isinstance(state["_metadata_cache"], dict) or not isinstance(state["_metadata_cache"].get("sheets"), list):
                return None
            return state
    except ImportCancelled:
        raise
    except Exception:
        return None


class _LimitedBuffer(io.BytesIO):
    def write(self, raw):
        if self.tell() + len(raw) > MAX_SNAPSHOT_BYTES - len(MAGIC) - 96:
            raise ValueError("Processing snapshot exceeds size limit")
        return super().write(raw)


def save(key, store):
    """Whitelist import state; never serialize callbacks, locks or query caches."""
    temporary = None
    try:
        with store._cache_lock:
            state = {name: getattr(store, name) for name in (
                "frames", "source_files", "warnings", "dates", "flags", "review_exclusions", "_metadata_cache")}
            state["_review_cache"] = {key: value for key, value in store._review_cache.items()
                                      if key[1:] == ("", 15, False)}
            with _LimitedBuffer() as output:
                pickle.dump(state, output, protocol=pickle.HIGHEST_PROTOCOL)
                body = output.getvalue()
        with _lock:
            directory = cache_directory()
            secret = _secret(directory, create=True)
            identity = MAGIC + key.encode("ascii")
            authentication = hmac.new(secret, identity, "sha256")
            authentication.update(body)
            signature = authentication.digest()
            temporary = directory / (uuid4().hex + ".tmp")
            with temporary.open("xb") as target:
                target.write(identity)
                target.write(signature)
                target.write(body)
                target.flush()
                os.fsync(target.fileno())
            temporary.replace(directory / "snapshot.bin")
    except Exception:
        # Cache storage must never turn a successful import into a failure.
        pass
    finally:
        if temporary is not None:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
