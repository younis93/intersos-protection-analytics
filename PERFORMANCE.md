# CSV import and page-loading performance

Implemented and measured on 7 September 2026. Comparisons use the workspace as it existed before this change, including its existing edits. No real case files were used in the benchmarks.

## Measured results

| Measurement | Before | After |
| --- | ---: | ---: |
| Import 9.95 MB of CSVs, ready with metadata | 50.52 s | 7.67 s |
| Import 49.73 MB of CSVs, ready with metadata | 274.21 s | 37.75 s |
| Initial JavaScript loaded by welcome page | 6.00 MB | 0.64 MB |
| Welcome page ready | 922 ms | 127 ms |
| First beneficiary review visit | 2,004 ms | 792 ms |
| Repeat beneficiary review visit | 1,620 ms | 60 ms |
| First Data Explorer visit | 137 ms | 53 ms |
| Explorer search, including debounce | 546 ms | 423 ms |

Import benchmarks use deterministic synthetic UTF-8 CSVs with Arabic names, leading-zero IDs, relationships, dates, notes, and legal service labels. The smaller folder has 12,151 rows per dataset; the larger has 60,754 rows per dataset, across beneficiaries, assessments, and legal services. Import measurements use separate Python processes. Browser figures are medians of three fresh headless Edge contexts, on localhost without network throttling, using the same 9.95 MB dataset. Background warming is enabled in the baseline, as it was in the original app. Timing depends on hardware, file contents, and the mix of validation findings.

Both import sizes produced identical checksums for metadata, review responses, explorer pages, and searches, excluding the new revision token.

### Import stage breakdown, 9.95 MB

| Stage | Before | After |
| --- | ---: | ---: |
| CSV parsing | 0.10 s | 0.10 s |
| Cleaning and construction | 0.60 s | 0.25 s |
| Validation | 31.11 s | 5.85 s |
| Review preparation | 11.84 s | 1.13 s |
| Metadata preparation | 6.85 s | 0.34 s |

The original import discarded prepared review contexts after applying saved exclusions. That repeated work is included in the baseline metadata time. In the new flow, exclusions are applied after base validation and before review preparation, preserving base findings and overview totals.

## Implementation

- Cache normalized header lookups; transform repeated column values once; parse repeated review dates once per query; reuse exact-name findings within the existing review cache.
- Complete review and metadata preparation before publishing a replacement store. Keep upload preparation in the worker thread and use the same ordering for folder selection, individual file selection, and startup restoration.
- Add an opaque `revision` to ready legal metadata. Replacement imports and changed exclusions get a new revision. Synchronize exclusion invalidation with review preparation and retry metadata calculation if its revision changes.
- Load the workspace, Studio, and charts on demand. Load export libraries when exporting. Share a single Plotly build between charts and exports.
- Cache successful read responses in memory, keyed by revision, query, method, and URL. The cache holds at most 64 responses and 16 MiB of estimated response text, with a 60-second lifetime. Deduplicate in-flight requests and isolate cancellation between subscribers. Failed responses, mutations, and exports are not cached.
- Invalidate cached responses after successful exclusion changes and imported metadata, including native desktop imports. Reject late responses belonging to an old cache generation.
- Debounce the remaining active search fields, ignore outdated responses, remove duplicate mount requests, and remove speculative requests for unopened pages that were competing with interactive searches. Import-time review preparation remains enabled.

Endpoint paths and existing response fields are unchanged. No database, new persistent case-data cache, or source-file modification was introduced.

## Verification and limits

- Production build passed. Browser network inspection confirmed that PDF/export modules are absent before an export is requested. Plotly remains a large optional chunk.
- Frontend: 26 tests passed, including request deduplication, cancellation, bounded storage, expiration, invalidation, and failed requests.
- Backend: 110 tests passed, 15 failed, and 5 skipped; 4 subtests also passed. All 15 failures also occur against the saved pre-change implementation. See [existing failure list](output/performance/existing-test-failures.txt). No new failures were introduced.
- Seven new backend tests cover preparation ordering, exclusions, revisions, metadata races, encoding, dates, IDs, and keeping the prior store when an import fails.
- 62 additional before/after checks matched dataframe values and types, filtered review results, explorer pagination, indicator reports, and exported workbook cells and styles.
- Browser checks passed for charts, Studio, PNG/PDF downloads, and an earlier search finishing after a newer one, with no uncaught page errors.
- Peak Python process working set, including synthetic data generation, increased from 183 MB to 201 MB for the smaller folder and from 552 MB to 624 MB for the larger folder. Retaining prepared reviews trades memory for speed. Browser cache memory is separate and bounded as described above.

Raw measurements: [results.json](output/performance/results.json).

## Repeating the import benchmark

Run from the project directory, in separate processes for each size:

```powershell
.venv/Scripts/python.exe scripts/benchmark_legal_performance.py --mb 10
.venv/Scripts/python.exe scripts/benchmark_legal_performance.py --mb 50
```

To compare a saved pre-change implementation, add `--baseline PATH_TO_SAVED_LEGAL_PLATFORM_PY`. Add `--output PATH_TO_JSON` to save results. The script generates its own data and never opens source case files. Per-stage timings are also available on `LegalStore.import_timings` for developer inspection.
