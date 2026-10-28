# UNHCR CfP Analytics

Local, privacy-conscious analytics for assessment caseload, legal-service achievements and deportation monitoring. The original workbook is read-only; uploaded workbooks are processed in memory.

## Start the application

Run `start-dashboard.ps1` from PowerShell. The first run creates a local Python environment and installs frontend packages, then opens:

- Application: http://127.0.0.1:5173
- API documentation: http://127.0.0.1:8000/docs

The packaged Windows EXE uses a native Edge WebView2 window instead of opening a browser. The development script intentionally continues to use the browser and Vite development server.

Desktop startup keeps a local workspace profile under `%LOCALAPPDATA%/INTERSOS Legal Platform/workspace-cache/webview` and remembers its localhost port in `workspace-cache/origin.json`. This lets WebView2 reuse downloaded workspace code, styles, fonts, images, and browser code caches across launches. Only verified, content-hashed assets receive immutable caching; the entry HTML and API responses remain `no-store`, so updates load the current application. A busy remembered port uses another free localhost port. Unavailable cache storage falls back to a private profile without blocking startup.

The backend now starts importing in parallel with native window creation, rather than waiting for WebView2 initialization. This reduces serial work behind **Preparing your workspace**. Each launch still uses a fresh local session token, verifies source-file contents, and restores data independently. Filtered results remain temporary; workspace asset caching does not add persistence for filters, searches, custom sorting, or pagination.

## Shared frontend components

Legal page implementations live in `frontend/src/Legal*Page.tsx` and load on demand from the workspace shell. Navigation warms a page module on hover or keyboard focus; revisiting a page reuses the loaded module. Failed module downloads offer a reload action that retains the current URL.

Use `SelectionControls`, `TableControls`, `TableSelectionActions`, `FilterDrawerShell`, and `ChartPrimitives` for common UI behavior. Page modules own queries, selections, filters, exports, and specialized cell/chart content. `components.tsx` and `LegalShared.tsx` remain compatibility exports; new code should import focused modules directly.

Run `npm test --prefix frontend` and `npm run build --prefix frontend`. Browser checks include `scripts/check_shared_ui.cjs` against Vite and `scripts/check_page_modules.cjs` against the production preview. Both use synthetic data and the Playwright package specified by `PLAYWRIGHT_MODULE_PATH`. Production measurements and visual-standardization recommendations are recorded in `output/performance/shared-ui-summary.md`.

The expected workbook sheets are `Assessments`, `Legal Services`, and `Deportation`. Use the upload button to refresh the application with a newer `.xlsx` file.

In the Legal Platform workspace, import `deportationrecords.csv`, `awareness.csv`, or `legalhotlines.csv` individually or together using Select CSV files or Select data folder. Each imported dataset enables its own page regardless of project, including AMAL. Data Explorer is available for imported data, and Awareness Review and Hotline Review support Send Issues. Overview and case-dependent features require `beneficiaries.csv`, `assessments.csv`, and `legalservices.csv` together. Importing a new source replaces the current source.

Legal Platform **Data source > Export project** saves all loaded original CSV datasets and saved review exclusions in a portable ZIP named `Legal Platform export YYYY-Mon.zip`, using the local export month. **Data source > Import project** replaces the workspace and saved review exclusions after validation; it is also available on the empty workspace screen. Restored CSVs are kept in managed application storage for desktop restart, so the ZIP can be moved afterwards. The indicator master workbook and personal preferences remain separate. Project ZIPs and expanded contents are limited to 200 MB; CSV datasets must total 100 MB or smaller.

Project backups in Legal Platform, Kobo, and Custom Analysis offer **Protect with password** in the export dialog. Standard exports remain ZIP files. Protected exports use `.intersos` and require the export password when imported. Use 12 to 1024 characters, confirm the password, and keep it separately: forgotten passwords cannot be recovered. Import detects protection from file contents, including renamed files, and allows password retries without selecting the file again. Failed imports preserve the current workspace. Protection covers the portable backup; local application data, CSV sources, and PDF/Excel exports retain their current storage behavior.

