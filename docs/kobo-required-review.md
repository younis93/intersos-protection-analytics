# Required and connected blank answers

Open a Kobo project and choose **Review > Data quality**. Checks use the Legal Platform style of expandable groups and affected-record tables, with search, column filters, pagination, source rows, finding details, and recommended actions. The categories are **All data checks**, **Missing answers**, **Answer conflicts**, **Condition checks**, and **Other quality checks**. Indicator checks remain available in their existing section.

## What a blank means

- **Required answer missing** is a warning. The question applies and its form required rule evaluates to true.
- **Connected answer blank** is a check. Its active connection condition is met, but the optional answer is blank. The blank may be intentional.
- A blank question whose relevance is false is not flagged. Ordinary optional blanks without a connection are not actionable findings.
- Nulls, empty strings, whitespace-only text, and empty selections are blank. Zero and valid negative numbers remain answers.
- Unsupported required/relevance expressions, missing dependencies, and unavailable required metadata appear under **Condition checks** without asserting that an answer is missing.

Required findings take priority over optional connected checks for the same cell. Review uses active manual connection rules when configured; required rules come from the form. Existing repeat records are evaluated against the correct parent submission. Review does not create repeat entries.

## Correcting records

Expand a question group and select a record or **Edit**. The list shows Source row, Current question, Connected question and Edit. Current question displays its label and the record’s answer; Connected question lists each controlling question and its answer separately, including parent records for repeats. A question without a configured connection says No connection configured. Unresolved connections are identified separately. Answer filtering remains available under Current question. The evaluated rule summary appears once above the list. Desktop text wraps within fixed columns, and the Edit icon and label stay together. On phones, each record stacks its current and connected question details below its source row; the column filters remain available above the records. Missing cells say **Blank**, with amber highlighting for required answers and softer highlighting for optional connected checks. **View full source row** shows the exact stored record and all fields, including hidden fields. **View controlling answer** opens a controlling answer or a parent submission. Protected identifiers remain read-only.

**Required** distinguishes Always, Optional, an evaluated dynamic condition, and Unknown. **Applies to** distinguishes all submissions in the response table, the actual active condition, and Unknown. Question wording never supplies an inferred condition. **Review condition** opens the existing setup.

Desktop Review uses a 60/40 list/editor split. Below 1100px the editor takes the full available width, with **Back to records**. Existing field controls and correction validation are shared with the data table. **Save** keeps the record visible and explicitly reports whether the finding remains. **Save & next** advances by stable record identity across pagination. A resolved record stays in the editor until the reviewer navigates away. Acknowledgment and permitted exclusion actions are secondary. Missing answers cannot be excluded. Technical expressions stay collapsed.

Unsaved drafts are protected when changing records, filters, sections, scope, opening another editing view, closing Review, or navigating away. Save-and-leave waits for successful validation and saving; failed saves keep the draft.

The same markers appear in the main data table and question headers. Edits and undo recheck findings, table highlights, and counts. Changes stay local and reversible; original source files remain unchanged. Optional blanks can be acknowledged with ignore/reopen. Neither required nor optional missing-answer findings can be excluded from analysis as a remedy. Missing-answer detection itself does not change analysis eligibility or percentage denominators.

## Existing projects and saved decisions

Imports retain the original XLSForm `required` value. Older projects recover it from the saved form workbook by question identity. If that workbook is unavailable or does not identify the question, the required status remains unknown and is reported as a condition check. Manually added and derived fields default to optional.

Acknowledgments are bound to the finding type, current blank, required expression, active connection, and controlling values. Changed evidence reopens review; filling a blank removes it. Existing nonblank conflict fingerprints and exclusion decisions are preserved. Backups retain form sources and review decisions.

## Interfaces and verification

`POST /projects/{id}/data-review` returns grouped findings and paginated records, with structured `rule` summaries. `focusRecord` locates an exact matching identity, selects its page, and returns `focusedRow` plus previous/next navigation. A resolved anchor still supplies its next matching record. Record filters remain in force; a separate unfiltered evidence lookup distinguishes resolution from leaving a filter. It supports category, review status, question, check search, record search, and column filters; `/data-review/values` supplies filter choices. Original quality-review and conditional-review endpoints remain available. Question results include `missingAnswers`; raw data cells identify `required-missing` and `connected-blank` outcomes.

