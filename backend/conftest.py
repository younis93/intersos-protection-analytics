"""Keep disposable processing snapshots isolated from real application data."""
import pytest

from backend import legal_processing_cache


@pytest.fixture(scope="session", autouse=True)
def isolate_session_processing_cache(tmp_path_factory):
    # Module-scoped data fixtures run before function-scoped autouse fixtures.
    directory = tmp_path_factory.mktemp("session-processing-cache")
    with pytest.MonkeyPatch.context() as isolation:
        isolation.setattr(legal_processing_cache, "cache_directory", lambda: directory)
        yield


@pytest.fixture(autouse=True)
def isolate_processing_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(legal_processing_cache, "cache_directory", lambda: tmp_path / "processing-cache")
