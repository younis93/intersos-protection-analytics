# UNHCR CfP Analytics

Local, privacy-conscious analytics for assessment caseload, legal-service achievements and deportation monitoring. The original workbook is read-only; uploaded workbooks are processed in memory.

## Start the application

Run `start-dashboard.ps1` from PowerShell. The first run creates a local Python environment and installs frontend packages, then opens:

- Application: http://127.0.0.1:5173
- API documentation: http://127.0.0.1:8000/docs

The packaged Windows EXE uses a native Edge WebView2 window instead of opening a browser. The development script intentionally continues to use the browser and Vite development server.

## Shared frontend components

Legal page implementations live in `frontend/src/Legal*Page.tsx` and load on demand from the workspace shell. Navigation warms a page module on hover or keyboard focus; revisiting a page reuses the loaded module. Failed module downloads offer a reload action that retains the current URL.

Use `SelectionControls`, `TableControls`, `TableSelectionActions`, `FilterDrawerShell`, and `ChartPrimitives` for common UI behavior. Page modules own queries, selections, filters, exports, and specialized cell/chart content. `components.tsx` and `LegalShared.tsx` remain compatibility exports; new code should import focused modules directly.

Run `npm test --prefix frontend` and `npm run build --prefix frontend`. Browser checks include `scripts/check_shared_ui.cjs` against Vite and `scripts/check_page_modules.cjs` against the production preview. Both use synthetic data and the Playwright package specified by `PLAYWRIGHT_MODULE_PATH`. Production measurements and visual-standardization recommendations are recorded in `output/performance/shared-ui-summary.md`.

The expected workbook sheets are `Assessments`, `Legal Services`, and `Deportation`. Use the upload button to refresh the application with a newer `.xlsx` file.

In the Legal Platform workspace, import `deportationrecords.csv`, `awareness.csv`, or `legalhotlines.csv` individually or together using Select CSV files or Select data folder. Each imported dataset enables its own page regardless of project, including AMAL. Data Explorer is available for imported data, and Awareness Review and Hotline Review support Send Issues. Overview and case-dependent features require `beneficiaries.csv`, `assessments.csv`, and `legalservices.csv` together. Importing a new source replaces the current source.

Assessments, legal services, legal fees, and follow-ups accept both full CSVs and reduced CSVs without repeated personal fields. Keep `Beneficiary ID` in those files: the import restores profile information from `beneficiaries.csv` using `Case ID`. Legal services also restore detention, immigration-charge, release, assessment-date, assessment-closure-date, and assessment-status fields from the matching `Assessment ID`. Follow-ups restore assessment and service provision dates using `Assessment ID` and `Service ID`. Matched parent fields are authoritative, including blank values; unresolved links retain any supplied legacy values and produce summary warnings. Views, filters, search, and Excel exports use the restored fields. Refresh or reimport to pick up changes to the parent CSVs. `Nationality Stateless` has no beneficiary equivalent, so an omitted column stays blank.

## Size and performance maintenance

Production builds emit a Vite manifest. The local server gives immutable caching only to existing hashed assets listed in that manifest. HTML and APIs remain uncached; unhashed runtime assets require revalidation. Keep `.vite/manifest.json` with `frontend/dist` when packaging or copying a build. A missing manifest safely disables immutable caching.

Chart rendering and exports share the deferred Cartesian Plotly 3.7.0 engine. Workspace, Studio, Indicator and Detention styles have deferred modules; shared controls, themes and cascade-sensitive rules remain in the global stylesheet. Unused asset variants and optimization originals are preserved under `assets/archived-runtime-assets`, outside production output.

After building, run `node scripts/check_runtime_assets.cjs`. Use `scripts/optimize_runtime_assets.py` for lossless image recompression; it preserves originals and verifies decoded pixels and animation metadata before accepting smaller candidates.

Profiling commands (use the repository Python environment):