Run `.venv/Scripts/python.exe -m pytest backend/test_kobo_required.py backend/test_kobo_quality.py backend/test_kobo_conditional.py -q`, `npm test --prefix frontend`, and `npm run build --prefix frontend`.

For browser acceptance, start `.venv/Scripts/python.exe scripts/serve_kobo_required_fixture.py`, then run `node scripts/check_kobo_review_editor.cjs`. The isolated fixture reproduces question 30 with 333 blanks and a long-answer conflict. It checks pagination, required/connected distinctions, embedded editing, unresolved saves, validation errors, undo, save-and-next across pages, unsaved save/discard/cancel, acknowledgment, parent/source rows, conflict actions, other checks, filtered findings, and English/Arabic desktop, tablet, mobile and enlarged-text layouts. Screenshots are written under `output/kobo-required-review`.


## Compact editor and filling blank answers

The editor combines source row and response table into one heading. Single-choice lists with eight or fewer options use compact native radios, with search and custom-answer entry under **Find or add an answer**. Larger and multiple-choice lists retain the existing searchable controls. Long labels wrap in English and Arabic.

**Apply to blank rows…** uses the current answer for the current question, across every page of the active review group. It respects review status, scope, search and column filters. This remains available after the anchor record was saved and resolved, even when its answer is unchanged. Only applicable required-missing and connected-blank findings are eligible. Nonblank values, zero, negative answers, false conditions and unchecked applicability are preserved.

The inline preview shows the replacement, scope and affected count. **Apply to N blank rows** commits a single reversible history entry. Empty or invalid replacements cannot be applied; zero matches disable confirmation. Edits or filter changes invalidate the preview. The backend rejects changed data, evidence, decisions or persisted connection settings.

The existing edits preview/apply requests accept an optional `operation.reviewBlanks` selector containing settings, group, question, category, status, search, groupSearch and columnFilters. It requires one anchor cell and cannot be combined with allMatches. The server resolves target identities without the 1000-explicit-cell request limit, materializes cells in the correction history, and requires a preview signature. Legacy allMatches semantics remain unchanged. Existing required metadata is recovered inside the write transaction when necessary.

Run `backend/test_kobo_review_blank_fill.py` for scoped filling, 1003-row batches, atomic validation, stale evidence, older-project metadata, choices, numeric zero, dates and undo. For the choice-editor browser fixture, set `KOBO_REVIEW_BLANK_FILL_FIXTURE=1`, start `scripts/serve_kobo_required_fixture.py`, then run `node scripts/check_kobo_blank_fill.cjs`. Use the default fixture with `node scripts/check_kobo_review_editor.cjs` for existing text-edit navigation checks.


## Review missing source connections first

Project reads compare native Kobo question and inherited group relevance with the stored original form, using exact question identities. Cached source parsing avoids rereading submission data. Imported `relevanceMetadataVersion` identifies retained source metadata when no workbook is readable. Local/custom/derived questions keep their existing rules. Valid intentional manual overrides remain active.

A missing, mismatched, changed or unverifiable connection creates one neutral **Connection setup needed** item per question, with only **Edit connection**. The affected-record table, answer editor, acknowledgments and review bulk filling are unavailable for the pending question. Answer-warning counts omit it. Setup-question totals, badges and raw-cell indicators remain separate from confirmed answer errors. Ordinary correction history continues to replay and undo without being invalidated by review metadata.

The connection dialog reuses the existing connection controls. Recovered original rules and controlling questions are previewed without activating them. Supported recovered rules can be explicitly confirmed unchanged; manual repairs are validated before saving. When the source confirms no condition, the reviewer can confirm applicability to all submissions. A source that cannot be verified is never silently treated as unconditional. Saving resumes detection and preserves the current Review scope and filters; cancel leaves setup pending.

