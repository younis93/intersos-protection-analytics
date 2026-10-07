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

## Indicator filter calculations, 5 October 2026

Indicator reporting now retains source records, normalized reporting dimensions, parsed date indexes, column lookups, and indicator eligibility on the current store revision. Filter requests reuse these indexes and combine months, quarters, and years using set membership. Report deduplication still covers the selected period as a whole, with carry-over beneficiaries counted once per completion month. Table requests, both report exports, and reconciliation share the preparation. Source replacement or exclusion changes invalidate it.

Synthetic benchmarks use 3,000 rows in each of five source datasets and three calculations per filter combination, without response caches. Median calculation time for six selected months fell from 12.51 seconds to 0.10 seconds; twelve months fell from 13.87 seconds to 0.19 seconds. These measurements exclude the one-time preparation cost and HTTP serialization, rendering, and debounce. The JSON artifact records preparation time and additional Python memory separately. Preparation timings use tracemalloc and include its overhead.

All twelve benchmark scenarios compare complete payloads against the saved implementation, including filter options, drill-down IDs, warnings, and narratives. Regression checks also cover concurrent requests, mixed date formats, cross-month duplicate IDs, and revision changes during a calculation. The reporting/reconciliation tests pass (26 tests), as do frontend cache/copy tests (13 tests) and the production build. The broader API/store run passed 123 tests with 12 failures already recorded in the existing failure list above.

Results: [indicator-filters.json](output/performance/indicator-filters.json). Repeat against a saved pre-change reporting module:

```powershell
.venv/Scripts/python.exe scripts/benchmark_indicator_performance.py --baseline PATH_TO_SAVED_INDICATOR_REPORTING_PY --rows 3000 --repeats 3 --output output/performance/indicator-filters.json
```


## Excel downloads, 5 October 2026

Flat exports now append rows directly with openpyxl. Detailed exports reuse bounded immutable style objects, prepared source records, and column positions. Review, selected-case, and pivot writers avoid repeated whole-sheet scans. The shared date formatter compiles recognition patterns once and parses distinct strings once per workbook; date widths are assigned once per column. Hotline dates retain their month-first parsing and share distinct-value parsing across date columns. Indicator exports retain the existing prepared calculations and eligible response-cache reuse. Export files and download responses are never cached.

All layouts, colours, filters, identifiers, freeze panes, tables, merged cells, row heights, filenames, endpoints, and formula protection remain compatible. Dates remain sortable Excel date values displayed as `2026-October-01` using `[$-en-US]yyyy-mmmm-dd`. Missing values, trailing blank rows, infinity, time strings, and durations retain pandas export semantics. No dependencies or frontend controls were added.

These synthetic first-download measurements use 100 and 3,000 source rows, with identical inputs before and after. Style caches are cleared before each download. Medians use three repetitions, with seven for the short hotline export to reduce timing noise. The selected-case workbook contains one selected beneficiary and related records, regardless of source size. Indicator and narrative output sizes depend on reporting dimensions. Source preparation is outside the timed download, consistent with reusing the loaded dataset.

| Export family | 100 rows before (s) | After (s) | 3,000 rows before (s) | After (s) | Large reduction |
| --- | ---: | ---: | ---: | ---: | ---: |
| Raw dataset | 0.079 | 0.026 | 1.825 | 0.386 | 78.9% |
| Data Explorer (legal) | 0.079 | 0.029 | 1.837 | 0.309 | 83.2% |
| Data Explorer (workbook) | 0.076 | 0.028 | 1.879 | 0.338 | 82.0% |
| Hotline Explorer | 0.023 | 0.021 | 0.221 | 0.180 | 18.7% |
| Review findings | 0.244 | 0.107 | 8.481 | 2.053 | 75.8% |
| All cases | 0.175 | 0.087 | 4.260 | 1.561 | 63.4% |
| Selected case | 0.043 | 0.041 | 0.073 | 0.050 | 31.6% |
| Indicator report | 0.747 | 0.296 | 0.853 | 0.386 | 54.7% |
| Narrative report | 0.029 | 0.026 | 0.069 | 0.065 | 5.8% |
| Reporting Check writer | 0.035 | 0.033 | 0.575 | 0.485 | 15.6% |
| Detention comparison writer | 0.119 | 0.040 | 3.107 | 0.781 | 74.9% |
| Table | 0.048 | 0.021 | 0.938 | 0.207 | 78.0% |
| Pivot | 0.072 | 0.028 | 3.524 | 0.471 | 86.6% |
| Exclusions | 0.063 | 0.023 | 1.504 | 0.299 | 80.1% |