Protected format version 1 encrypts the complete original ZIP with AES-256-GCM. The binary header is the eight ASCII bytes `INTERSOS`, one version byte (`1`), a random 16-byte salt, and a random 12-byte nonce. The 37-byte header is authenticated as associated data, followed by ciphertext and a 16-byte authentication tag. Scrypt derives a 32-byte key from the exact UTF-8 password with `N=131072`, `r=8`, `p=1`. Parameters are fixed per version; imports never accept file-supplied work factors. Each export has fresh random values. Existing ZIP/expanded size limits still apply, with precisely 53 extra bytes allowed for the encrypted envelope. Unsupported versions require an application update. Passwords and derived keys are never intentionally persisted; plaintext is validated in memory before the existing import commit.

Export APIs support `POST /api/legal/backup` and `POST /api/{kobo|custom}/projects/{id}/backup` with JSON `{ "password": "..." }`, or `{}` for ZIP. Existing GET exports remain available. Restore APIs accept optional multipart `password` alongside `file`, returning structured `detail.code` and `detail.message` for protection/backup failures. Codes include `password_required`, `unlock_failed`, `unsupported_format`, `invalid_backup`, and export validation `invalid_password`. Passwords must never be sent in URLs. Encryption workers share a single crypto semaphore to bound scrypt memory use.

Validate with `python -m pytest backend/test_project_encryption.py backend/test_legal_workspace.py backend/test_kobo_workspace.py backend/test_custom_analysis.py`, `npm test --prefix frontend`, and `npm run build --prefix frontend`. Run `node scripts/check_project_protection.cjs` for synthetic dialog checks and light/dark desktop/mobile screenshots. `scripts/smoke_project_encryption.py` can be frozen with PyInstaller to check the bundled Windows encryption runtime; `package-windows.ps1` explicitly collects `cryptography`.

Legal Platform automatically reuses the last successful file-processing result across app restarts. It checks the complete selected CSV contents before restoring cleaned records, validation findings, metadata, and prepared default reviews. Changed files, changed saved review exclusions, a new local date, or an incompatible application/processing version cause normal processing. Selecting the same contents in another folder can reuse the cache. Progress shows **Checking saved processing** and **Restoring saved processing** when applicable.

The refresh buttons beside **Data source > Select folder** and **Select multiple CSV files** always reread the last selected folder or individual CSV paths and force fresh processing, even when the contents are unchanged. A successful refresh replaces the processing snapshot and clears saved default page results. Missing sources or cancelled/failed refreshes preserve the current workspace and saved selection, without silently loading a cache instead.

The disposable snapshot includes source records and remains on this computer under `%LOCALAPPDATA%/INTERSOS Legal Platform/processing-cache`, separate from portable project ZIPs. Only the latest successful selection is retained, with a 512 MB snapshot limit. Authentication is checked before loading local serialized state; project ZIPs contain no serialized cache. Missing, damaged, oversized, or unwritable caches fall back to normal processing. Delete the `processing-cache` folder while the app is closed to clear it. Developers must increment `CACHE_VERSION` in `backend/legal_processing_cache.py` when changing import or validation rules; application-version changes also invalidate snapshots.

Opening a default Legal page also saves its initial, unfiltered results in `processing-cache/pages.sqlite3`. These results can be reused after an app restart for Overview, Reviews, Data Explorer, cases, lawyers, hotline/deportation/detention dashboards, Analytics Studio dataset pages, Sampling, intelligence pages, and the default indicator report. Filtered results, searches, custom sorting, later table pages, and customized views are never saved in this persistent page cache; their existing session behavior is unchanged. Send Issues reuses only its unfiltered findings and always reads current contact details. Custom pivot building, master-workbook comparisons, file uploads, and exports continue to run normally. Page results are authenticated, limited to 96 entries and 64 MB total (16 MB per result), and invalidated when the source, saved review decisions, processing version, or local date changes. Cached indicator figures receive the current import's source-record export revision.

Run `.venv/Scripts/python scripts/benchmark_legal_performance.py --mb 10 --cache-comparison` to compare cold and cached imports in separate processes using synthetic records and isolated temporary storage. The benchmark verifies matching result digests and never replaces the user's saved cache.

Indicator Reporting also retains one already-parsed default report in session memory. After background loading finishes, opening the page renders that report immediately without another JSON parse or an empty loading table. Source changes, saved review changes, and explicit refresh invalidate it. Filtered reports do not replace this default snapshot. Indicator HTTP responses bypass redundant generic object encoding while preserving the complete report and its source-record export references.

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