- `python scripts/benchmark_legal_performance.py --suite --output output/performance/import-profile.json` runs five fresh processes for normal and duplicate-heavy 10/50/100 MB synthetic imports. Allow substantial time and several GB of memory for the largest duplicate-heavy case.
- `python scripts/benchmark_legal_performance.py --mb 10 --duplicates --profile --output output/performance/import-cpu.json` runs a separate sanitized CPU profile. Do not combine profiling with timing comparisons.
- `python scripts/benchmark_overview_filters.py output/performance/local-filter-profile.json` profiles read-only temporary copies of the local CSV source, with five cold/warm query samples. Add `--profile --repeats 1` for a separate sanitized CPU run.
- `python scripts/profile_local_server.py` starts an isolated production server on port 5181. Run `scripts/profile_browser_filters.cjs` and `scripts/check_production_cache.cjs` against it, then stop the server. Browser scripts use `PLAYWRIGHT_MODULE_PATH` as described above. No active import or contact/exclusion persistence is used.

Run timing suites serially with other CPU-intensive work stopped for controlled comparisons. Browser search timings include a settling interval and are upper bounds. For a refactor-time computed-style comparison, save the old stylesheet and set `STYLE_BASELINE_PATH`; standard browser checks skip this optional comparison when no baseline is available.

Results and measurement limits are recorded in `output/performance/size-loading-summary.md`.

## Analytical definitions

- Assessment volume: distinct Assessment ID.
- Service volume: distinct Service ID.
- Unique beneficiary mode: distinct Beneficiary ID.
- Deportations: distinct PN ID.
- Default time window: valid 2026 year-to-date reporting dates.
- Percentages: share of the currently filtered measure.
- Multi-choice categories: percentage selecting each option; totals can exceed 100%.

The Data Quality page reports key uniqueness, completeness, validity and service-to-assessment join checks. Personally identifying narrative and contact fields are not ingested or exported.

## Interactive features

- **Testing feature:** Send Issues email preparation is being tested. Review recipients and content before sending.
- Open **Send Issues** to prepare review follow-up emails for individual lawyers. Use **Manage Lawyers** to enter email addresses or import an Excel/CSV contact list, map the name/email columns, resolve unmatched names, and save confirmed contacts locally.
- Select individual findings or entire issue tables across pagination, then choose **Prepare Email**. Review the English and Arabic message, optional deadline, signature, and generated tables before downloading an `.eml` draft or copying the email. Open the draft in a compatible email client and send manually; downloading does not mark findings as resolved or sent.
- Findings without an identifiable lawyer can be assigned for email preparation without modifying source data. Selections and these temporary assignments reset when the loaded data or review exclusions change. Contacts remain in the current user's application data folder across restarts and updates.

For development API tests, install `backend/requirements-dev.txt`, then run `python -m pytest backend/test_send_issues.py backend/test_api_security.py` and `npm test --prefix frontend`.

- Select categories directly in dashboard charts to cross-filter the page.
- Select month markers or month chips below a timeline to filter all dashboard results.
- Use **Clear all filters** to return to the default 2026 YTD view.
- Open **Pivot table** on any standard chart for a full-screen count and percentage table.
- Download every dashboard and Analytics Studio chart as a high-resolution **PNG** or landscape **PDF**. Exports use a clean white background and presentation-safe text regardless of the active UI theme.
- Use **Analytics Studio** to select a source sheet, one or two dimensions, the ID/beneficiary measure, chart type, pivot-table output, and filters.
- The **Sampling** tab at the end of Analytics Studio is a read-only list of completed Legal Representation services with a primary contact of exactly ten digits starting with 77, 78, or 75. Search, source-field filters, and completion-month filters run before optional ID/contact duplicate removal. Latest completion dates take priority, then results alternate male/female across pages and Excel exports. Settings persist across Studio tabs and reset on dataset revision. Missing source fields are explained; imports with blank primary contacts correctly show no eligible records.
- Switch themes from the header dropdown: Liquid Glass Light, Liquid Glass Dark, UNHCR Professional, or Executive Minimal.

