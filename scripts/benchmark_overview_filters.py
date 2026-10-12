"""Compare Overview latency on the same local source without exposing records."""
import hashlib
import json
import statistics
import sys
from pathlib import Path
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.legal_platform import LegalStore

store = LegalStore.from_folder(Path("Legal Platform Data"))
options = store.overview()["filterOptions"]
first = lambda name: options[name][:1]
advanced = next((option for group in options["groups"] for option in group["columns"] if option["values"]), None)
queries = {
    "project": {"projects": first("projects")},
    "location": {"locations": first("locations")},
    "month": {"months": first("months")},
    "combined": {"projects": first("projects"), "locations": first("locations"), "months": first("months")},
    "advanced": {"filters": {advanced["key"]: advanced["values"][:1]}} if advanced else {},
}
results = {}
for name, query in queries.items():
    samples = []
    for _ in range(3):
        started = perf_counter()
        response = store.overview(**query)
        samples.append((perf_counter() - started) * 1000)
    item = {"median_ms": round(statistics.median(samples), 2), "response_hash": hashlib.sha256(json.dumps(response, sort_keys=True).encode()).hexdigest()}
    if hasattr(store, "overview_filters"):
        samples = []
        for _ in range(3):
            started = perf_counter()
            assert store.overview_filters(**query)["filterOptions"] == response["filterOptions"]
            samples.append((perf_counter() - started) * 1000)
        item["options_median_ms"] = round(statistics.median(samples), 2)
    results[name] = item
target = Path(sys.argv[1])
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps({"rows": {name: len(frame) for name, frame in store.frames.items()}, "queries": results}, indent=2))
print(target.read_text())