Large date-heavy exports exceed the 50% target. The smaller Reporting Check, hotline, narrative, and selected-case exports have less work to eliminate; workbook serialization and existing calculations limit the overall gain. These timings exclude HTTP transfer and browser rendering. Reporting Check and detention measurements cover workbook generation from prepared comparison results, excluding reconciliation calculations. The JSON records calculation, shared date formatting, workbook/filter work, and serialization separately. Hotline date preparation is included in workbook/filter work. Independently calculated stage medians may not add up to the median total.

Verification compares every workbook family before and after, including values, number formats, fonts, fills, borders, alignments, protection, tables, merges, filters, widths, row heights, and sheet settings. Twelve additional comparisons cover regional tables, selected filters, empty results, and empty multi-sheet case downloads. Tests cover English date formatting, ISO and day-first parsing, hotline month-first parsing, leading-zero IDs, formulas, missing values, and workbook-local parsing reuse.

The focused reporting, reconciliation, indicator cache, analytics, hotline, security, and export suite passed 63 tests and four subtests, with five existing fixture-dependent skips. The review export run passed 37 tests, including the four previously repaired regressions, and retained three existing failures. Each of those failures was reproduced against the saved pre-change backend: an empty awareness sheet assertion, the old `Review Detail` heading, and treating subsequent table headings as beneficiary rows. This export optimization does not repair those unrelated expectations. Python compilation and whitespace checks also pass.

Measurements: [excel-downloads.json](output/performance/excel-downloads.json). Repeat with a directory containing the pre-change `legal_platform.py`, `analytics.py`, `main.py`, `indicator_reporting.py`, and `indicator_reconciliation.py`:

```powershell
.venv/Scripts/python.exe scripts/benchmark_excel_performance.py --baseline-dir PATH_TO_SAVED_BACKEND --sizes 100 3000 --repeats 3 --output output/performance/excel-downloads.json
```

Use `--families hotline_explorer --repeats 7` for the shorter hotline measurement. The benchmark generates only synthetic records and compares workbook contents and styles outside the timed generation.


## Further app improvements, 5 October 2026

Analysis now makes one `POST /api/legal/indicators/monthly` request. This additive endpoint returns ordered `{months, reports}` entries with the existing full report structure. Reporting Check uses the same monthly calculation path directly. Each request prepares community and eligibility masks once and partitions relevant date records across its requested months. Monthly deduplication and completion-month carry-over remain independent; selected-period totals still use a separate whole-period calculation. Existing normalized indicator caches are reused. Dataset and exclusion revisions invalidate preparation and caches, and the frontend rejects late responses and clears Reporting Check results when the dataset changes.

Data Explorer lazily prepares search text, categorical values, date-sort keys, and month values per dataset revision. It filters and stably sorts row indexes, then materializes only the requested page. Source frames remain unchanged. Mixed date formats retain the previous subset-dependent parsing where required, rather than changing date interpretation to gain speed. Import validation now parses distinct scalar dates once, groups related service records once, and prepares source records and header positions while retaining rule-specific finding order, messages, severity, IDs, and exclusions.

Detention downloads use one `POST /api/legal/detention/export` request and one complete filtered backend query. The workbook retains the existing columns, appended Case ID, `detention-cases.xlsx` filename, formula protection, sortable English dates, and 10,000-row limit. Download responses remain uncached. Checkbox lists above 200 options and Reporting Check tables above 200 results use measured row heights, spacers, and ten-row overscan. Reporting Check retains its existing pagination. Keyboard focus and selection survive window changes; searches and exports use the complete data. Unchanged chart inputs are memoized. No dependencies or Apply button were added.

### Measured calculations

The saved baseline includes the earlier indicator and Excel improvements. These are additional gains, using identical synthetic inputs and three repetitions. Reporting has 3,000 rows in each of five datasets, Explorer has 30,000 rows and 13 columns, and validation has 2.98 MB of synthetic CSVs. Responses are uncached; indicator eligibility is warmed equally before timing, and monthly request preparation is included. Results compare complete payloads and validation finding digests, not only counts. HTTP serialization, network transfer, and frontend rendering are outside these calculation timings.