### Kobo project workspaces and backups

Open projects offer Analysis, Overview, Geography, and Reporting in the desktop sidebar. Analysis opens by default; question-group navigation appears only there. At widths of 900px or less, a compact Workspace selector below the project header switches sections, and the bottom navigation retains Projects and Home. Overview saves selected non-identifying question summaries and shows submission totals. Geography compares visible main-submission category/text location fields, maps recognized Iraqi governorate labels using the bundled offline boundaries, lists unmatched names, and aggregates geopoints into 0.1-degree cells on a latitude/longitude plot. Tables distinguish missing locations and invalid coordinates. Current response filters apply to every workspace.

Reporting saves a title, findings, methodology/limitations, recommendations, and selected questions with the project settings. Download PDF report saves pending edits and generates a portrait A4 PDF locally through the existing PDF worker, with narrative, selected charts/tables, respondent bases, active filter notes, and embedded Arabic fonts. Long narratives paginate automatically; narrative-only reports are supported. Analysis PDF exports keep their existing landscape layout. Reporting inputs are constrained to their container, with inset focus rings.

Export > Back up project remains available even without visible analysis results and downloads a versioned ZIP containing the original uploads, normalized data, mappings, and complete settings including dashboard and report selections. Backups include original response data, including identifying fields in the source uploads. Import project in the Projects header or beside Create your first project validates checksums and contents before creating a separate project; it never replaces an existing project. Portable backups have a 200 MB compressed and expanded size limit. They are not encrypted.

Verification: `python -m pytest backend/test_kobo_workspace.py`; `npm --prefix frontend test`; `npm --prefix frontend run build`. For isolated browser checks, run `python scripts/serve_kobo_customize_fixture.py 5207` and then `node scripts/check_kobo_workspace_features.cjs`. Outputs use synthetic records under `output/kobo-workspace-features`.

Workspace navigation verification: `node scripts/check_kobo_sidebar_workspaces.cjs` uses the isolated fixture server on port 5207 to check desktop/mobile navigation, collapsed labels, themes/RTL, preserved settings, and empty-analysis backup loading/failure/download states.

### Governorate review and Geography exports

Geography reuses the Legal detention map component with submission-specific titles, counts, percentages, hover/focus tooltips, selected regions, expanded view, PNG/PDF export, and an Excel-exportable pivot. Selecting map regions focuses only the geographic detail table. Shared response filters continue to apply, and map percentages use mapped submissions as their denominator.

Review location values previews project-wide distinct raw values with total/filtered counts, automatic matches, and Matched/Unmatched/Missing/Excluded statuses. A searchable correction dropdown overrides a value to one of the map governorates, excludes it, or restores automatic matching. Optional fallback fields are consulted only for blank primary answers. Corrections are saved separately per primary field and source/raw answer code in geographyConfigs, apply only to Geography, and are included in project backup/import. Original answers elsewhere remain unchanged. Re-upload retains mappings and surfaces unavailable fields, stale raw values, and unmatched values for review. Geopoint fields retain their separate aggregated coordinate view.

Verification: `python -m pytest backend/test_kobo_workspace.py backend/test_kobo_geography.py`; `npm --prefix frontend test`; `npm --prefix frontend run build`. Run `python scripts/serve_kobo_geography_report_fixture.py 5208` and `node scripts/check_kobo_geography_report.cjs` for synthetic review, fallback, map interactions/exports, Reporting containment, and English/Arabic/narrative-only PDF checks. `node scripts/check_shared_governorate_map.cjs` verifies all three shared map modes without using user data. Outputs are under output/kobo-geography-report and output/shared-governorate-map.


## Custom Analysis

Choose **Home > Custom Analysis > New project** to import an XLSX workbook or UTF-8/UTF-16 CSV without a Kobo form. Select one worksheet and a header row, then review automatically detected column types. The column editor supports Text, Number, Date, Category, Multiple choice, display labels, groups, exclusions, and value labels.

Date columns support native Excel dates, ISO dates, UK day/month/year and US month/day/year. Ambiguous text dates require a file-wide convention or a column override. Conversion previews show interpreted dates; invalid values require explicit acceptance before being treated as missing. Date columns can optionally extract the source clock time into a separate, named column without timezone conversion. Original files and source row numbers are preserved.