`FormQuestion.connectionSetup` and analysis question `connectionSetup` expose the pending state, reason, recovered conditions, source fingerprint and confirmation fingerprint. Grouped Review uses `connection-setup-needed` and reports `summary.connectionSetupQuestions`; conditional Review returns question-level `connectionSetups`. `POST /analysis/preview` accepts `connectionSetup: true` for prospective recovered-rule preview. `POST /connection-setup/confirm` accepts question, fingerprint and settings; it updates only that question's settings and source relevance under one fingerprint-checked transaction.

Project data stores `connectionVerification` with source/rule fingerprints and timestamp. Confirmed inherited rules use `connectionVerifiedInheritance` so stale group metadata cannot override the reviewed rule, while other questions remain unchanged until reviewed. Re-import carries confirmations by question identity, and changed source or effective rules reopen setup. Backups retain source workbooks and confirmations. Bulk preview/apply rechecks source verification within its write transaction. Analysis retains previously configured conditions until the connection is saved.

Validate with `backend/test_kobo_connection_setup.py`. For browser checks, start `scripts/serve_kobo_connection_setup_fixture.py` and run `node scripts/check_kobo_connection_setup.cjs`; its original form contains a Q30 connection omitted from stored question metadata. It checks setup-only actions, paused counts, recovered-rule preview, cancellation, confirmation, preserved filters, resumed applicability, reload, Arabic and mobile layouts.

## Import notes in Review

The project toolbar has one **Review** button. Its pending-note badge is separate from answer-warning counts. Review opens on Data quality; **Import notes · N** and Indicator checks are separate sections. Import notes remains available at zero and distinguishes an empty project from one whose notes are all reviewed.

Import notes cover the whole import, so response-scope controls are hidden on that tab. Switching sections preserves data-quality scope, search, filters and the record editor. Unsaved answer drafts are protected before switching or opening the import workflow. The shared list supports individual acknowledgment, Mark all reviewed, Show reviewed notes, collapsed original technical details, and English/Arabic controls. Unrecognized source messages retain their original text.

Acknowledgments reuse `/import-notes/review`; Refresh notes uses the existing project read endpoint. Changes update both note counts without closing Review or correcting answers. Fingerprint-bound acknowledgments reopen when relevant evidence changes. Transient connection-setup display metadata is excluded from note fingerprints; actual form, mapping and answer evidence remains bound.

Grouped data-quality coverage omits copies of saved import notes while retaining general limitations. The legacy quality-review response remains compatible. The same note list still serves the original import workflow.

Start `scripts/serve_kobo_review_notes_fixture.py`, then run `node scripts/check_kobo_review_notes.cjs` for real-API acknowledgment, failure/retry, reviewed and empty states, reload, evidence invalidation, unchanged answers, preserved filters, unsaved keep/discard/save, keyboard navigation, Arabic/mobile and import-workflow checks. The legacy mocked acceptance script also accepts a local frontend URL as its first argument.


### Shared source-connection confirmation

Pending automatic connections with identical complete source expressions and the same repeat scope appear as one shared setup item. The heading names the controlling questions and counts dependent questions. The connection editor lists all affected questions and offers explicit confirmation for the group. This is general and does not depend on question names such as consent.

Confirmation restores and validates each question's original complete rule atomically. Manual overrides, different conditions, and different repeat scopes remain separate. Source and member fingerprints are rechecked before saving. Answers and analysis settings are unchanged. Uncheck shared confirmation to configure the selected question individually.

Validation: connection and required-review backend tests, focused Review frontend tests, production build, existing single-connection browser acceptance, and `scripts/check_kobo_shared_connection.cjs` with `KOBO_SHARED_FIXTURE=1`.


### Shared dependency management and effective connection health

Review's scope toolbar contains **Shared dependencies** (accessible name **Manage shared dependencies**). Available/Ignored tabs retain counts and searching. Each preview separates Will change, Unchanged (manual overrides), and Needs review (unsafe or unsupported rules). Selection stays visible after applying/restoring. On smaller screens the preview replaces the condition list with Back to conditions. The footer requires an affected-count confirmation; original source expressions remain inspectable below the preview.

