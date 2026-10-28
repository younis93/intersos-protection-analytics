# Record column filters

Record tables expose a funnel beside each data-column heading. Sorting keeps its own button. The popup has searchable values and one typed condition per column, with draft changes, Apply, Cancel, and Clear column. Active filters appear as removable chips. Tables with Download controls use one adjacent button labeled "Clear filters and selection" to clear column filters and selected rows and return to page 1, preserving search, sorting, and dashboard filters. Those tables hide the chips' separate "Clear all" action. Tables without Download controls retain it. Clearing every checkbox means no matches; it is distinct from an unrestricted column.

## Coverage

| Record view | Evaluation and actions |
| --- | --- |
| Legal Explorer, across all datasets | Backend filtering before pagination; linked drawer values; filtered Excel; select all through bounded API pages |
| Beneficiary case table | Backend case-summary filters and facets before pagination; filtered case export; explicit selected-case export retained |
| Detention records | Backend filters before pagination; matching count and export; dashboard calculations retain their page-filter scope |
| Hotline and deportation records | Backend Explorer queries and exports; table conditions remain separate from chart filters |
| Analytics Studio records | Backend filtering before record pagination; chart calculations retain their page-filter scope |
| Sampling | Shared backend sampling pipeline for table, facets, and Excel |
| Legal findings | Complete matching findings loaded in API pages, then filtered before rendering and bulk selection; filtered table Excel |
| Excluded legal findings | Full local list filtered before select-all and restore actions |
| Send Issues findings | Full local group filtered before pagination and group selection; explicit selections remain authoritative for report actions |
| Kobo/custom response Explorer and pivot record drilldowns | Backend filters and searchable facets before pagination; matching count and Excel use the same rules |
| Kobo answer records, quality records, and indicator records | Backend filtering before pagination; quality and indicator summary calculations stay in their existing scope |
| Custom duplicate review | Full duplicate group filtered before its display limit; source inclusion decisions remain attached to original record IDs |
| Prepared-column examples, calculated/validation examples, answer-source examples, and combine previews | Full supplied preview filtered locally |
| Connected case records and representation-service drilldowns | Full local record list |
| Indicator source-ID drilldowns | Local filters shared with Copy IDs and filtered-table Excel; unfiltered source export retained |
| Detention comparison findings | Individual differences filtered before rebuilding grouped rows and row spans; filtered Excel |

Pivot matrices, aggregated charts and scorecards, field-configuration grids, and the raw worksheet/header-row picker do not receive record filters. The legacy workbook `App`/`DataExplorer` is outside the current `RootApp` routes.

## Shared interfaces

- `ValueTable` accepts an explicit `RecordFilterControl` and optional `filterColumns`, or `recordFilters="local"` for complete preview lists. Paginated callers supply their own server controller rather than filtering the rendered page.
- `FilterableHeader` and `ColumnFilterChips` can also be used directly. Column metadata uses stable keys, display labels, and text/number/date types. Identifiers remain text.
- Record query/export requests accept optional `columnFilters`. Each rule has a column, type, optional value selection, exclusions, an optional value-search selection, and one condition. Value-search selections cover the complete matching value set, with explicit inclusions/exclusions for later checkbox edits.
- Values in one column combine with OR. Value selection, a condition, and other columns combine with AND. Text conditions are case insensitive. Date comparisons use calendar dates, strict before/after, and inclusive ranges. Existing monthly drawer selections remain supported.
- Legal facets use `POST /api/legal/record-values`. Kobo/custom routes expose `/data/values`, `/responses/values`, `/quality-review/values`, and `/indicators/records/values` beneath their project route. Facets exclude their own column's rules, respect the remaining query scope, and return a bounded value page and full count.

## Verification

Run the frontend suite with `npm test` and build with `npm run build` from `frontend`. Backend predicate and integration tests are in `backend/test_column_filters.py` and `backend/test_column_filter_api.py`.

`scripts/check_column_filters.cjs` builds an isolated fixture and checks real browser interactions, native dialogs, light/dark themes, mobile positioning, and the real Legal Explorer's requests, select-all pagination, and reset behavior. It uses `PLAYWRIGHT_MODULE_PATH` and optional `EDGE_PATH` overrides. Temporary source fixtures are removed in `finally`; screenshots and the result manifest are written under `output/column-filters`.