| Scenario | Before (ms) | After (ms) | Reduction |
| --- | ---: | ---: | ---: |
| One monthly report | 19.55 | 11.30 | 42.2% |
| Three monthly reports | 66.26 | 31.97 | 51.7% |
| Six monthly reports | 126.88 | 61.60 | 51.4% |
| Twelve monthly reports | 357.37 | 219.65 | 38.5% |
| Six months with combined filters and quarters | 61.94 | 19.40 | 68.7% |
| Reporting Check, twelve months | 605.34 | 281.74 | 53.5% |
| Explorer date filters and sorting | 29.45 | 3.28 | 88.9% |
| Explorer combined search, filters, and sorting | 34.84 | 10.92 | 68.6% |
| Explorer categorical filter, sort, and pagination | 14.44 | 2.87 | 80.1% |
| Import validation | 1,772.76 | 641.11 | 63.8% |

Three and six months meet the 50% calculation target; twelve months improves by 38.5% and misses it. The final [profile](output/performance/monthly-profile.txt) attributes about 54% of profiled time to building report matrices, including full demographic cells and drill-down details. Remaining work also includes per-month deduplication, narratives, and independent report structures. Preserving complete outputs limits further gains from shared filtering alone. Explorer exceeds 50% and validation exceeds 30% in these scenarios. Timings vary with dataset contents, dimensions, findings, and hardware.

One-time source preparation was measured separately with tracemalloc enabled. Indicator preparation changed from 1.82 s and 13.11 MB retained Python allocations to 2.19 s and 19.02 MB. Prepared Explorer indexes retained 33.39 MB, with a 34.76 MB peak and 1.05 s traced preparation time. These times include tracing overhead and are not first-request latency measurements. These lazy in-memory indexes trade memory for faster subsequent filters and are discarded on revision changes. The figures do not measure total process memory or browser caches.

### Verification

Complete monthly payloads match the saved implementation for 1, 3, 6, and 12 months and combined filters. Tests cover multiple years, quarters, empty intersections, duplicate IDs spanning months, completion carry-over, blank/invalid dates, source-absent months, source immutability, revision invalidation, concurrent requests, and cache publication during a revision change. Explorer comparison includes mixed formats, filter order, stable date/numeric/text sorting, null values, and pagination. Validation findings match the saved implementation's digest. Detention workbook tests compare values and styles, check leading-zero IDs and formula protection, enforce limits/errors, and verify one backend query and one frontend download request.

Browser checks with 2,000 checkbox options and 2,000 variable-height rows passed with fewer than 100 rendered entries, no page errors, Home/End navigation, offscreen search, retained selections, and the complete underlying data. See [windowed-lists.json](output/performance/windowed-lists.json). The frontend suite passes all 76 tests and the production build passes. The build retains its existing large optional chart-chunk warning.

The final full backend run has 261 passed tests, 8 failures, 5 skips, and 11 passing subtests. All eight failures were reproduced against the saved pre-change backend. An earlier run also encountered the Windows single-instance mutex test; it passes in the final run, and launcher code was unchanged. The remaining failures are listed here so they are not mistaken for completed repairs:

| Test in `backend/test_legal_platform.py` | Existing failure |
| --- | --- |
| `test_optional_files_are_not_required_and_cleanup_is_applied` | Expects the old ISO date display in Explorer. |
| `test_representation_case_load_uses_service_status_and_the_correct_event_month` | Fixture lacks mandatory Assessment ID and Beneficiary ID fields. |
| `test_review_export_places_dataset_identifiers_before_name` | Empty awareness review sheet causes StopIteration. |
| `test_review_export_uses_the_same_south_duplicate_group` | Looks for the obsolete Review Detail heading. |
| `test_beneficiary_review_export_groups_findings_by_region` | Treats later table headings as beneficiary rows. |
| `test_lawyer_summary_monthly_assessments_only_uses_2026_and_later` | Expected denominator gives 0.5; current result is 0.333. |
| `test_intelligence_integrates_distinct_records_and_keeps_awareness_separate` | Expects two assessments; current result has three. |
| `test_duplicate_service_without_assessment_id_compares_across_assessments` | Duplicate grouping expectation differs from existing normalization behavior. |