Projects use the shared Analysis, Overview, Geography and Reporting pages, including filters, pivots, indicators, saved views, charts, exports, settings sharing and backups. **Choose filters** lets you select filter columns before Review & save, with none selected for new projects. **Column setup** reopens saved configurations; **Re-upload data** reviews a replacement file before applying it. Custom projects use a separate local SQLite database (`custom-projects.sqlite3`, overridable with `INTERSOS_CUSTOM_DB`). Each project contains one flat table; joins, appends, and AI-written findings are outside this version.

Run backend acceptance tests with `.venv/Scripts/python.exe -m pytest backend/test_custom_analysis.py -q`. To check the production UI against an isolated real API, build the frontend, run `scripts/serve_custom_analysis_fixture.py`, then run `node scripts/check_custom_analysis.cjs`. The fixture uses a temporary database and port 5399.


Custom Analysis multiple-choice columns offer Comma, Semicolon, Pipe, Tab, New line, Space, and Custom delimiters through the app dropdown. Delimiters are stored as literal characters in the existing separator setting. Split previews show individual answers after trimming whitespace, removing empty parts, and deduplicating selections within each record.

The final import review summarizes source columns, exclusions, extracted time columns, selected filters, and invalid cells. Columns are marked Ready, Needs attention, or Excluded, with accepted missing-value warnings listed separately. You can reach the review while conversion issues remain, edit a column directly, and return after validation. Saving stays blocked until all unresolved issues are fixed; the backend revalidates the import on confirmation.


### Prepare data

Custom Analysis now opens **Prepare data** between worksheet/header selection and column configuration. Its three tabs cover cleaning and number formats, calculated columns, and validation rules. Cleaning is off by default and can trim surrounding spaces, collapse repeated spaces while preserving line breaks, change letter case, and map explicit case-insensitive tokens to missing values. The preview keeps the original, prepared, and interpreted values separate. Original source files are never rewritten.

Number formats support plain numbers, comma thousands with a dot decimal (`1,234.56`), and dot thousands with a comma decimal (`1.234,56`). An optional currency symbol/code can be removed from either end. A trailing percent sign can explicitly convert `25%` to `0.25`; existing numeric Excel cells and bare numbers keep their numeric value. Invalid grouping and non-finite numbers require review.

Calculated columns support addition, subtraction, multiplication, division, percentage (first/second times 100), days between dates, and age in completed years. Operands may use included source columns, earlier included calculations, or a fixed number/date as the second operand. Missing operands leave the result missing. Division by zero, invalid dates and broken references are shown before saving; configuration errors cannot be accepted as missing.

Validation rules check required values, numeric ranges and date order. Errors block saving. Warnings must be acknowledged in Review & save and are listed in accepted warnings. An acknowledgment remains valid only while the rule and its flagged values are unchanged. Recipes, calculations, filters and rules persist through edits, replacement uploads and project backups. Run preparation tests with `.venv/Scripts/python.exe -m pytest backend/test_custom_preparation.py -q`, and run `node scripts/check_custom_preparation.cjs` against the isolated fixture server for browser acceptance checks.


Custom Analysis duplicate review is available in Prepare data. Select one or more included columns to match cleaned, converted values (case-sensitive). Records with incomplete matching keys are skipped and remain included. Review each group with Keep all, Keep first source row, Keep last source row, or individual record checkboxes. No records are excluded automatically; unresolved groups block saving. Review & save shows source and retained record counts, excluded duplicates, and each group decision. Original source rows remain preserved in project backups. Decisions persist across reopening and unchanged reuploads; changed source records or matching values require a new decision. Validation rules run on retained records, while source conversion issues still require resolution or explicit acceptance.


Prepare data uses a type-aware Column preparation editor. Every source column shows its selected type and can be retyped using the app dropdown. Text and choice types offer text cleanup; numbers offer locale, currency, and percentage interpretation; dates offer date conventions and optional extracted time. All types support explicit missing-value tokens. Incompatible settings are remembered but paused, and become active again when switching back to that type. Previewed changes stay staged until saved. The frontend and backend share `backend/custom_preparation_policy.json`; desktop packaging includes this policy alongside the backend.
