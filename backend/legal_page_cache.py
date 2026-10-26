"""Bounded, authenticated JSON results for default Legal page loads only."""
from __future__ import annotations

import hashlib
import hmac
import inspect
import json
import sqlite3
import time
from datetime import date
from functools import wraps

from fastapi.encoders import jsonable_encoder

from . import legal_processing_cache as processing

PAGE_CACHE_VERSION = 1
MAX_BYTES = 64 * 1024 * 1024
MAX_ENTRIES = 96
MAX_ENTRY_BYTES = 16 * 1024 * 1024


def _json(value):
    return json.dumps(jsonable_encoder(value), ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _empty(value):
    if isinstance(value, dict):
        return all(_empty(item) for item in value.values())
    return value in (None, "", [], {}, ())


def initial_request(parameters, *, review_defaults=False):
    """Custom filtering, search, ordering and pagination remain session-only."""
    for value in parameters.values():
        if not hasattr(type(value), "model_fields"):
            # Route identifiers (dataset, intelligence page, open/closed) select
            # the page itself; they are not filters within that page.
            continue
        dataset = getattr(value, "dataset", "")
        for name, selected in value.model_dump().items():
            if name == "dataset":
                continue
            if name == "query" and _empty(selected):
                continue
            if review_defaults and name == "pageSize" and selected == 5000:
                # Review pages initially display one complete table. Their UI
                # requests 5000 rows rather than the generic API default of 100.
                continue
            if review_defaults and name in {"allowNameVariations", "exactMatchesOnly"}:
                expected = (dataset == "legalhotlines") if name == "allowNameVariations" else (dataset != "legalhotlines")
                if selected != expected:
                    return False
                continue
            field = type(value).model_fields[name]
            if field.is_required():
                return False
            default = field.get_default(call_default_factory=True)
            if selected != default and not (_empty(selected) and _empty(default)):
                return False
    return True


def _identity(store, page, parameters, extra):
    source = getattr(store, "_persistent_cache_identity", None)
    if not source:
        return None
    namespace = hashlib.sha256(_json({"source": source, "exclusions": store.review_exclusions,
        "date": date.today().isoformat(), "version": PAGE_CACHE_VERSION}).encode()).hexdigest()
    key = hashlib.sha256(_json([page, parameters, extra]).encode()).hexdigest()
    return namespace, key


def _connect():
    directory = processing.cache_directory()
    directory.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(directory / "pages.sqlite3", timeout=.1)
    try:
        connection.execute("PRAGMA auto_vacuum=FULL")
        connection.execute("CREATE TABLE IF NOT EXISTS pages (namespace TEXT, query TEXT, body BLOB, signature BLOB, used INTEGER, PRIMARY KEY(namespace, query))")
        return connection
    except Exception:
        connection.close()
        raise


def _signature(secret, identity, body):
    authentication = hmac.new(secret, ("legal-pages:" + ":".join(identity)).encode(), "sha256")
    authentication.update(body)
    return authentication.digest()


def _read(identity):
    try:
        with processing._lock:
            secret = processing._secret(processing.cache_directory())
            connection = _connect()
            try:
                # Check length before asking SQLite to materialize a BLOB.
                row = connection.execute("SELECT body, signature FROM pages WHERE namespace=? AND query=? AND length(body)<=?",
                    (*identity, MAX_ENTRY_BYTES)).fetchone()
                if row is None or not hmac.compare_digest(row[1], _signature(secret, identity, row[0])):
                    return None
                value = json.loads(row[0])
                connection.execute("UPDATE pages SET used=? WHERE namespace=? AND query=?", (time.time_ns(), *identity))
                connection.commit()
                return value
            finally:
                connection.close()
    except Exception:
        return None


def _write(identity, value):
    try:
        body = _json(value).encode("utf-8")
        if len(body) > MAX_ENTRY_BYTES or len(body) > MAX_BYTES or MAX_ENTRIES < 1:
            return
        with processing._lock:
            secret = processing._secret(processing.cache_directory(), create=True)
            signature = _signature(secret, identity, body)
            connection = _connect()
            try:
                with connection:
                    connection.execute("DELETE FROM pages WHERE namespace<>?", (identity[0],))
                    connection.execute("DELETE FROM pages WHERE namespace=? AND query=?", identity)
                    while True:
                        count, size = connection.execute("SELECT count(*), coalesce(sum(length(body)), 0) FROM pages").fetchone()
                        if count < MAX_ENTRIES and size + len(body) <= MAX_BYTES:
                            break
                        connection.execute("DELETE FROM pages WHERE rowid=(SELECT rowid FROM pages ORDER BY used LIMIT 1)")
                    connection.execute("INSERT INTO pages VALUES (?, ?, ?, ?, ?)", (*identity, body, signature, time.time_ns()))
            finally:
                connection.close()
    except Exception:
        # Disposable caches cannot turn a successful page request into a failure.
        pass


def clear():
    """Discard page results only after a forced source refresh succeeds."""
    try:
        with processing._lock:
            connection = _connect()
            try:
                with connection:
                    connection.execute("DELETE FROM pages")
            finally:
                connection.close()
    except Exception:
        pass


def compute(store, page, parameters, build, *, extra=None, is_current=lambda: True):
    """Cache only successful JSON computations for the exact captured revision."""
    revision = getattr(store, "revision", None)
    try:
        with store._cache_lock:
            identity = _identity(store, page, parameters, extra)
    except Exception:
        identity = None
    if identity is not None:
        value = _read(identity)
        if value is not None and store.revision == revision and is_current():
            return value
    value = build()
    if identity is not None and store.revision == revision and is_current():
        _write(identity, value)
    return value


def page(get_store, *, indicator_revisions=False, review_defaults=False):
    """Opt-in decorator: never applied to uploads, mutations or exports."""
    def decorate(function):
        signature = inspect.signature(function, eval_str=True)
        @wraps(function)
        def wrapped(*args, **kwargs):
            store = get_store()
            bound = signature.bind(*args, **kwargs)
            bound.apply_defaults()
            if not initial_request(bound.arguments, review_defaults=review_defaults):
                return function(*args, **kwargs)
            result = compute(store, function.__module__ + "." + function.__qualname__, bound.arguments,
                lambda: function(*args, **kwargs), is_current=lambda: get_store() is store)
            if indicator_revisions:
                # Source-record export tokens belong to this import, including
                # when the figures were calculated in an earlier app session.
                if "revision" in result:
                    result["revision"] = store.data_revision
                for entry in result.get("reports", []):
                    entry["report"]["revision"] = store.data_revision
            return result
        # FastAPI must resolve postponed endpoint types in their original module.
        wrapped.__signature__ = signature
        return wrapped
    return decorate