Full test output: [further-backend-tests.txt](output/performance/further-backend-tests.txt).

Measurements: [further-improvements.json](output/performance/further-improvements.json). Repeat with a directory containing the saved pre-change backend modules:

```powershell
$env:INTERSOS_DEFER_LEGAL_LOAD = '1'
.venv/Scripts/python.exe scripts/benchmark_further_performance.py --baseline-dir PATH_TO_SAVED_BACKEND --rows 3000 --explorer-rows 30000 --validation-mb 3 --repeats 3 --output output/performance/further-improvements.json
```

For repeatable browser verification, start the frontend dev server on port 5174, point `PLAYWRIGHT_MODULE_PATH` to an existing Playwright installation, and run `node scripts/check_windowed_lists.cjs`. The standalone performance harness is not included in the production app entry. No private source data is used by these scripts.


## Record processing and real overall progress, 5 October 2026

Legal data imports now share an operation tracker across startup restoration, native folder/file selection, refresh, and browser uploads. The Processing records dialog appears while remembered sources load at startup. It shows the overall measured percentage and current dataset/stage. Initial discovery remains indeterminate; browser upload bytes have their own percentage. The old fixed import milestones and the fixed one-minute message are removed.

Each applicable reading, parsing, cleaning, validation, relationship-checking, review, exclusion, metadata, and publication task contributes one completion unit. Date-column cleaning and relationship record scans report completed fractions within their tasks. Overall progress is completed units divided by planned units, rounded down. Tasks with no safe internal measurement advance only on completion, so the display can pause during a long task. It measures work completed, not elapsed time or time remaining. Successful publication and final metadata are required before 100% is exposed.

The additive `GET /api/legal/import/status?operationId=...` is uncached and reports operation ID, state, source, stage, dataset, completed/total work, percent, and error. Operation IDs are optional for existing upload and native import callers. The numeric native progress method remains available. Snapshots are throttled to five updates per second; the frontend polls every 250 ms after each previous poll finishes, cancels on unmount/change, and rejects old-operation responses. Simultaneous imports are rejected with a 409 response or native error. Failed replacements keep the previous published store. Startup retains the existing rule clearing an unavailable remembered source.

Imports reuse normalized name/project/contact values, beneficiary enrichment lookups, duplicate findings for identical matching settings and exclusions, and a bounded 8,192-entry cache of ordered pure transformations and name comparisons. Comparison direction is retained. Stores are replaced on new imports; duplicate-result reuse distinguishes exclusion selections. Review preparation now skips constructing an unused paginated response. Empty exclusion lists bypass identifier preparation and matching. Assessment reconciliation avoids repeated scalar pandas date lookups, and assessment count checks use prepared dictionaries. Exclusions are reconciled before review preparation, preventing those prepared contexts from being immediately discarded. Selection settings are saved only after candidate processing succeeds, before publication.

### Uncached benchmarks

Three repetitions use identical synthetic data in separate Python processes, against the backend saved immediately before these changes. Both implementations and their dependencies are loaded in each worker. Timing includes CSV parsing, cleaning, validation, review preparation, and metadata. It excludes source transfer, persisting settings, browser rendering, and HTTP polling. All scenarios compare complete result digests for findings, metadata, review responses, and filtered Explorer responses. No response or persistent case-data caches are used.

| Synthetic input | Before (s) | After (s) | Reduction | Before peak process MB | After peak process MB |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 MB target | 4.381 | 3.055 | 30.3% | 240.4 | 242.3 |
| 50 MB target | 21.630 | 14.223 | 34.2% | 633.6 | 655.9 |
| Duplicate-heavy, 10 MB target | 11.936 | 7.364 | 38.3% | 352.6 | 374.8 |

All three scenarios meet the 30% target. The 50 MB median validation stage changes from 11.232 s to 8.102 s; review preparation changes from 7.047 s to 2.647 s. Parsing changes from 0.527 s to 0.514 s and cleaning from 1.234 s to 1.220 s, so the gains mainly come from validation and preparation reuse. Raw JSON contains all stage medians. Peak process memory includes synthetic-data construction and loaded modules; it is not an isolated retained-cache measurement. Prepared values trade up to about 22 MB additional peak memory in these runs for lower processing time.