Only safe conjunctive predicates are ignored, by resolved field/operator/value identity. Project-level source-bound decisions persist through backups and matching reimports. Source changes suspend affected decisions. Explicitly reviewing and saving a suspended question restores the source dependency for that question; the setup editor explains this consequence before saving. Stored answers and source expressions stay intact.

Question cards use one compact Status / View / Edit group. An ignored-only condition is labeled Condition ignored; remaining healthy conditions stay Connected with an ignored-count marker. Active errors stay visible; suspended decisions show Needs review. The View dialog presents Active condition, Active controlling questions, Ignored dependencies, Original Kobo conditions, then expandable diagnostics and percentage explanations.

If an ignored predicate removes the configured (or previously inferred) percentage parent entirely, the shared plan falls back to the current question's base. The preview shows the before/after base labels. The saved settings are preserved; restoring the ignored predicate automatically restores the saved percentage base. Analysis and Excel query configuration consume this same effective plan.

Validation includes `backend/test_kobo_shared_dependencies.py`, connection/required/conditional/Excel/import-note regression suites, frontend connection-health tests, and browser scripts `check_kobo_shared_dependencies.cjs`, `check_kobo_connection_view.cjs`, and `check_kobo_shared_dependency_layout.cjs`. Browser fixtures are isolated synthetic projects; the layout stress test modifies only a read-only response to inspect 200 long-label preview rows.


### Per-question source-condition selection and compact inline editing

Connection setup items now offer Ignore conditions next to Edit connection. Each checkbox represents a complete original question or inherited group expression. One or more expressions can be ignored for the current question only, including unresolved expressions reviewed explicitly in this interface. Group conditions clearly state that the entire displayed expression will be removed. The remaining rule is previewed; unsupported remaining rules stay unchecked rather than being called answer errors. Reversing the checkbox choices restores source conditions. Shared dependencies retains its separate whole-project scope.

Source-bound decisions are stored in `questionConditionOverrides` and applied as runtime `ignoredSourceConditions` annotations. The source workbook and stored answers remain unchanged. Preview/apply endpoints under `question-conditions` bind the selected expression identities, source evidence, settings, and effective records to a confirmation token. Matching decisions survive backup/reload and re-import; changed evidence requires review. Percentage-parent removal uses the same reversible current-question fallback as shared predicates.

View is a compact scrollable dialog with direct Ignore and Edit controls. Ignore opens the same per-question selector inside the dialog. Edit uses existing field controls and analysis previews in place, with pinned Save/Cancel actions, validation, a stale-project check, and connection-specific unsaved-change protection. Pending setups use the fingerprint-checked setup confirmation endpoint; configured connections use the existing settings save interface. Connection setup styling also uses compact sections, clear source evidence, and fixed footer controls.

Acceptance: `backend/test_kobo_question_conditions.py` covers local multi-selection, unresolved-group removal, unaffected other questions/answers, restoration, stale tokens, backups, and Excel percentage-base consistency. `scripts/check_kobo_question_conditions.cjs` exercises the isolated real API fixture in Review and View, inline editing/saving, the draft guard, and English/Arabic mobile layouts.


### Condition state clarity and explicit Ignore popups

Original condition cards carry textual/icon state badges: Active, Setup needed, Ignored - whole project, Ignored - this question, Partly ignored, Missing reference, Could not be checked, or Replaced by manual rule. Review shows summary badges and expandable connection details for unchecked findings. Missing active references remain visible even when another predicate is ignored. A separate safe AND predicate can now be ignored across a project while unrelated unresolved or unsupported source entries remain unchecked. Partial previews say which remaining conditions still need review; ignored predicates do not act as false ancestors when reviewing blank cells.

Review and setup use an outlined Ignore conditions button with a scope label and a dedicated popup. The popup has multi-selection, original expressions, per-condition states, a remaining-rule preview, and fixed confirmation controls. View's embedded selector uses one footer with Back to details at the start and the Ignore action at the end. There is no duplicate Back button or floating primary action in the content.

`conditionReview` is runtime presentation metadata, excluded from semantic form signatures and import-note fingerprints. Review action transactions and review-scoped corrections hydrate active project/question overrides consistently, preserving acknowledgment and blank-fill behavior.
