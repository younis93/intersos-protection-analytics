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
