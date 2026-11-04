# Portable project transfers

Kobo and custom analysis share the export and staged import workflow. Exporting
defaults to **Data and settings**; **Data only** materializes current corrected
values, cleaned values, and calculated columns. Filters and visibility settings
do not restrict the dataset. Optional password protection applies to either mode.

New imports can restore file settings or use defaults. Updates replace the
destination dataset, retain its identity and name, and ask whether to keep its
current analysis settings or use the file settings. Data-only files cannot
provide settings. Existing matching and correction-conflict review runs before
the update is committed. Incompatible settings block confirmation. Users can
cancel, repair the destination settings, and reopen the file.

## API

- `POST /api/{kobo|custom}/projects/{id}/backup` accepts `password` and
  `includeSettings` (defaults to `true`). GET also accepts `includeSettings`.
- `POST /api/{kobo|custom}/backups/preview` stages a multipart `file` and optional
  `password`. It returns a token, name, content availability, record and field
  counts, and destination projects with their last-updated versions.
- `POST /api/{kobo|custom}/backups/{token}/review` accepts `projectId`,
  `expectedUpdated`, `settingsPolicy` (`file`, `defaults`, or `keep`), and the
  existing update matching and pagination fields. New projects return settings
  issues; updates return the shared update-review response.
- `POST /api/{kobo|custom}/backups/{token}/confirm` accepts the selected options
  and reviewed matching decision. An update requires its destination version to
  still match. Data, sources, settings, and update history commit together.
- `DELETE /api/{kobo|custom}/backups/{token}` cancels the staged import.
- The previous `/backups/restore` endpoint remains available for direct restores.

Staged files expire after 30 minutes and each workspace permits three pending
imports. File limits, checksums, workspace validation, and password-encryption
rules apply before publication.

## Archive compatibility

Kobo/custom version 2 archives retain `project.json`, `form.bin`, `data.bin`, and
`manifest.json`. The manifest declares `includesSettings`; data-only project JSON
omits `settings`. Version 1 archives remain readable.

Data-only sources use the internal `INTERSOS-SOURCE-1` signature followed by JSON.
These sources preserve normalized field IDs, types, choice lists, repeat links,
and cleaned values without retaining original values or cleaning recipes.
Existing source parsers recognize these snapshots so preparing imported data
does not revert corrections or apply cleaning twice. Full transfers preserve
their original source files and preparation configuration.

Legal version 2 archives contain source CSVs and a checksummed manifest declaring
`includesSettings: false`. Exclusion decisions are omitted. Version 1 Legal
archives remain readable, but their review decisions are discarded. Successful
imports clear the destination exclusion registry; the changed source revision
remounts the Legal pages with default filters and review controls. Application
appearance preferences remain unchanged.

## Checks

Run the backend transfer, workspace, encryption, update, custom-preparation, and
edit tests. Run the frontend tests and production build. For browser checks,
start `scripts/serve_project_transfer_fixture.py`, then run
`node scripts/check_project_transfer.cjs`. The fixture uses temporary databases
and synthetic data. Screenshots are saved under `output/project-transfer`.