Counter-enabled imports were also compared with the same implementation suppressing counter updates. Median enabled times were 7.5%, 3.7%, and 0.4% higher for the three scenarios respectively. These isolated-process differences include run-to-run CPU and timing variability; they should not be interpreted as a precise counter-only CPU cost. Browser transport and status polling are outside these measurements. The [before profile](output/performance/processing-before-profile.txt) and [after profile](output/performance/processing-after-profile.txt) show remaining work in assessment validation, source-field normalization, finding construction, and metadata. Profile timings include instrumentation overhead and are separate from benchmark timings.

### Verification

The production build passes and all 85 frontend tests pass. The full backend suite passes 276 tests and 11 subtests, with five skips and the same eight existing failures. Each failure was reproduced against the saved baseline. See [backend test output](output/performance/processing-backend-tests.txt) and the failure descriptions in the previous section. Import-specific tests cover measured arithmetic, monotonic counters, throttling, terminal states, concurrent requests, operation isolation, uncached status, failed replacements, shared native folder/file progress, browser uploads, reconciliation ordering, and startup publication.

Six additional complete import comparisons cover core data, optional awareness data, encoding fallback, header-only service data, hotline-only data with invalid dates and leading-zero IDs, and duplicate exclusions. Duplicate review settings at 10, 15, and 30 characters, including spelling variations, also match the baseline. These comparisons check frame values/types, findings, metadata, and review responses; they do not claim to repair unrelated empty-table Explorer behavior. Results: [processing-parity.json](output/performance/processing-parity.json).

Browser checks with the actual LegalPlatform component verified startup restoration, folder replacement, and refresh, including the percentage, stage, successful dismissal, separate operation IDs, and no page errors. Screenshots: [startup](output/processing-startup.png) and [replacement](output/processing-replacement.png). Frontend unit tests verify upload/processing separation, indeterminate discovery, polling without overlap, terminal cleanup, and late-response rejection.

Measurements: [processing-progress.json](output/performance/processing-progress.json). Repeat with the saved pre-change backend directory:

```powershell
$env:INTERSOS_DEFER_LEGAL_LOAD = '1'
.venv/Scripts/python.exe scripts/benchmark_processing_progress.py --baseline-dir PATH_TO_SAVED_BACKEND --sizes 10 50 --repeats 3
```

For browser checks, run the frontend development server on port 5174, supply synthetic metadata at `output/processing-dialog-fixture.json`, set `PLAYWRIGHT_MODULE_PATH` to an existing Playwright installation, and run `node scripts/check_processing_dialog.cjs`. No dependencies were added, and the scripts use synthetic data only.

## Page loading queue, 6 October 2026

Background page preparation remains sequential. Opening a page or tab pauses unrelated scheduler requests and returns those tasks to the queue. A matching in-flight request is promoted and shared instead of restarted. Interrupted main tasks resume before secondary tabs. Completion callbacks retain ownership checks so cancelled or replaced runs cannot update a resumed task. Data revisions and exclusions still invalidate cached results.

A 250 ms idle delay remains after foreground activity; completed background tasks now yield for 16 ms instead of adding another 250 ms pause. Hidden windows do not start new background tasks. Indicator Analysis warms the existing monthly batch endpoint, and review/case preload settings match the initial page requests. Backend stores, cache limits, public endpoints, and published client releases are unchanged.

`node scripts/benchmark_loading_queue.mjs PATH_TO_SAVED_SCHEDULER_TS` compares a saved scheduler with the current one. The saved local baseline is `tmp/queue-baseline/legalLoadScheduler.ts`. Both runs use 120 deterministic synthetic records, 12 months, 19 page/tab tasks, and simulated 5 ms transport. Send Issues is excluded from the benchmark to match the published client. This measures scheduler overhead, not backend CPU or real-user loading times.

| Measurement | Before | After |
| --- | ---: | ---: |
| Queue completion | 5,166 ms | 993 ms |
| Network requests | 31 | 20 |
| Opened page starts after navigation | 0.25 ms | 0.15 ms |
| Opened page ready after navigation | 15.95 ms | 16.20 ms |
| Unrelated background request paused on navigation | No | Yes |

Monthly report digests match. The opened-page timing difference is timer noise; this benchmark demonstrates reduced queue waits and requests, not a measured speedup in foreground backend computation. Results are saved in `output/performance/loading-queue.json`.
