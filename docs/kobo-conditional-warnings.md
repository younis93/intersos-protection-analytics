# Conditional answer warnings

Kobo now presents these findings in the unified grouped data-review tables. See [Required and connected blank answers](kobo-required-review.md) for the current layout, missing-answer rules, and editing workflow.

Open **Review > Data quality** (Review is beside Insights in the project header) or click a conditional warning badge beside a question or data-table answer. The review lists stored answers whose active condition evaluates to false. It checks the original form's question and group conditions, or the question's manual connection rules when configured.

**Answer conflicts** opens by default and lists only confirmed answers outside their active conditions. Each finding explains why the answer should be blank, using the question and answer labels, then shows the stored answer and controlling values. Raw expressions are available under expandable **Technical details**.

**Condition checks** groups rules the app cannot evaluate by question, condition, and reason. These checks explicitly state that no answer error has been confirmed. Each group shows how many answers are affected, with **View affected records** and **View condition setup**. The affected-record list supports ignore/reopen acknowledgment. It does not offer exclusion, editing, or clearing as a solution to a checker limitation. Counts distinguish conflicting answers from unchecked conditions and affected answers; unchecked records are not included in confirmed-conflict badges or conditional records-needing-review totals.

The shared condition parser supports nested negation of selection groups, including `${q26} != '' and not(selected(${q26}, 'none') or selected(${q26}, 'unknown') or selected(${q26}, 'refuse'))`. These expressions normalize to the existing AND/OR and selected/not-selected rules used by analysis and Excel. Expressions that cannot be safely normalized remain unchecked.

## Review actions

- **Ignore warning** acknowledges the finding. Existing condition-based calculations stay unchanged.
- **Exclude from analysis** removes only that record/question answer from analysis, including its use as a value or breakdown. The stored value remains in the raw table and raw data download.
- **Edit answer** and **Clear answer** make reversible local corrections using the existing edit workflow. Controlling answers can also be edited from a finding. Protected fields remain read-only.
- **Reopen** and **Restore inclusion** remove a decision. Existing form/manual conditions still apply.
- **Source row · Open data table** opens the exact stored response, highlights the related answer, and enables cell editing. All fields in that response table are available, including hidden fields. The record remains accessible when filters or analysis exclusions would hide its answer. Controlling answers also offer **View row**, including parent submissions of repeat entries. Corrections update the table and review; **Back to review** returns to the finding list.

Each category retains its own filters and pagination. Answer conflicts offers Open, Ignored, and Excluded views; Condition checks offers Open and Ignored views. Search and question/status filters apply before grouping and pagination. The review scope controls whether current response filters or the whole dataset are checked. Coverage totals describe the whole dataset and count nonblank answers. Edit buttons keep their icons and labels on one line, moving below long text on narrow screens as needed.

## Persistence and exports

Decisions are saved in project payload `conditionalReview`, separately from saved analysis views, with action, timestamp, record/question identity, and an evidence fingerprint. Changed evidence reopens review; a corrected conflict disappears. Backups retain decisions. Replacement uploads preserve decisions only when unique source identities and the evidence match. Row numbers and generated row IDs alone are never used to carry decisions to a different upload. Older imports without stable source identities require review again after data replacement.

Analysis uses a separate projection of explicitly excluded values. Screen pivots, previews, drilldowns, measures, indicators, geographic/population analyses, and Excel source helpers use that projection. Excel exports carry record-specific exclusions into calculated helper columns and Power Query sources. Original uploaded files are never changed or written back to Kobo.

The local API adds `POST /projects/{id}/conditional-review` for paginated findings and `POST /projects/{id}/conditional-review/actions` for revision-checked decisions. The review accepts `category` (`conflicts` by default, `checks`, or the compatibility `all` record list) and a `group` identifier to open affected records. Responses include category totals, grouped checks, category-specific question filters, confirmed question counts, and separate condition-check question counts. Quality-review summaries, question results, and paginated data cells expose warning metadata. A bounded in-memory cache is keyed by effective data, form, active conditions, review decisions, and language.

Data, data-value filters, and raw data downloads accept an optional `recordIds` list to restrict the source-row view by exact record identity. A main submission and repeat entry with the same source row number are kept distinct. The source-row dialog clears response filters locally without changing saved analysis settings.

## Verification

Run `.venv/Scripts/python.exe -m pytest backend/test_kobo_conditional.py -q`, `npm test --prefix frontend`, and `npm run build --prefix frontend`.

For browser acceptance, run `.venv/Scripts/python.exe scripts/serve_kobo_conditional_fixture.py`, then `node scripts/check_kobo_conditional_review.cjs`. This uses an isolated synthetic project and writes desktop, mobile, and Arabic screenshots under `output/kobo-conditional-review`.