## Kobo Analysis

Open **Kobo Analysis** beside Legal Platform on the home page. Create a project with an XLSForm `.xlsx` and an exported `.xlsx` or UTF-8/UTF-16 CSV. Review ambiguous/unmatched columns, explicitly exclude unused columns, and resolve encoding conflicts before confirming. Names, bilingual labels, nested groups, combined/split multi-select answers, repeat sheets, and export metadata are supported. Simple equality/AND/OR choice filters help disambiguate cascading labels; unsupported form expressions are never executed.

Kobo uses the same workspace shell classes, INTERSOS sidebar branding, collapsible navigation, fullscreen controls, chart/table panels, filter scroll controls, and chart palette as Legal Platform. Arabic mirrors the desktop sidebar and content; mobile uses the shared floating navigation surface. Sidebar collapse is saved independently for each workspace.

Projects store original uploads, normalized answers, mappings, and analysis settings in `%LOCALAPPDATA%/INTERSOS Legal Platform/kobo-projects.sqlite3`, independently of Legal Platform imports. `INTERSOS_KOBO_DB` can select an isolated database for testing. Identifying text and metadata are hidden by default. Percentages use filtered answered respondents per question, or within each breakdown category. Multi-select totals may exceed 100%; blanks never change the answered denominator. Repeat sections count repeat entries, with parent filters applied.

The Analysis page uses a compact project header, collapsible response filters, and a sticky question toolbar. Its searchable group navigator opens nested sections or individual questions without changing filters or export contents. Main groups follow form order; ungrouped questions appear under General. Only the first group and its first branch open by default. Manage questions and Display options stay in the toolbar; question ordering is inside Display options. Project PDF/Excel actions are in Export, and individual PNG/PDF/native Excel actions are in each card's Export question menu. The separate Report page is removed; old report links open Analysis. Each visible question offers a chart, count/percentage table, customization, and individual PNG/PDF/native Excel downloads. Report PDF and Native Excel exports use the current analysis settings. PDF exports embed Arabic fonts and paginate all visible answer rows.

The visible **Search questions** field filters only on-screen question cards by title, name, or identifier. It temporarily opens matching groups, restores prior expansion when cleared, and leaves exports unchanged. **Reset** in the Filter responses header clears response rules while retaining chosen filter fields and chart settings.

**Customize** opens a wide draft editor with Chart, Breakdowns, and Colors sections. Chart colors/types and #/% display update locally; calculation changes use the read-only `POST /api/kobo/projects/{pid}/analysis/preview` endpoint for one question, debounced by 250 ms. Suggested Balanced, Blue, Teal, and Warm palettes support per-answer/series HEX and native custom colors. Cancel, Close, and Escape discard drafts; Apply changes updates only the selected question. Mobile provides Settings/Preview tabs, and the preview legend wraps long labels.

Acceptance checks: run `python scripts/serve_kobo_customize_fixture.py 5199`, then `node scripts/check_kobo_customize.cjs` in another terminal. This uses a generated synthetic project under `output/kobo-customize`, not the user's project database. Run `python -m pytest backend/test_kobo.py backend/test_kobo_preview.py backend/test_kobo_excel_layout.py` for backend coverage and the frontend's Vitest/build commands.

Re-upload form or data opens file pickers immediately without reparsing saved sources. Select either replacement or both, then choose **Review files** to process them together. Initial answer issues and source examples come from that preview; further checks run only when mappings or policies change. Analysis settings are flushed before Apply corrections, and closing during preparation cancels any resulting staged preview. `node scripts/check_kobo_reupload_performance.cjs` validates the workflow and records controlled-latency opening measurements under `output/performance`.

Native Excel export requires Windows, installed/activated Microsoft Excel, and `pywin32`. Ordinary questions use native PivotTables directly on their analysis sheets, sourced from editable **Data** tables with shared caches. Double-click pivot count cells to see the underlying permitted response fields. Repeat scopes have separate Data tables with response and parent keys. All responses and non-identifying fields are included, with the current filters selected initially.

Each multi-select question has its own workbook-local Power Query and independent slicers captioned with the selected filter question names. Its hidden reference stores selected answers plus one denominator row per respondent, instead of expanding every respondent across every option. Count pivots exclude denominator and category-seed rows, so double-click returns only selected respondents. Adjacent percentage formulas use answered respondents within each active filter/breakdown and can sum above 100%. Ordinary percentages use Excel rounding and can sum to 99% or 101%. Necessary query, choice dictionary, totals and chart support sheets are hidden; the export does not create **Workbook guide** or **Pivot data**.

Selected groups get separate analysis sheets. Remaining grouped questions appear on **Analysis**, and ungrouped questions appear on **General**, with no empty analysis sheets. Edit or append rows inside Data tables, retain collapsed calculated columns, use unique Response IDs and valid Parent IDs, then choose **Data > Refresh All** once. Multiple-choice codes are separated by spaces; their dictionary is available on the hidden **_Kobo choices** sheet. Re-export after form/schema changes. Charts and totals update from the pivots, with normal Excel percentage rounding. Workbooks remain macro-free; large manual pivot expansions can require adjusting spacing. Exports validate Excel row/column limits and exclude identifying fields. Jobs run in isolated Excel processes with cancellation and one-hour download expiry. A ten-minute no-progress watchdog identifies the stalled stage; a sixty-minute absolute ceiling replaces the old twenty-minute cancellation.

The **Fast and responsive** export strategy prepares Data tables, lookup tables and helper formulas on disk before opening Excel. Large preparation workloads use up to four processes, reducing that count to budget 1 GiB per worker while reserving 8 GiB of currently available RAM for Excel, Windows and other applications. Small workloads use one process. Excel workbook changes remain sequential, with Excel multithreaded calculation enabled. Prepared multi-select results load through a native recordset; their saved connections use the real Data-based Power Queries for future Refresh All. Export status retains the existing fields and adds optional stage, completed-question, elapsed-time and last-progress metadata. Aggregate stage/query timings are recorded with each generated workbook; they contain no response values. Only one export workbook runs at a time, and cancellation terminates its owned worker, Excel and query processes.

Verification: `node scripts/check_kobo_organization.cjs` checks grouped navigation, search, filters, display controls, export scope, keyboard, themes, RTL and mobile against the frontend preview at port 5197 (or pass a URL). `node scripts/check_kobo_scrolling.cjs` checks deferred rendering, chart eviction/restoration, table state and exports. Also run `python -m pytest backend/test_kobo.py backend/test_kobo_excel_layout.py`, frontend tests/build, and `node scripts/check_runtime_assets.cjs`. Run browser/PDF checks against an isolated server with `INTERSOS_KOBO_DB` set and `KOBO_TEST_URL` pointing to it: `node scripts/check_kobo_browser.cjs` and `node scripts/check_kobo_pdf.cjs`. `python scripts/check_kobo_grouped_excel.py` exercises installed Excel using synthetic English/Arabic grouped projects, zero to three breakdowns, all display modes, numeric bins, dates, single-question exports, empty data, actual layout bounds, source edits/appends, question isolation, Refresh All, live chart linkage, and save/reopen. `python scripts/check_kobo_excel.py` additionally exercises the supplied read-only files in Downloads; add `--full` to verify every visible question. These checks edit only generated workbooks.


Run `python scripts/check_kobo_excel_optimized.py` for synthetic desktop Excel checks of full-record drill-through, sparse references, independent named slicers, respondent percentages, edits/appends, one Refresh All, and saved-cache reopening.
